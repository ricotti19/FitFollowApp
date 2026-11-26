import os
import sys
import modal

def download_models():
    from transformers import CLIPModel, CLIPProcessor
    CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
    CLIPModel.from_pretrained("openai/clip-vit-base-patch32")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1", "libglib2.0-0")
    .pip_install(
        "torch",
        "torchvision",
        extra_index_url="https://download." + "pytorch.org/whl/cpu",
    )
    .pip_install(
        "flask",
        "numpy",
        "opencv-python-headless",
        "pillow",
        "mediapipe==0.10.14",
        "transformers",
        "huggingface-hub",
    )
    .run_function(download_models)
    .add_local_dir(".", remote_path="/app", ignore=[".venv", "__pycache__"])
)

app = modal.App("fitfollow-cv", image=image)

@app.function(memory=2048, timeout=120, min_containers=1, scaledown_window=300, max_containers=5)
@modal.wsgi_app()
def flask_app():

    os.chdir("/app")
    if "/app" not in sys.path:
        sys.path.insert(0, "/app")
    os.environ["CLIP_ENABLED"] = "true"
    from app import create_app
    return create_app()
