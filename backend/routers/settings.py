from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import User, UserRole, SystemSetting
from auth import require_role
from audit_logger import log_audit
from settings_utils import encrypt_val, decrypt_val
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/api/settings", tags=["settings"])

class SettingsUpdateRequest(BaseModel):
    billingo_api_key: Optional[str] = None

@router.get("")
async def get_settings(db: AsyncSession = Depends(get_db), current_user: User = Depends(require_role([UserRole.ADMIN]))):
    # Check if Billingo API key is configured in system settings
    result = await db.execute(select(SystemSetting).where(SystemSetting.key == "billingo_api_key"))
    setting = result.scalar_one_or_none()
    
    return {
        "billingo_api_key_configured": setting is not None and bool(setting.value)
    }

@router.post("")
async def update_settings(req: SettingsUpdateRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_role([UserRole.ADMIN]))):
    if req.billingo_api_key is not None:
        # Query existing setting
        result = await db.execute(select(SystemSetting).where(SystemSetting.key == "billingo_api_key"))
        setting = result.scalar_one_or_none()
        
        encrypted_key = encrypt_val(req.billingo_api_key)
        
        if setting:
            setting.value = encrypted_key
            setting.is_encrypted = True
        else:
            setting = SystemSetting(
                key="billingo_api_key",
                value=encrypted_key,
                is_encrypted=True
            )
            db.add(setting)
            
        await log_audit(db, current_user.id, current_user.username, "Billingo API kulcs frissítve és titkosítva")
        await db.commit()
        
    return {"status": "success", "message": "A beállítások sikeresen elmentve."}
