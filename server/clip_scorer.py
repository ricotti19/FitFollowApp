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
    "a photo of a protein shaker bottle, hydration flask, or post-workout supplement",
    "a photo of a person eating a healthy salad, fresh fruit bowl, or clean post-workout meal",
]


NEGATIVE = [
    "a photo of fast food, junk food, fried food, sugary dessert, or heavy restaurant dining",
    "a close-up photo of an empty plate or unattended food without a person exercising or meal prepping",
    "a photo of a meme, screenshot, or text on a plain background",
    "a photo of a landscape, nature scenery, or city street with no one exercising",
    "a photo of a casual selfie of a person posing without exercising",
    "a photo of a pet, dog, cat, or animal",
    "a photo of an empty table, book, electronics, or inanimate object without a person",
    "a photo of a person lounging or being lazy on a couch or bed",
    "a photo of a person sitting, standing, or talking casually without exercising",
    "a photo of a retail product, car, or building exterior",
    "a photo of a person in a bikini or swimsuit at the beach or pool",
    "a photo of a glamour selfie or formal evening dress",
    "a photo of a person in lingerie or underwear",
    "a photo of a naked person without clothes",
    "a photo of a person in an explicit or sexual position",
    "a photo of a person sleeping in bed",
    "a photo of people fighting or in physical violence",
    "a photo of a person watching television or scrolling a phone on a sofa",
    "a photo of a person sitting, standing, or talking casually without exercising",
    "a photo of a retail product, car, or building exterior",
    "a photo of a person in a bikini or swimsuit at the beach or pool",
    "a photo of a glamour selfie or formal evening dress",
    "a photo of a person in lingerie or underwear",
    "a photo of a naked person without clothes",
    "a photo of a person in an explicit or sexual position",
    "a photo of a person sleeping in bed",
    "a photo of people fighting or in physical violence",
    "a photo of a person watching television or scrolling a phone on a sofa",
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


    def score_text(self, query: str, labels: list[str], scale: float = 25.0) -> Optional[list[float]]:
        """Cosine-similarity softmax probabilities of `query` against `labels`."""
        if not self.load():
            return None
        import torch

        q_in = self._proc(text=[query], return_tensors="pt", padding=True, truncation=True)
        c_in = self._proc(text=labels, return_tensors="pt", padding=True, truncation=True)
        with torch.no_grad():
            q_feat = self._model.get_text_features(**q_in)
            q_feat = q_feat / q_feat.norm(dim=-1, keepdim=True)
            c_feat = self._model.get_text_features(**c_in)
            c_feat = c_feat / c_feat.norm(dim=-1, keepdim=True)
            return (q_feat @ c_feat.T * scale).softmax(dim=-1).squeeze(0).tolist()

    def score_avatar(self, pil_image) -> Optional[float]:
        """Reuses POSITIVE + NEGATIVE prompts plus athletic headshot allowance."""
        if not self.load():
            return None
        import torch

        prompts = ["a clean fitness portrait, gym selfie, or athletic headshot"] + POSITIVE + NEGATIVE
        inputs = self._proc(text=prompts, images=pil_image, return_tensors="pt", padding=True)
        with torch.no_grad():
            probs = self._model(**inputs).logits_per_image.softmax(dim=1).squeeze(0)
        return float(probs[: 1 + len(POSITIVE)].sum())


def enabled() -> bool:
    return os.getenv("CLIP_ENABLED", "true").lower() not in ("0", "false", "no", "off")
