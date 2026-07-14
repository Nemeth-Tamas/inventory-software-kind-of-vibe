from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, or_, func
from database import get_db
from models import Category, Supplier, Location, User, UserRole, Product
from schemas import (
    CategoryBase,
    CategoryResponse,
    LocationBase,
    LocationResponse,
    SupplierBase,
    SupplierResponse,
    MergeRequest,
)
from auth import require_role
from audit_logger import log_audit

router = APIRouter(prefix="/api", tags=["master_data"])


# Categories CRUD
@router.get("/categories", response_model=list[CategoryResponse])
async def get_categories(
    q: str = None, all_items: bool = True, db: AsyncSession = Depends(get_db)
):
    stmt = select(Category)
    if not all_items:
        stmt = stmt.where(Category.is_archived.is_(False))
    if q:
        stmt = stmt.where(Category.name.ilike(f"%{q}%"))
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/categories", response_model=CategoryResponse)
async def create_category(
    cat: CategoryBase,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role([UserRole.ADMIN, UserRole.LEADER, UserRole.WAREHOUSE])
    ),
):
    # Check uniqueness
    chk = await db.execute(select(Category).where(Category.name == cat.name))
    if chk.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Ez a kategória már létezik!")
    new_cat = Category(name=cat.name)
    db.add(new_cat)
    await db.commit()
    await db.refresh(new_cat)
    return new_cat


@router.put("/categories/{id}", response_model=CategoryResponse)
async def rename_category(
    id: str,
    cat: CategoryBase,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER])),
):
    result = await db.execute(select(Category).where(Category.id == id))
    db_cat = result.scalar_one_or_none()
    if not db_cat:
        raise HTTPException(status_code=404, detail="A kategória nem található")
    # Check unique name
    chk = await db.execute(
        select(Category).where((Category.name == cat.name) & (Category.id != id))
    )
    if chk.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Ez a kategória név már létezik!")
    db_cat.name = cat.name
    await log_audit(
        db,
        current_user.id,
        current_user.username,
        f"Kategória átnevezve: {db_cat.name}",
    )
    await db.commit()
    await db.refresh(db_cat)
    return db_cat


@router.post("/categories/{id}/archive", response_model=CategoryResponse)
async def archive_category(
    id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER])),
):
    result = await db.execute(select(Category).where(Category.id == id))
    db_cat = result.scalar_one_or_none()
    if not db_cat:
        raise HTTPException(status_code=404, detail="A kategória nem található")
    db_cat.is_archived = True
    await log_audit(
        db,
        current_user.id,
        current_user.username,
        f"Kategória archiválva: {db_cat.name}",
    )
    await db.commit()
    await db.refresh(db_cat)
    return db_cat


@router.post("/categories/{id}/restore", response_model=CategoryResponse)
async def restore_category(
    id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER])),
):
    result = await db.execute(select(Category).where(Category.id == id))
    db_cat = result.scalar_one_or_none()
    if not db_cat:
        raise HTTPException(status_code=404, detail="A kategória nem található")
    db_cat.is_archived = False
    await log_audit(
        db,
        current_user.id,
        current_user.username,
        f"Kategória visszaállítva: {db_cat.name}",
    )
    await db.commit()
    await db.refresh(db_cat)
    return db_cat


@router.delete("/categories/{id}")
async def delete_category(
    id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER])),
):
    result = await db.execute(select(Category).where(Category.id == id))
    db_cat = result.scalar_one_or_none()
    if not db_cat:
        raise HTTPException(status_code=404, detail="A kategória nem található")
    # Check if used by any products
    p_chk = await db.execute(select(Product).where(Product.category_id == id).limit(1))
    if p_chk.scalars().first():
        raise HTTPException(
            status_code=400,
            detail="A kategória nem törölhető, mert vannak hozzárendelt termékek!",
        )
    await db.delete(db_cat)
    await log_audit(
        db, current_user.id, current_user.username, f"Kategória törölve: {db_cat.name}"
    )
    await db.commit()
    return {"status": "success", "message": "Kategória sikeresen törölve."}


@router.get("/categories/merge-preview")
async def merge_categories_preview(
    source_id: str,
    target_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN])),
):
    if source_id == target_id:
        raise HTTPException(
            status_code=400, detail="A forrás és cél kategória nem lehet ugyanaz!"
        )
    source = (
        await db.execute(select(Category).where(Category.id == source_id))
    ).scalar_one_or_none()
    target = (
        await db.execute(select(Category).where(Category.id == target_id))
    ).scalar_one_or_none()
    if not source or not target:
        raise HTTPException(
            status_code=404, detail="Forrás vagy cél kategória nem található"
        )
    
    count_stmt = select(func.count(Product.id)).where(Product.category_id == source_id)
    count_res = await db.execute(count_stmt)
    count = count_res.scalar_one()
    
    return {
        "source_name": source.name,
        "target_name": target.name,
        "product_count": count
    }


@router.post("/categories/merge")
async def merge_categories(
    req: MergeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN])),
):
    if req.source_id == req.target_id:
        raise HTTPException(
            status_code=400, detail="A forrás és cél kategória nem lehet ugyanaz!"
        )
    source = (
        await db.execute(select(Category).where(Category.id == req.source_id))
    ).scalar_one_or_none()
    target = (
        await db.execute(select(Category).where(Category.id == req.target_id))
    ).scalar_one_or_none()
    if not source or not target:
        raise HTTPException(
            status_code=404, detail="Forrás vagy cél kategória nem található"
        )
    
    # Get count of affected products
    count_stmt = select(func.count(Product.id)).where(Product.category_id == req.source_id)
    count_res = await db.execute(count_stmt)
    count = count_res.scalar_one()

    # Move products transactionally
    await db.execute(
        update(Product)
        .where(Product.category_id == req.source_id)
        .values(category_id=req.target_id)
    )
    
    # Delete the source category
    await db.delete(source)
    
    # Audit log the operation
    await log_audit(
        db,
        current_user.id,
        current_user.username,
        f"Kategóriák összevonása: '{source.name}' -> '{target.name}' (érintett termékek: {count})",
    )
    await db.commit()
    return {
        "status": "success",
        "message": f"'{source.name}' sikeresen összevonva a(z) '{target.name}' kategóriával.",
    }


@router.get("/categories/with-count")
async def get_categories_with_count(db: AsyncSession = Depends(get_db)):
    stmt = (
        select(
            Category.id,
            Category.name,
            Category.is_archived,
            func.count(Product.id).label("product_count"),
        )
        .outerjoin(Product, Product.category_id == Category.id)
        .group_by(Category.id, Category.name, Category.is_archived)
    )
    res = await db.execute(stmt)
    return [
        {"id": r[0], "name": r[1], "is_archived": r[2], "product_count": r[3]}
        for r in res.all()
    ]


# Locations CRUD
@router.get("/locations", response_model=list[LocationResponse])
async def get_locations(
    q: str = None, all_items: bool = True, db: AsyncSession = Depends(get_db)
):
    stmt = select(Location)
    if not all_items:
        stmt = stmt.where(Location.is_archived.is_(False))
    if q:
        stmt = stmt.where(Location.name.ilike(f"%{q}%"))
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/locations", response_model=LocationResponse)
async def create_location(
    loc: LocationBase,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER])),
):
    chk = await db.execute(select(Location).where(Location.name == loc.name))
    if chk.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Ez a raktárhely már létezik!")
    new_loc = Location(name=loc.name)
    db.add(new_loc)
    await db.commit()
    await db.refresh(new_loc)
    return new_loc


@router.put("/locations/{id}", response_model=LocationResponse)
async def update_location(
    id: str,
    loc: LocationBase,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER])),
):
    result = await db.execute(select(Location).where(Location.id == id))
    db_loc = result.scalar_one_or_none()
    if not db_loc:
        raise HTTPException(status_code=404, detail="A raktárhely nem található")
    chk = await db.execute(
        select(Location).where((Location.name == loc.name) & (Location.id != id))
    )
    if chk.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Ez a raktárhely név már létezik!")
    db_loc.name = loc.name
    await log_audit(
        db,
        current_user.id,
        current_user.username,
        f"Raktárhely módosítva: {db_loc.name}",
    )
    await db.commit()
    await db.refresh(db_loc)
    return db_loc


@router.post("/locations/{id}/archive", response_model=LocationResponse)
async def archive_location(
    id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER])),
):
    result = await db.execute(select(Location).where(Location.id == id))
    db_loc = result.scalar_one_or_none()
    if not db_loc:
        raise HTTPException(status_code=404, detail="A raktárhely nem található")
    db_loc.is_archived = True
    await log_audit(
        db,
        current_user.id,
        current_user.username,
        f"Raktárhely archiválva: {db_loc.name}",
    )
    await db.commit()
    await db.refresh(db_loc)
    return db_loc


@router.post("/locations/{id}/restore", response_model=LocationResponse)
async def restore_location(
    id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER])),
):
    result = await db.execute(select(Location).where(Location.id == id))
    db_loc = result.scalar_one_or_none()
    if not db_loc:
        raise HTTPException(status_code=404, detail="A raktárhely nem található")
    db_loc.is_archived = False
    await log_audit(
        db,
        current_user.id,
        current_user.username,
        f"Raktárhely visszaállítva: {db_loc.name}",
    )
    await db.commit()
    await db.refresh(db_loc)
    return db_loc


@router.delete("/locations/{id}")
async def delete_location(
    id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER])),
):
    result = await db.execute(select(Location).where(Location.id == id))
    db_loc = result.scalar_one_or_none()
    if not db_loc:
        raise HTTPException(status_code=404, detail="A raktárhely nem található")
    stock_chk = await db.execute(
        select(Product)
        .where((Product.default_location_id == id) & (Product.current_stock > 0))
        .limit(1)
    )
    if stock_chk.scalars().first():
        raise HTTPException(
            status_code=400,
            detail="A raktárhely nem törölhető, mert aktív készlet található rajta!",
        )
    p_chk = await db.execute(
        select(Product).where(Product.default_location_id == id).limit(1)
    )
    if p_chk.scalars().first():
        raise HTTPException(
            status_code=400,
            detail="A raktárhely nem törölhető, mert hozzá van rendelve termékekhez alapértelmezettként!",
        )
    await db.delete(db_loc)
    await log_audit(
        db, current_user.id, current_user.username, f"Raktárhely törölve: {db_loc.name}"
    )
    await db.commit()
    return {"status": "success", "message": "Raktárhely sikeresen törölve."}


@router.get("/locations/with-stock")
async def get_locations_with_stock(db: AsyncSession = Depends(get_db)):
    stmt = (
        select(
            Location.id,
            Location.name,
            Location.is_archived,
            func.sum(Product.current_stock).label("stock_count"),
        )
        .outerjoin(Product, Product.default_location_id == Location.id)
        .group_by(Location.id, Location.name, Location.is_archived)
    )
    res = await db.execute(stmt)
    return [
        {"id": r[0], "name": r[1], "is_archived": r[2], "stock_count": int(r[3] or 0)}
        for r in res.all()
    ]


# Suppliers CRUD
@router.get("/suppliers", response_model=list[SupplierResponse])
async def get_suppliers(
    q: str = None, all_items: bool = True, db: AsyncSession = Depends(get_db)
):
    stmt = select(Supplier)
    if not all_items:
        stmt = stmt.where(Supplier.is_archived.is_(False))
    if q:
        search_filter = or_(
            Supplier.name.ilike(f"%{q}%"),
            Supplier.contact_person.ilike(f"%{q}%"),
            Supplier.email.ilike(f"%{q}%"),
            Supplier.phone.ilike(f"%{q}%"),
            Supplier.address.ilike(f"%{q}%"),
            Supplier.tax_number.ilike(f"%{q}%"),
            Supplier.customer_number.ilike(f"%{q}%"),
        )
        stmt = stmt.where(search_filter)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/suppliers", response_model=SupplierResponse)
async def create_supplier(
    sup: SupplierBase,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role([UserRole.ADMIN, UserRole.LEADER, UserRole.WAREHOUSE])
    ),
):
    chk = await db.execute(select(Supplier).where(Supplier.name == sup.name))
    if chk.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Ez a beszállító már létezik!")
    new_sup = Supplier(
        name=sup.name,
        contact_person=sup.contact_person,
        email=sup.email,
        phone=sup.phone,
        address=sup.address,
        tax_number=sup.tax_number,
        customer_number=sup.customer_number,
        comment=sup.comment,
        billingo_partner_id=sup.billingo_partner_id,
        is_active=sup.is_active,
    )
    db.add(new_sup)
    await db.commit()
    await db.refresh(new_sup)
    return new_sup


@router.put("/suppliers/{id}", response_model=SupplierResponse)
async def update_supplier(
    id: str,
    sup: SupplierBase,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role([UserRole.ADMIN, UserRole.LEADER, UserRole.WAREHOUSE])
    ),
):
    result = await db.execute(select(Supplier).where(Supplier.id == id))
    db_sup = result.scalar_one_or_none()
    if not db_sup:
        raise HTTPException(status_code=404, detail="A beszállító nem található")
    chk = await db.execute(
        select(Supplier).where((Supplier.name == sup.name) & (Supplier.id != id))
    )
    if chk.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Ez a beszállító név már létezik!")
    db_sup.name = sup.name
    db_sup.contact_person = sup.contact_person
    db_sup.email = sup.email
    db_sup.phone = sup.phone
    db_sup.address = sup.address
    db_sup.tax_number = sup.tax_number
    db_sup.customer_number = sup.customer_number
    db_sup.comment = sup.comment
    db_sup.billingo_partner_id = sup.billingo_partner_id
    db_sup.is_active = sup.is_active
    await log_audit(
        db,
        current_user.id,
        current_user.username,
        f"Beszállító módosítva: {db_sup.name}",
    )
    await db.commit()
    await db.refresh(db_sup)
    return db_sup


@router.post("/suppliers/{id}/archive", response_model=SupplierResponse)
async def archive_supplier(
    id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER])),
):
    result = await db.execute(select(Supplier).where(Supplier.id == id))
    db_sup = result.scalar_one_or_none()
    if not db_sup:
        raise HTTPException(status_code=404, detail="A beszállító nem található")
    db_sup.is_archived = True
    await log_audit(
        db,
        current_user.id,
        current_user.username,
        f"Beszállító archiválva: {db_sup.name}",
    )
    await db.commit()
    await db.refresh(db_sup)
    return db_sup


@router.post("/suppliers/{id}/restore", response_model=SupplierResponse)
async def restore_supplier(
    id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER])),
):
    result = await db.execute(select(Supplier).where(Supplier.id == id))
    db_sup = result.scalar_one_or_none()
    if not db_sup:
        raise HTTPException(status_code=404, detail="A beszállító nem található")
    db_sup.is_archived = False
    await log_audit(
        db,
        current_user.id,
        current_user.username,
        f"Beszállító visszaállítva: {db_sup.name}",
    )
    await db.commit()
    await db.refresh(db_sup)
    return db_sup


@router.delete("/suppliers/{id}")
async def delete_supplier(
    id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER])),
):
    result = await db.execute(select(Supplier).where(Supplier.id == id))
    db_sup = result.scalar_one_or_none()
    if not db_sup:
        raise HTTPException(status_code=404, detail="A beszállító nem található")
    p_chk = await db.execute(select(Product).where(Product.supplier_id == id).limit(1))
    if p_chk.scalars().first():
        raise HTTPException(
            status_code=400,
            detail="A beszállító nem törölhető, mert vannak hozzárendelt termékek!",
        )
    await db.delete(db_sup)
    await log_audit(
        db, current_user.id, current_user.username, f"Beszállító törölve: {db_sup.name}"
    )
    await db.commit()
    return {"status": "success", "message": "Beszállító sikeresen törölve."}


@router.post("/suppliers/merge")
async def merge_suppliers(
    req: MergeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER])),
):
    if req.source_id == req.target_id:
        raise HTTPException(
            status_code=400, detail="A forrás és cél beszállító nem lehet ugyanaz!"
        )
    source = (
        await db.execute(select(Supplier).where(Supplier.id == req.source_id))
    ).scalar_one_or_none()
    target = (
        await db.execute(select(Supplier).where(Supplier.id == req.target_id))
    ).scalar_one_or_none()
    if not source or not target:
        raise HTTPException(
            status_code=404, detail="Forrás vagy cél beszállító nem található"
        )
    await db.execute(
        update(Product)
        .where(Product.supplier_id == req.source_id)
        .values(supplier_id=req.target_id)
    )
    await db.delete(source)
    await log_audit(
        db,
        current_user.id,
        current_user.username,
        f"Beszállító összevonva: {source.name} -> {target.name}",
    )
    await db.commit()
    return {
        "status": "success",
        "message": f"'{source.name}' sikeresen összevonva a(z) '{target.name}' beszállítóval.",
    }


@router.get("/suppliers/{id}/products")
async def get_supplier_products(id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Product).where(Product.supplier_id == id))
    return result.scalars().all()


@router.get("/suppliers/{id}/purchase-history")
async def get_supplier_purchase_history(id: str, db: AsyncSession = Depends(get_db)):
    from models_inventory import InventoryMovement, MovementType

    stmt = (
        select(InventoryMovement)
        .join(Product, Product.id == InventoryMovement.product_id)
        .where(
            (Product.supplier_id == id)
            & (InventoryMovement.movement_type == MovementType.RECEIPT)
        )
        .order_by(InventoryMovement.timestamp.desc())
    )
    result = await db.execute(stmt)
    res = result.scalars().all()

    formatted_movements = []
    for m in res:
        p_name = (
            await db.execute(select(Product.name).where(Product.id == m.product_id))
        ).scalar()
        formatted_movements.append(
            {
                "id": m.id,
                "product_name": p_name,
                "quantity_delta": m.quantity_delta,
                "timestamp": m.timestamp,
                "reference_number": m.reference_number,
                "note": m.note,
            }
        )
    return formatted_movements
