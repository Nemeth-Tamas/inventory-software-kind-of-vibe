import pytest
import httpx
from main import app
from sqlalchemy.exc import SQLAlchemyError
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db

# Register temporary test routes to trigger errors cleanly
router = APIRouter(prefix="/api/test-errors", tags=["test-errors"])

@router.get("/db-error")
async def trigger_db_error():
    raise SQLAlchemyError("Mock unique constraint violation error details: KEY (sku)=(TEST1234) already exists.")

@router.get("/generic-error")
async def trigger_generic_error():
    raise Exception("Critical raw python error trace that should not leak!")

app.include_router(router)

@pytest.mark.anyio
async def test_correlation_id_and_error_handling():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as client:
        # 1. Verify successful request propagates correlation ID header
        res = await client.get("/api/health")
        assert res.status_code == 200
        assert "X-Correlation-ID" in res.headers
        cid = res.headers["X-Correlation-ID"]
        assert len(cid) > 0

        # 2. Verify custom incoming correlation ID is propagated back
        custom_cid = "custom-correlation-12345"
        res_custom = await client.get("/api/health", headers={"X-Correlation-ID": custom_cid})
        assert res_custom.status_code == 200
        assert res_custom.headers["X-Correlation-ID"] == custom_cid

        # 3. Verify SQLAlchemy exception handler hides raw details, returns Hungarian message & CID
        res_db = await client.get("/api/test-errors/db-error")
        assert res_db.status_code == 409
        assert "X-Correlation-ID" in res_db.headers
        data_db = res_db.json()
        assert "detail" in data_db
        assert "correlation_id" in data_db
        # Friendly Hungarian message check
        assert "adatbázis" in data_db["detail"] or "létezik" in data_db["detail"]
        # Make sure no raw SQL details leak
        assert "Mock unique constraint" not in data_db["detail"]
        assert "TEST1234" not in data_db["detail"]

        # 4. Verify generic unhandled exception handler masks error details, returns Hungarian message & CID
        res_gen = await client.get("/api/test-errors/generic-error")
        assert res_gen.status_code == 500
        assert "X-Correlation-ID" in res_gen.headers
        data_gen = res_gen.json()
        assert "detail" in data_gen
        assert "correlation_id" in data_gen
        assert "Belső szerverhiba" in data_gen["detail"]
        assert "Critical raw" not in data_gen["detail"]
