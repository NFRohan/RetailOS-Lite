from fastapi import FastAPI, File, Form, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import config
from .compliance import build_supervisor_summary, evaluate_compliance
from .image_io import download_image, ensure_image_path, save_upload
from .llm_analysis import analyze_retail_image
from .logging_utils import log_event, request_logging_middleware
from .schemas import HealthResponse, ReadyResponse, ShelfAnalysisResponse, YoloDetectRequest, YoloResponse
from .yolo_backend import RemoteYoloError, run_yolo_analysis
from .yolo_detector import get_detector, model_loaded


app = FastAPI(
    title="RetailOS Lite AI Service",
    description="YOLO shelf detection and AI analysis service for RetailOS Lite.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.middleware("http")(request_logging_middleware)

config.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
config.OVERLAY_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/artifacts/overlays", StaticFiles(directory=str(config.OVERLAY_DIR)), name="overlays")


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        modelLoaded=model_loaded(),
        modelPath=str(config.MODEL_PATH),
    )


@app.get("/ready", response_model=ReadyResponse)
def ready(response: Response) -> ReadyResponse:
    errors = config.readiness_errors()
    if errors:
        response.status_code = 503
    return ReadyResponse(
        status="ready" if not errors else "not_ready",
        yoloBackend=config.YOLO_BACKEND,
        errors=errors,
    )


@app.get("/model")
def model_info():
    detector = get_detector() if config.YOLO_BACKEND == "local" else None
    return {
        "modelName": config.MODEL_NAME,
        "modelVersion": config.MODEL_VERSION,
        "modelPath": str(config.MODEL_PATH),
        "yoloBackend": config.YOLO_BACKEND,
        "modalConfigured": bool(config.MODAL_YOLO_URL),
        "classNames": detector.names if detector else {0: "foodie_noodles_olympics", 1: "mr_noodles_competitor"},
    }


@app.post("/detect-yolo", response_model=YoloResponse)
def detect_yolo(payload: YoloDetectRequest) -> YoloResponse:
    try:
        image_path = resolve_request_image(payload)

        return run_yolo_analysis(image_path=image_path, payload=payload)
    except (FileNotFoundError, ValueError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RemoteYoloError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.post("/analyze-shelf", response_model=ShelfAnalysisResponse)
def analyze_shelf(payload: YoloDetectRequest) -> ShelfAnalysisResponse:
    warnings: list[str] = []
    try:
        image_path = resolve_request_image(payload)
    except (FileNotFoundError, ValueError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    try:
        yolo = run_yolo_analysis(image_path=image_path, payload=payload)
    except RemoteYoloError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    llm = None
    if payload.use_llm:
        try:
            llm = analyze_retail_image(
                image_path=image_path,
                yolo=yolo,
                outlet_name=payload.outlet_name,
                rep_notes=payload.rep_notes,
            )
        except Exception as error:
            warnings.append("LLM analysis failed; using YOLO-only compliance fallback.")
            log_event(
                "llm_analysis_failed",
                visitId=payload.visit_id,
                model=config.LLM_MODEL,
                error=str(error),
            )

    compliance = evaluate_compliance(yolo, llm)
    return ShelfAnalysisResponse(
        visitId=payload.visit_id,
        yolo=yolo,
        llm=llm,
        compliance=compliance,
        supervisorSummary=build_supervisor_summary(yolo, compliance, llm),
        warnings=warnings,
    )


def resolve_request_image(payload: YoloDetectRequest):
    if payload.image_path:
        return ensure_image_path(payload.image_path)
    if payload.image_url:
        return download_image(payload.image_url, config.UPLOAD_DIR)
    raise ValueError("Either imagePath or imageUrl is required.")


@app.post("/detect-yolo/upload", response_model=YoloResponse)
def detect_yolo_upload(
    file: UploadFile = File(...),
    visit_id: str | None = Form(default=None),
    confidence: float = Form(default=config.DEFAULT_CONFIDENCE),
    image_size: int = Form(default=config.DEFAULT_IMAGE_SIZE),
    save_overlay: bool = Form(default=True),
) -> YoloResponse:
    try:
        image_path = save_upload(file, config.UPLOAD_DIR)
        payload = YoloDetectRequest(
            visitId=visit_id,
            imagePath=str(image_path),
            confidence=confidence,
            imageSize=image_size,
            saveOverlay=save_overlay,
        )
        return run_yolo_analysis(image_path=image_path, payload=payload)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RemoteYoloError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
