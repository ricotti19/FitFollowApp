"""
The neural network and a self-contained save/load "bundle".

Same shape as your original - a small fully-connected network on pose features - with two additions:
  * Dropout, because pose datasets are small and a 128-unit MLP memorises them quickly.
  * The bundle also stores the mean/std used to standardise the inputs. Without them the server would feed
    the network differently-scaled numbers than it was trained on.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

from features import FEATURE_DIM

TASKS = {
    # task -> (dataset sub-folder, {class folder: label}, positive class name)
    "relevance": ("relevance", {"not_fitness": 0, "fitness": 1}, "fitness"),
    
    "form": ("form", {"bad_form": 0, "good_form": 1}, "good_form"),
}


class PoseClassifier(nn.Module):
    def __init__(self, input_dim: int = FEATURE_DIM, hidden_dim: int = 128, output_dim: int = 2, dropout: float = 0.2):
        super().__init__()
        self.network = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, output_dim),
        )

    def forward(self, x):
        return self.network(x)


def save_bundle(path, model: PoseClassifier, mean: np.ndarray, std: np.ndarray, meta: dict) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "state_dict": model.state_dict(),
            "mean": [float(x) for x in mean],
            "std": [float(x) for x in std],
            "input_dim": int(len(mean)),
            "meta": meta,  # plain python types only, so weights_only loading works
        },
        path,
    )


class LoadedModel:
    def __init__(self, model: PoseClassifier, mean: np.ndarray, std: np.ndarray, meta: dict):
        self.model, self.mean, self.std, self.meta = model, mean, std, meta

    @torch.no_grad()
    def predict_proba(self, features: np.ndarray) -> float:
        """Probability of the POSITIVE class (fitness / good_form) for one feature vector."""
        x = (np.asarray(features, dtype=np.float32) - self.mean) / self.std
        logits = self.model(torch.from_numpy(x).unsqueeze(0))
        return float(torch.softmax(logits, dim=1)[0, 1])


def load_bundle(path) -> LoadedModel:
    bundle = torch.load(path, map_location="cpu", weights_only=True)
    if bundle["input_dim"] != FEATURE_DIM:
        raise ValueError(
            f"{path} was trained with {bundle['input_dim']} features but this code produces {FEATURE_DIM}. "
            "Re-run prepare_data.py and train.py."
        )
    model = PoseClassifier(input_dim=bundle["input_dim"])
    model.load_state_dict(bundle["state_dict"])
    model.eval()
    mean = np.asarray(bundle["mean"], dtype=np.float32)
    std = np.asarray(bundle["std"], dtype=np.float32)
    return LoadedModel(model, mean, std, bundle.get("meta", {}))