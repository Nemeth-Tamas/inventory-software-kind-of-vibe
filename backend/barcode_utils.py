from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models import BarcodeSequence
from datetime import datetime
import pytz
from typing import Optional

async def generate_next_barcode(db: AsyncSession, exclude_barcodes: Optional[set] = None) -> str:
    tz = pytz.timezone("Europe/Budapest")
    now_local = datetime.now(tz)
    year_prefix = int(str(now_local.year)[2:]) # e.g. 26 for 2026
    
    # Query sequence for the year
    result = await db.execute(
        select(BarcodeSequence).where(BarcodeSequence.year == year_prefix).with_for_update()
    )
    seq = result.scalar_one_or_none()
    
    if not seq:
        seq = BarcodeSequence(year=year_prefix, current_counter=0)
        db.add(seq)
        await db.flush()
        
    from models import Product
    while True:
        seq.current_counter += 1
        counter = seq.current_counter
        if counter > 0xFFFF:
            raise ValueError("A vonalkód tartomány megtelt ebben az évben! (Elérte a FFFF értéket)")
            
        hex_str = f"{counter:04X}" # Upper case hex padded to 4 characters
        barcode = f"{year_prefix}{hex_str}"
        
        # Check in memory set first to avoid session conflicts
        if exclude_barcodes and barcode in exclude_barcodes:
            continue
            
        # Verify if barcode already exists in products
        exists_result = await db.execute(
            select(Product.id).where(Product.barcode == barcode)
        )
        if not exists_result.scalar():
            await db.flush()
            return barcode
