from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func
from database import get_db
from models import Product, User, UserRole
from schemas import ProductCreate, ProductResponse
from auth import require_role
from barcode_utils import generate_next_barcode
from audit_logger import log_audit
from event_bus import event_bus
from decimal import Decimal, ROUND_HALF_UP
import math

router = APIRouter(prefix="/api/products", tags=["products"])


@router.post("/generate-barcode")
async def get_barcode(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role([UserRole.ADMIN, UserRole.LEADER, UserRole.WAREHOUSE])
    ),
):
    try:
        from barcode_utils import get_next_barcode_preview

        barcode = await get_next_barcode_preview(db)
        return {"barcode": barcode}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Szerver hiba: {str(e)}")


def calculate_gross(net: int, vat_rate: int) -> int:
    net_dec = Decimal(net)
    vat_dec = Decimal(vat_rate)
    gross_dec = net_dec * (Decimal("1") + vat_dec / Decimal("100"))
    return int(gross_dec.to_integral_value(rounding=ROUND_HALF_UP))


def normalize_gross(net: int, gross: int, vat_rate: int) -> int:
    expected_gross = calculate_gross(net, vat_rate)
    if abs(expected_gross - gross) <= 2:
        return gross
    return expected_gross


@router.get("")
async def list_products(
    q: str = None,
    all: bool = False,
    page: int = 1,
    limit: int = 50,
    category_id: str = None,
    supplier_id: str = None,
    is_archived: bool = False,
    stock_status: str = "all",
    billingo_imported: str = "all",
    sort_by: str = "name",
    sort_order: str = "asc",
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Product)

    # 1. Archived filter
    stmt = stmt.where(Product.is_archived == is_archived)

    # 2. Text Search
    if q:
        import re

        words = q.split()
        for word in words:
            if not word:
                continue
            escaped_chars = [re.escape(c) for c in word]
            pattern = ".{0,6}".join(escaped_chars)
            word_filter = or_(
                Product.name.op("~*")(pattern),
                Product.barcode.op("~*")(pattern),
                Product.ean.op("~*")(pattern),
                Product.sku.op("~*")(pattern),
                Product.manufacturer_sku.op("~*")(pattern),
                Product.billingo_product_id.op("~*")(pattern),
            )
            stmt = stmt.where(word_filter)

    # 3. Category Filter
    if category_id:
        stmt = stmt.where(Product.category_id == category_id)

    # 4. Supplier Filter
    if supplier_id:
        stmt = stmt.where(Product.supplier_id == supplier_id)

    # 5. Billingo Imported Filter
    if billingo_imported == "true":
        stmt = stmt.where(Product.billingo_product_id.isnot(None))
    elif billingo_imported == "false":
        stmt = stmt.where(Product.billingo_product_id.is_(None))

    # 6. Stock Status Filter
    if stock_status == "low":
        stmt = stmt.where(
            Product.track_stock,
            Product.minimum_stock > 0,
            Product.current_stock <= Product.minimum_stock,
        )
    elif stock_status == "in_stock":
        stmt = stmt.where(Product.current_stock > 0)
    elif stock_status == "out_of_stock":
        stmt = stmt.where(Product.current_stock <= 0)
    elif stock_status == "zero_stock":
        stmt = stmt.where(Product.current_stock == 0)

    # 7. Sorting
    col = getattr(Product, sort_by, Product.name)
    if sort_order == "desc":
        stmt = stmt.order_by(col.desc())
    else:
        stmt = stmt.order_by(col.asc())

    # Execution
    if all:
        result = await db.execute(stmt)
        products = result.scalars().all()
        return [ProductResponse.model_validate(p) for p in products]

    # Count total
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    # Paginate
    offset = (page - 1) * limit
    stmt = stmt.offset(offset).limit(limit)

    result = await db.execute(stmt)
    products = result.scalars().all()

    items = [ProductResponse.model_validate(p) for p in products]
    pages = math.ceil(total / limit) if limit > 0 else 1

    return {
        "items": items,
        "total": total,
        "page": page,
        "pages": pages,
        "limit": limit,
    }


@router.post("", response_model=ProductResponse)
async def create_product(
    prod: ProductCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role([UserRole.ADMIN, UserRole.LEADER, UserRole.WAREHOUSE])
    ),
):
    # Enforce database transaction for unique barcode generation
    try:
        if not prod.barcode:
            barcode = await generate_next_barcode(db)
        else:
            # Authorized custom barcode validation
            result = await db.execute(
                select(Product).where(Product.barcode == prod.barcode)
            )
            if result.scalar_one_or_none():
                raise HTTPException(
                    status_code=400, detail="Ez a vonalkód már létezik!"
                )
            barcode = prod.barcode

        # Check SKU uniqueness (only if SKU is provided)
        if prod.sku and prod.sku.strip():
            sku_result = await db.execute(
                select(Product).where(Product.sku == prod.sku.strip())
            )
            if sku_result.scalar_one_or_none():
                raise HTTPException(
                    status_code=400, detail="Ez a cikkszám (SKU) már létezik!"
                )

        # Validate and normalize prices
        purchase_net = prod.purchase_price_net
        purchase_gross = normalize_gross(
            purchase_net, prod.purchase_price_gross, prod.vat_rate
        )
        sale_net = prod.sale_price_net
        sale_gross = normalize_gross(sale_net, prod.sale_price_gross, prod.vat_rate)

        new_prod = Product(
            barcode=barcode,
            ean=prod.ean.strip() if (prod.ean and prod.ean.strip()) else None,
            name=prod.name,
            description=prod.description,
            sku=prod.sku.strip() if (prod.sku and prod.sku.strip()) else None,
            manufacturer_sku=prod.manufacturer_sku,
            category_id=prod.category_id,
            supplier_id=prod.supplier_id,
            default_location_id=prod.default_location_id,
            unit=prod.unit,
            vat_rate=prod.vat_rate,
            purchase_price_net=purchase_net,
            purchase_price_gross=purchase_gross,
            sale_price_net=sale_net,
            sale_price_gross=sale_gross,
            minimum_stock=prod.minimum_stock,
            track_stock=prod.track_stock,
            allow_negative_stock=prod.allow_negative_stock,
            serial_number_tracking=prod.serial_number_tracking,
        )
        db.add(new_prod)
        await db.flush()

        await log_audit(
            db,
            current_user.id,
            current_user.username,
            f"Termék létrehozva: {new_prod.name} (Vonalkód: {new_prod.barcode})",
        )

        # Reload and prepare response before committing
        result = await db.execute(select(Product).where(Product.id == new_prod.id))
        loaded_prod = result.scalar_one()

        await db.commit()
    except Exception as e:
        await db.rollback()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=500,
            detail=f"A termék mentése közben adatbázishiba történt: {str(e)}",
        )

    # Trigger Server-Sent Event for real-time dashboard / list update
    await event_bus.publish(
        "inventory_events",
        "product_created",
        {
            "id": loaded_prod.id,
            "name": loaded_prod.name,
            "barcode": loaded_prod.barcode,
        },
    )

    return loaded_prod


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(product_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="A termék nem található")
    return product


@router.put("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: str,
    prod: ProductCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role([UserRole.ADMIN, UserRole.LEADER, UserRole.WAREHOUSE])
    ),
):
    try:
        result = await db.execute(select(Product).where(Product.id == product_id))
        db_prod = result.scalar_one_or_none()
        if not db_prod:
            raise HTTPException(status_code=404, detail="A termék nem található")

        # Check SKU uniqueness (only if SKU is provided and has changed)
        new_sku = prod.sku.strip() if (prod.sku and prod.sku.strip()) else None
        if new_sku and new_sku != db_prod.sku:
            sku_result = await db.execute(select(Product).where(Product.sku == new_sku))
            if sku_result.scalar_one_or_none():
                raise HTTPException(
                    status_code=400, detail="Ez a cikkszám (SKU) már létezik!"
                )

        # Check Barcode uniqueness (only if Barcode is provided and has changed)
        new_barcode = (
            prod.barcode.strip()
            if (prod.barcode and prod.barcode.strip())
            else db_prod.barcode
        )
        if new_barcode and new_barcode != db_prod.barcode:
            barcode_result = await db.execute(
                select(Product).where(Product.barcode == new_barcode)
            )
            if barcode_result.scalar_one_or_none():
                raise HTTPException(
                    status_code=400, detail="Ez a belső vonalkód már létezik!"
                )
            db_prod.barcode = new_barcode

        # Validate and normalize prices
        purchase_net = prod.purchase_price_net
        purchase_gross = normalize_gross(
            purchase_net, prod.purchase_price_gross, prod.vat_rate
        )
        sale_net = prod.sale_price_net
        sale_gross = normalize_gross(sale_net, prod.sale_price_gross, prod.vat_rate)

        db_prod.name = prod.name
        db_prod.ean = prod.ean.strip() if (prod.ean and prod.ean.strip()) else None
        db_prod.description = prod.description
        db_prod.sku = new_sku
        db_prod.manufacturer_sku = prod.manufacturer_sku
        db_prod.category_id = prod.category_id
        db_prod.supplier_id = prod.supplier_id
        db_prod.default_location_id = prod.default_location_id
        db_prod.unit = prod.unit
        db_prod.vat_rate = prod.vat_rate
        db_prod.purchase_price_net = purchase_net
        db_prod.purchase_price_gross = purchase_gross
        db_prod.sale_price_net = sale_net
        db_prod.sale_price_gross = sale_gross
        db_prod.minimum_stock = prod.minimum_stock
        if prod.current_stock is not None:
            db_prod.current_stock = prod.current_stock
        db_prod.track_stock = prod.track_stock
        db_prod.allow_negative_stock = prod.allow_negative_stock
        db_prod.serial_number_tracking = prod.serial_number_tracking

        await log_audit(
            db,
            current_user.id,
            current_user.username,
            f"Termék módosítva: {db_prod.name} (id: {product_id})",
        )
        await db.commit()
    except Exception as e:
        await db.rollback()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=500,
            detail=f"A termék módosítása közben adatbázishiba történt: {str(e)}",
        )

    await event_bus.publish(
        "inventory_events", "product_updated", {"id": db_prod.id, "name": db_prod.name}
    )
    return db_prod


@router.delete("/delete-zero-stock")
async def delete_zero_stock_products(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER])),
):
    from sqlalchemy import delete
    from models_inventory import (
        StocktakeItem,
        StocktakeUnknownBarcode,
        InventoryMovement,
    )

    try:
        # Get IDs of products that have current_stock == 0
        zero_stock_result = await db.execute(
            select(Product.id).where(Product.current_stock == 0)
        )
        product_ids = [r[0] for r in zero_stock_result.all()]

        if not product_ids:
            return {
                "status": "success",
                "message": "Nincsenek 0 készletes termékek.",
                "deleted_count": 0,
            }

        # Delete related records to avoid FK violations
        await db.execute(
            delete(InventoryMovement).where(
                InventoryMovement.product_id.in_(product_ids)
            )
        )
        await db.execute(
            delete(StocktakeItem).where(StocktakeItem.product_id.in_(product_ids))
        )
        await db.execute(
            delete(StocktakeUnknownBarcode).where(
                StocktakeUnknownBarcode.resolved_product_id.in_(product_ids)
            )
        )

        # Finally, delete the products
        await db.execute(delete(Product).where(Product.id.in_(product_ids)))

        await log_audit(
            db,
            current_user.id,
            current_user.username,
            f"Összes 0 készletes termék törölve ({len(product_ids)} db)",
        )
        await db.commit()

        # Broadcast event
        await event_bus.publish(
            "inventory_events",
            "products_bulk_deleted",
            {"deleted_count": len(product_ids)},
        )

        return {
            "status": "success",
            "message": f"Sikeresen törölve {len(product_ids)} darab 0 készletes termék.",
            "deleted_count": len(product_ids),
        }
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=500, detail=f"Hiba a termékek törlése során: {str(e)}"
        )


@router.delete("/{product_id}")
async def delete_product(
    product_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER])),
):
    from sqlalchemy import delete
    from models_inventory import (
        StocktakeItem,
        StocktakeUnknownBarcode,
        InventoryMovement,
    )

    try:
        # Find product
        result = await db.execute(select(Product).where(Product.id == product_id))
        db_prod = result.scalar_one_or_none()
        if not db_prod:
            raise HTTPException(status_code=404, detail="A termék nem található")

        # Cascade delete related entries
        await db.execute(
            delete(InventoryMovement).where(InventoryMovement.product_id == product_id)
        )
        await db.execute(
            delete(StocktakeItem).where(StocktakeItem.product_id == product_id)
        )
        await db.execute(
            delete(StocktakeUnknownBarcode).where(
                StocktakeUnknownBarcode.resolved_product_id == product_id
            )
        )

        # Delete product
        await db.execute(delete(Product).where(Product.id == product_id))

        await log_audit(
            db,
            current_user.id,
            current_user.username,
            f"Termék törölve: {db_prod.name} (id: {product_id}, vonalkód: {db_prod.barcode})",
        )
        await db.commit()

        await event_bus.publish(
            "inventory_events",
            "product_deleted",
            {"id": product_id, "name": db_prod.name},
        )
        return {"status": "success", "message": f"Sikeresen törölve: {db_prod.name}"}
    except Exception as e:
        await db.rollback()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=500, detail=f"Hiba a termék törlése során: {str(e)}"
        )


@router.post("/{product_id}/archive")
async def archive_product(
    product_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER])),
):
    try:
        result = await db.execute(select(Product).where(Product.id == product_id))
        db_prod = result.scalar_one_or_none()
        if not db_prod:
            raise HTTPException(status_code=404, detail="A termék nem található")

        db_prod.is_archived = True
        await log_audit(
            db,
            current_user.id,
            current_user.username,
            f"Termék archiválva: {db_prod.name} (id: {product_id})",
        )
        await db.commit()

        await event_bus.publish(
            "inventory_events",
            "product_archived",
            {"id": product_id, "name": db_prod.name},
        )
        return {
            "status": "success",
            "message": f"Termék sikeresen archiválva: {db_prod.name}",
        }
    except Exception as e:
        await db.rollback()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=500, detail=f"Hiba az archiválás során: {str(e)}"
        )


@router.post("/{product_id}/restore")
async def restore_product(
    product_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER])),
):
    try:
        result = await db.execute(select(Product).where(Product.id == product_id))
        db_prod = result.scalar_one_or_none()
        if not db_prod:
            raise HTTPException(status_code=404, detail="A termék nem található")

        db_prod.is_archived = False
        await log_audit(
            db,
            current_user.id,
            current_user.username,
            f"Termék visszaállítva az archívumból: {db_prod.name} (id: {product_id})",
        )
        await db.commit()

        await event_bus.publish(
            "inventory_events",
            "product_restored",
            {"id": product_id, "name": db_prod.name},
        )
        return {
            "status": "success",
            "message": f"Termék sikeresen visszaállítva: {db_prod.name}",
        }
    except Exception as e:
        await db.rollback()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=500, detail=f"Hiba a visszaállítás során: {str(e)}"
        )
