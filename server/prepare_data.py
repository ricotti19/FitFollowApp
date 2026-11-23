"""
Step 1 of 2: turn your folders of photos into numbers.   (your prepare_data.py, generalised)

    dataset/
      relevance/                 <- "is this a fitness photo?"      python prepare_data.py --task relevance
        fitness/       *.jpg       people exercising (any exercise, gym or home or outdoors)
        not_fitness/   *.jpg       people NOT exercising: standing, sitting, posing, walking, selfies...
      form/                      <- optional "good vs bad form"      python prepare_data.py --task form
        good_form/     *.jpg       people exercising with good form (e.g. squat depth, back straight, knees out) , one exercise per folder, e.g. "squat", "pushup", "lunge" etc.
        bad_form/      *.jpg.      people exercising with bad form (e.g. shallow squat, back bent, knees in) , one exercise per folder, e.g. "squat", "pushup", "lunge" etc.

For every photo: find the person with MediaPipe Pose -> 33 landmarks -> 40 numbers (features.py).
Photos with no detectable person are skipped (they cannot teach a pose model anything; the server handles
"no person" separately). Each photo is also mirrored left-right to double the data.

Output (in data/):  <task>_X.npy  features      <task>_y.npy  labels      <task>_groups.npy  source-photo id
`groups` lets train.py keep a photo and its mirror image on the SAME side of the train/validation split.
(Without that, the validation score would be inflated because the model would be graded on near-copies.)
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np

from features import flip_landmarks, landmarks_to_features
from tasks import TASKS

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
MAX_SIDE = 1280  # downscale huge photos: faster, and MediaPipe does not need more


def load_rgb(path: Path):
    import cv2

    image = cv2.imread(str(path))
    if image is None:
        return None
    h, w = image.shape[:2]
    if max(h, w) > MAX_SIDE:
        s = MAX_SIDE / max(h, w)
        image = cv2.resize(image, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    # convert OpenCV's BGR byte order into RGB (MediaPipe expects RGB)
    return cv2.cvtColor(image, cv2.COLOR_BGR2RGB)


def build_dataset(task: str, dataset_dir="dataset", out_dir="data", flip: bool = True, backend=None, quiet=False) -> dict:
    sub, categories, _ = TASKS[task]
    if backend is None:
        from pose import get_backend

        backend = get_backend()
    say = (lambda *a: None) if quiet else print

    base = Path(dataset_dir) / sub
    X, y, groups = [], [], []
    stats = {"task": task, "per_class": {}, "skipped_no_person": 0, "skipped_unreadable": 0, "images": 0, "samples": 0}
    gid = 0

    say(f"[Data Pipeline] Task '{task}' - reading {base}/ (pose backend: {getattr(backend, 'name', '?')})")
    for folder, label in categories.items():
        folder_path = base / folder
        if not folder_path.exists():
            folder_path.mkdir(parents=True, exist_ok=True)
            say(f"  created empty folder {folder_path} - drop images there")
            stats["per_class"][folder] = 0
            continue
        used = 0
        for img_path in sorted(folder_path.iterdir()):
            if img_path.suffix.lower() not in IMAGE_EXTS:
                continue
            stats["images"] += 1
            rgb = load_rgb(img_path)
            if rgb is None:
                stats["skipped_unreadable"] += 1
                continue
            lms = backend.detect(rgb)
            if lms is None:
                stats["skipped_no_person"] += 1  # skip images where a human body isn't detected
                continue
            views = [lms] + ([flip_landmarks(lms)] if flip else [])
            for v in views:
                X.append(landmarks_to_features(v))
                y.append(label)
                groups.append(gid)
            gid += 1
            used += 1
        stats["per_class"][folder] = used
        say(f"  {folder:<12} {used:>5} usable photos")

    stats["samples"] = len(X)
    if not X:
        say("[Warning] No usable images. Add photos with a visible person to the dataset folders above.")
        return stats

    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    np.save(out / f"{task}_X.npy", np.asarray(X, dtype=np.float32))
    np.save(out / f"{task}_y.npy", np.asarray(y, dtype=np.int64))
    np.save(out / f"{task}_groups.npy", np.asarray(groups, dtype=np.int64))
    say(f"[Success] {gid} photos -> {len(X)} training samples saved to {out}/{task}_*.npy")
    if stats["skipped_no_person"]:
        say(f"          {stats['skipped_no_person']} photo(s) skipped: no person detected")
    for folder, n in stats["per_class"].items():
        if n < 30:
            say(f"[Tip] '{folder}' has only {n} usable photos. 100+ per class is a good start; more variety beats more volume.")
    return stats


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--task", choices=list(TASKS), default="relevance")
    ap.add_argument("--dataset", default="dataset")
    ap.add_argument("--out", default="data")
    ap.add_argument("--no-flip", action="store_true", help="do not add mirrored copies")
    args = ap.parse_args(argv)
    ok = build_dataset(args.task, args.dataset, args.out, flip=not args.no_flip)["samples"] > 0
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())