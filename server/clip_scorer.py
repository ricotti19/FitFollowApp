"""
Optional zero-shot workout detector using CLIP. Needs no training images.

Why it is here: pose landmarks only exist when a person is in frame, and your pose classifier only knows the
poses it was trained on. CLIP understands the whole scene ("a gym", "a barbell", "a runner on a trail") and
rejects obvious non-workout uploads (food, memes, screenshots, landscapes) on day one.

Enable:   pip install -r requirements-clip.txt        (adds transformers; the model, ~600 MB, downloads once)
Disable:  CLIP_ENABLED=false
"""
from __future__ import annotations

import os
import threading
from typing import Optional

POSITIVE = [
    "a photo of a person working out in a gym",
    "a photo of a person lifting weights",
    "a photo of a person doing bodyweight exercises like push-ups, squats or lunges",
    "a photo of a person running or jogging outdoors",
    "a photo of a person doing yoga, stretching or pilates",
    "a photo of a person cycling, swimming or playing a sport",
    "a photo of gym equipment such as dumbbells, barbells and machines",
]
NEGATIVE = [
    "a photo of a meal or a plate of food",
    "a meme, screenshot or text on a plain background",
    "a landscape or a city street with no one exercising",
    "a selfie of a person posing without exercising",
    "a photo of a pet or an animal",
    "a photo of a person sitting or standing casually",
    "a photo of a product, a car or a building",
]


class ClipScorer:
    def __init__(self, model_name: Optional[str] = None):
        self.model_name = model_name or os.getenv("CLIP_MODEL", "openai/clip-vit-base-patch32")
        self._model = None
        self._proc = None
        self._lock = threading.Lock()
        self.error: Optional[str] = None

    def load(self) -> bool:
        """Idempotent. Returns False (and records why) if CLIP can't be used - the service then runs without it."""
        if self._model is not None:
            return True
        if self.error:
            return False
        with self._lock:
            if self._model is not None:
                return True
            try:
                import torch  # noqa: F401
                from transformers import CLIPModel, CLIPProcessor

                self._proc = CLIPProcessor.from_pretrained(self.model_name)
                self._model = CLIPModel.from_pretrained(self.model_name).eval()
                return True
            except Exception as e:
                self.error = f"{type(e).__name__}: {str(e)[:200]}"
                return False

    @property
    def available(self) -> bool:
        return self._model is not None

    def score(self, pil_image) -> Optional[float]:
        """P(fitness) = total probability mass on the positive prompts, in 0..1. None when CLIP is unavailable."""
        if not self.load():
            return None
        import torch

        prompts = POSITIVE + NEGATIVE
        inputs = self._proc(text=prompts, images=pil_image, return_tensors="pt", padding=True)
        with torch.no_grad():
            probs = self._model(**inputs).logits_per_image.softmax(dim=1)[0]
        return float(probs[: len(POSITIVE)].sum())


def enabled() -> bool:
    return os.getenv("CLIP_ENABLED", "true").lower() not in ("0", "false", "no", "off")