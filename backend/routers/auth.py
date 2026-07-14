from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from database import get_db
from models import User, UserRole
from schemas import Token, UserCreate, UserResponse
from auth import (
    verify_password,
    get_password_hash,
    create_access_token,
    get_current_user,
    require_role,
)
from audit_logger import log_audit
import asyncio
import redis.asyncio as aioredis
from config import settings
from pydantic import BaseModel

router = APIRouter(prefix="/api/auth", tags=["auth"])


async def check_login_rate_limit(username: str, ip: str) -> tuple[bool, int]:
    try:
        redis_client = aioredis.from_url(settings.REDIS_URL)
        # Check IP block
        ip_fail = await redis_client.get(f"login_fail_ip:{ip}")
        if ip_fail and int(ip_fail) >= 15:
            ttl = await redis_client.ttl(f"login_fail_ip:{ip}")
            await redis_client.aclose()
            return True, max(1, ttl)

        # Check User+IP block
        user_ip_fail = await redis_client.get(f"login_fail_user_ip:{username}:{ip}")
        if user_ip_fail and int(user_ip_fail) >= 5:
            ttl = await redis_client.ttl(f"login_fail_user_ip:{username}:{ip}")
            await redis_client.aclose()
            return True, max(1, ttl)

        # Check Global User block
        global_fail = await redis_client.get(f"login_fail_user_global:{username}")
        if global_fail and int(global_fail) >= 50:
            ttl = await redis_client.ttl(f"login_fail_user_global:{username}")
            await redis_client.aclose()
            return True, max(1, ttl)

        await redis_client.aclose()
        return False, 0
    except Exception:
        return False, 0


async def record_login_failure(username: str, ip: str):
    try:
        redis_client = aioredis.from_url(settings.REDIS_URL)

        # Increment IP failures
        ip_key = f"login_fail_ip:{ip}"
        ip_val = await redis_client.incr(ip_key)
        if ip_val == 1:
            await redis_client.expire(ip_key, 300)

        # Increment User+IP failures
        user_ip_key = f"login_fail_user_ip:{username}:{ip}"
        user_ip_val = await redis_client.incr(user_ip_key)
        if user_ip_val == 1:
            await redis_client.expire(user_ip_key, 300)

        # Increment Global User failures
        global_key = f"login_fail_user_global:{username}"
        global_val = await redis_client.incr(global_key)
        if global_val == 1:
            await redis_client.expire(global_key, 300)

        await redis_client.aclose()
    except Exception:
        pass


async def reset_login_failures(username: str, ip: str):
    try:
        redis_client = aioredis.from_url(settings.REDIS_URL)
        await redis_client.delete(f"login_fail_user_ip:{username}:{ip}")
        await redis_client.delete(f"login_fail_user_global:{username}")
        await redis_client.aclose()
    except Exception:
        pass


def validate_password_strength(password: str):
    if len(password) < 8:
        raise HTTPException(
            status_code=400,
            detail="A jelszónak legalább 8 karakter hosszúnak kell lennie!",
        )
    common_passwords = {
        "password",
        "12345678",
        "admin123",
        "qwertyui",
        "jelszo123",
        "password123",
    }
    if password.lower() in common_passwords:
        raise HTTPException(
            status_code=400,
            detail="Ez a jelszó túl gyakori/könnyen kitalálható. Válasszon egy biztonságosabb jelszót!",
        )


async def is_final_active_admin(user_id: str, db: AsyncSession) -> bool:
    res = await db.execute(select(User).where(User.id == user_id))
    user = res.scalar_one_or_none()
    if not user or user.role != UserRole.ADMIN or not user.is_active:
        return False

    count_res = await db.execute(
        select(func.count(User.id))
        .where(User.role == UserRole.ADMIN)
        .where(User.is_active)
    )
    active_admins_count = count_res.scalar()
    return active_admins_count <= 1


@router.post("/login", response_model=Token)
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    username = form_data.username.strip().lower()
    ip = request.client.host if request.client else "127.0.0.1"

    blocked, retry_after = await check_login_rate_limit(username, ip)
    if blocked:
        raise HTTPException(
            status_code=429,
            detail="Túl sok sikertelen bejelentkezési kísérlet. Kérjük várjon!",
            headers={"Retry-After": str(retry_after)},
        )

    # Calculate artificial delay BEFORE querying database to avoid holding transactions open
    try:
        redis_client = aioredis.from_url(settings.REDIS_URL)
        user_ip_fail = await redis_client.get(f"login_fail_user_ip:{username}:{ip}")
        failures = int(user_ip_fail) if user_ip_fail else 0
        await redis_client.aclose()
    except Exception:
        failures = 0

    if failures >= 2:
        delay = min(10, 2 * (failures - 1))
        await asyncio.sleep(delay)

    result = await db.execute(select(User).where(User.username == form_data.username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(form_data.password, user.hashed_password):
        await record_login_failure(username, ip)
        await log_audit(
            db,
            None,
            form_data.username,
            "Sikertelen bejelentkezési kísérlet (hibás jelszó)",
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Hibás felhasználónév vagy jelszó",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inaktív felhasználó")

    await reset_login_failures(username, ip)
    access_token = create_access_token(data={"sub": user.username})
    await log_audit(db, user.id, user.username, "Sikeres bejelentkezés")
    await db.commit()
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": user.role.value,
    }


@router.post("/register", response_model=UserResponse)
async def register(
    user_in: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN])),
):
    result = await db.execute(select(User).where(User.username == user_in.username))
    existing_user = result.scalar_one_or_none()
    if existing_user:
        raise HTTPException(status_code=400, detail="A felhasználónév már foglalt")

    validate_password_strength(user_in.password)

    new_user = User(
        username=user_in.username,
        hashed_password=get_password_hash(user_in.password),
        role=user_in.role,
        is_active=True,
    )
    db.add(new_user)
    await db.flush()
    await log_audit(
        db,
        current_user.id,
        current_user.username,
        f"Felhasználó regisztrálva: {new_user.username} (szerepkör: {new_user.role})",
    )
    await db.commit()

    return new_user


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "role": current_user.role.value,
        "is_active": current_user.is_active,
        "must_change_password": current_user.must_change_password,
    }


class PasswordChangeRequest(BaseModel):
    old_password: str
    new_password: str


@router.post("/change-password")
async def change_password(
    req: PasswordChangeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(req.old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="A jelenlegi jelszó helytelen!")

    validate_password_strength(req.new_password)

    current_user.hashed_password = get_password_hash(req.new_password)
    current_user.must_change_password = False
    await log_audit(
        db,
        current_user.id,
        current_user.username,
        "Jelszó sikeresen megváltoztatva (kötelező csere feloldva)",
    )
    await db.commit()
    return {"status": "success", "message": "Jelszó sikeresen megváltoztatva."}


# User management endpoints for admin settings
@router.get("/users")
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN])),
):
    result = await db.execute(select(User).order_by(User.username))
    users = result.scalars().all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "role": u.role.value,
            "is_active": u.is_active,
            "must_change_password": u.must_change_password,
            "created_at": u.created_at,
        }
        for u in users
    ]


class UserRoleUpdate(BaseModel):
    role: str


@router.put("/users/{id}/role")
async def update_user_role(
    id: str,
    req: UserRoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN])),
):
    if req.role not in [role.value for role in UserRole]:
        raise HTTPException(status_code=400, detail="Érvénytelen szerepkör")
    result = await db.execute(select(User).where(User.id == id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Felhasználó nem található")
    if user.id == current_user.id:
        raise HTTPException(
            status_code=400, detail="Nem változtathatja meg a saját szerepkörét!"
        )

    # Prevent demoting the final active administrator
    if user.role == UserRole.ADMIN and req.role != UserRole.ADMIN.value:
        if await is_final_active_admin(user.id, db):
            raise HTTPException(
                status_code=400,
                detail="Nem fokozhatja le az utolsó aktív adminisztrátort!",
            )

    user.role = UserRole(req.role)
    await log_audit(
        db,
        current_user.id,
        current_user.username,
        f"Felhasználó ({user.username}) szerepköre módosítva: {user.role}",
    )
    await db.commit()
    return {"status": "success", "message": "Szerepkör sikeresen módosítva."}


@router.put("/users/{id}/toggle-active")
async def toggle_user_active(
    id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN])),
):
    result = await db.execute(select(User).where(User.id == id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Felhasználó nem található")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Nem tilthatja le saját magát!")

    # Prevent disabling the final active administrator
    if user.is_active:
        if await is_final_active_admin(user.id, db):
            raise HTTPException(
                status_code=400,
                detail="Nem tilthatja le az utolsó aktív adminisztrátort!",
            )

    user.is_active = not user.is_active
    status_str = "aktiválva" if user.is_active else "deaktiválva"
    await log_audit(
        db,
        current_user.id,
        current_user.username,
        f"Felhasználó ({user.username}) {status_str}",
    )
    await db.commit()
    return {"status": "success", "message": f"Felhasználó sikeresen {status_str}."}


class PasswordResetRequest(BaseModel):
    new_password: str


@router.post("/users/{id}/reset-password")
async def reset_user_password(
    id: str,
    req: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN])),
):
    result = await db.execute(select(User).where(User.id == id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Felhasználó nem található")

    validate_password_strength(req.new_password)

    user.hashed_password = get_password_hash(req.new_password)
    user.must_change_password = True

    await log_audit(
        db,
        current_user.id,
        current_user.username,
        f"Adminisztrátori jelszó-visszaállítás a következő felhasználónál: {user.username}",
    )
    await db.commit()
    return {
        "status": "success",
        "message": f"A(z) {user.username} felhasználó jelszava sikeresen visszaállítva. Kötelező csere beállítva.",
    }
