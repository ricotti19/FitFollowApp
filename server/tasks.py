"""Task definitions shared by prepare_data.py, train.py, model.py and app.py (no heavy imports here)."""

# task -> (dataset sub-folder, {class folder: label}, positive class name)
TASKS = {
    "relevance": ("relevance", {"not_fitness": 0, "fitness": 1}, "fitness"),
    "form": ("form", {"bad_form": 0, "good_form": 1}, "good_form"),
}