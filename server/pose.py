"""
Pose detection with automatic backend selection.

Your original code used the LEGACY MediaPipe API (`mp.solutions.pose`). Google removed that API from recent
MediaPipe releases (1.x), so on a fresh `pip install mediapipe` today it simply does not exist. This module
supports both, so the project works whichever version you end up with:

  legacy  mediapipe <= 0.10.2x  -> mp.solutions.pose  (model is bundled inside the wheel, nothing to download)
  tasks   mediapipe 0.10.x / 1.x -> PoseLandmarker      (needs pose_landmarker_lite.task, downloaded once)

Select explicitly with POSE_BACKEND=legacy|tasks, or leave unset for auto. Point POSE_MODEL_PATH at a local
.task file to skip the download (useful offline).

Every backend returns the same thing: a list of 33 (x, y, visibility) tuples, or None when no person is found.
"""
from __future__ import annotations

import os
import threading
import urllib.request
from pathlib import Path
from typing import Optional, Protocol

import numpy as np

MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/"
    "pose_landmarker_lite.task"
)
DEFAULT_MODEL_PATH = Path(__file__).parent / "models" / "pose_landmarker_lite.task"


class PoseBackend(Protocol):
    name: str

    def detect(self, rgb: np.ndarray) -> Optional[list[tuple[float, float, float]]]: ...


class PoseUnavailable(RuntimeError):
    pass


# --------------------------------------------------------------------------------------------- legacy
class LegacyBackend:
    name = "legacy"

    def __init__(self, min_confidence: float = 0.5):
        import mediapipe as mp

        if not (hasattr(mp, "solutions") and hasattr(mp.solutions, "pose")):
            raise PoseUnavailable("this MediaPipe version has no mp.solutions.pose")
        # static_image_mode=True: every upload is an independent photo, exactly as in your prepare_data.py
        self._pose = mp.solutions.pose.Pose(static_image_mode=True, min_detection_confidence=min_confidence)
        self._lock = threading.Lock()  # MediaPipe graphs are not thread-safe

    def detect(self, rgb):
        with self._lock:
            res = self._pose.process(np.ascontiguousarray(rgb))
        if not res.pose_landmarks:
            return None
        return [(lm.x, lm.y, lm.visibility) for lm in res.pose_landmarks.landmark]


# --------------------------------------------------------------------------------------------- tasks
def ensure_model(path: Path | str | None = None, url: str = MODEL_URL) -> Path:
    """Return a local path to the pose model, downloading it on first use."""
    p = Path(path or os.getenv("POSE_MODEL_PATH") or DEFAULT_MODEL_PATH)
    if p.exists() and p.stat().st_size > 1_000_000:
        return p
    p.parent.mkdir(parents=True, exist_ok=True)
    print(f"[pose] downloading pose model (~6 MB) to {p} ...")
    tmp = p.with_suffix(".part")
    try:
        urllib.request.urlretrieve(url, tmp)
        tmp.replace(p)
    except Exception as e:  # pragma: no cover - network dependent
        tmp.unlink(missing_ok=True)
        raise PoseUnavailable(
            f"could not download the pose model ({e}). Download it manually from\n  {url}\n"
            f"and save it as {p} (or set POSE_MODEL_PATH)."
        ) from e
    return p


class TasksBackend:
    name = "tasks"

    def __init__(self, model_path: Path | str | None = None, min_confidence: float = 0.5):
        import mediapipe as mp
        from mediapipe.tasks.python import BaseOptions, vision

        self._mp = mp
        path = ensure_model(model_path)
        opts = vision.PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(path)),
            running_mode=vision.RunningMode.IMAGE,
            num_poses=1,
            min_pose_detection_confidence=min_confidence,
        )
        self._landmarker = vision.PoseLandmarker.create_from_options(opts)
        self._lock = threading.Lock()

    def detect(self, rgb):
        image = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
        with self._lock:
            res = self._landmarker.detect(image)
        if not res.pose_landmarks:
            return None
        return [(lm.x, lm.y, lm.visibility if lm.visibility is not None else 1.0) for lm in res.pose_landmarks[0]]


# --------------------------------------------------------------------------------------------- factory
_backend: PoseBackend | None = None
_backend_lock = threading.Lock()


def get_backend() -> PoseBackend:
    global _backend
    with _backend_lock:
        if _backend is None:
            _backend = create_backend(os.getenv("POSE_BACKEND", "auto"))
        return _backend


def set_backend(backend: PoseBackend | None) -> None:
    """Install a specific backend (used by tests to inject a fake)."""
    global _backend
    with _backend_lock:
        _backend = backend


def create_backend(kind: str = "auto") -> PoseBackend:
    kind = (kind or "auto").lower()
    errors = []
    order = {"legacy": [LegacyBackend], "tasks": [TasksBackend]}.get(kind, [LegacyBackend, TasksBackend])
    for cls in order:
        try:
            return cls()
        except Exception as e:
            errors.append(f"{cls.name}: {e}")
    raise PoseUnavailable("no pose backend could start -> " + " | ".join(errors))