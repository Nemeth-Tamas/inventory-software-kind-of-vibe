import uuid
import logging
from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import SQLAlchemyError
from routers import (
    auth,
    master_data,
    products,
    inventory,
    stocktake,
    billingo,
    excel,
    audit,
    events,
    seed,
    settings as settings_router,
    health,
)
from config import settings

app = FastAPI(title="Raktárkezelő API", version="1.0.0")

# Set up logging format
logger = logging.getLogger("app_logger")
logger.setLevel(logging.INFO)
if logger.handlers:
    logger.handlers.clear()
handler = logging.StreamHandler()
formatter = logging.Formatter(
    "[%(asctime)s] [%(levelname)s] [CID:%(correlation_id)s] %(message)s"
)
handler.setFormatter(formatter)
logger.addHandler(handler)


class CorrelationIdAdapter(logging.LoggerAdapter):
    def process(self, msg, kwargs):
        extra = self.extra.copy() if self.extra else {}
        kwargs["extra"] = {"correlation_id": extra.get("correlation_id", "N/A")}
        return msg, kwargs


@app.middleware("http")
async def add_correlation_id(request: Request, call_next):
    correlation_id = request.headers.get("X-Correlation-ID") or str(uuid.uuid4())
    request.state.correlation_id = correlation_id

    request_logger = CorrelationIdAdapter(logger, {"correlation_id": correlation_id})
    request.state.logger = request_logger

    request_logger.info(f"Kérés indult: {request.method} {request.url.path}")

    # SSE endpoint must bypass response-header mutation: assigning a header on a
    # StreamingResponse inside middleware buffers the entire body before writing,
    # which immediately terminates the infinite event stream.
    if request.url.path == "/api/events":
        response = await call_next(request)
        return response

    try:
        response: Response = await call_next(request)
        response.headers["X-Correlation-ID"] = correlation_id
        request_logger.info(f"Kérés lefutott: status={response.status_code}")
        return response
    except SQLAlchemyError as exc:
        request_logger.error(f"Adatbázis hiba történt: {str(exc)}", exc_info=True)

        exc_str = str(exc).lower()
        if "foreign key" in exc_str or "foreignkey" in exc_str:
            detail = "A művelet nem hajtható végre, mert a rekordhoz kapcsolódó más adatok is léteznek."
            status_code = 409
        elif "unique constraint" in exc_str or "duplicate key" in exc_str:
            detail = "A megadott azonosító vagy egyedi érték már létezik a rendszerben."
            status_code = 409
        else:
            detail = "Belső adatbázis hiba történt. Kérjük, próbálja meg később."
            status_code = 500

        return JSONResponse(
            status_code=status_code,
            content={"detail": detail, "correlation_id": correlation_id},
            headers={"X-Correlation-ID": correlation_id},
        )
    except Exception as exc:
        if isinstance(exc, HTTPException):
            return JSONResponse(
                status_code=exc.status_code,
                content={"detail": exc.detail},
                headers={"X-Correlation-ID": correlation_id},
            )

        request_logger.error(f"Váratlan hiba történt: {str(exc)}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "detail": "Belső szerverhiba történt. Kérjük, próbálja meg később.",
                "correlation_id": correlation_id,
            },
            headers={"X-Correlation-ID": correlation_id},
        )


# CORS middleware configuration
origins = []
if settings.CORS_ALLOWED_ORIGINS:
    origins = [o.strip() for o in settings.CORS_ALLOWED_ORIGINS.split(",") if o.strip()]
elif settings.APP_ENV == "development":
    origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:18080",
        "http://127.0.0.1:18080",
    ]

if origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Include modular routers
app.include_router(auth.router)
app.include_router(master_data.router)
app.include_router(products.router)
app.include_router(inventory.router)
app.include_router(stocktake.router)
app.include_router(billingo.router)
app.include_router(excel.router)
app.include_router(audit.router)
app.include_router(events.router)
app.include_router(settings_router.router)
app.include_router(seed.router)
app.include_router(health.router)


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "system": "Raktárkezelő API"}
