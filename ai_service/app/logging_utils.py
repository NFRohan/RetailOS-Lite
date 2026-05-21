import json
import logging
import time
import uuid

from fastapi import Request


logger = logging.getLogger("retailos.ai_service")
logging.basicConfig(level=logging.INFO, format="%(message)s")


def log_event(event: str, **fields):
    logger.info(json.dumps({"event": event, **fields}, default=str))


async def request_logging_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id", uuid.uuid4().hex)
    started = time.perf_counter()

    try:
        response = await call_next(request)
    except Exception as error:
        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        log_event(
            "request_failed",
            requestId=request_id,
            method=request.method,
            path=request.url.path,
            durationMs=duration_ms,
            error=str(error),
        )
        raise

    duration_ms = round((time.perf_counter() - started) * 1000, 2)
    response.headers["x-request-id"] = request_id
    log_event(
        "request_completed",
        requestId=request_id,
        method=request.method,
        path=request.url.path,
        statusCode=response.status_code,
        durationMs=duration_ms,
    )
    return response
