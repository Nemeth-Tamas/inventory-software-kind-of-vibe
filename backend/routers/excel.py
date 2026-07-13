from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import Product
from models_inventory import Stocktake, StocktakeItem
import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill
import io

router = APIRouter(prefix="/api/excel", tags=["excel"])


@router.get("/export/products")
async def export_products(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Product).where(Product.is_archived.is_(False)))
    products = result.scalars().all()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Termékek"

    headers = [
        "Belső vonalkód",
        "EAN",
        "Termék név",
        "Cikkszám (SKU)",
        "Gyártói SKU",
        "Egység",
        "ÁFA (%)",
        "Nettó beszerzési ár (Ft)",
        "Bruttó eladási ár (Ft)",
        "Készlet",
    ]
    ws.append(headers)

    # Style header row
    for col_num, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_num)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(
            start_color="1E293B", end_color="1E293B", fill_type="solid"
        )
        cell.alignment = Alignment(horizontal="center")

    for p in products:
        ws.append(
            [
                p.barcode,
                p.ean or "",
                p.name,
                p.sku,
                p.manufacturer_sku or "",
                p.unit,
                p.vat_rate,
                p.purchase_price_net,
                p.sale_price_gross,
                p.current_stock,
            ]
        )

    # Set column widths
    for col in ws.columns:
        max_len = max(len(str(cell.value or "")) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 3, 12)

    # Freeze header
    ws.freeze_panes = "A2"

    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)

    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=termekek.xlsx"},
    )


@router.get("/export/stocktake/{stocktake_id}")
async def export_stocktake(stocktake_id: str, db: AsyncSession = Depends(get_db)):
    # Query stocktake and items
    st_res = await db.execute(select(Stocktake).where(Stocktake.id == stocktake_id))
    st = st_res.scalar_one_or_none()
    if not st:
        raise HTTPException(status_code=404, detail="Leltár nem található")

    items_res = await db.execute(
        select(StocktakeItem).where(StocktakeItem.stocktake_id == stocktake_id)
    )
    items = items_res.scalars().all()

    wb = openpyxl.Workbook()

    ws_all = wb.active
    ws_all.title = "Teljes leltár"
    headers = [
        "Vonalkód",
        "Termék név",
        "Mennyiség",
        "Egységár nettó (Ft)",
        "Összérték nettó (Ft)",
    ]
    ws_all.append(headers)

    for item in items:
        p_res = await db.execute(select(Product).where(Product.id == item.product_id))
        p = p_res.scalar_one()
        ws_all.append(
            [
                p.barcode,
                p.name,
                item.counted_qty,
                p.purchase_price_net,
                item.counted_qty * p.purchase_price_net,
            ]
        )

    # Style Teljes leltár header
    for col_num, header in enumerate(headers, 1):
        cell = ws_all.cell(row=1, column=col_num)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(
            start_color="1E293B", end_color="1E293B", fill_type="solid"
        )
        cell.alignment = Alignment(horizontal="center")

    # Set column widths
    for col in ws_all.columns:
        max_len = max(len(str(cell.value or "")) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws_all.column_dimensions[col_letter].width = max(max_len + 3, 12)

    ws_all.freeze_panes = "A2"

    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)

    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename=leltar_{stocktake_id}.xlsx"
        },
    )
