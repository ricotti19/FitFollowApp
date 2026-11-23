"""
FitFollow CV service (Flask). The Express API calls this to decide whether an uploaded photo is a workout photo.

    python app.py                 -> http://127.0.0.1:8001

    GET  /health                  what is loaded (pose backend, trained models, CLIP)
    POST /classify   file=<img>   {confidence, poseFound, mode, signals}      -> express-server/src/services/cv.js
    POST /form       file=<img>   {poseFound, goodFormProbability, label}     optional "form check" (needs form model)

It listens on 127.0.0.1 ONLY by default: this service has no user accounts and must never be exposed to the
internet. If you deploy it on another machine, set HOST and CV_TOKEN (the Express API sends the same token).
"""
from __future__ import annotations

import os
import time
from pathlib import Path

import cv2
import numpy as np
from flask import Flask, jsonify, request
from PIL import Image

import clip_scorer
import pose as pose_mod
from features import landmarks_to_features, visibility_score
from scoring import combine
from tasks import TASKS

try:  # the service still runs (in pose-only mode) when PyTorch is not installed
    import model as model_mod
except ImportError:  # pragma: no cover
    model_mod = None

MODELS_DIR = Path(__file__).parent / "models"
MAX_BYTES = 10 * 1024 * 1024
MAX_SIDE = 1280


class ModelStore:
    """Loads models/<task>_classifier.pth and reloads it automatically whenever train.py rewrites the file."""

    def __init__(self, directory: Path):
        self.dir = directory
        self._cache: dict[str, tuple[float, object]] = {}
        self.errors: dict[str, str] = {}

    def get(self, task: str):
        path = self.dir / f"{task}_classifier.pth"
        if not path.exists():
            self._cache.pop(task, None)
            return None
        if model_mod is None:
            self.errors[task] = "a trained model exists but PyTorch is not installed (pip install -r requirements.txt)"
            return None
        mtime = path.stat().st_mtime
        hit = self._cache.get(task)
        if hit and hit[0] == mtime:
            return hit[1]
        try:
            loaded = model_mod.load_bundle(path)
            self.errors.pop(task, None)
        except Exception as e:  # a corrupt / outdated file must not take the service down
            self.errors[task] = str(e)[:200]
            self._cache.pop(task, None)
            return None
        self._cache[task] = (mtime, loaded)
        return loaded

    def describe(self, task: str):
        m = self.get(task)
        return {"loaded": m is not None, "meta": (m.meta if m else None), "error": self.errors.get(task)}


def decode_image(data: bytes):
    """bytes -> RGB uint8 array (downscaled), or None if it is not an image."""
    arr = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if arr is None:
        return None
    h, w = arr.shape[:2]
    if max(h, w) > MAX_SIDE:
        s = MAX_SIDE / max(h, w)
        arr = cv2.resize(arr, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    return cv2.cvtColor(arr, cv2.COLOR_BGR2RGB)


def create_app(store: ModelStore | None = None, clip="default") -> Flask:
    """clip: a ClipScorer, None to disable CLIP, or "default" to follow the CLIP_ENABLED environment variable."""
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = MAX_BYTES + 64 * 1024
    store = store or ModelStore(MODELS_DIR)
    if clip == "default":
        clip = clip_scorer.ClipScorer() if clip_scorer.enabled() else None
    token = os.getenv("CV_TOKEN")

    @app.before_request
    def guard():
        if token and request.path != "/health" and request.headers.get("x-cv-token") != token:
            return jsonify(error="unauthorized"), 401

    def read_upload():
        f = request.files.get("file")
        if f is None:
            return None, (jsonify(error="send the image as multipart field 'file'"), 400)
        data = f.read()
        if not data:
            return None, (jsonify(error="empty file"), 400)
        rgb = decode_image(data)
        if rgb is None:
            return None, (jsonify(error="not a readable image"), 400)
        return rgb, None

    @app.errorhandler(413)
    def too_large(_e):
        return jsonify(error="image too large"), 413

    @app.get("/health")
    def health():
        backend = None
        err = None
        try:
            backend = pose_mod.get_backend().name
        except Exception as e:
            err = str(e)[:300]
        return jsonify(
            ok=backend is not None,
            poseBackend=backend,
            poseError=err,
            relevanceModel=store.describe("relevance"),
            formModel=store.describe("form"),
            clip={"enabled": clip is not None, "loaded": bool(clip and clip.available), "error": clip.error if clip else None},
        )

    @app.post("/classify")
    def classify():
        t0 = time.perf_counter()
        rgb, err = read_upload()
        if err:
            return err
        try:
            backend = pose_mod.get_backend()
        except Exception as e:
            return jsonify(error=f"pose detector unavailable: {e}"), 503

        try:
            lms = backend.detect(rgb)
        except Exception as e:
            return jsonify(error=f"pose detection failed: {str(e)[:200]}"), 500
        found = lms is not None
        vis = visibility_score(lms) if found else 0.0

        mlp_prob = None
        relevance = store.get("relevance")
        if found and relevance is not None:
            mlp_prob = relevance.predict_proba(landmarks_to_features(lms))

        clip_prob = None
        if clip is not None:
            clip_prob = clip.score(Image.fromarray(rgb))  # None if CLIP could not be loaded

        out = combine(found, vis, mlp_prob, clip_prob)
        out["elapsedMs"] = round((time.perf_counter() - t0) * 1000)
        return jsonify(out)

    @app.post("/form")
    def form():
        rgb, err = read_upload()
        if err:
            return err
        model = store.get("form")
        if model is None:
            return jsonify(error="no form model trained yet: python prepare_data.py --task form && python train.py --task form"), 503
        try:
            lms = pose_mod.get_backend().detect(rgb)
        except Exception as e:
            return jsonify(error=f"pose detector unavailable: {e}"), 503
        if lms is None:
            return jsonify(poseFound=False, goodFormProbability=None, label=None)
        p = model.predict_proba(landmarks_to_features(lms))
        return jsonify(poseFound=True, goodFormProbability=round(p, 4), label="good_form" if p >= 0.5 else "bad_form")

    app.config["store"] = store
    return app


def main():
    store = ModelStore(MODELS_DIR)
    clip = clip_scorer.ClipScorer() if clip_scorer.enabled() else None

    print("[cv] starting pose detector ...")
    try:
        print(f"[cv] pose backend: {pose_mod.get_backend().name}")
    except Exception as e:
        print(f"[cv] WARNING: no pose backend yet: {e}\n     /classify will answer 503 until this is fixed (see README).")
    for task in TASKS:
        d = store.describe(task)
        print(f"[cv] {task} model: " + ("loaded " + str(d["meta"]) if d["loaded"] else d["error"] or "not trained yet"))
    if clip is not None:
        ok = clip.load()
        print("[cv] CLIP zero-shot: " + ("ready" if ok else f"unavailable ({clip.error}). Install requirements-clip.txt or set CLIP_ENABLED=false"))
    else:
        print("[cv] CLIP zero-shot: disabled")

    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8001"))
    print(f"[cv] listening on http://{host}:{port}")
    create_app(store, clip).run(host=host, port=port, threaded=True)


if __name__ == "__main__":
    main()