"""
Combines the available signals into the single `confidence` the Express API thresholds
(>= 0.6 approved, 0.4-0.6 moderator review, < 0.4 rejected - see express-server/src/services/cv.js).

Signals
  clip  zero-shot "is this a fitness photo?" probability from CLIP      (optional, no training data needed)
  mlp   probability from YOUR trained pose classifier (relevance task)   (needs dataset + train.py)
  pose  whether a person was found + how many key joints are visible     (always available)

Design rule: with NO trained model and NO CLIP, the service must never auto-approve. Pose alone proves
"there is a person", not "the person is working out", so that mode caps confidence below the approval line
and sends every person-photo to a human moderator. Quality (and automation) improves as you add CLIP and/or train.
"""
from __future__ import annotations

from typing import Optional

W_CLIP = 0.6
W_MLP = 0.4
POSE_ONLY_BASE = 0.40  # 0.40 .. 0.55 -> always "review", never "approved"
POSE_ONLY_SPAN = 0.15


def combine(pose_found: bool, visibility: float, mlp_prob: Optional[float], clip_prob: Optional[float]) -> dict:
    signals = {
        "clip": None if clip_prob is None else round(float(clip_prob), 4),
        "mlp": None if mlp_prob is None else round(float(mlp_prob), 4),
        "visibility": round(float(visibility), 4) if pose_found else 0.0,
    }

    has_clip = clip_prob is not None
    has_mlp = mlp_prob is not None and pose_found  # the MLP can only run when a pose was found

    if has_clip and has_mlp:
        mode, conf = "clip+pose-model", W_CLIP * clip_prob + W_MLP * mlp_prob
    elif has_clip:
        mode, conf = "clip", clip_prob
    elif has_mlp:
        mode, conf = "pose-model", mlp_prob
    elif pose_found:
        mode, conf = "pose-only", POSE_ONLY_BASE + POSE_ONLY_SPAN * visibility
    else:
        mode, conf = "pose-only", 0.0

    return {
        "confidence": round(float(max(0.0, min(1.0, conf))), 4),
        "poseFound": bool(pose_found),
        "mode": mode,
        "signals": signals,
    }