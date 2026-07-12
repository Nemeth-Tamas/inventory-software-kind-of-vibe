from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import User, UserRole
from schemas import Token, UserCreate
from auth import verify_password, get_password_hash, create_access_token, get_current_user, require_role
from audit_logger import log_audit

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == form_data.username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Hibás felhasználónév vagy jelszó",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inaktív felhasználó")
        
    access_token = create_access_token(data={"sub": user.username})
    await log_audit(db, user.id, user.username, "Sikeres bejelentkezés")
    await db.commit()
    return {"access_token": access_token, "token_type": "bearer", "role": user.role.value}

@router.post("/register", response_model=Token)
async def register(user_in: UserCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_role([UserRole.ADMIN]))):
    # Only Admin can register/create new users
    result = await db.execute(select(User).where(User.username == user_in.username))
    existing_user = result.scalar_one_or_none()
    if existing_user:
        raise HTTPException(status_code=400, detail="A felhasználónév már foglalt")
        
    new_user = User(
        username=user_in.username,
        hashed_password=get_password_hash(user_in.password),
        role=user_in.role,
        is_active=True
    )
    db.add(new_user)
    await db.flush()
    await log_audit(db, current_user.id, current_user.username, f"Felhasználó regisztrálva: {new_user.username} (szerepkör: {new_user.role})")
    await db.commit()
    
    access_token = create_access_token(data={"sub": new_user.username})
    return {"access_token": access_token, "token_type": "bearer", "role": new_user.role.value}

@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "role": current_user.role.value,
        "is_active": current_user.is_active,
        "must_change_password": current_user.must_change_password
    }

from pydantic import BaseModel

class PasswordChangeRequest(BaseModel):
    old_password: str
    new_password: str

@router.post("/change-password")
async def change_password(req: PasswordChangeRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not verify_password(req.old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="A jelenlegi jelszó helytelen!")
        
    current_user.hashed_password = get_password_hash(req.new_password)
    current_user.must_change_password = False
    await log_audit(db, current_user.id, current_user.username, "Jelszó sikeresen megváltoztatva (kötelező csere feloldva)")
    await db.commit()
    return {"status": "success", "message": "Jelszó sikeresen megváltoztatva."}


# User management endpoints for admin settings
@router.get("/users")
async def list_users(db: AsyncSession = Depends(get_db), current_user: User = Depends(require_role([UserRole.ADMIN]))):
    result = await db.execute(select(User).order_by(User.username))
    users = result.scalars().all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "role": u.role.value,
            "is_active": u.is_active,
            "must_change_password": u.must_change_password,
            "created_at": u.created_at
        }
        for u in users
    ]

class UserRoleUpdate(BaseModel):
    role: str

@router.put("/users/{id}/role")
async def update_user_role(id: str, req: UserRoleUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_role([UserRole.ADMIN]))):
    if req.role not in [role.value for role in UserRole]:
        raise HTTPException(status_code=400, detail="Érvénytelen szerepkör")
    result = await db.execute(select(User).where(User.id == id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Felhasználó nem található")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Nem változtathatja meg a saját szerepkörét!")
    user.role = UserRole(req.role)
    await log_audit(db, current_user.id, current_user.username, f"Felhasználó ({user.username}) szerepköre módosítva: {user.role}")
    await db.commit()
    return {"status": "success", "message": "Szerepkör sikeresen módosítva."}

@router.put("/users/{id}/toggle-active")
async def toggle_user_active(id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_role([UserRole.ADMIN]))):
    result = await db.execute(select(User).where(User.id == id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Felhasználó nem található")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Nem tilthatja le saját magát!")
    user.is_active = not user.is_active
    status_str = "aktiválva" if user.is_active else "deaktiválva"
    await log_audit(db, current_user.id, current_user.username, f"Felhasználó ({user.username}) {status_str}")
    await db.commit()
    return {"status": "success", "message": f"Felhasználó sikeresen {status_str}."}
