from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from database import get_db
from models import Product, User, UserRole, SystemSetting, BillingoQueueItem, BillingoQueueAction, BillingoQueueStatus
from auth import require_role
from config import settings
from settings_utils import decrypt_val
import httpx
from datetime import datetime
from audit_logger import log_audit
from typing import Optional
import json

router = APIRouter(prefix="/api/billingo", tags=["billingo"])

async def get_billingo_api_key(db: AsyncSession) -> Optional[str]:
    # 1. Query database settings
    result = await db.execute(select(SystemSetting).where(SystemSetting.key == "billingo_api_key"))
    setting = result.scalar_one_or_none()
    if setting and setting.value:
        try:
            return decrypt_val(setting.value)
        except Exception:
            pass
    # 2. Fallback to settings.py / env config
    return settings.BILLINGO_API_KEY

async def execute_queue_item(db: AsyncSession, item: BillingoQueueItem, api_key: str) -> bool:
    try:
        headers = {"X-API-KEY": api_key}
        payload = json.loads(item.payload)
        
        async with httpx.AsyncClient() as client:
            if item.product.billingo_product_id:
                # Update existing product in Billingo
                url = f"https://api.billingo.hu/v3/products/{item.product.billingo_product_id}"
                response = await client.put(url, json=payload, headers=headers, timeout=5.0)
                
                # If product not found in Billingo (e.g. deleted manually), fall back to create (POST)
                if response.status_code == 404:
                    response = await client.post("https://api.billingo.hu/v3/products", json=payload, headers=headers, timeout=5.0)
            else:
                # Create new product in Billingo
                response = await client.post("https://api.billingo.hu/v3/products", json=payload, headers=headers, timeout=5.0)
                
            if response.status_code in (200, 201):
                resp_data = response.json()
                item.product.billingo_product_id = str(resp_data.get("id"))
                item.product.billingo_sync_state = "Szinkronban"
                item.product.billingo_last_sync = datetime.utcnow()
                item.status = BillingoQueueStatus.COMPLETED
                item.processed_at = datetime.utcnow()
                return True
            else:
                item.status = BillingoQueueStatus.FAILED
                item.error_message = f"API válasz: {response.status_code} - {response.text}"
                item.product.billingo_sync_state = "Hiba"
                return False
    except Exception as e:
        item.status = BillingoQueueStatus.FAILED
        item.error_message = f"Rendszerhiba: {str(e)}"
        item.product.billingo_sync_state = "Hiba"
        return False

@router.get("/status")
async def get_connection_status(db: AsyncSession = Depends(get_db)):
    api_key = await get_billingo_api_key(db)
    
    if not api_key:
        if settings.ALLOW_MOCK_BILLINGO:
            return {
                "status": "Nincs beállítva",
                "message": "A Billingo API kulcs hiányzik, de a szimuláció engedélyezett (ALLOW_MOCK_BILLINGO=true).",
                "stock_sync_message": "Szimulációs mód aktív."
            }
        else:
            return {
                "status": "Nincs beállítva",
                "message": "A Billingo API kulcs hiányzik. A szinkronizáció le van tiltva.",
                "stock_sync_message": "Billingo szinkron letiltva."
            }
    
    try:
        headers = {"X-API-KEY": api_key}
        async with httpx.AsyncClient() as client:
            response = await client.get("https://api.billingo.hu/v3/partners", headers=headers, timeout=5.0)
            if response.status_code == 200:
                return {
                    "status": "Kapcsolódva",
                    "message": "Sikeres kapcsolat a Billingo API V3-al.",
                    "stock_sync_message": "A rendszer készen áll a termékadatok (név, árak, ÁFA, cikkszám) szinkronizálására a számlázáshoz."
                }
            else:
                return {
                    "status": "Hiba",
                    "message": f"Nem sikerült a kapcsolódás. API válasz kód: {response.status_code}",
                    "stock_sync_message": "Billingo kapcsolat sikertelen."
                }
    except Exception as e:
        return {
            "status": "Hiba",
            "message": f"Hálózati hiba: {str(e)}",
            "stock_sync_message": "Billingo kapcsolat sikertelen."
        }

@router.get("/queue")
async def get_sync_queue(db: AsyncSession = Depends(get_db), current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER]))):
    # Fetch all pending or failed queue items
    result = await db.execute(
        select(BillingoQueueItem)
        .where(BillingoQueueItem.status == BillingoQueueStatus.PENDING)
        .options(selectinload(BillingoQueueItem.product))
        .order_by(BillingoQueueItem.created_at.desc())
    )
    items = result.scalars().all()
    return items

@router.post("/sync-product/{product_id}")
async def queue_product_sync(product_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER]))):
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Termék nem található")
        
    payload = {
        "name": product.name,
        "description": product.description or "",
        "net_unit_price": float(product.sale_price_net) if product.sale_price_net else 0.0,
        "unit": product.unit or "db",
        "vat": "AAM" if product.vat_rate == 0 else f"{product.vat_rate}%",
        "sku": product.sku,
        "ean": product.barcode or ""
    }
    
    # Check if a pending queue item already exists for this product
    q_result = await db.execute(
        select(BillingoQueueItem)
        .where((BillingoQueueItem.product_id == product_id) & (BillingoQueueItem.status == BillingoQueueStatus.PENDING))
    )
    existing_item = q_result.scalar_one_or_none()
    
    action = BillingoQueueAction.UPDATE if product.billingo_product_id else BillingoQueueAction.CREATE
    
    if existing_item:
        existing_item.action = action
        existing_item.payload = json.dumps(payload)
        existing_item.created_at = datetime.utcnow()
    else:
        new_item = BillingoQueueItem(
            product_id=product_id,
            action=action,
            payload=json.dumps(payload),
            status=BillingoQueueStatus.PENDING
        )
        db.add(new_item)
        
    product.billingo_sync_state = "Sorban áll"
    await db.commit()
    await log_audit(db, current_user.id, current_user.username, f"Billingo szinkronizációs kérés sorba állítva: {product.name}")
    return {"status": "success", "message": "A szinkronizációs kérés sikeresen sorba állítva felülvizsgálatra."}

@router.post("/queue/process/{item_id}")
async def process_queue_item(item_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER]))):
    # Fetch queue item
    result = await db.execute(
        select(BillingoQueueItem)
        .where(BillingoQueueItem.id == item_id)
        .options(selectinload(BillingoQueueItem.product))
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Sorban álló elem nem található")
        
    api_key = await get_billingo_api_key(db)
    if not api_key:
        if settings.ALLOW_MOCK_BILLINGO:
            # Mock mode
            item.product.billingo_product_id = f"mock-bill-prod-{item.product.barcode}"
            item.product.billingo_sync_state = "Szinkronban"
            item.product.billingo_last_sync = datetime.utcnow()
            item.status = BillingoQueueStatus.COMPLETED
            item.processed_at = datetime.utcnow()
            await db.commit()
            await log_audit(db, current_user.id, current_user.username, f"Billingo szimulált szinkron feldolgozva: {item.product.name}")
            return {"status": "success", "message": "Szimulációs szinkronizáció kész."}
        else:
            raise HTTPException(status_code=400, detail="A Billingo API kulcs hiányzik.")
            
    success = await execute_queue_item(db, item, api_key)
    await db.commit()
    
    if success:
        await log_audit(db, current_user.id, current_user.username, f"Billingo szinkronizáció végrehajtva: {item.product.name}")
        return {"status": "success", "message": "Sikeresen szinkronizálva a Billingo-val."}
    else:
        raise HTTPException(status_code=400, detail=f"Sikertelen szinkronizáció: {item.error_message}")

@router.post("/queue/process-all")
async def process_all_queue_items(db: AsyncSession = Depends(get_db), current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER]))):
    result = await db.execute(
        select(BillingoQueueItem)
        .where(BillingoQueueItem.status == BillingoQueueStatus.PENDING)
        .options(selectinload(BillingoQueueItem.product))
    )
    items = result.scalars().all()
    if not items:
        return {"status": "success", "message": "Nincs feldolgozandó elem a sorban.", "processed_count": 0}
        
    api_key = await get_billingo_api_key(db)
    if not api_key and not settings.ALLOW_MOCK_BILLINGO:
        raise HTTPException(status_code=400, detail="A Billingo API kulcs hiányzik.")
        
    processed_count = 0
    failed_count = 0
    
    for item in items:
        if not api_key and settings.ALLOW_MOCK_BILLINGO:
            item.product.billingo_product_id = f"mock-bill-prod-{item.product.barcode}"
            item.product.billingo_sync_state = "Szinkronban"
            item.product.billingo_last_sync = datetime.utcnow()
            item.status = BillingoQueueStatus.COMPLETED
            item.processed_at = datetime.utcnow()
            processed_count += 1
        else:
            success = await execute_queue_item(db, item, api_key)
            if success:
                processed_count += 1
            else:
                failed_count += 1
                
    await db.commit()
    await log_audit(db, current_user.id, current_user.username, f"Billingo tömeges szinkronizáció lefutott: {processed_count} sikeres, {failed_count} sikertelen")
    return {"status": "success", "processed_count": processed_count, "failed_count": failed_count}

@router.post("/queue/delete/{item_id}")
async def delete_queue_item(item_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER]))):
    result = await db.execute(
        select(BillingoQueueItem)
        .where(BillingoQueueItem.id == item_id)
        .options(selectinload(BillingoQueueItem.product))
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Sorban álló elem nem található")
        
    item.product.billingo_sync_state = "Nincs szinkronizálva" if not item.product.billingo_product_id else "Szinkronban"
    await db.delete(item)
    await db.commit()
    return {"status": "success", "message": "A szinkronizációs kérés eltávolítva a sorból."}

@router.post("/import")
async def import_products_from_billingo(db: AsyncSession = Depends(get_db), current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER]))):
    api_key = await get_billingo_api_key(db)
    if not api_key:
        raise HTTPException(status_code=400, detail="A Billingo API kulcs hiányzik. Kérjük, állítsa be a beállítások menüben!")
        
    # Get or create default Category, Location, Supplier
    from models import Category, Location, Supplier
    cat_res = await db.execute(select(Category))
    default_category = cat_res.scalars().first()
    if not default_category:
        default_category = Category(name="Importált")
        db.add(default_category)
        await db.flush()
        
    loc_res = await db.execute(select(Location))
    default_location = loc_res.scalars().first()
    if not default_location:
        default_location = Location(name="Fő Raktár")
        db.add(default_location)
        await db.flush()
        
    sup_res = await db.execute(select(Supplier))
    default_supplier = sup_res.scalars().first()
    if not default_supplier:
        default_supplier = Supplier(name="Billingo Import")
        db.add(default_supplier)
        await db.flush()
        
    # Fetch all existing barcodes to prevent duplicate barcode assignments (both from DB and within this batch)
    bar_res = await db.execute(select(Product.barcode))
    existing_barcodes = {b for b in bar_res.scalars().all() if b}
        
    imported_count = 0
    updated_count = 0
    
    try:
        headers = {"X-API-KEY": api_key}
        async with httpx.AsyncClient() as client:
            page = 1
            while True:
                response = await client.get(f"https://api.billingo.hu/v3/products?page={page}&per_page=100", headers=headers, timeout=10.0)
                if response.status_code != 200:
                    raise HTTPException(status_code=400, detail=f"Billingo API hiba: {response.text}")
                    
                resp_data = response.json()
                billingo_products = resp_data.get("data", [])
                if not billingo_products:
                    break
                    
                for bp in billingo_products:
                    bp_id = str(bp.get("id"))
                    bp_sku = bp.get("sku") or f"BILL-{bp_id}"
                    bp_name = bp.get("name")
                    bp_description = bp.get("description") or ""
                    
                    bp_price_net = int(round(float(bp.get("net_unit_price") or 0.0)))
                    bp_vat = bp.get("vat") or "27%"
                    vat_rate = 27
                    if "AAM" in bp_vat or "0" in bp_vat:
                        vat_rate = 0
                    elif "5" in bp_vat:
                        vat_rate = 5
                    elif "18" in bp_vat:
                        vat_rate = 18
                        
                    bp_price_gross = int(bp_price_net * (1.0 + vat_rate / 100.0))
                    
                    # Check if product already exists
                    p_res = await db.execute(select(Product).where(
                        (Product.billingo_product_id == bp_id) | (Product.sku == bp_sku)
                    ))
                    existing_product = p_res.scalar_one_or_none()
                    
                    if existing_product:
                        existing_product.billingo_product_id = bp_id
                        existing_product.billingo_sync_state = "Szinkronban"
                        existing_product.billingo_last_sync = datetime.utcnow()
                        updated_count += 1
                    else:
                        bp_ean = bp.get("ean")
                        cleaned_ean = bp_ean.strip() if (bp_ean and bp_ean.strip()) else None
                        
                        # We only use EAN directly as the barcode if it fits our 6-character database limit
                        if cleaned_ean and len(cleaned_ean) == 6 and cleaned_ean not in existing_barcodes:
                            barcode = cleaned_ean
                        else:
                            from barcode_utils import generate_next_barcode
                            barcode = await generate_next_barcode(db, exclude_barcodes=existing_barcodes)
                        
                        # Add to set to prevent duplicate assignment in subsequent iterations
                        existing_barcodes.add(barcode)
                        
                        new_product = Product(
                            name=bp_name,
                            description=bp_description,
                            sku=bp_sku,
                            barcode=barcode,
                            ean=cleaned_ean,
                            purchase_price_net=0,
                            purchase_price_gross=0,
                            sale_price_net=bp_price_net,
                            sale_price_gross=bp_price_gross,
                            vat_rate=vat_rate,
                            current_stock=0,
                            minimum_stock=1,
                            unit=bp.get("unit") or "db",
                            category_id=default_category.id,
                            default_location_id=default_location.id,
                            supplier_id=default_supplier.id,
                            billingo_product_id=bp_id,
                            billingo_sync_state="Szinkronban",
                            billingo_last_sync=datetime.utcnow()
                        )
                        db.add(new_product)
                        imported_count += 1
                        
                page += 1
                
        await db.commit()
        await log_audit(db, current_user.id, current_user.username, f"Billingo termék importálás lefutott: {imported_count} új, {updated_count} frissített termék")
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Hiba a termékimportálás során: {str(e)}")
        
    return {"status": "success", "imported_count": imported_count, "updated_count": updated_count}
