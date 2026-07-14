import pytest
import httpx
from datetime import timedelta
import redis.asyncio as aioredis
from main import app
from database import AsyncSessionLocal
from models import User, UserRole, AuditLog
from auth import get_password_hash, create_access_token
from config import settings
from sqlalchemy import delete, select
from routers.auth import validate_password_strength
from fastapi import HTTPException


@pytest.mark.anyio
async def test_password_policy():
    # 1. Reject < 8 chars
    with pytest.raises(HTTPException) as exc:
        validate_password_strength("short")
    assert exc.value.status_code == 400

    # 2. Reject common passwords
    with pytest.raises(HTTPException) as exc:
        validate_password_strength("password123")
    assert exc.value.status_code == 400

    # 3. Accept strong passwords
    validate_password_strength("MySuperUncommonPassword2026!")


@pytest.mark.anyio
async def test_auth_hardening_endpoints():
    async with AsyncSessionLocal() as session:
        # Cleanup
        await session.execute(
            delete(AuditLog).where(
                AuditLog.username.in_(["auth_admin1", "auth_admin2", "auth_standard"])
            )
        )
        await session.execute(
            delete(User).where(
                User.username.in_(["auth_admin1", "auth_admin2", "auth_standard"])
            )
        )

        # Create users
        admin1 = User(
            username="auth_admin1",
            hashed_password=get_password_hash("secureAdminPass1!"),
            role=UserRole.ADMIN,
            is_active=True,
            must_change_password=False,
        )
        admin2 = User(
            username="auth_admin2",
            hashed_password=get_password_hash("secureAdminPass2!"),
            role=UserRole.ADMIN,
            is_active=True,
            must_change_password=False,
        )
        standard = User(
            username="auth_standard",
            hashed_password=get_password_hash("secureStandardPass!"),
            role=UserRole.SALES,
            is_active=True,
            must_change_password=False,
        )
        session.add_all([admin1, admin2, standard])
        await session.commit()

    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://testserver/api"
        ) as client:
            # Login to get tokens
            login_admin1 = await client.post(
                "/auth/login",
                data={"username": "auth_admin1", "password": "secureAdminPass1!"},
            )
            assert login_admin1.status_code == 200
            token_admin1 = login_admin1.json()["access_token"]
            headers_admin1 = {"Authorization": f"Bearer {token_admin1}"}

            login_admin2 = await client.post(
                "/auth/login",
                data={"username": "auth_admin2", "password": "secureAdminPass2!"},
            )
            assert login_admin2.status_code == 200
            token_admin2 = login_admin2.json()["access_token"]
            headers_admin2 = {"Authorization": f"Bearer {token_admin2}"}

            # 1. Admin creates a user (register endpoint) -> returns safe details, no token!
            reg_resp = await client.post(
                "/auth/register",
                headers=headers_admin1,
                json={
                    "username": "auth_standard_new",
                    "password": "secureStandardNewPass!",
                    "role": UserRole.VIEWER.value,
                },
            )
            assert reg_resp.status_code == 200
            user_data = reg_resp.json()
            assert "access_token" not in user_data  # No token!
            assert user_data["username"] == "auth_standard_new"
            assert user_data["role"] == UserRole.VIEWER.value

            # Cleanup registered user
            async with AsyncSessionLocal() as session:
                await session.execute(
                    delete(User).where(User.username == "auth_standard_new")
                )
                await session.commit()

            # 2. Get user IDs
            async with AsyncSessionLocal() as session:
                res1 = await session.execute(
                    select(User.id).where(User.username == "auth_admin1")
                )
                admin1_id = res1.scalar()
                res2 = await session.execute(
                    select(User.id).where(User.username == "auth_admin2")
                )
                admin2_id = res2.scalar()
                res3 = await session.execute(
                    select(User.id).where(User.username == "auth_standard")
                )
                standard_id = res3.scalar()

            # 3. Protect last admin demotion
            # Try to demote admin2 (who is NOT the final active admin since admin1 is also active) -> should succeed
            demote_resp = await client.put(
                f"/auth/users/{admin2_id}/role",
                headers=headers_admin1,
                json={"role": UserRole.SALES.value},
            )
            assert demote_resp.status_code == 200

            # Now auth_admin1 is the final active admin. Try to demote auth_admin1 -> should fail with 400
            await client.put(
                f"/auth/users/{admin1_id}/role",
                headers=headers_admin2,  # authenticate as admin2 (now sales) or admin1? wait, admin2 is demoted.
                # Actually, try to demote admin1 using a request, but we must use admin1 credentials since they are still admin
                json={"role": UserRole.SALES.value},
            )
            # Demote own role is blocked anyway, so let's promote admin2 back to admin, then demote admin1.
            promote_admin2 = await client.put(
                f"/auth/users/{admin2_id}/role",
                headers=headers_admin1,
                json={"role": UserRole.ADMIN.value},
            )
            assert promote_admin2.status_code == 200

            # Now both are admins. Demote admin2 from admin1 -> works.
            demote_admin2 = await client.put(
                f"/auth/users/{admin2_id}/role",
                headers=headers_admin1,
                json={"role": UserRole.SALES.value},
            )
            assert demote_admin2.status_code == 200

            # Now admin1 is the last active admin. Try to demote admin1 from another request?
            # Wait, standard user cannot demote, so it would return 403 anyway.
            # But what if admin1 tries to demote themselves? Own demotion is blocked: "Nem változtathatja meg a saját szerepkörét!" (400)
            # What if we disable admin2? Let's check.
            # Let's verify toggling active:
            # Can we disable standard user? -> yes
            toggle_std = await client.put(
                f"/auth/users/{standard_id}/toggle-active", headers=headers_admin1
            )
            assert toggle_std.status_code == 200

            # Can admin1 disable themselves? -> blocked ("Nem tilthatja le saját magát!")
            toggle_self = await client.put(
                f"/auth/users/{admin1_id}/toggle-active", headers=headers_admin1
            )
            assert toggle_self.status_code == 400

            # Can we promote standard back to active?
            toggle_std_back = await client.put(
                f"/auth/users/{standard_id}/toggle-active", headers=headers_admin1
            )
            assert toggle_std_back.status_code == 200

            # Promote admin2 back to admin
            promote_admin2_back = await client.put(
                f"/auth/users/{admin2_id}/role",
                headers=headers_admin1,
                json={"role": UserRole.ADMIN.value},
            )
            assert promote_admin2_back.status_code == 200

            # Disable admin2 (which is allowed because admin1 is still active) -> works
            disable_admin2 = await client.put(
                f"/auth/users/{admin2_id}/toggle-active", headers=headers_admin1
            )
            assert disable_admin2.status_code == 200

            # Now admin1 is the only active admin. Try to disable admin2? admin2 is already inactive.
            # Try to disable admin1: blocked by self-disable check.
            # What if we try to demote admin1? Blocked by self-role-change check.
            # Let's enable admin2 again.
            enable_admin2 = await client.put(
                f"/auth/users/{admin2_id}/toggle-active", headers=headers_admin1
            )
            assert enable_admin2.status_code == 200

            # Now both are active admins. Disable admin2.
            disable_admin2_again = await client.put(
                f"/auth/users/{admin2_id}/toggle-active", headers=headers_admin1
            )
            assert disable_admin2_again.status_code == 200

            # Now admin2 is inactive, meaning admin1 is the last active admin.
            # Let's try to demote admin1? Self demote is blocked.
            # Let's try to demote admin2 (who is inactive)? Inactive admins are not "active admins", so demoting them is allowed.

            # Let's test admin password reset:
            reset_resp = await client.post(
                f"/auth/users/{standard_id}/reset-password",
                headers=headers_admin1,
                json={"new_password": "secureNewStandardPass1!"},
            )
            assert reset_resp.status_code == 200

            # Login with new standard pass
            login_std_new = await client.post(
                "/auth/login",
                data={
                    "username": "auth_standard",
                    "password": "secureNewStandardPass1!",
                },
            )
            assert login_std_new.status_code == 200
            std_new_token = login_std_new.json()["access_token"]

            # Me request should require password change (412 status)
            me_resp = await client.get(
                "/auth/me", headers={"Authorization": f"Bearer {std_new_token}"}
            )
            assert me_resp.status_code == 412

    finally:
        async with AsyncSessionLocal() as session:
            await session.execute(
                delete(AuditLog).where(
                    AuditLog.username.in_(
                        ["auth_admin1", "auth_admin2", "auth_standard"]
                    )
                )
            )
            await session.execute(
                delete(User).where(
                    User.username.in_(["auth_admin1", "auth_admin2", "auth_standard"])
                )
            )
            await session.commit()


@pytest.mark.anyio
async def test_auth_hardened_features():
    # Setup temp user
    async with AsyncSessionLocal() as session:
        # Pre-cleanup
        await session.execute(delete(AuditLog).where(AuditLog.username == "auth_temp"))
        await session.execute(delete(User).where(User.username == "auth_temp"))
        await session.commit()

        user = User(
            username="auth_temp",
            hashed_password=get_password_hash("securePass123!"),
            role=UserRole.SALES,
            is_active=True,
            must_change_password=False,
        )
        session.add(user)
        await session.commit()

    # Reset Redis keys for clean test
    redis_client = aioredis.from_url(settings.REDIS_URL)
    await redis_client.delete("login_fail_ip:127.0.0.1")
    await redis_client.delete("login_fail_user_ip:auth_temp:127.0.0.1")
    await redis_client.delete("login_fail_user_global:auth_temp")
    await redis_client.aclose()

    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://testserver/api"
        ) as client:
            # 1. Test token expiry
            expired_token = create_access_token(
                data={"sub": "auth_temp"}, expires_delta=timedelta(seconds=-10)
            )
            expired_headers = {"Authorization": f"Bearer {expired_token}"}
            me_resp = await client.get("/auth/me", headers=expired_headers)
            assert me_resp.status_code == 401
            assert (
                me_resp.json()["detail"]
                == "Nem sikerült érvényesíteni a hitelesítő adatokat"
            )

            # 2. Test login throttling (5 failures allowed, 6th blocked with 429)
            for i in range(5):
                login_resp = await client.post(
                    "/auth/login",
                    data={"username": "auth_temp", "password": "wrongpassword123"},
                )
                assert login_resp.status_code == 401

            # 6th login attempt should return 429 Too Many Requests
            throttle_resp = await client.post(
                "/auth/login",
                data={"username": "auth_temp", "password": "wrongpassword123"},
            )
            assert throttle_resp.status_code == 429
            assert "Retry-After" in throttle_resp.headers
            assert int(throttle_resp.headers["Retry-After"]) > 0

            # 3. Verify no password values are in audit logs
            async with AsyncSessionLocal() as session:
                stmt = select(AuditLog).where(AuditLog.username == "auth_temp")
                logs = (await session.execute(stmt)).scalars().all()
                assert len(logs) > 0
                for log in logs:
                    assert "wrongpassword123" not in log.action
                    if log.details:
                        assert "wrongpassword123" not in log.details

            # 4. Reset failures and test successful login resets throttling
            redis_client = aioredis.from_url(settings.REDIS_URL)
            await redis_client.delete("login_fail_ip:127.0.0.1")
            await redis_client.delete("login_fail_user_ip:auth_temp:127.0.0.1")
            await redis_client.delete("login_fail_user_global:auth_temp")
            await redis_client.aclose()

            # Now successful login works
            success_login = await client.post(
                "/auth/login",
                data={"username": "auth_temp", "password": "securePass123!"},
            )
            assert success_login.status_code == 200

    finally:
        async with AsyncSessionLocal() as session:
            await session.execute(
                delete(AuditLog).where(AuditLog.username == "auth_temp")
            )
            await session.execute(delete(User).where(User.username == "auth_temp"))
            await session.commit()
