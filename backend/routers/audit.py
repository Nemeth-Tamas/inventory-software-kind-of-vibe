from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import AuditLog
from auth import require_role
from models import User, UserRole

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("")
async def list_audit_logs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.LEADER])),
):
    result = await db.execute(
        select(AuditLog).order_by(AuditLog.timestamp.desc()).limit(200)
    )
    logs = result.scalars().all()
    return [
        {
            "id": log.id,
            "username": log.username or "Rendszer",
            "action": log.action,
            "details": log.details,
            "timestamp": log.timestamp.isoformat(),
        }
        for log in logs
    ]
