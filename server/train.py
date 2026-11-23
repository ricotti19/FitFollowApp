"""
Step 2 of 2: train the classifier on the numbers from prepare_data.py.   (your train.py, generalised)

    python train.py --task relevance        ->  models/relevance_classifier.pth   (the server loads this automatically)
    python train.py --task form             ->  models/form_classifier.pth        (optional form-check endpoint)
    python train.py --task relevance --synthetic   plumbing smoke test with fake skeletons (saved separately)

Same recipe as before: Cross-Entropy loss, Adam, TensorBoard logging to runs/. What changed and why:
  * Real validation split. Your version reported accuracy on the data it trained on, which only measures memory.
    The split is by SOURCE PHOTO so a photo and its mirror image never straddle train/validation.
  * Inputs are standardised; the mean/std are saved inside the model file so the server does the same.
  * Class weights, so 300 fitness photos vs 100 non-fitness photos does not bias the model.
  * The best epoch (lowest validation loss) is kept, with early stopping, instead of blindly running 500 epochs.
"""
from __future__ import annotations

import argparse
import copy
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

from features import FEATURE_DIM, landmarks_to_features
from model import PoseClassifier, save_bundle
from tasks import TASKS


def split_by_group(y: np.ndarray, groups: np.ndarray, val_frac: float, seed: int):
    """Boolean (train_mask, val_mask). Whole groups go to one side; each class is split separately."""
    rng = np.random.default_rng(seed)
    val_mask = np.zeros(len(y), dtype=bool)
    for cls in np.unique(y):
        gs = np.unique(groups[y == cls])
        rng.shuffle(gs)
        n_val = int(round(len(gs) * val_frac)) if len(gs) >= 5 else 0
        n_val = min(n_val, len(gs) - 1)
        if n_val > 0:
            val_mask |= np.isin(groups, gs[:n_val]) & (y == cls)
    return ~val_mask, val_mask


def _accuracy(logits, y):
    return float((logits.argmax(1) == y).float().mean())


def train_model(X, y, groups, epochs=400, lr=1e-3, val_frac=0.2, batch_size=64, patience=60, seed=42, writer=None, log=print):
    """Returns (model, mean, std, metrics)."""
    torch.manual_seed(seed)
    np.random.seed(seed)
    X = np.asarray(X, dtype=np.float32)
    y = np.asarray(y, dtype=np.int64)
    if X.shape[1] != FEATURE_DIM:
        raise ValueError(f"features have {X.shape[1]} columns, expected {FEATURE_DIM}. Re-run prepare_data.py.")
    if len(np.unique(y)) < 2:
        raise ValueError("need photos from BOTH classes to train")

    tr, va = split_by_group(y, groups, val_frac, seed)
    mean = X[tr].mean(0)
    std = X[tr].std(0)
    std = np.where(std < 1e-6, 1.0, std).astype(np.float32)
    norm = lambda a: torch.from_numpy(((a - mean) / std).astype(np.float32))

    Xtr, ytr = norm(X[tr]), torch.from_numpy(y[tr])
    has_val = bool(va.any())
    Xva, yva = (norm(X[va]), torch.from_numpy(y[va])) if has_val else (None, None)

    counts = np.bincount(y[tr], minlength=2).astype(np.float32)
    weights = torch.tensor(counts.sum() / (2.0 * np.maximum(counts, 1)), dtype=torch.float32)
    criterion = nn.CrossEntropyLoss(weight=weights)

    model = PoseClassifier()
    optimizer = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=1e-4)

    best_loss, best_state, best_epoch, since_best = float("inf"), copy.deepcopy(model.state_dict()), 0, 0
    n = len(Xtr)
    log(f"[Trainer] {n} train / {int(va.sum())} validation samples, {FEATURE_DIM} features, class weights {weights.tolist()}")
    for epoch in range(1, epochs + 1):
        model.train()
        perm = torch.randperm(n)
        for i in range(0, n, batch_size):
            idx = perm[i : i + batch_size]
            optimizer.zero_grad()
            loss = criterion(model(Xtr[idx]), ytr[idx])
            loss.backward()
            optimizer.step()

        model.eval()
        with torch.no_grad():
            tr_logits = model(Xtr)
            tr_loss = float(criterion(tr_logits, ytr))
            tr_acc = _accuracy(tr_logits, ytr)
            if has_val:
                va_logits = model(Xva)
                va_loss = float(criterion(va_logits, yva))
                va_acc = _accuracy(va_logits, yva)
            else:
                va_loss, va_acc = tr_loss, None

        if writer:
            writer.add_scalar("Loss/train", tr_loss, epoch)
            writer.add_scalar("Accuracy/train", tr_acc * 100, epoch)
            if has_val:
                writer.add_scalar("Loss/val", va_loss, epoch)
                writer.add_scalar("Accuracy/val", va_acc * 100, epoch)
        if epoch == 1 or epoch % 50 == 0:
            extra = f" ── val loss {va_loss:.4f} val acc {va_acc * 100:.1f}%" if has_val else ""
            log(f"Epoch {epoch}/{epochs} ── train loss {tr_loss:.4f} train acc {tr_acc * 100:.1f}%{extra}")

        if va_loss < best_loss - 1e-5:
            best_loss, best_state, best_epoch, since_best = va_loss, copy.deepcopy(model.state_dict()), epoch, 0
        else:
            since_best += 1
            if since_best >= patience:
                log(f"[Trainer] early stop at epoch {epoch} (best was {best_epoch})")
                break

    model.load_state_dict(best_state)
    model.eval()
    with torch.no_grad():
        tr_acc = _accuracy(model(Xtr), ytr)
        metrics = {"best_epoch": best_epoch, "train_acc": tr_acc, "train_n": int(n), "val_n": int(va.sum()), "val_acc": None, "confusion": None}
        if has_val:
            pred = model(Xva).argmax(1).numpy()
            metrics["val_acc"] = float((pred == yva.numpy()).mean())
            cm = np.zeros((2, 2), dtype=int)
            for t, p in zip(yva.numpy(), pred):
                cm[t, p] += 1
            metrics["confusion"] = cm.tolist()  # rows = true class, cols = predicted
    return model, mean, std, metrics


def _writer(task, synthetic):
    try:
        from torch.utils.tensorboard import SummaryWriter

        return SummaryWriter(f"runs/{'synthetic_' if synthetic else ''}{task}_experiment")
    except Exception:
        print("[Trainer] TensorBoard not installed - skipping logging (pip install tensorboard)")
        return None


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--task", choices=list(TASKS), default="relevance")
    ap.add_argument("--data", default="data")
    ap.add_argument("--epochs", type=int, default=400)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--val-frac", type=float, default=0.2)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--synthetic", action="store_true", help="train on fake skeletons to test the plumbing (NOT for real use)")
    args = ap.parse_args(argv)

    if args.synthetic:
        import synthetic

        print("[Trainer] --synthetic: generating fake skeletons. The result is saved as models/synthetic_*.pth and is never used by the server.")
        lms, y = synthetic.make_task(args.task, n_per_class=200, seed=args.seed)
        X = np.stack([landmarks_to_features(l) for l in lms])
        groups = np.arange(len(y))
    else:
        d = Path(args.data)
        try:
            X = np.load(d / f"{args.task}_X.npy")
            y = np.load(d / f"{args.task}_y.npy")
            groups = np.load(d / f"{args.task}_groups.npy")
        except FileNotFoundError:
            print(f"[Trainer] No data found for '{args.task}'. Run:  python prepare_data.py --task {args.task}\n"
                  "          (or add --synthetic to smoke-test the pipeline).")
            return 1

    writer = _writer(args.task, args.synthetic)
    try:
        model, mean, std, m = train_model(X, y, groups, epochs=args.epochs, lr=args.lr, val_frac=args.val_frac, seed=args.seed, writer=writer)
    except ValueError as e:
        print(f"[Trainer] {e}")
        return 1
    finally:
        if writer:
            writer.close()

    name = f"{'synthetic_' if args.synthetic else ''}{args.task}_classifier.pth"
    out = Path("models") / name
    meta = {"task": args.task, "synthetic": bool(args.synthetic), "val_acc": m["val_acc"], "train_acc": m["train_acc"], "samples": int(len(y)), "positive": TASKS[args.task][2]}
    save_bundle(out, model, mean, std, meta)

    print(f"\n[Result] train accuracy {m['train_acc'] * 100:.1f}%  (best epoch {m['best_epoch']})")
    if m["val_acc"] is None:
        print("[Warning] Not enough photos for a validation split, so there is NO honest accuracy number. Add more photos.")
    else:
        print(f"[Result] validation accuracy {m['val_acc'] * 100:.1f}% on {m['val_n']} unseen samples; confusion [[TN, FP], [FN, TP]] = {m['confusion']}")
        if m["val_n"] < 40:
            print("[Warning] The validation set is small, so treat this number as a rough guide.")
        if m["train_acc"] - m["val_acc"] > 0.15:
            print("[Warning] Much better on training than validation = overfitting. Add more varied photos.")
    print(f"[Success] Model serialised to '{out}'" + ("" if args.synthetic else "  (restart or just keep the server running: it reloads automatically)"))
    return 0


if __name__ == "__main__":
    sys.exit(main())