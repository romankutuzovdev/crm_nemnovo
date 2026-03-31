import time
import uuid

import structlog
from fastapi import Request, Response
from fastapi.exceptions import RequestValidationError
from starlette.middleware.base import BaseHTTPMiddleware

logger = structlog.get_logger()


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = str(uuid.uuid4())
        start_time = time.monotonic()

        # Bind request context to structlog
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            method=request.method,
            path=request.url.path,
            ip=request.client.host if request.client else "unknown",
        )

        try:
            response = await call_next(request)
        except RequestValidationError as exc:
            # Логируем детали 422, иначе в терминале видно только status_code=422.
            try:
                body = await request.body()
                body_text = body.decode("utf-8", errors="replace") if body else ""
            except Exception:
                body_text = ""
            logger.warning(
                "http.request_validation_error",
                errors=exc.errors(),
                body=body_text[:4000],
            )
            raise
        except Exception as exc:
            # Keep request context (request_id, method, path) for exception logs
            logger.exception(
                "http.request_error",
                error_type=type(exc).__name__,
            )
            raise
        duration_ms = round((time.monotonic() - start_time) * 1000, 2)

        logger.info(
            "http.request",
            status_code=response.status_code,
            duration_ms=duration_ms,
        )

        response.headers["X-Request-ID"] = request_id
        return response
