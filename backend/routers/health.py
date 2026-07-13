import os
import json
import asyncio
from datetime import datetime
import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from database import get_db
from config import settings
from celery_app import celery_app

router = APIRouter(prefix="/api/health", tags=["health"])

@router.get("/live")
async def live_check():
    return {"status": "ok", "system": "Raktárkezelő API"}

@router.get("/ready")
async def ready_check(db: AsyncSession = Depends(get_db)):
    checks = {}
    is_ready = True
    
    # 1. Database Check
    try:
        res = await db.execute(text("SELECT 1"))
        val = res.scalar()
        if val == 1:
            checks["database"] = {"status": "ok", "message": "Adatbázis elérhető"}
        else:
            checks["database"] = {"status": "error", "message": "Hibás válasz az adatbázistól"}
            is_ready = False
    except Exception as e:
        checks["database"] = {"status": "error", "message": f"Nem sikerült csatlakozni: {str(e)}"}
        is_ready = False
        
    # 2. Redis Check
    try:
        redis_client = aioredis.from_url(settings.REDIS_URL)
        await redis_client.ping()
        await redis_client.aclose()
        checks["redis"] = {"status": "ok", "message": "Redis elérhető"}
    except Exception as e:
        checks["redis"] = {"status": "error", "message": f"Nem sikerült csatlakozni: {str(e)}"}
        is_ready = False

    # 3. Schema Check
    if checks.get("database", {}).get("status") == "ok":
        try:
            res_alembic = await db.execute(text("SELECT version_num FROM alembic_version"))
            version_num = res_alembic.scalar()
            
            await db.execute(text("SELECT 1 FROM users LIMIT 1"))
            await db.execute(text("SELECT 1 FROM products LIMIT 1"))
            
            checks["schema"] = {
                "status": "ok",
                "version": version_num,
                "message": "Séma kompatibilis és migrált"
            }
        except Exception as e:
            checks["schema"] = {"status": "error", "message": f"Séma hiba vagy hiányzó táblák: {str(e)}"}
            is_ready = False
    else:
        checks["schema"] = {"status": "error", "message": "Adatbázis elérhetetlen, séma ellenőrzés kihagyva"}
        is_ready = False

    # 4. Backup Check
    status_file = "/app/backups/backup_status.json"
    if os.path.exists(status_file):
        try:
            with open(status_file, "r") as f:
                backup_data = json.load(f)
            
            last_success = backup_data.get("last_successful")
            if last_success:
                ts_str = last_success.get("timestamp")
                last_ts = datetime.fromisoformat(ts_str)
                
                # handle timezone awareness
                last_tz = last_ts.tzinfo
                now = datetime.now(last_tz)
                
                age_hours = (now - last_ts).total_seconds() / 3600.0
                
                if age_hours > 36.0:
                    backup_status = "warning"
                    backup_msg = f"A legutóbbi biztonsági mentés több mint {int(age_hours)} órája készült."
                else:
                    backup_status = "ok"
                    backup_msg = f"Legutóbbi mentés: {ts_str} ({int(age_hours)} órája)"
            else:
                backup_status = "warning"
                backup_msg = "Nem található sikeres biztonsági mentés regisztrálva."
                
            checks["backup"] = {
                "status": backup_status,
                "message": backup_msg,
                "free_space_bytes": backup_data.get("disk_space_free", 0)
            }
        except Exception as e:
            checks["backup"] = {"status": "error", "message": f"Státuszfájl olvasási hiba: {str(e)}"}
    else:
        checks["backup"] = {"status": "warning", "message": "Biztonsági mentés státuszfájl nem található."}

    # 5. Worker Check
    try:
        inspect = celery_app.control.inspect(timeout=0.5)
        pong = await asyncio.to_thread(inspect.ping)
        if pong:
            checks["worker"] = {"status": "ok", "message": f"Aktív Celery munkamenetek: {list(pong.keys())}"}
        else:
            checks["worker"] = {"status": "warning", "message": "Nincs aktív Celery worker kapcsolat."}
    except Exception as e:
        checks["worker"] = {"status": "warning", "message": f"Munkamenet ellenőrzési hiba: {str(e)}"}

    overall_status = "ok" if is_ready else "error"
    response_code = status.HTTP_200_OK if is_ready else status.HTTP_503_SERVICE_UNAVAILABLE
    
    return JSONResponse(
        status_code=response_code,
        content={
            "status": overall_status,
            "checks": checks
        }
    )
