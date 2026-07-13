import pytest
from unittest.mock import MagicMock
from barcode_utils import generate_next_barcode
from models import BarcodeSequence

class MockDB:
    def __init__(self):
        self.seq = None
        self.added = []
        self.flushed = False

    async def execute(self, stmt):
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = self.seq
        mock_result.scalar.return_value = None
        return mock_result

    def add(self, obj):
        self.added.append(obj)
        self.seq = obj

    async def flush(self):
        self.flushed = True

    async def begin(self):
        pass

@pytest.mark.asyncio
async def test_barcode_initial():
    db = MockDB()
    barcode = await generate_next_barcode(db)
    # Prefix matches year (e.g. 26 for 2026)
    assert barcode.startswith("26")
    # Padded sequence starts at 0001
    assert barcode == "260001"

@pytest.mark.asyncio
async def test_barcode_increment_hex():
    db = MockDB()
    # Mocking pre-existing sequence at 15 (000F)
    db.seq = BarcodeSequence(year=26, current_counter=15)
    barcode = await generate_next_barcode(db)
    assert barcode == "260010" # Hex increment: 000F -> 0010

@pytest.mark.asyncio
async def test_barcode_increment_large_hex():
    db = MockDB()
    # Mocking pre-existing sequence at 255 (00FF)
    db.seq = BarcodeSequence(year=26, current_counter=255)
    barcode = await generate_next_barcode(db)
    assert barcode == "260100" # Hex increment: 00FF -> 0100

@pytest.mark.asyncio
async def test_barcode_exhausted():
    db = MockDB()
    # Mocking pre-existing sequence at FFFF (65535)
    db.seq = BarcodeSequence(year=26, current_counter=65535)
    with pytest.raises(ValueError) as excinfo:
        await generate_next_barcode(db)
    assert "megtelt" in str(excinfo.value)


from barcode_utils import get_next_barcode_preview

@pytest.mark.asyncio
async def test_barcode_preview_no_burn():
    db = MockDB()
    barcode1 = await get_next_barcode_preview(db)
    assert barcode1 == "260001"
    assert db.seq is None
    
    db.seq = BarcodeSequence(year=26, current_counter=42)
    barcode2 = await get_next_barcode_preview(db)
    assert barcode2 == "26002B"
    assert db.seq.current_counter == 42
    
    actual_barcode = await generate_next_barcode(db)
    assert actual_barcode == "26002B"
    assert db.seq.current_counter == 43


from main import app
from database import AsyncSessionLocal
from models import User, UserRole, AuditLog
from auth import get_password_hash
from sqlalchemy import delete
import httpx

@pytest.mark.anyio
async def test_barcode_endpoint_security_and_preview():
    async with AsyncSessionLocal() as session:
        await session.execute(delete(AuditLog).where(AuditLog.username.in_(["barcode_admin", "barcode_unauth", "barcode_warehouse"])))
        await session.execute(delete(User).where(User.username.in_(["barcode_admin", "barcode_unauth", "barcode_warehouse"])))
        
        admin = User(
            username="barcode_admin",
            hashed_password=get_password_hash("admin123"),
            role=UserRole.ADMIN,
            is_active=True,
            must_change_password=False
        )
        unauth = User(
            username="barcode_unauth",
            hashed_password=get_password_hash("unauth123"),
            role=UserRole.VIEWER,
            is_active=True,
            must_change_password=False
        )
        warehouse = User(
            username="barcode_warehouse",
            hashed_password=get_password_hash("wh123"),
            role=UserRole.WAREHOUSE,
            is_active=True,
            must_change_password=False
        )
        session.add_all([admin, unauth, warehouse])
        await session.commit()

    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver/api") as client:
            resp = await client.post("/products/generate-barcode")
            assert resp.status_code == 401

            login_unauth = await client.post("/auth/login", data={"username": "barcode_unauth", "password": "unauth123"})
            assert login_unauth.status_code == 200
            unauth_token = login_unauth.json()["access_token"]
            
            login_wh = await client.post("/auth/login", data={"username": "barcode_warehouse", "password": "wh123"})
            assert login_wh.status_code == 200
            wh_token = login_wh.json()["access_token"]

            resp = await client.post("/products/generate-barcode", headers={"Authorization": f"Bearer {unauth_token}"})
            assert resp.status_code == 403

            resp1 = await client.post("/products/generate-barcode", headers={"Authorization": f"Bearer {wh_token}"})
            assert resp1.status_code == 200
            code1 = resp1.json()["barcode"]

            resp2 = await client.post("/products/generate-barcode", headers={"Authorization": f"Bearer {wh_token}"})
            assert resp2.status_code == 200
            code2 = resp2.json()["barcode"]
            assert code1 == code2

    finally:
        async with AsyncSessionLocal() as session:
            await session.execute(delete(AuditLog).where(AuditLog.username.in_(["barcode_admin", "barcode_unauth", "barcode_warehouse"])))
            await session.execute(delete(User).where(User.username.in_(["barcode_admin", "barcode_unauth", "barcode_warehouse"])))
            await session.commit()

