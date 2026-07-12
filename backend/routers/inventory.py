from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from database import get_db
from models import Product, User, UserRole
from models_inventory import InventoryMovement, MovementType
from auth import require_role
from audit_logger import log_audit
from event_bus import event_bus
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter(prefix="/api/inventory", tags=["inventory"])

class ReceiptItem(BaseModel):
    product_id: str
    quantity: int
    purchase_price_net: Optional[int] = None
    purchase_price_gross: Optional[int] = None

class ReceiptRequest(BaseModel):
    items: List[ReceiptItem]
    supplier_id: Optional[str] = None
    location_id: str
    reference_number: Optional[str] = None
    note: Optional[str] = None
    idempotency_key: Optional[str] = None

class IssueItem(BaseModel):
    product_id: str
    quantity: int

class IssueRequest(BaseModel):
    items: List[IssueItem]
    location_id: str
    reason: str
    reference_number: Optional[str] = None
    note: Optional[str] = None
    idempotency_key: Optional[str] = None

class TransferRequest(BaseModel):
    product_id: str
    source_location_id: str
    destination_location_id: str
    quantity: int
    note: Optional[str] = None
    idempotency_key: Optional[str] = None

@router.post("/receipt", status_code=status.HTTP_201_CREATED)
async def goods_receipt(req: ReceiptRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER, UserRole.WAREHOUSE]))):
    try:
        # Check idempotency
        if req.idempotency_key:
            dup_res = await db.execute(
                select(InventoryMovement).where(InventoryMovement.idempotency_key == req.idempotency_key)
            )
            if dup_res.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Ez a bevételezés már fel lett dolgozva (duplikált idempotens kérés)!")

        for item in req.items:
            result = await db.execute(select(Product).where(Product.id == item.product_id).with_for_update())
            product = result.scalar_one_or_none()
            if not product:
                raise HTTPException(status_code=404, detail=f"Termék nem található: {item.product_id}")
            
            stock_before = product.current_stock
            product.current_stock += item.quantity
            
            if item.purchase_price_net is not None:
                product.purchase_price_net = item.purchase_price_net
            if item.purchase_price_gross is not None:
                product.purchase_price_gross = item.purchase_price_gross

            movement = InventoryMovement(
                product_id=product.id,
                quantity_delta=item.quantity,
                stock_before=stock_before,
                stock_after=product.current_stock,
                destination_location_id=req.location_id,
                movement_type=MovementType.RECEIPT,
                reason="Bevételezés",
                reference_number=req.reference_number,
                user_id=current_user.id,
                note=req.note,
                idempotency_key=req.idempotency_key
            )
            db.add(movement)
            await log_audit(db, current_user.id, current_user.username, f"Készlet bevételezés: {product.name} (+{item.quantity} db)")
            
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise e
        
    await event_bus.publish("inventory_events", "stock_updated", {"message": "Készlet bevételezés történt"})
    return {"status": "success", "message": "Bevételezés sikeresen rögzítve"}

@router.post("/issue", status_code=status.HTTP_201_CREATED)
async def stock_issue(req: IssueRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER, UserRole.WAREHOUSE, UserRole.SALES]))):
    try:
        # Check idempotency
        if req.idempotency_key:
            dup_res = await db.execute(
                select(InventoryMovement).where(InventoryMovement.idempotency_key == req.idempotency_key)
            )
            if dup_res.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Ez a kiadás már fel lett dolgozva (duplikált idempotens kérés)!")

        for item in req.items:
            result = await db.execute(select(Product).where(Product.id == item.product_id).with_for_update())
            product = result.scalar_one_or_none()
            if not product:
                raise HTTPException(status_code=404, detail=f"Termék nem található: {item.product_id}")
            
            if not product.allow_negative_stock and product.current_stock < item.quantity:
                raise HTTPException(status_code=400, detail=f"Nincs elegendő készlet a termékből: {product.name} (Elérhető: {product.current_stock})")
                
            stock_before = product.current_stock
            product.current_stock -= item.quantity
            
            movement = InventoryMovement(
                product_id=product.id,
                quantity_delta=-item.quantity,
                stock_before=stock_before,
                stock_after=product.current_stock,
                source_location_id=req.location_id,
                movement_type=MovementType.SALE,
                reason=req.reason,
                reference_number=req.reference_number,
                user_id=current_user.id,
                note=req.note,
                idempotency_key=req.idempotency_key
            )
            db.add(movement)
            await log_audit(db, current_user.id, current_user.username, f"Készlet kiadás: {product.name} (-{item.quantity} db, indok: {req.reason})")
            
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise e
        
    await event_bus.publish("inventory_events", "stock_updated", {"message": "Készlet kiadás történt"})
    return {"status": "success", "message": "Kiadás sikeresen rögzítve"}

@router.post("/transfer", status_code=status.HTTP_201_CREATED)
async def stock_transfer(req: TransferRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER, UserRole.WAREHOUSE]))):
    try:
        # Check idempotency
        if req.idempotency_key:
            dup_res = await db.execute(
                select(InventoryMovement).where(InventoryMovement.idempotency_key == req.idempotency_key)
            )
            if dup_res.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Ez az átadás már fel lett dolgozva (duplikált idempotens kérés)!")

        result = await db.execute(select(Product).where(Product.id == req.product_id).with_for_update())
        product = result.scalar_one_or_none()
        if not product:
            raise HTTPException(status_code=404, detail="Termék nem található")
            
        if not product.allow_negative_stock and product.current_stock < req.quantity:
            raise HTTPException(status_code=400, detail=f"Nincs elegendő készlet az átadáshoz: {product.name} (Készleten: {product.current_stock})")
            
        stock_before = product.current_stock
        movement = InventoryMovement(
            product_id=product.id,
            quantity_delta=0, 
            stock_before=stock_before,
            stock_after=stock_before,
            source_location_id=req.source_location_id,
            destination_location_id=req.destination_location_id,
            movement_type=MovementType.TRANSFER,
            reason="Helyszínek közötti átadás",
            user_id=current_user.id,
            note=req.note,
            idempotency_key=req.idempotency_key
        )
        db.add(movement)
        await log_audit(db, current_user.id, current_user.username, f"Készlet átadás: {product.name} ({req.quantity} db átadva)")
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise e
        
    await event_bus.publish("inventory_events", "stock_updated", {"message": "Készletátadás történt"})
    return {"status": "success", "message": "Átadás sikeresen rögzítve"}

@router.get("/movements")
async def get_movements(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(InventoryMovement)
        .options(selectinload(InventoryMovement.product), selectinload(InventoryMovement.user))
        .order_by(InventoryMovement.timestamp.desc())
        .limit(100)
    )
    movements = result.scalars().all()
    return [
        {
            "id": m.id,
            "product_name": m.product.name if m.product else "Ismeretlen termék",
            "barcode": m.product.barcode if m.product else "",
            "quantity_delta": m.quantity_delta,
            "stock_before": m.stock_before,
            "stock_after": m.stock_after,
            "movement_type": m.movement_type.value,
            "reason": m.reason,
            "timestamp": m.timestamp.isoformat(),
            "user": m.user.username if m.user else "Rendszer"
        }
        for m in movements
    ]
