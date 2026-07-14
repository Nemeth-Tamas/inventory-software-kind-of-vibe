import os
import re
import sys
import subprocess
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from config import settings
from models import Base
import models_inventory  # noqa
from init_db import init_database
from alembic.migration import MigrationContext
from alembic.autogenerate import compare_metadata


# Sync database URL for compare_metadata which requires sync connection
def get_sync_url(url: str) -> str:
    return url.replace("postgresql+asyncpg://", "postgresql://")


@pytest.fixture(scope="module")
def base_db_urls():
    # Parse existing DATABASE_URL
    original_url = settings.DATABASE_URL
    base_url, db_name = original_url.rsplit("/", 1)

    # We will connect to default 'postgres' database to perform admin operations
    admin_async_url = f"{base_url}/postgres"

    temp_db_name = "test_migration_integrity_db"
    temp_async_url = f"{base_url}/{temp_db_name}"

    return {
        "admin_async_url": admin_async_url,
        "temp_db_name": temp_db_name,
        "temp_async_url": temp_async_url,
        "original_url": original_url,
    }


@pytest.mark.anyio
async def test_migration_and_init_db_lifecycle(base_db_urls, monkeypatch):
    admin_engine = create_async_engine(
        base_db_urls["admin_async_url"], isolation_level="AUTOCOMMIT"
    )
    temp_db_name = base_db_urls["temp_db_name"]
    temp_async_url = base_db_urls["temp_async_url"]

    # Drop and recreate the temp database
    async with admin_engine.connect() as conn:
        await conn.execute(text(f"DROP DATABASE IF EXISTS {temp_db_name}"))
        await conn.execute(text(f"CREATE DATABASE {temp_db_name}"))

    await admin_engine.dispose()

    # Set DATABASE_URL to our temporary database in config settings
    monkeypatch.setattr(settings, "DATABASE_URL", temp_async_url)

    # Get backend directory
    backend_dir = os.path.dirname(os.path.abspath(__file__))

    # Prepare environment variables for subprocesses
    sub_env = {**os.environ, "DATABASE_URL": temp_async_url, "APP_ENV": "development"}

    try:
        # 1. Run migrations from zero to head
        res = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=backend_dir,
            env=sub_env,
            capture_output=True,
            text=True,
        )
        assert res.returncode == 0, f"Migrations failed: {res.stderr}"

        # 2. Run init_db.py's init_database() on the freshly migrated db
        new_engine = create_async_engine(temp_async_url)
        from sqlalchemy.orm import sessionmaker
        from sqlalchemy.ext.asyncio import AsyncSession

        new_sessionmaker = sessionmaker(
            new_engine, class_=AsyncSession, expire_on_commit=False
        )

        monkeypatch.setattr("database.AsyncSessionLocal", new_sessionmaker)
        monkeypatch.setattr("init_db.AsyncSessionLocal", new_sessionmaker)

        try:
            # Run database initialization
            await init_database()

            # Verify admin user exists
            async with new_sessionmaker() as session:
                from sqlalchemy import select
                from models import User, UserRole

                admin_check = await session.execute(
                    select(User).where(User.role == UserRole.ADMIN)
                )
                admin = admin_check.scalars().first()
                assert admin is not None
                assert admin.username == settings.ADMIN_USER

            # 3. Rerun init_database() to prove it is idempotent
            await init_database()

            # 4. Rerun alembic upgrade head to verify it is safe (no-op)
            res_repeat = subprocess.run(
                [sys.executable, "-m", "alembic", "upgrade", "head"],
                cwd=backend_dir,
                env=sub_env,
                capture_output=True,
                text=True,
            )
            assert res_repeat.returncode == 0, (
                f"Repeat migration failed: {res_repeat.stderr}"
            )

            # 5. Verify model metadata matches database schema exactly
            async with new_engine.connect() as connection:

                def do_compare(conn):
                    mc = MigrationContext.configure(conn)
                    diff = compare_metadata(mc, Base.metadata)
                    return diff

                diff = await connection.run_sync(do_compare)
                # Remove alembic_version table differences if compare_metadata detects it
                filtered_diff = [
                    d
                    for d in diff
                    if not (d[0] == "remove_table" and d[1].name == "alembic_version")
                ]
                assert len(filtered_diff) == 0, (
                    f"Schema mismatch detected: {filtered_diff}"
                )

        finally:
            await new_engine.dispose()

    finally:
        # Drop the temporary database
        admin_engine = create_async_engine(
            base_db_urls["admin_async_url"], isolation_level="AUTOCOMMIT"
        )
        async with admin_engine.connect() as conn:
            # Terminate connections to the database to ensure we can drop it
            await conn.execute(
                text(
                    f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{temp_db_name}'"
                )
            )
            await conn.execute(text(f"DROP DATABASE IF EXISTS {temp_db_name}"))
        await admin_engine.dispose()


@pytest.mark.anyio
async def test_migration_upgrade_path(base_db_urls, monkeypatch):
    admin_engine = create_async_engine(
        base_db_urls["admin_async_url"], isolation_level="AUTOCOMMIT"
    )
    temp_db_name = "test_upgrade_path_db"
    base_url, _ = base_db_urls["original_url"].rsplit("/", 1)
    temp_async_url = f"{base_url}/{temp_db_name}"

    # Drop and recreate the temp database
    async with admin_engine.connect() as conn:
        await conn.execute(text(f"DROP DATABASE IF EXISTS {temp_db_name}"))
        await conn.execute(text(f"CREATE DATABASE {temp_db_name}"))

    await admin_engine.dispose()

    monkeypatch.setattr(settings, "DATABASE_URL", temp_async_url)
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    sub_env = {**os.environ, "DATABASE_URL": temp_async_url, "APP_ENV": "development"}

    try:
        # Upgrade only up to the previous migration e84098e5ded7
        res_prev = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "e84098e5ded7"],
            cwd=backend_dir,
            env=sub_env,
            capture_output=True,
            text=True,
        )
        assert res_prev.returncode == 0, (
            f"Upgrade to previous migration failed: {res_prev.stderr}"
        )

        # Now upgrade to head
        res_head = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=backend_dir,
            env=sub_env,
            capture_output=True,
            text=True,
        )
        assert res_head.returncode == 0, (
            f"Upgrade from previous migration to head failed: {res_head.stderr}"
        )

    finally:
        admin_engine = create_async_engine(
            base_db_urls["admin_async_url"], isolation_level="AUTOCOMMIT"
        )
        async with admin_engine.connect() as conn:
            await conn.execute(
                text(
                    f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{temp_db_name}'"
                )
            )
            await conn.execute(text(f"DROP DATABASE IF EXISTS {temp_db_name}"))
        await admin_engine.dispose()


def test_no_adhoc_ddl_statements():
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    ddl_pattern = re.compile(r"\b(ALTER|CREATE|DROP)\s+TABLE\b", re.IGNORECASE)

    for root, dirs, files in os.walk(backend_dir):
        # Exclude alembic versions, virtual env, cache, and test files
        if "alembic" in root or "venv" in root or "__pycache__" in root:
            continue

        for file in files:
            if (
                not file.endswith(".py")
                or file.startswith("test_")
                or file == "test_migration_integrity.py"
            ):
                continue

            filepath = os.path.join(root, file)
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()

            # Search for ALTER TABLE / CREATE TABLE / DROP TABLE
            matches = ddl_pattern.findall(content)
            assert len(matches) == 0, f"Ad-hoc DDL detected in {filepath}: {matches}"
