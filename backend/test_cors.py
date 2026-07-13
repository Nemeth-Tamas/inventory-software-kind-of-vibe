import pytest
import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


def build_test_app(app_env: str, cors_allowed_origins: str) -> FastAPI:
    test_app = FastAPI()

    @test_app.get("/test")
    def test_endpoint():
        return {"ok": True}

    origins = []
    if cors_allowed_origins:
        origins = [o.strip() for o in cors_allowed_origins.split(",") if o.strip()]
    elif app_env == "development":
        origins = [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:18080",
            "http://127.0.0.1:18080",
        ]

    if origins:
        test_app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
    return test_app


@pytest.mark.anyio
async def test_allowed_development_origin():
    app = build_test_app(app_env="development", cors_allowed_origins="")
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        headers = {"Origin": "http://localhost:5173"}
        response = await client.get("/test", headers=headers)
        assert response.status_code == 200
        assert (
            response.headers.get("access-control-allow-origin")
            == "http://localhost:5173"
        )


@pytest.mark.anyio
async def test_rejected_untrusted_origin_in_dev():
    app = build_test_app(app_env="development", cors_allowed_origins="")
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        headers = {"Origin": "http://untrusted.com"}
        response = await client.get("/test", headers=headers)
        assert response.status_code == 200
        assert "access-control-allow-origin" not in response.headers


@pytest.mark.anyio
async def test_production_explicit_origins():
    app = build_test_app(
        app_env="production",
        cors_allowed_origins="https://myprodapp.com,https://anotherorigin.hu",
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        headers = {"Origin": "https://myprodapp.com"}
        response = await client.get("/test", headers=headers)
        assert response.status_code == 200
        assert (
            response.headers.get("access-control-allow-origin")
            == "https://myprodapp.com"
        )

        headers = {"Origin": "https://untrusted.com"}
        response = await client.get("/test", headers=headers)
        assert response.status_code == 200
        assert "access-control-allow-origin" not in response.headers


@pytest.mark.anyio
async def test_production_same_origin_no_cors():
    app = build_test_app(app_env="production", cors_allowed_origins="")
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        headers = {"Origin": "http://localhost:5173"}
        response = await client.get("/test", headers=headers)
        assert response.status_code == 200
        assert "access-control-allow-origin" not in response.headers
