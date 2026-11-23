"""
Pose-landmark -> feature-vector maths. Pure numpy: no MediaPipe, no PyTorch, so it is fast to test
and identical for training (prepare_data.py) and serving (app.py).

Your original pipeline fed the network 32 RAW image coordinates (16 joints x (x, y)). That works when the
camera and the person are always framed the same way, but a gym photo is not: the same squat shot from
further away or off-centre gives completely different numbers. Two upgrades fix that while keeping your idea:

  1. Coordinates are re-expressed relative to the hips and divided by torso length
     -> the same pose gives the same numbers wherever the person stands and however big they appear.
  2. Eight joint angles (elbows, shoulders, hips, knees) are appended. Angles describe form directly and
     are also scale/position independent.

Feature vector = 32 normalised coordinates + 8 angles = 40 numbers (FEATURE_DIM).
"""
from __future__ import annotations

import math
from typing import Optional, Sequence

import numpy as np

# MediaPipe BlazePose has 33 landmarks. These are the 16 your original DESIRED_LANDMARKS list used, in the
# same order (spelled as indices so this file does not depend on which MediaPipe API is installed).
KEY_LANDMARKS = {
    "LEFT_SHOULDER": 11, "RIGHT_SHOULDER": 12,
    "LEFT_ELBOW": 13, "RIGHT_ELBOW": 14,
    "LEFT_WRIST": 15, "RIGHT_WRIST": 16,
    "LEFT_HIP": 23, "RIGHT_HIP": 24,
    "LEFT_KNEE": 25, "RIGHT_KNEE": 26,
    "LEFT_ANKLE": 27, "RIGHT_ANKLE": 28,
    "LEFT_HEEL": 29, "RIGHT_HEEL": 30,
    "LEFT_FOOT_INDEX": 31, "RIGHT_FOOT_INDEX": 32,
}
KEY_IDX = list(KEY_LANDMARKS.values())
NUM_LANDMARKS = 33
NUM_ANGLES = 8
FEATURE_DIM = len(KEY_IDX) * 2 + NUM_ANGLES  # 40

# (a, b, c) -> angle at b between segments b->a and b->c
_ANGLES = [
    (11, 13, 15), (12, 14, 16),  # elbows
    (13, 11, 23), (14, 12, 24),  # shoulders (elbow - shoulder - hip)
    (11, 23, 25), (12, 24, 26),  # hips (shoulder - hip - knee)
    (23, 25, 27), (24, 26, 28),  # knees
]

# Left/right pairs for mirroring (BlazePose layout)
_MIRROR_PAIRS = [(1, 4), (2, 5), (3, 6), (7, 8), (9, 10), (11, 12), (13, 14), (15, 16),
                 (17, 18), (19, 20), (21, 22), (23, 24), (25, 26), (27, 28), (29, 30), (31, 32)]
_EPS = 1e-6


def as_array(landmarks: Sequence) -> np.ndarray:
    """Accepts a (33, 2|3|4) array-like of x, y[, ...] and returns a float32 (33, >=2) array."""
    arr = np.asarray(landmarks, dtype=np.float32)
    if arr.ndim != 2 or arr.shape[0] != NUM_LANDMARKS or arr.shape[1] < 2:
        raise ValueError(f"expected {NUM_LANDMARKS} landmarks with at least x,y; got shape {arr.shape}")
    return arr


def _angle(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
    """Angle at b in radians, 0..pi. Degenerate (zero-length) segments return pi/2 rather than NaN."""
    v1, v2 = a - b, c - b
    n1, n2 = float(np.linalg.norm(v1)), float(np.linalg.norm(v2))
    if n1 < _EPS or n2 < _EPS:
        return math.pi / 2
    cos = float(np.dot(v1, v2) / (n1 * n2))
    return math.acos(max(-1.0, min(1.0, cos)))


def landmarks_to_features(landmarks: Sequence) -> np.ndarray:
    """33 landmarks (x, y normalised 0..1 by MediaPipe) -> FEATURE_DIM float32 vector."""
    lm = as_array(landmarks)[:, :2]

    hip_mid = (lm[23] + lm[24]) / 2.0
    shoulder_mid = (lm[11] + lm[12]) / 2.0
    torso = float(np.linalg.norm(shoulder_mid - hip_mid))
    scale = max(torso, 1e-3)  # a crouched/occluded torso must not blow the coordinates up

    coords = ((lm[KEY_IDX] - hip_mid) / scale).reshape(-1)
    coords = np.clip(coords, -5.0, 5.0)

    angles = [_angle(lm[a], lm[b], lm[c]) / math.pi for a, b, c in _ANGLES]  # 0..1
    return np.concatenate([coords, np.asarray(angles, dtype=np.float32)]).astype(np.float32)


def visibility_score(landmarks: Sequence, threshold: float = 0.5) -> float:
    """Share of the 16 key joints MediaPipe is confident are visible (0..1). Needs the 4th column."""
    arr = np.asarray(landmarks, dtype=np.float32)
    if arr.ndim != 2 or arr.shape[1] < 4:
        return 1.0  # no visibility info supplied: do not penalise
    return float(np.mean(arr[KEY_IDX, 3] >= threshold))


def flip_landmarks(landmarks: Sequence) -> np.ndarray:
    """Mirror the pose left<->right. Used to double the training data (a left-handed squat is still a squat)."""
    arr = as_array(landmarks).copy()
    arr[:, 0] = 1.0 - arr[:, 0]
    for a, b in _MIRROR_PAIRS:
        arr[[a, b]] = arr[[b, a]]
    return arr


def feature_names() -> list[str]:
    names = []
    for key in KEY_LANDMARKS:
        names += [f"{key}_x", f"{key}_y"]
    names += ["elbow_L", "elbow_R", "shoulder_L", "shoulder_R", "hip_L", "hip_R", "knee_L", "knee_R"]
    return names


def maybe_features(landmarks: Optional[Sequence]) -> Optional[np.ndarray]:
    return None if landmarks is None else landmarks_to_features(landmarks)