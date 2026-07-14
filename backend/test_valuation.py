import pytest
import httpx
from main import app
from database import AsyncSessionLocal
from models import Category, Location, Product, User, UserRole
from sqlalchemy import select, delete
from auth import create_access_token, get_password_hash

@pytest.mark.anyio
async def test_inventory_valuation_flow():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as client:
        # Pre-cleanup
        async with AsyncSessionLocal() as session:
            await session.execute(delete(Product).where(Product.barcode.in_(["888111", "888112"])))
            await session.execute(delete(Category).where(Category.name == "Valuation Cat"))
            await session.execute(delete(Location).where(Location.name == "Valuation Loc"))
            await session.commit()

        # Setup test master data
        async with AsyncSessionLocal() as session:
            # Create user
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

            cat = Category(name="Valuation Cat")
            loc = Location(name="Valuation Loc")
            session.add_all([cat, loc])
            await session.commit()
            await session.refresh(cat)
            await session.refresh(loc)

            # Product 1: net price is set, gross is 0 (should auto-calculate gross)
            p1 = Product(
                barcode="888111",
                name="Valuation Prod 1",
                category_id=cat.id,
                default_location_id=loc.id,
                current_stock=10,
                purchase_price_net=1000,
                purchase_price_gross=0
            )

            # Product 2: both prices 0 (should trigger warning)
            p2 = Product(
                barcode="888112",
                name="Valuation Prod 2",
                category_id=cat.id,
                default_location_id=loc.id,
                current_stock=5,
                purchase_price_net=0,
                purchase_price_gross=0
            )

            session.add_all([p1, p2])
            await session.commit()

            cat_id = cat.id
            loc_id = loc.id

        admin_token = create_access_token(data={"sub": "admin", "role": "ADMIN"})
        headers = {"Authorization": f"Bearer {admin_token}"}

        # 1. Get Valuation without filters
        res = await client.get("/api/inventory/valuation", headers=headers)
        assert res.status_code == 200
        data = res.json()
        
        # Verify our products are present in items
        items = data["items"]
        matching_p1 = [i for i in items if i["product_name"] == "Valuation Prod 1"]
        matching_p2 = [i for i in items if i["product_name"] == "Valuation Prod 2"]
        
        assert len(matching_p1) == 1
        assert len(matching_p2) == 1
        
        # Verify gross auto-calculation
        assert matching_p1[0]["purchase_price_gross"] == 1270
        assert matching_p1[0]["total_value_gross"] == 12700
        
        # Verify warning flag
        assert matching_p1[0]["price_warning"] is False
        assert matching_p2[0]["price_warning"] is True

        # 2. Get Valuation with category filter
        res_cat = await client.get(f"/api/inventory/valuation?category_id={cat_id}", headers=headers)
        assert res_cat.status_code == 200
        data_cat = res_cat.json()
        assert len(data_cat["items"]) == 2
        assert data_cat["total_stock"] == 15
        assert data_cat["total_value_net"] == 10 * 1000 + 5 * 0

        # 3. Get Valuation with location filter
        res_loc = await client.get(f"/api/inventory/valuation?location_id={loc_id}", headers=headers)
        assert res_loc.status_code == 200
        data_loc = res_loc.json()
        assert len(data_loc["items"]) == 2

        # 4. Test Excel Export
        res_excel = await client.get(f"/api/excel/export/valuation?category_id={cat_id}&location_id={loc_id}")
        assert res_excel.status_code == 200
        assert "spreadsheetml.sheet" in res_excel.headers["content-type"]
        assert "keszletertek.xlsx" in res_excel.headers["content-disposition"]

        # Cleanup
        async with AsyncSessionLocal() as session:
            await session.execute(delete(Product).where(Product.barcode.in_(["888111", "888112"])))
            await session.execute(delete(Category).where(Category.id == cat_id))
            await session.execute(delete(Location).where(Location.id == loc_id))
            await session.commit()


from models_inventory import InventoryMovement, MovementType

@pytest.mark.anyio
async def test_product_movements_endpoint():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as client:
        # Pre-cleanup
        async with AsyncSessionLocal() as session:
            await session.execute(delete(InventoryMovement).where(InventoryMovement.reason == "Test Movement Reason"))
            await session.execute(delete(Product).where(Product.barcode == "888113"))
            await session.commit()

        # Setup test product and movement
        async with AsyncSessionLocal() as session:
            p = Product(
                barcode="888113",
                name="Movement Test Prod",
                current_stock=15,
                purchase_price_net=500,
                purchase_price_gross=635
            )
            session.add(p)
            await session.commit()
            await session.refresh(p)
            
            p_id = p.id
            
            m = InventoryMovement(
                product_id=p_id,
                quantity_delta=5,
                stock_before=10,
                stock_after=15,
                movement_type=MovementType.RECEIPT,
                reason="Test Movement Reason",
                price_net=500
            )
            session.add(m)
            await session.commit()

        admin_token = create_access_token(data={"sub": "admin", "role": "ADMIN"})
        headers = {"Authorization": f"Bearer {admin_token}"}

        # Query movements endpoint
        res = await client.get(f"/api/products/{p_id}/movements", headers=headers)
        assert res.status_code == 200
        movements = res.json()
        assert len(movements) == 1
        assert movements[0]["movement_type"] == "Bevételezés"
        assert movements[0]["quantity_delta"] == 5
        assert movements[0]["reason"] == "Test Movement Reason"
        assert movements[0]["price_net"] == 500

        # Query non-existent product movements
        res_fail = await client.get("/api/products/non-existent-product-id-123/movements", headers=headers)
        assert res_fail.status_code == 404

        # Cleanup
        async with AsyncSessionLocal() as session:
            await session.execute(delete(InventoryMovement).where(InventoryMovement.product_id == p_id))
            await session.execute(delete(Product).where(Product.id == p_id))
            await session.commit()


@pytest.mark.anyio
async def test_stock_consistency_endpoints():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as client:
        # Pre-cleanup
        async with AsyncSessionLocal() as session:
            await session.execute(delete(InventoryMovement).where(InventoryMovement.reason == "Test Consistency"))
            await session.execute(delete(Product).where(Product.barcode.in_(["888201", "888202"])))
            await session.commit()

        # Setup test data:
        async with AsyncSessionLocal() as session:
            p1 = Product(
                barcode="888201",
                name="Consistency Prod 1",
                current_stock=10,
                allow_negative_stock=False
            )
            p2 = Product(
                barcode="888202",
                name="Consistency Prod 2",
                current_stock=-5,
                allow_negative_stock=False
            )
            session.add_all([p1, p2])
            await session.commit()
            await session.refresh(p1)
            await session.refresh(p2)
            
            p1_id = p1.id
            p2_id = p2.id
            
            m1 = InventoryMovement(
                product_id=p1_id,
                quantity_delta=5,
                stock_before=0,
                stock_after=5,
                movement_type=MovementType.RECEIPT,
                reason="Test Consistency"
            )
            session.add(m1)
            await session.commit()

        admin_token = create_access_token(data={"sub": "admin", "role": "ADMIN"})
        headers = {"Authorization": f"Bearer {admin_token}"}

        # Query consistency api
        res = await client.get("/api/inventory/consistency", headers=headers)
        assert res.status_code == 200
        report = res.json()
        assert report["has_issues"] is True
        
        discrepancies = report["discrepancies"]
        types = [d["type"] for d in discrepancies]
        assert "stock_mismatch" in types
        assert "negative_stock" in types

        # Query excel consistency export
        res_excel = await client.get("/api/excel/export/consistency")
        assert res_excel.status_code == 200
        assert "spreadsheetml.sheet" in res_excel.headers["content-type"]
        assert "keszlet_konzisztencia.xlsx" in res_excel.headers["content-disposition"]

        # Cleanup
        async with AsyncSessionLocal() as session:
            await session.execute(delete(InventoryMovement).where(InventoryMovement.product_id.in_([p1_id, p2_id])))
            await session.execute(delete(Product).where(Product.id.in_([p1_id, p2_id])))
            await session.commit()
