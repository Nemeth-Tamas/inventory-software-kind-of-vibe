from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import Product, Category, Supplier, Location
from barcode_utils import generate_next_barcode
from sqlalchemy import select
from audit_logger import log_audit

from models import User, UserRole
from auth import require_role
from config import settings

router = APIRouter(prefix="/api/seed", tags=["seed"])

@router.post("", status_code=status.HTTP_201_CREATED)
async def seed_development_data(db: AsyncSession = Depends(get_db), current_user: User = Depends(require_role([UserRole.ADMIN]))):
    if not settings.ALLOW_SEEDING:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A demo adatok betöltése le van tiltva ebben a környezetben!"
        )
    # Verify if products are already seeded
    p_check = await db.execute(select(Product).limit(1))
    if p_check.scalars().first():
        return {"status": "skipped", "message": "Az adatbázis már tartalmaz termékeket. A feltöltés kihagyva."}

    try:
        # Get Locations
        locs_res = await db.execute(select(Location))
        locs = {loc.name: loc.id for loc in locs_res.scalars().all()}
        
        # Get Categories
        cats_res = await db.execute(select(Category))
        cats = {c.name: c.id for c in cats_res.scalars().all()}

        # Get Suppliers
        sups_res = await db.execute(select(Supplier))
        sups = {s.name: s.id for s in sups_res.scalars().all()}

        # Seed products list
        seed_items = [
            {
                "name": "Baseus USB-C gyorstöltő kábel 2m",
                "sku": "ACC-BAS-USBC-2M",
                "cat": "Kiegészítők",
                "loc": "Üzlettér",
                "sup": "HRP Hungary Kft",
                "price_net": 1200,
                "price_gross": 1524,
                "sale_gross": 2990,
                "stock": 45,
                "min": 10
            },
            {
                "name": "Samsung 25W PD fali adapter",
                "sku": "CHG-SAM-25W-PD",
                "cat": "Kiegészítők",
                "loc": "Raktár",
                "sup": "Expert Zrt",
                "price_net": 3200,
                "price_gross": 4064,
                "sale_gross": 7990,
                "stock": 2, # Low-stock item
                "min": 5
            },
            {
                "name": "iPhone 15 Pro Max üvegfólia",
                "sku": "SCR-IPH15PM-GLS",
                "cat": "Kiegészítők",
                "loc": "Üzlettér",
                "sup": "HRP Hungary Kft",
                "price_net": 450,
                "price_gross": 571,
                "sale_gross": 1990,
                "stock": 80,
                "min": 20
            },
            {
                "name": "Kingston DataTraveler 64GB USB 3.2",
                "sku": "MEM-KIN-64GB",
                "cat": "Alkatrészek",
                "loc": "Raktár",
                "sup": "Expert Zrt",
                "price_net": 1800,
                "price_gross": 2286,
                "sale_gross": 4490,
                "stock": 15,
                "min": 5
            },
            {
                "name": "BGA forrasztó paszta szervizhez",
                "sku": "SVC-BGA-PASTE",
                "cat": "Szolgáltatások",
                "loc": "Szervizpolc",
                "sup": "HRP Hungary Kft",
                "price_net": 2400,
                "price_gross": 3048,
                "sale_gross": 5990,
                "stock": 8,
                "min": 2
            }
        ]

        for item in seed_items:
            barcode = await generate_next_barcode(db)
            p = Product(
                barcode=barcode,
                name=item["name"],
                sku=item["sku"],
                category_id=cats.get(item["cat"]),
                default_location_id=locs.get(item["loc"]),
                supplier_id=sups.get(item["sup"]),
                purchase_price_net=item["price_net"],
                purchase_price_gross=item["price_gross"],
                sale_price_net=int(item["sale_gross"] / 1.27),
                sale_price_gross=item["sale_gross"],
                current_stock=item["stock"],
                minimum_stock=item["min"],
                vat_rate=27,
                unit="db",
                billingo_sync_state="Nincs összekapcsolva"
            )
            db.add(p)
            
        await log_audit(db, None, "Rendszer", "Magyar nyelvű demo tesztadatok sikeresen feltöltve.")
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Sikertelen seeding: {str(e)}")
        
    return {"status": "success", "message": "Demo adatok sikeresen betöltve."}
