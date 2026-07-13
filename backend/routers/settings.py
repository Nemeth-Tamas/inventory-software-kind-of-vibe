from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import User, UserRole, SystemSetting
from auth import require_role
from audit_logger import log_audit
from settings_utils import encrypt_val
from pydantic import BaseModel
from typing import Optional
import os
import re
import json
import asyncio
from datetime import datetime, timedelta

# Import backup manager details
from backup_manager import BACKUP_DIR, STATUS_FILE, HISTORY_FILE, TZ

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsUpdateRequest(BaseModel):
    billingo_api_key: Optional[str] = None


@router.get("")
async def get_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN])),
):
    # Check if Billingo API key is configured in system settings
    result = await db.execute(
        select(SystemSetting).where(SystemSetting.key == "billingo_api_key")
    )
    setting = result.scalar_one_or_none()

    return {"billingo_api_key_configured": setting is not None and bool(setting.value)}


@router.post("")
async def update_settings(
    req: SettingsUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN])),
):
    if req.billingo_api_key is not None:
        # Query existing setting
        result = await db.execute(
            select(SystemSetting).where(SystemSetting.key == "billingo_api_key")
        )
        setting = result.scalar_one_or_none()

        encrypted_key = encrypt_val(req.billingo_api_key)

        if setting:
            setting.value = encrypted_key
            setting.is_encrypted = True
        else:
            setting = SystemSetting(
                key="billingo_api_key", value=encrypted_key, is_encrypted=True
            )
            db.add(setting)

        await log_audit(
            db,
            current_user.id,
            current_user.username,
            "Billingo API kulcs frissítve és titkosítva",
        )
        await db.commit()

    return {"status": "success", "message": "A beállítások sikeresen elmentve."}


@router.get("/backup/status")
async def get_backup_status(
    current_user: User = Depends(require_role([UserRole.ADMIN])),
):
    # Read status file
    status_info = {}
    if os.path.exists(STATUS_FILE):
        try:
            with open(STATUS_FILE, "r") as f:
                status_info = json.load(f)
        except Exception:
            pass

    # Calculate next expected backup
    now = datetime.now(TZ)
    next_expected = now.replace(hour=2, minute=0, second=0, microsecond=0)
    if now >= next_expected:
        next_expected += timedelta(days=1)

    status_info["next_expected_backup"] = next_expected.isoformat()

    # Read history
    history = []
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, "r") as f:
                history = json.load(f)
        except Exception:
            pass
    status_info["recent_history"] = history

    # Read verification history
    ver_history = []
    ver_history_file = os.path.join(BACKUP_DIR, "verification_history.json")
    if os.path.exists(ver_history_file):
        try:
            with open(ver_history_file, "r") as f:
                ver_history = json.load(f)
        except Exception:
            pass
    status_info["verification_history"] = ver_history

    # List actual files
    files_list = []
    if os.path.exists(BACKUP_DIR):
        try:
            pattern = re.compile(
                r"^(inventory|safety_inventory)_\d{4}-\d{2}-\d{2}_\d{6}\.dump$"
            )
            for filename in os.listdir(BACKUP_DIR):
                if pattern.match(filename):
                    fp = os.path.join(BACKUP_DIR, filename)
                    files_list.append(
                        {
                            "filename": filename,
                            "size": os.path.getsize(fp),
                            "created_at": datetime.fromtimestamp(
                                os.path.getctime(fp), TZ
                            ).isoformat(),
                        }
                    )
        except Exception:
            pass
    status_info["backup_files"] = sorted(
        files_list, key=lambda x: x["filename"], reverse=True
    )

    return status_info


@router.post("/backup/run")
async def run_backup_now(current_user: User = Depends(require_role([UserRole.ADMIN]))):
    from backup_manager import run_backup_sync

    # Run in thread pool to avoid blocking ASGI loop
    success, result_detail = await asyncio.to_thread(run_backup_sync)
    if success:
        return {"status": "success", "filename": result_detail}
    else:
        raise HTTPException(
            status_code=500, detail=f"Mentés sikertelen: {result_detail}"
        )


@router.post("/backup/verify/{filename}")
async def verify_backup_now(
    filename: str, current_user: User = Depends(require_role([UserRole.ADMIN]))
):
    # Prevent path traversal
    if not re.match(
        r"^(inventory|safety_inventory)_\d{4}-\d{2}-\d{2}_\d{6}\.dump$", filename
    ):
        raise HTTPException(status_code=400, detail="Invalid filename")

    from backup_manager import run_restore_temp

    try:
        # Run restore temp in a separate thread because it's async and does subprocesses
        def run_in_thread():
            asyncio.run(run_restore_temp(filename))

        await asyncio.to_thread(run_in_thread)
        return {
            "status": "success",
            "message": f"A(z) {filename} mentés sikeresen ellenőrizve.",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ellenőrzés hiba: {str(e)}")


@router.get("/backup/download/{filename}")
async def download_backup(
    filename: str, current_user: User = Depends(require_role([UserRole.ADMIN]))
):
    # Prevent path traversal
    if not re.match(
        r"^(inventory|safety_inventory)_\d{4}-\d{2}-\d{2}_\d{6}\.dump$", filename
    ):
        raise HTTPException(status_code=400, detail="Invalid filename")
    filepath = os.path.join(BACKUP_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(
        filepath, filename=filename, media_type="application/octet-stream"
    )
