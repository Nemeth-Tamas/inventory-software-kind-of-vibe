from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from barcode_utils import generate_next_barcode
from fastapi.middleware.cors import CORSMiddleware
from routers import auth, master_data, products, inventory, stocktake, billingo, excel, audit, events, seed, settings

app = FastAPI(title="Raktárkezelő API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
app.include_router(settings.router)
app.include_router(seed.router)

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "system": "Raktárkezelő API"}

@app.post("/api/products/generate-barcode")
async def get_barcode(db: AsyncSession = Depends(get_db)):
    try:
        barcode = await generate_next_barcode(db)
        await db.commit()
        return {"barcode": barcode}
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Szerver hiba: {str(e)}")
