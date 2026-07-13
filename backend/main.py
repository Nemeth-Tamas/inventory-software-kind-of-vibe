from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import auth, master_data, products, inventory, stocktake, billingo, excel, audit, events, seed, settings as settings_router, health
from config import settings

app = FastAPI(title="Raktárkezelő API", version="1.0.0")

# CORS middleware configuration
origins = []
if settings.CORS_ALLOWED_ORIGINS:
    origins = [o.strip() for o in settings.CORS_ALLOWED_ORIGINS.split(",") if o.strip()]
elif settings.APP_ENV == "development":
    origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:18080",
        "http://127.0.0.1:18080"
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


