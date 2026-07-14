import pytest
import httpx
from main import app
from database import AsyncSessionLocal
from models import Category, Product, User, UserRole, AuditLog
from sqlalchemy import select, delete
from init_db import init_database
from auth import create_access_token, get_password_hash

@pytest.mark.anyio
async def test_init_db_idempotency():
    # Run it first time
    await init_database()
    
    # Get counts of categories and locations
    async with AsyncSessionLocal() as session:
        cat_count_1 = (await session.execute(select(Category))).scalars().all()
        
    # Run it second time
    await init_database()
    
    # Verify counts remain identical
    async with AsyncSessionLocal() as session:
        cat_count_2 = (await session.execute(select(Category))).scalars().all()
        assert len(cat_count_1) == len(cat_count_2)

@pytest.mark.anyio
async def test_category_merge_flow():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as client:
        # Pre-cleanup
        async with AsyncSessionLocal() as session:
            # Delete any products with barcode 998811/998812
            await session.execute(delete(Product).where(Product.barcode.in_(["998811", "998812"])))
            # Delete test categories
            await session.execute(delete(Category).where(Category.name.in_(["Source Category Test", "Target Category Test"])))
            await session.commit()

        # Setup test categories, products, and users
        async with AsyncSessionLocal() as session:
            # Create users
            admin_user = await session.execute(select(User).where(User.username == "admin"))
            if not admin_user.scalars().first():
                admin = User(
                    username="admin",
                    hashed_password=get_password_hash("admin123"),
                    role=UserRole.ADMIN,
                    is_active=True,
                    must_change_password=False
                )
                session.add(admin)
                
            warehouse_user = await session.execute(select(User).where(User.username == "warehouse"))
            if not warehouse_user.scalars().first():
                wh = User(
                    username="warehouse",
                    hashed_password=get_password_hash("warehouse123"),
                    role=UserRole.WAREHOUSE,
                    is_active=True,
                    must_change_password=False
                )
                session.add(wh)
                
            # Create categories
            source_cat = Category(name="Source Category Test")
            target_cat = Category(name="Target Category Test")
            session.add_all([source_cat, target_cat])
            await session.commit()
            await session.refresh(source_cat)
            await session.refresh(target_cat)
            
            # Create products belonging to source category
            p1 = Product(barcode="998811", name="Prod 1", category_id=source_cat.id)
            p2 = Product(barcode="998812", name="Prod 2", category_id=source_cat.id)
            session.add_all([p1, p2])
            await session.commit()
            
            source_id = source_cat.id
            target_id = target_cat.id

        # Create admin token for auth
        admin_token = create_access_token(data={"sub": "admin", "role": "ADMIN"})
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # 1. Test Merge Preview
        preview_res = await client.get(
            f"/api/categories/merge-preview?source_id={source_id}&target_id={target_id}",
            headers=headers
        )
        assert preview_res.status_code == 200
        preview_data = preview_res.json()
        assert preview_data["source_name"] == "Source Category Test"
        assert preview_data["target_name"] == "Target Category Test"
        assert preview_data["product_count"] == 2
        
        # 2. Test Merge restricted to admin (test non-admin response)
        user_token = create_access_token(data={"sub": "warehouse", "role": "WAREHOUSE"})
        bad_headers = {"Authorization": f"Bearer {user_token}"}
        merge_bad = await client.post(
            "/api/categories/merge",
            json={"source_id": source_id, "target_id": target_id},
            headers=bad_headers
        )
        assert merge_bad.status_code == 403
        
        # 3. Test Merge Success
        merge_good = await client.post(
            "/api/categories/merge",
            json={"source_id": source_id, "target_id": target_id},
            headers=headers
        )
        assert merge_good.status_code == 200
        
        # Verify DB state
        async with AsyncSessionLocal() as session:
            # Check source category is deleted
            stmt_cat = select(Category).where(Category.id == source_id)
            deleted_cat = (await session.execute(stmt_cat)).scalar_one_or_none()
            assert deleted_cat is None
            
            # Check products are moved to target category
            stmt_prods = select(Product).where(Product.category_id == target_id)
            moved_prods = (await session.execute(stmt_prods)).scalars().all()
            assert len(moved_prods) == 2
            
            # Check audit log entry exists
            stmt_audit = select(AuditLog)
            audit_entries = (await session.execute(stmt_audit)).scalars().all()
            matching = [ae for ae in audit_entries if ae.action and "2" in ae.action]
            assert len(matching) > 0
            
            # Clean up target category and products after successful test
            await session.execute(delete(Product).where(Product.barcode.in_(["998811", "998812"])))
            await session.execute(delete(Category).where(Category.id == target_id))
            await session.commit()
