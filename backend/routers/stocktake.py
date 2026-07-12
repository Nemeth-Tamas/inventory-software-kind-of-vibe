from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from database import get_db
from models import Product, User, UserRole
from models_inventory import Stocktake, StocktakeItem, StocktakeStatus, InventoryMovement, MovementType, StocktakeUnknownBarcode
from auth import require_role
from audit_logger import log_audit
from event_bus import event_bus
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

router = APIRouter(prefix="/api/stocktakes", tags=["stocktakes"])

class ScanRequest(BaseModel):
    barcode: str
    multiplier: int = 1

@router.get("")
async def list_stocktakes(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Stocktake).order_by(Stocktake.created_at.desc()))
    return result.scalars().all()

@router.post("", response_model=dict)
async def create_stocktake(name: str, notes: Optional[str] = None, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER, UserRole.WAREHOUSE]))):
    try:
        # Create the stocktake header
        stocktake = Stocktake(
            name=name,
            notes=notes,
            status=StocktakeStatus.DRAFT,
            created_by=current_user.id
        )
        db.add(stocktake)
        await db.flush()
        
        # Take a snapshot of all active products and freeze expected stock
        result = await db.execute(select(Product).where(Product.is_archived == False))
        products = result.scalars().all()
        
        for p in products:
            item = StocktakeItem(
                stocktake_id=stocktake.id,
                product_id=p.id,
                expected_qty=p.current_stock,
                counted_qty=0,
                difference=-p.current_stock
            )
            db.add(item)
            
        await log_audit(db, current_user.id, current_user.username, f"Leltár létrehozva: {name} ({len(products)} tétel pillanatkép)")
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise e
        
    await event_bus.publish("inventory_events", "stocktake_created", {"id": stocktake.id, "name": name})
    return {"id": stocktake.id, "name": name, "status": stocktake.status.value}

@router.post("/{stocktake_id}/start")
async def start_stocktake(stocktake_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER, UserRole.WAREHOUSE]))):
    result = await db.execute(select(Stocktake).where(Stocktake.id == stocktake_id))
    st = result.scalar_one_or_none()
    if not st:
        raise HTTPException(status_code=404, detail="Leltár nem található")
    st.status = StocktakeStatus.IN_PROGRESS
    await db.commit()
    await log_audit(db, current_user.id, current_user.username, f"Leltár elindítva: {st.name}")
    await event_bus.publish("inventory_events", "stocktake_updated", {"id": st.id, "status": st.status.value})
    return {"status": "success", "message": "Leltár elindítva"}

@router.post("/{stocktake_id}/scan")
async def scan_item(stocktake_id: str, req: ScanRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER, UserRole.WAREHOUSE]))):
    # Verify stocktake status
    result = await db.execute(select(Stocktake).where(Stocktake.id == stocktake_id))
    st = result.scalar_one_or_none()
    if not st or st.status != StocktakeStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="A leltározás nincs aktív folyamatban állapotban!")

    # Find product by barcode or EAN
    p_result = await db.execute(select(Product).where(
        (Product.barcode == req.barcode) | (Product.ean == req.barcode)
    ))
    product = p_result.scalar_one_or_none()
    
    if not product:
        # Immutable unknown barcode scan event logging
        unknown_scan = StocktakeUnknownBarcode(
            stocktake_id=stocktake_id,
            barcode=req.barcode,
            user_id=current_user.id,
            timestamp=datetime.utcnow(),
            resolved=False
        )
        db.add(unknown_scan)
        await db.commit()
        
        await log_audit(db, current_user.id, current_user.username, f"Ismeretlen vonalkód leltározva: {req.barcode}")
        
        return {
            "status": "unknown",
            "id": unknown_scan.id,
            "barcode": req.barcode,
            "timestamp": unknown_scan.timestamp.isoformat()
        }
        
    # Query corresponding stocktake item
    item_result = await db.execute(select(StocktakeItem).where(
        (StocktakeItem.stocktake_id == stocktake_id) & (StocktakeItem.product_id == product.id)
    ))
    st_item = item_result.scalar_one_or_none()
    
    if not st_item:
        st_item = StocktakeItem(
            stocktake_id=stocktake_id,
            product_id=product.id,
            expected_qty=0,
            counted_qty=0,
            difference=0
        )
        db.add(st_item)
        await db.flush()

    # Increment counted quantity
    st_item.counted_qty += req.multiplier
    st_item.difference = st_item.counted_qty - st_item.expected_qty
    
    await db.commit()
    
    # Broadcast event via SSE
    payload = {
        "stocktake_id": stocktake_id,
        "product_name": product.name,
        "barcode": product.barcode,
        "counted_qty": st_item.counted_qty,
        "difference": st_item.difference
    }
    await event_bus.publish("inventory_events", "item_scanned", payload)
    
    return {"status": "success", "item": payload}

@router.get("/{stocktake_id}/unresolved")
async def list_unresolved_scans(stocktake_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(StocktakeUnknownBarcode)
        .options(selectinload(StocktakeUnknownBarcode.user))
        .where(
            (StocktakeUnknownBarcode.stocktake_id == stocktake_id) & (StocktakeUnknownBarcode.resolved == False)
        )
    )
    return [
        {
            "id": u.id,
            "barcode": u.barcode,
            "timestamp": u.timestamp.isoformat(),
            "user": u.user.username if u.user else "Rendszer"
        }
        for u in result.scalars().all()
    ]

@router.post("/unresolved/{unresolved_id}/link")
async def link_unresolved_scan(unresolved_id: str, product_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER, UserRole.WAREHOUSE]))):
    try:
        # Retrieve unknown barcode record
        u_res = await db.execute(select(StocktakeUnknownBarcode).where(StocktakeUnknownBarcode.id == unresolved_id).with_for_update())
        u_scan = u_res.scalar_one_or_none()
        if not u_scan:
            raise HTTPException(status_code=404, detail="Ismeretlen vonalkód rekord nem található.")
        if u_scan.resolved:
            raise HTTPException(status_code=400, detail="Ez a tétel már fel lett dolgozva.")

        # Find target product
        p_res = await db.execute(select(Product).where(Product.id == product_id))
        product = p_res.scalar_one_or_none()
        if not product:
            raise HTTPException(status_code=404, detail="A megadott termék nem található.")

        # Find or create corresponding stocktake item
        st_res = await db.execute(select(StocktakeItem).where(
            (StocktakeItem.stocktake_id == u_scan.stocktake_id) & (StocktakeItem.product_id == product.id)
        ))
        st_item = st_res.scalar_one_or_none()
        
        if not st_item:
            st_item = StocktakeItem(
                stocktake_id=u_scan.stocktake_id,
                product_id=product.id,
                expected_qty=0,
                counted_qty=0,
                difference=0
            )
            db.add(st_item)
            await db.flush()

        # Apply scan quantity exactly once (adds 1 for single scan event)
        st_item.counted_qty += 1
        st_item.difference = st_item.counted_qty - st_item.expected_qty

        # Mark scan as resolved
        u_scan.resolved = True
        u_scan.resolved_product_id = product.id
        u_scan.resolved_user_id = current_user.id
        u_scan.resolved_at = datetime.utcnow()
        u_scan.resolution_type = "linked"

        await log_audit(db, current_user.id, current_user.username, f"Ismeretlen vonalkód ({u_scan.barcode}) összekapcsolva termékkel: {product.name}")
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise e
        
    await event_bus.publish("inventory_events", "stocktake_updated", {"message": "Ismeretlen vonalkód sikeresen feloldva"})
    return {"status": "success", "message": "Sikeres összekapcsolás."}

@router.post("/unresolved/{unresolved_id}/ignore")
async def ignore_unresolved_scan(unresolved_id: str, reason: str = "Mellőzve", db: AsyncSession = Depends(get_db), current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER, UserRole.WAREHOUSE]))):
    result = await db.execute(select(StocktakeUnknownBarcode).where(StocktakeUnknownBarcode.id == unresolved_id))
    u_scan = result.scalar_one_or_none()
    if not u_scan:
        raise HTTPException(status_code=404, detail="Ismeretlen vonalkód rekord nem található.")
        
    u_scan.resolved = True
    u_scan.resolution_type = "ignored"
    u_scan.ignore_reason = reason
    u_scan.resolved_user_id = current_user.id
    u_scan.resolved_at = datetime.utcnow()
    
    await db.commit()
    await log_audit(db, current_user.id, current_user.username, f"Ismeretlen vonalkód ({u_scan.barcode}) mellőzve. Indok: {reason}")
    return {"status": "success"}

@router.post("/unresolved/{unresolved_id}/reopen")
async def reopen_unresolved_scan(unresolved_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER, UserRole.WAREHOUSE]))):
    result = await db.execute(select(StocktakeUnknownBarcode).where(StocktakeUnknownBarcode.id == unresolved_id))
    u_scan = result.scalar_one_or_none()
    if not u_scan:
        raise HTTPException(status_code=404, detail="Ismeretlen vonalkód rekord nem található.")
        
    u_scan.resolved = False
    u_scan.resolution_type = None
    u_scan.ignore_reason = None
    
    await db.commit()
    return {"status": "success"}

@router.get("/{stocktake_id}/discrepancies")
async def get_discrepancies(stocktake_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(StocktakeItem).where(StocktakeItem.stocktake_id == stocktake_id)
    )
    items = result.scalars().all()
    
    # Return discrepancies for review
    res = []
    for item in items:
        # Avoid lazy loading problems
        p_res = await db.execute(select(Product).where(Product.id == item.product_id))
        p = p_res.scalar_one()
        res.append({
            "id": item.id,
            "product_id": p.id,
            "barcode": p.barcode,
            "sku": p.sku,
            "name": p.name,
            "expected": item.expected_qty,
            "counted": item.counted_qty,
            "difference": item.difference,
            "purchase_price_net": p.purchase_price_net,
            "value_difference": item.difference * p.purchase_price_net
        })
    return res

@router.post("/{stocktake_id}/apply-corrections")
async def apply_corrections(stocktake_id: str, reason: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER]))):
    # Retrieve stocktake
    st_result = await db.execute(select(Stocktake).where(Stocktake.id == stocktake_id))
    st = st_result.scalar_one_or_none()
    
    if not st or st.status == StocktakeStatus.APPLIED:
        raise HTTPException(status_code=400, detail="A leltár nem létezik vagy már javításra került!")
        
    try:
        # Retrieve all items with discrepancies
        items_result = await db.execute(select(StocktakeItem).where(
            (StocktakeItem.stocktake_id == stocktake_id) & (StocktakeItem.difference != 0)
        ))
        discrepancies = items_result.scalars().all()
        
        for item in discrepancies:
            # Query the product to update stock
            p_result = await db.execute(select(Product).where(Product.id == item.product_id).with_for_update())
            product = p_result.scalar_one()
            
            stock_before = product.current_stock
            product.current_stock = item.counted_qty # Apply the counted quantity
            
            # Record compensating movement
            movement = InventoryMovement(
                product_id=product.id,
                quantity_delta=item.difference,
                stock_before=stock_before,
                stock_after=product.current_stock,
                movement_type=MovementType.CORRECTION,
                reason=f"Leltár korrekció ({st.name})",
                user_id=current_user.id,
                note=reason
            )
            db.add(movement)
            
        st.status = StocktakeStatus.APPLIED
        await log_audit(db, current_user.id, current_user.username, f"Leltár eltérések alkalmazva: {st.name} ({len(discrepancies)} termék korrigálva)")
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise e
        
    await event_bus.publish("inventory_events", "stocktake_applied", {"id": stocktake_id, "status": st.status.value})
    return {"status": "success", "message": "A leltárkorrekciók sikeresen alkalmazva lettek az adatbázisban."}

@router.delete("/{stocktake_id}")
async def delete_stocktake(stocktake_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER]))):
    # Fetch stocktake
    st_result = await db.execute(select(Stocktake).where(Stocktake.id == stocktake_id))
    st = st_result.scalar_one_or_none()
    
    if not st:
        raise HTTPException(status_code=404, detail="A leltár nem található.")
        
    # Check if stocktake is already applied
    if st.status == StocktakeStatus.APPLIED:
        raise HTTPException(status_code=400, detail="Már véglegesített/alkalmazott leltárt nem lehet törölni!")
        
    try:
        # 1. Delete associated unknown scans
        await db.execute(delete(StocktakeUnknownBarcode).where(StocktakeUnknownBarcode.stocktake_id == stocktake_id))
        
        # 2. Delete the stocktake itself (cascading items)
        await db.delete(st)
        
        await log_audit(db, current_user.id, current_user.username, f"Leltár törölve: {st.name} (id: {stocktake_id})")
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Hiba történt a leltár törlése során: {str(e)}")
        
    await event_bus.publish("inventory_events", "stocktake_deleted", {"id": stocktake_id})
    return {"status": "success", "message": "A leltár sikeresen törölve lett."}
