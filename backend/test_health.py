import pytest
import httpx
from main import app
from unittest.mock import patch


@pytest.mark.anyio
async def test_health_live_endpoint():
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        resp = await client.get("/api/health/live")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok", "system": "Raktárkezelő API"}


@pytest.mark.anyio
async def test_health_ready_healthy():
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        resp = await client.get("/api/health/ready")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["checks"]["database"]["status"] == "ok"
        assert data["checks"]["redis"]["status"] == "ok"


@pytest.mark.anyio
async def test_health_ready_db_failure():
    async def mock_execute_fail(*args, **kwargs):
        raise Exception("Database Connection Refused")

    with patch(
        "sqlalchemy.ext.asyncio.AsyncSession.execute", side_effect=mock_execute_fail
    ):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            resp = await client.get("/api/health/ready")
            assert resp.status_code == 503
            data = resp.json()
            assert data["status"] == "error"
            assert data["checks"]["database"]["status"] == "error"


@pytest.mark.anyio
async def test_health_ready_redis_failure():
    class MockRedis:
        async def ping(self):
            raise Exception("Redis Connection Offline")

        async def aclose(self):
            pass

    with patch("redis.asyncio.from_url", return_value=MockRedis()):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            resp = await client.get("/api/health/ready")
            assert resp.status_code == 503
            data = resp.json()
            assert data["status"] == "error"
            assert data["checks"]["redis"]["status"] == "error"
