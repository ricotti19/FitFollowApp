"""
FitFollow CV service (Flask). The Express API calls this to decide whether an uploaded photo is a workout photo.

    python app.py                

    GET  /health                  what is loaded (pose backend, trained models, CLIP)
    POST /classify   file=<img>   {confidence, poseFound, mode, signals}      -> express-server/src/services/cv.js
    POST /form       file=<img>   {poseFound, goodFormProbability, label}     optional "form check" (needs form model)

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
    
    try:
        pose_mod.get_backend()
    except Exception:
        pass
    if clip is not None and not clip.available:
        clip.load()

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
        if not found and clip_prob is not None and clip_prob < 0.68:
            out["confidence"] = min(float(out.get("confidence", 0.0)), 0.35)
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


    @app.post("/classify-exercise")
    def classify_exercise():
        data = request.get_json(silent=True) or {}
        name = str(data.get("exercise") or "").strip()
        if len(name) < 2 or len(name) > 60:
            return jsonify(valid=False, requiresWeight=False, mode="weighted_strength", score=0.0)
        if clip is None:
            return jsonify(valid=True, requiresWeight=False, mode="weighted_strength", score=0.75)

        sims = clip.score_text(name, [
            "a physical fitness exercise, sport, aerobic movement, mind-body practice, or dance form",
            "food, meal, beverage, or culinary ingredient",
            "inanimate object, non-physical noun, or nonsense text",
        ], scale=25.0)
        m_sims = clip.score_text(name, [
            "resistance training performed with external weights or gym equipment",
            "calisthenics or bodyweight strength exercise counted in repetitions and sets",
            "locomotive endurance cardio measured by duration and travel speed",
            "choreographed movement, dance, mobility, or mind-body session measured by duration",
        ], scale=22.0)
        if sims is None or m_sims is None:
            return jsonify(valid=True, requiresWeight=False, mode="weighted_strength", score=0.75)

        activity_prob = float(sims.pop(0))
        food_prob = float(sims.pop(0))
        mode_keys = ["weighted_strength", "bodyweight_strength", "cardio_speed", "movement_duration"]
        best_mode = mode_keys[max(range(len(m_sims)), key=lambda i: m_sims[i])]
        return jsonify(
            valid=(activity_prob >= 0.58 and food_prob < 0.25),
            requiresWeight=(best_mode == "weighted_strength"),
            mode=best_mode,
            score=round(activity_prob, 3),
        )

    _tox_pipe = None

    def get_toxicity_pipe():
        nonlocal _tox_pipe
        if _tox_pipe is not None:
            return _tox_pipe
        try:
            from transformers import pipeline
            _tox_pipe = pipeline("text-classification", model="unitary/toxic-bert", top_k=None)
            return _tox_pipe
        except Exception as e:
            print(f"[cv] toxicity model unavailable: {e}")
            return False

    @app.post("/classify-comment")
    def classify_comment():
        data = request.get_json(silent=True) or {}
        text = str(data.get("text") or "").strip()
        if not text:
            return jsonify(allowed=False, score=0.0)

        # Layer 2: Dedicated NLP Toxicity Classifier (unitary/toxic-bert)
        pipe = get_toxicity_pipe()
        if pipe:
            rows = pipe(text[:512])
            items = rows[0] if rows and isinstance(rows[0], list) else rows
            worst_tox = max(float(item["score"]) for item in items)
            
            if worst_tox >= 0.50:
                return jsonify(allowed=False, layer="toxic-bert", toxicity=round(worst_tox, 3))

        # Layer 3: Existing CLIP Semantic Encouragement vs. Put-Down Check
        if clip is not None:
            sims = clip.score_text(text, [
                "a kind, supportive, encouraging, friendly, or neutral message",
                "a rude, insulting, mean, discouraging, or hostile attack on someone",
            ], scale=15.0)
            if sims is not None:
                pos_prob = float(sims.pop(0))
                neg_prob = float(sims.pop(0))
                if neg_prob > pos_prob + 0.05:
                    return jsonify(allowed=False, layer="clip", score=round(pos_prob, 3))

        return jsonify(allowed=True)

    ACTIVITY_PROMPTS = [
        ("squats", "a photo of a person performing barbell back squats or lunges in a gym"),
        ("deadlift", "a photo of a person lifting a heavy barbell off the floor doing deadlifts"),
        ("bench", "a photo of a person lying on a gym bench doing barbell or dumbbell chest press"),
        ("arms_shoulders", "a photo of a person lifting dumbbells for bicep curls or overhead shoulder press"),
        ("back_pull", "a photo of a person doing pull-ups, lat pulldowns, or cable rows in a gym"),
        ("outdoor_run", "a photo of a person running or jogging outdoors on a road, trail, or track"),
        ("treadmill_cardio", "a photo of a person running or walking on a treadmill or rowing machine"),
        ("cycling", "a photo of a person riding a stationary spin bike or outdoor bicycle"),
        ("yoga_stretch", "a photo of a person doing yoga poses, stretching, or pilates on a floor mat"),
        ("core_abs", "a photo of a person doing planks, crunches, or floor abdominal core workouts"),
        ("hiit_kettlebell", "a photo of a person swinging a kettlebell, slamming battle ropes, or doing box jumps"),
        ("group_class", "a photo of a group fitness class exercising together in a studio"),
        ("meal_nutrition", "a photo of a healthy high-protein meal, salad bowl, smoothie, or meal prep"),
        ("gym_selfie", "a photo of a person taking a post-workout gym mirror selfie"),
        ("rest_recovery", "a photo of a person resting after a workout, foam rolling, drinking water, or relaxing on a couch"),
        ("sports", "a photo of a person playing basketball, tennis, soccer, or football on a court or field"),
    ]

    @app.post("/classify-activity")
    def classify_activity():
        rgb, err = read_upload()
        if err:
            return err
        if clip is None or not clip.load():
            return jsonify(category="general", confidence=0.5)
        import torch
        labels = [prompt for _, prompt in ACTIVITY_PROMPTS]
        keys = [key for key, _ in ACTIVITY_PROMPTS]
        pil_img = Image.fromarray(rgb)
        inputs = clip._proc(text=labels, images=pil_img, return_tensors="pt", padding=True)
        with torch.no_grad():
            probs = (clip._model(**inputs).logits_per_image * 1.5).softmax(dim=1).squeeze(0).tolist()
        best_idx = max(range(len(probs)), key=lambda i: probs[i])
        best_conf = float(probs[best_idx])
        category = keys[best_idx] if best_conf >= 0.16 else "general"
        return jsonify(category=category, confidence=round(best_conf, 3))


    @app.post("/classify-avatar")
    def classify_avatar():
        rgb, err = read_upload()
        if err:
            return err
        if clip is None:
            return jsonify(approved=True, score=0.75)

        score = clip.score_avatar(Image.fromarray(rgb))
        if score is None:
            return jsonify(approved=True, score=0.75)
        return jsonify(approved=score >= 0.55, score=round(score, 3))


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
