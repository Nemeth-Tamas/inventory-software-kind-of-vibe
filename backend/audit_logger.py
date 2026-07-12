from sqlalchemy.ext.asyncio import AsyncSession
from models import AuditLog
from datetime import datetime

async def log_audit(db: AsyncSession, user_id: str | None, username: str | None, action: str, details: str | None = None):
    audit = AuditLog(
        user_id=user_id,
        username=username,
        action=action,
        details=details,
        timestamp=datetime.utcnow()
    )
    db.add(audit)
    await db.flush()
