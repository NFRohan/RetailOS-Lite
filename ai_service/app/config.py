from pathlib import Path
import os


PROJECT_ROOT = Path(__file__).resolve().parents[2]


try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None


if load_dotenv:
    load_dotenv(PROJECT_ROOT / ".env")
    load_dotenv(PROJECT_ROOT / "ai_service" / ".env")


def _path_from_env(name: str, fallback: Path) -> Path:
    raw = os.getenv(name)
    return Path(raw).expanduser().resolve() if raw else fallback.resolve()


def _float_from_env(name: str, fallback: float) -> float:
    raw = os.getenv(name)
    if not raw:
        return fallback
    try:
        return float(raw)
    except ValueError:
        return fallback


def _int_from_env(name: str, fallback: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return fallback
    try:
        return int(raw)
    except ValueError:
        return fallback


def _bool_from_env(name: str, fallback: bool) -> bool:
    raw = os.getenv(name)
    if not raw:
        return fallback
    return raw.lower() in {"1", "true", "yes", "on"}


MODEL_PATH = _path_from_env(
    "RETAILOS_YOLO_MODEL_PATH",
    PROJECT_ROOT / "Detection Model" / "best.pt",
)
UPLOAD_DIR = _path_from_env(
    "RETAILOS_UPLOAD_DIR",
    PROJECT_ROOT / "ai_service" / "storage" / "uploads",
)
OVERLAY_DIR = _path_from_env(
    "RETAILOS_OVERLAY_DIR",
    PROJECT_ROOT / "ai_service" / "storage" / "overlays",
)

MODEL_NAME = os.getenv("RETAILOS_YOLO_MODEL_NAME", "retail-shelf-yolo")
MODEL_VERSION = os.getenv("RETAILOS_YOLO_MODEL_VERSION", "v1")
DEFAULT_CONFIDENCE = _float_from_env("RETAILOS_YOLO_CONFIDENCE", 0.25)
DEFAULT_IMAGE_SIZE = _int_from_env("RETAILOS_YOLO_IMAGE_SIZE", 640)
PUBLIC_BASE_URL = os.getenv("RETAILOS_PUBLIC_BASE_URL", "").rstrip("/")
YOLO_BACKEND = os.getenv("RETAILOS_YOLO_BACKEND", "local").lower()
MODAL_YOLO_URL = os.getenv("RETAILOS_MODAL_YOLO_URL", "").strip()
MODAL_YOLO_TOKEN = os.getenv("RETAILOS_MODAL_YOLO_TOKEN", "").strip()
YOLO_FALLBACK_LOCAL = _bool_from_env("RETAILOS_YOLO_FALLBACK_LOCAL", True)
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("RETAILOS_CORS_ORIGINS", "*").split(",")
    if origin.strip()
]

LLM_PROVIDER = os.getenv("RETAILOS_LLM_PROVIDER", "openai").lower()
LLM_MODEL = os.getenv("RETAILOS_LLM_MODEL", "gpt-4o-mini")
LLM_ENABLED = _bool_from_env("RETAILOS_LLM_ENABLED", True)


def readiness_errors() -> list[str]:
    errors: list[str] = []
    if YOLO_BACKEND == "local" and not MODEL_PATH.exists():
        errors.append(f"YOLO model file does not exist: {MODEL_PATH}")
    if YOLO_BACKEND == "modal" and not MODAL_YOLO_URL:
        errors.append("RETAILOS_MODAL_YOLO_URL is required when RETAILOS_YOLO_BACKEND=modal")
    if YOLO_BACKEND not in {"local", "modal"}:
        errors.append("RETAILOS_YOLO_BACKEND must be either local or modal")
    return errors
