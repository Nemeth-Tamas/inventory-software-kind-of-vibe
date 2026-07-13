import pytest
import httpx
from sqlalchemy import select, delete
from main import app
from database import AsyncSessionLocal
from models import User, UserRole, Product, Location, Category, Supplier, AuditLog
from models_inventory import Stocktake, StocktakeItem, StocktakeUnknownBarcode, InventoryMovement, MovementType
from auth import get_password_hash

TEST_URL = "http://testserver/api"

@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"

@pytest.fixture(autouse=True)
async def dispose_engine():
    yield
    from database import engine
    await engine.dispose()


@pytest.mark.anyio
async def test_full_integration_flow():
    # Initialize variables for cleanup
    category = None
    location = None
    supplier = None
    product = None
    st_id = None

    try:
        # Pre-cleanup leftovers from previous failed runs
        async with AsyncSessionLocal() as session:
            # 1. Delete stocktake items and unknown barcodes first
            await session.execute(delete(StocktakeItem).where(StocktakeItem.stocktake_id.in_(
                select(Stocktake.id).where(Stocktake.name.like("TestStocktake%"))
            )))
            await session.execute(delete(StocktakeUnknownBarcode).where(StocktakeUnknownBarcode.stocktake_id.in_(
                select(Stocktake.id).where(Stocktake.name.like("TestStocktake%"))
            )))
            await session.execute(delete(Stocktake).where(Stocktake.name.like("TestStocktake%")))
            
            # 2. Delete movements by user_id
            user_ids_subq = select(User.id).where(User.username.in_(["test_technician", "test_admin"]))
            await session.execute(delete(InventoryMovement).where(InventoryMovement.user_id.in_(user_ids_subq)))
            
            # 3. Delete products, categories, locations, suppliers, audit logs, users
            await session.execute(delete(StocktakeUnknownBarcode).where(StocktakeUnknownBarcode.barcode == "999999"))
            await session.execute(delete(Product).where((Product.name == "Test Phone Screen") | (Product.barcode == "260001")))
            await session.execute(delete(Category).where(Category.name == "Test Category"))
            await session.execute(delete(Location).where(Location.name == "Test Location"))
            await session.execute(delete(Supplier).where(Supplier.name == "Test Supplier"))
            await session.execute(delete(AuditLog).where(AuditLog.username.in_(["test_technician", "test_admin"])))
            await session.execute(delete(User).where(User.username.in_(["test_technician", "test_admin"])))
            await session.commit()

        # 1. Seed test master data directly into the database using a clean session
        async with AsyncSessionLocal() as async_session:
            category = Category(name="Test Category")
            location = Location(name="Test Location")
            supplier = Supplier(name="Test Supplier")
            async_session.add_all([category, location, supplier])
            await async_session.flush()
            
            product = Product(
                name="Test Phone Screen",
                sku="SCR-101",
                barcode="260001",
                current_stock=10,
                minimum_stock=2,
                purchase_price_net=5000,
                purchase_price_gross=6350,
                sale_price_net=10000,
                sale_price_gross=12700,
                is_active=True,
                category_id=category.id,
                default_location_id=location.id,
                supplier_id=supplier.id
            )
            async_session.add(product)
            await async_session.flush()
            
            test_user = User(
                username="test_technician",
                hashed_password=get_password_hash("tempPass123"),
                role=UserRole.WAREHOUSE,
                must_change_password=True,
                is_active=True
            )
            
            admin_user = User(
                username="test_admin",
                hashed_password=get_password_hash("adminPass123"),
                role=UserRole.ADMIN,
                must_change_password=False,
                is_active=True
            )
            async_session.add_all([test_user, admin_user])
            await async_session.commit()

        # 2. Test Login and Token retrieval
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=TEST_URL) as client:
            # Login as technician
            login_resp = await client.post("/auth/login", data={
                "username": "test_technician",
                "password": "tempPass123"
            })
            assert login_resp.status_code == 200
            tech_token = login_resp.json()["access_token"]
            tech_headers = {"Authorization": f"Bearer {tech_token}"}
            
            # 3. Test must_change_password blocking
            prod_resp = await client.get("/auth/me", headers=tech_headers)
            assert prod_resp.status_code == 412
            
            # 4. Test password change
            change_resp = await client.post("/auth/change-password", headers=tech_headers, json={
                "old_password": "tempPass123",
                "new_password": "secureNewPass123"
            })
            assert change_resp.status_code == 200
            
            # Verify user must_change_password is now False
            async with AsyncSessionLocal() as session:
                res_user = await session.execute(select(User).where(User.username == "test_technician"))
                db_user = res_user.scalar_one()
                assert db_user.must_change_password is False
            
            # Relogin with new password to get unblocked token
            login_resp2 = await client.post("/auth/login", data={
                "username": "test_technician",
                "password": "secureNewPass123"
            })
            assert login_resp2.status_code == 200
            tech_token = login_resp2.json()["access_token"]
            tech_headers = {"Authorization": f"Bearer {tech_token}"}
            
            # Call /auth/me again - should now succeed
            prod_resp2 = await client.get("/auth/me", headers=tech_headers)
            assert prod_resp2.status_code == 200
            
            # Login as admin to perform administrative tasks
            admin_login = await client.post("/auth/login", data={
                "username": "test_admin",
                "password": "adminPass123"
            })
            admin_token = admin_login.json()["access_token"]
            admin_headers = {"Authorization": f"Bearer {admin_token}"}

            # 5. Create a stocktake
            st_resp = await client.post("/stocktakes?name=TestStocktake1&notes=TestNotes", headers=admin_headers)
            assert st_resp.status_code == 200
            st_id = st_resp.json()["id"]
            
            # Verify StocktakeItem was created with expected_qty=10
            async with AsyncSessionLocal() as session:
                st_item_result = await session.execute(
                    select(StocktakeItem).where((StocktakeItem.stocktake_id == st_id) & (StocktakeItem.product_id == product.id))
                )
                st_item = st_item_result.scalar_one_or_none()
                assert st_item is not None
                assert st_item.expected_qty == 10

            # Start the stocktake
            start_resp = await client.post(f"/stocktakes/{st_id}/start", headers=admin_headers)
            assert start_resp.status_code == 200
            
            # 6. Scan a known item
            scan_resp = await client.post(f"/stocktakes/{st_id}/scan", headers=tech_headers, json={
                "barcode": "260001",
                "multiplier": 2
            })
            assert scan_resp.status_code == 200
            assert scan_resp.json()["status"] == "success"
            
            # Verify stocktake item count is updated
            async with AsyncSessionLocal() as session:
                st_item_result = await session.execute(
                    select(StocktakeItem).where((StocktakeItem.stocktake_id == st_id) & (StocktakeItem.product_id == product.id))
                )
                st_item = st_item_result.scalar_one()
                assert st_item.counted_qty == 2
                assert st_item.difference == -8
            
            # 7. Scan an unknown item
            scan_unknown = await client.post(f"/stocktakes/{st_id}/scan", headers=tech_headers, json={
                "barcode": "999999",
                "multiplier": 1
            })
            assert scan_unknown.status_code == 200
            assert scan_unknown.json()["status"] == "unknown"
            unknown_scan_id = scan_unknown.json()["id"]
            
            # Verify it is persisted in StocktakeUnknownBarcode
            async with AsyncSessionLocal() as session:
                u_scan_res = await session.execute(
                    select(StocktakeUnknownBarcode).where(StocktakeUnknownBarcode.id == unknown_scan_id)
                )
                u_scan = u_scan_res.scalar_one_or_none()
                assert u_scan is not None
                assert u_scan.barcode == "999999"
                assert u_scan.resolved is False
            
            # 8. Retrieve unresolved scans
            unresolved_resp = await client.get(f"/stocktakes/{st_id}/unresolved", headers=tech_headers)
            assert unresolved_resp.status_code == 200
            unresolved_list = unresolved_resp.json()
            assert any(x["barcode"] == "999999" for x in unresolved_list)
            
            # 9. Link unresolved scan to the product
            link_resp = await client.post(
                f"/stocktakes/unresolved/{unknown_scan_id}/link?product_id={product.id}",
                headers=tech_headers
            )
            assert link_resp.status_code == 200
            
            # Verify unresolved scan is marked resolved
            async with AsyncSessionLocal() as session:
                u_scan_res = await session.execute(
                    select(StocktakeUnknownBarcode).where(StocktakeUnknownBarcode.id == unknown_scan_id)
                )
                u_scan = u_scan_res.scalar_one()
                assert u_scan.resolved is True
                assert u_scan.resolved_product_id == product.id
                
                # Verify product counted quantity was incremented by 1 (total is 2 + 1 = 3)
                st_item_result = await session.execute(
                    select(StocktakeItem).where((StocktakeItem.stocktake_id == st_id) & (StocktakeItem.product_id == product.id))
                )
                st_item = st_item_result.scalar_one()
                assert st_item.counted_qty == 3
            # Prevent other products from being modified by setting their counted_qty = expected_qty
            async with AsyncSessionLocal() as session:
                from sqlalchemy import update
                await session.execute(
                    update(StocktakeItem)
                    .where((StocktakeItem.stocktake_id == st_id) & (StocktakeItem.product_id != product.id))
                    .values(counted_qty=StocktakeItem.expected_qty, difference=0)
                )
                await session.commit()
            
            # 10. Apply corrections
            apply_resp = await client.post(
                f"/stocktakes/{st_id}/apply-corrections?reason=TestCorrect",
                headers=admin_headers
            )
            assert apply_resp.status_code == 200
            
            # Verify stock was updated to counted_qty (3 db)
            async with AsyncSessionLocal() as session:
                res_prod = await session.execute(select(Product).where(Product.id == product.id))
                db_prod = res_prod.scalar_one()
                assert db_prod.current_stock == 3
                
                # Verify compensating InventoryMovement was created with delta -7
                mov_result = await session.execute(
                    select(InventoryMovement).where(
                        (InventoryMovement.product_id == product.id) & (InventoryMovement.movement_type == MovementType.CORRECTION)
                    )
                )
                mov = mov_result.scalar_one_or_none()
                assert mov is not None
                assert mov.quantity_delta == -7
                assert mov.stock_before == 10
                assert mov.stock_after == 3
                
            # 11. Verify idempotency key validation
            receipt_payload = {
                "items": [{"product_id": product.id, "quantity": 5}],
                "location_id": location.id,
                "idempotency_key": "unique-receipt-key-123"
            }
            rec_resp1 = await client.post("/inventory/receipt", json=receipt_payload, headers=tech_headers)
            assert rec_resp1.status_code == 201
            
            rec_resp2 = await client.post("/inventory/receipt", json=receipt_payload, headers=tech_headers)
            assert rec_resp2.status_code == 400
            assert "duplikált" in rec_resp2.json()["detail"]
            
            # Check current stock is 3 + 5 = 8 db (it did not add 5 twice)
            async with AsyncSessionLocal() as session:
                res_prod = await session.execute(select(Product).where(Product.id == product.id))
                db_prod = res_prod.scalar_one()
                assert db_prod.current_stock == 8
                
    finally:
        # Clean up seeded test data completely
        import asyncio
        await asyncio.sleep(0.2)
        async with AsyncSessionLocal() as clean_session:
            # Delete referencing InventoryMovements by user_id to prevent FK violation
            user_ids_subq = select(User.id).where(User.username.in_(["test_technician", "test_admin"]))
            await clean_session.execute(delete(InventoryMovement).where(InventoryMovement.user_id.in_(user_ids_subq)))
            
            if product:
                await clean_session.execute(delete(InventoryMovement).where(InventoryMovement.product_id == product.id))
            if st_id:
                await clean_session.execute(delete(StocktakeUnknownBarcode).where(StocktakeUnknownBarcode.stocktake_id == st_id))
                await clean_session.execute(delete(StocktakeItem).where(StocktakeItem.stocktake_id == st_id))
                await clean_session.execute(delete(Stocktake).where(Stocktake.id == st_id))
            if product:
                await clean_session.execute(delete(Product).where((Product.id == product.id) | (Product.barcode == "260001")))
            # Delete referencing Audit Logs first to avoid foreign key violation
            await clean_session.execute(delete(AuditLog).where(AuditLog.username.in_(["test_technician", "test_admin"])))
            await clean_session.execute(delete(User).where(User.username.in_(["test_technician", "test_admin"])))
            if category:
                await clean_session.execute(delete(Category).where(Category.id == category.id))
            if location:
                await clean_session.execute(delete(Location).where(Location.id == location.id))
            if supplier:
                await clean_session.execute(delete(Supplier).where(Supplier.id == supplier.id))
            await clean_session.commit()


@pytest.mark.anyio
async def test_master_data_operations():
    admin_user = None
    cat_id = None
    sup_id = None
    loc_id = None

    try:
        async with AsyncSessionLocal() as session:
            admin_user = User(
                username="master_data_admin",
                hashed_password=get_password_hash("adminPass123"),
                role=UserRole.ADMIN,
                must_change_password=False,
                is_active=True
            )
            session.add(admin_user)
            await session.commit()

        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=TEST_URL) as client:
            login_resp = await client.post("/auth/login", data={
                "username": "master_data_admin",
                "password": "adminPass123"
            })
            assert login_resp.status_code == 200
            token = login_resp.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}
            
            # 1. Create Category
            cat_resp = await client.post("/categories", json={"name": "Temp Cat"}, headers=headers)
            assert cat_resp.status_code == 200
            cat_id = cat_resp.json()["id"]
            assert cat_resp.json()["is_archived"] is False
            
            # Rename Category
            rename_resp = await client.put(f"/categories/{cat_id}", json={"name": "Temp Cat Renamed"}, headers=headers)
            assert rename_resp.status_code == 200
            assert rename_resp.json()["name"] == "Temp Cat Renamed"

            # Archive Category
            arch_resp = await client.post(f"/categories/{cat_id}/archive", headers=headers)
            assert arch_resp.status_code == 200
            assert arch_resp.json()["is_archived"] is True
            
            # Restore Category
            rest_resp = await client.post(f"/categories/{cat_id}/restore", headers=headers)
            assert rest_resp.status_code == 200
            assert rest_resp.json()["is_archived"] is False

            # 2. Create Supplier
            sup_payload = {
                "name": "Searchable Supplier Ltd",
                "contact_person": "Jane Doe",
                "email": "jane@searchable.com",
                "phone": "+36301234567",
                "address": "Budapest, Hungary",
                "tax_number": "12345678-1-12",
                "customer_number": "CUST-999",
                "comment": "Temporary supplier",
                "is_active": True
            }
            sup_resp = await client.post("/suppliers", json=sup_payload, headers=headers)
            assert sup_resp.status_code == 200
            sup_id = sup_resp.json()["id"]
            assert sup_resp.json()["customer_number"] == "CUST-999"

            # Search Suppliers
            search_resp = await client.get("/suppliers?q=Searchable", headers=headers)
            assert search_resp.status_code == 200
            assert len(search_resp.json()) >= 1
            assert search_resp.json()[0]["id"] == sup_id

            # Merge Categories
            cat_target_resp = await client.post("/categories", json={"name": "Target Cat"}, headers=headers)
            assert cat_target_resp.status_code == 200
            cat_target_id = cat_target_resp.json()["id"]
            
            merge_resp = await client.post("/categories/merge", json={"source_id": cat_id, "target_id": cat_target_id}, headers=headers)
            assert merge_resp.status_code == 200
            
            # Verify source category is deleted
            get_deleted_cat = await client.get("/categories", headers=headers)
            assert not any(c["id"] == cat_id for c in get_deleted_cat.json())
            
            # Cleanup target category
            del_target = await client.delete(f"/categories/{cat_target_id}", headers=headers)
            assert del_target.status_code == 200

            # Delete Supplier
            del_sup = await client.delete(f"/suppliers/{sup_id}", headers=headers)
            assert del_sup.status_code == 200

    finally:
        async with AsyncSessionLocal() as session:
            await session.execute(delete(AuditLog).where(AuditLog.username == "master_data_admin"))
            if admin_user:
                await session.execute(delete(User).where(User.username == "master_data_admin"))
            await session.commit()


@pytest.mark.anyio
async def test_product_creation_success():
    category = None
    location = None
    supplier = None
    product_id = None
    admin_user = None

    try:
        async with AsyncSessionLocal() as session:
            category = Category(name="Success Category")
            location = Location(name="Success Location")
            supplier = Supplier(name="Success Supplier")
            session.add_all([category, location, supplier])
            
            admin_user = User(
                username="prod_success_admin",
                hashed_password=get_password_hash("adminPass123"),
                role=UserRole.ADMIN,
                must_change_password=False,
                is_active=True
            )
            session.add(admin_user)
            await session.commit()

        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=TEST_URL) as client:
            login_resp = await client.post("/auth/login", data={
                "username": "prod_success_admin",
                "password": "adminPass123"
            })
            assert login_resp.status_code == 200
            token = login_resp.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}
            
            payload = {
                "name": "Success Test Product",
                "sku": "SKU-SUCCESS-XYZ",
                "category_id": category.id,
                "default_location_id": location.id,
                "supplier_id": supplier.id,
                "vat_rate": 27,
                "unit": "db",
                "purchase_price_net": 100,
                "purchase_price_gross": 127,
                "sale_price_net": 200,
                "sale_price_gross": 254
            }
            
            resp = await client.post("/products", json=payload, headers=headers)
            assert resp.status_code == 200
            data = resp.json()
            product_id = data["id"]
            assert data["name"] == "Success Test Product"
            assert data["sku"] == "SKU-SUCCESS-XYZ"
            assert data["barcode"] is not None
            
    finally:
        import asyncio
        await asyncio.sleep(0.1)
        async with AsyncSessionLocal() as session:
            if product_id:
                await session.execute(delete(Product).where(Product.id == product_id))
            await session.execute(delete(AuditLog).where(AuditLog.username == "prod_success_admin"))
            if admin_user:
                await session.execute(delete(User).where(User.username == "prod_success_admin"))
            if category:
                await session.execute(delete(Category).where(Category.id == category.id))
            if location:
                await session.execute(delete(Location).where(Location.id == location.id))
            if supplier:
                await session.execute(delete(Supplier).where(Supplier.id == supplier.id))
            await session.commit()


@pytest.mark.anyio
async def test_product_creation_rollback_on_failure():
    category = None
    location = None
    supplier = None
    admin_user = None

    try:
        async with AsyncSessionLocal() as session:
            category = Category(name="Fail Category")
            location = Location(name="Fail Location")
            supplier = Supplier(name="Fail Supplier")
            session.add_all([category, location, supplier])
            
            admin_user = User(
                username="prod_fail_admin",
                hashed_password=get_password_hash("adminPass123"),
                role=UserRole.ADMIN,
                must_change_password=False,
                is_active=True
            )
            session.add(admin_user)
            await session.commit()

        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=TEST_URL) as client:
            login_resp = await client.post("/auth/login", data={
                "username": "prod_fail_admin",
                "password": "adminPass123"
            })
            assert login_resp.status_code == 200
            token = login_resp.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}
            
            # First, create a product with duplicate SKU
            payload1 = {
                "name": "First Product",
                "sku": "SKU-DUPE",
                "category_id": category.id,
                "default_location_id": location.id,
                "supplier_id": supplier.id,
                "vat_rate": 27,
                "unit": "db"
            }
            resp1 = await client.post("/products", json=payload1, headers=headers)
            assert resp1.status_code == 200
            prod1_id = resp1.json()["id"]
            
            # Try to create a second product with the same SKU (must fail and rollback)
            payload2 = {
                "name": "Second Product",
                "sku": "SKU-DUPE",
                "category_id": category.id,
                "default_location_id": location.id,
                "supplier_id": supplier.id,
                "vat_rate": 27,
                "unit": "db"
            }
            resp2 = await client.post("/products", json=payload2, headers=headers)
            assert resp2.status_code == 400
            
            # Verify the second product was NOT saved in database
            async with AsyncSessionLocal() as session:
                res = await session.execute(select(Product).where(Product.name == "Second Product"))
                assert res.scalar_one_or_none() is None

    finally:
        import asyncio
        await asyncio.sleep(0.1)
        async with AsyncSessionLocal() as session:
            await session.execute(delete(Product).where(Product.sku == "SKU-DUPE"))
            await session.execute(delete(AuditLog).where(AuditLog.username == "prod_fail_admin"))
            if admin_user:
                await session.execute(delete(User).where(User.username == "prod_fail_admin"))
            if category:
                await session.execute(delete(Category).where(Category.id == category.id))
            if location:
                await session.execute(delete(Location).where(Location.id == location.id))
            if supplier:
                await session.execute(delete(Supplier).where(Supplier.id == supplier.id))
            await session.commit()


@pytest.mark.anyio
async def test_delete_stocktake():
    # Setup test admin
    admin_user = None
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.username == "st_del_admin"))
        admin_user = result.scalar_one_or_none()
        if not admin_user:
            admin_user = User(
                username="st_del_admin",
                hashed_password=get_password_hash("stDelPass123"),
                role=UserRole.ADMIN,
                is_active=True
            )
            session.add(admin_user)
            await session.commit()
            
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=TEST_URL) as client:
            # Login
            login_resp = await client.post("/auth/login", data={
                "username": "st_del_admin",
                "password": "stDelPass123"
            })
            assert login_resp.status_code == 200
            token = login_resp.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}
            
            # Create a stocktake
            st_create_resp = await client.post("/stocktakes?name=TestDeleteSt", headers=headers)
            assert st_create_resp.status_code == 200
            st_id = st_create_resp.json()["id"]
            
            # Delete the stocktake
            st_del_resp = await client.delete(f"/stocktakes/{st_id}", headers=headers)
            assert st_del_resp.status_code == 200
            
            # Verify deleted
            st_get_resp = await client.get("/stocktakes", headers=headers)
            assert not any(st["id"] == st_id for st in st_get_resp.json())
            
    finally:
        async with AsyncSessionLocal() as session:
            await session.execute(delete(AuditLog).where(AuditLog.username == "st_del_admin"))
            if admin_user:
                await session.execute(delete(User).where(User.username == "st_del_admin"))
            await session.commit()


@pytest.mark.anyio
async def test_delete_zero_stock_products():
    admin_user = None
    prod_zero = None
    prod_five = None
    
    async with AsyncSessionLocal() as session:
        # Seed admin user
        admin_user = User(
            username="bulk_del_admin",
            hashed_password=get_password_hash("bulkDelPass123"),
            role=UserRole.ADMIN,
            is_active=True
        )
        # Seed products
        prod_zero = Product(
            name="Test Zero Stock",
            barcode="999900",
            current_stock=0
        )
        prod_five = Product(
            name="Test Five Stock",
            barcode="999905",
            current_stock=5
        )
        session.add_all([admin_user, prod_zero, prod_five])
        await session.commit()
        # Refresh to get IDs
        await session.refresh(prod_zero)
        await session.refresh(prod_five)
        
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=TEST_URL) as client:
            # Login
            login_resp = await client.post("/auth/login", data={
                "username": "bulk_del_admin",
                "password": "bulkDelPass123"
            })
            assert login_resp.status_code == 200
            token = login_resp.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}
            
            # Delete zero stock products
            del_resp = await client.delete("/products/delete-zero-stock", headers=headers)
            assert del_resp.status_code == 200
            assert del_resp.json()["deleted_count"] >= 1
            
            # Verify prod_zero is deleted, prod_five is not
            async with AsyncSessionLocal() as session:
                res_zero = await session.execute(select(Product).where(Product.barcode == "999900"))
                assert res_zero.scalar_one_or_none() is None
                
                res_five = await session.execute(select(Product).where(Product.barcode == "999905"))
                assert res_five.scalar_one_or_none() is not None
    finally:
        async with AsyncSessionLocal() as session:
            await session.execute(delete(AuditLog).where(AuditLog.username == "bulk_del_admin"))
            if admin_user:
                await session.execute(delete(User).where(User.username == "bulk_del_admin"))
            await session.execute(delete(Product).where(Product.barcode.in_(["999900", "999905"])))
            await session.commit()


@pytest.mark.anyio
async def test_update_and_delete_single_product():
    admin_user = None
    product = None
    
    async with AsyncSessionLocal() as session:
        # Seed admin
        admin_user = User(
            username="single_prod_admin",
            hashed_password=get_password_hash("singlePass123"),
            role=UserRole.ADMIN,
            is_active=True
        )
        product = Product(
            name="Test Single Edit",
            barcode="999910",
            current_stock=10
        )
        session.add_all([admin_user, product])
        await session.commit()
        await session.refresh(product)
        
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=TEST_URL) as client:
            # Login
            login_resp = await client.post("/auth/login", data={
                "username": "single_prod_admin",
                "password": "singlePass123"
            })
            assert login_resp.status_code == 200
            token = login_resp.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}
            
            # 1. Update (PUT)
            update_resp = await client.put(f"/products/{product.id}", headers=headers, json={
                "name": "Test Single Edit Modded",
                "barcode": "999990",
                "current_stock": 15,
                "unit": "db",
                "vat_rate": 27
            })
            assert update_resp.status_code == 200
            
            # Verify update
            async with AsyncSessionLocal() as session:
                res = await session.execute(select(Product).where(Product.id == product.id))
                db_prod = res.scalar_one()
                assert db_prod.name == "Test Single Edit Modded"
                assert db_prod.barcode == "999990"
                assert db_prod.current_stock == 15
                
            # 2. Delete (DELETE)
            del_resp = await client.delete(f"/products/{product.id}", headers=headers)
            assert del_resp.status_code == 200
            
            # Verify deleted
            async with AsyncSessionLocal() as session:
                res_del = await session.execute(select(Product).where(Product.id == product.id))
                assert res_del.scalar_one_or_none() is None
    finally:
        async with AsyncSessionLocal() as session:
            await session.execute(delete(AuditLog).where(AuditLog.username == "single_prod_admin"))
            if admin_user:
                await session.execute(delete(User).where(User.username == "single_prod_admin"))
            await session.execute(delete(Product).where(Product.barcode.in_(["999910", "999990"])))
            await session.commit()


@pytest.mark.anyio
async def test_product_archive_and_restore():
    admin_user = None
    product = None
    
    async with AsyncSessionLocal() as session:
        admin_user = User(
            username="archive_admin",
            hashed_password=get_password_hash("archivePass123"),
            role=UserRole.ADMIN,
            is_active=True
        )
        product = Product(
            name="Test Archive Prod",
            barcode="999920",
            is_archived=False
        )
        session.add_all([admin_user, product])
        await session.commit()
        await session.refresh(product)
        
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=TEST_URL) as client:
            # Login
            login_resp = await client.post("/auth/login", data={
                "username": "archive_admin",
                "password": "archivePass123"
            })
            assert login_resp.status_code == 200
            token = login_resp.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}
            
            # Archive
            arc_resp = await client.post(f"/products/{product.id}/archive", headers=headers)
            assert arc_resp.status_code == 200
            
            # Verify in DB
            async with AsyncSessionLocal() as session:
                res = await session.execute(select(Product).where(Product.id == product.id))
                db_prod = res.scalar_one()
                assert db_prod.is_archived is True
                
            # Restore
            res_resp = await client.post(f"/products/{product.id}/restore", headers=headers)
            assert res_resp.status_code == 200
            
            # Verify in DB
            async with AsyncSessionLocal() as session:
                res = await session.execute(select(Product).where(Product.id == product.id))
                db_prod = res.scalar_one()
                assert db_prod.is_archived is False
    finally:
        async with AsyncSessionLocal() as session:
            await session.execute(delete(AuditLog).where(AuditLog.username == "archive_admin"))
            if admin_user:
                await session.execute(delete(User).where(User.username == "archive_admin"))
            await session.execute(delete(Product).where(Product.barcode == "999920"))
            await session.commit()


@pytest.mark.anyio
async def test_opening_stock_workflow():
    from models import Location
    from models_inventory import InventoryMovement, MovementType
    
    admin_user = None
    product = None
    location = None
    
    async with AsyncSessionLocal() as session:
        # Pre-cleanup
        await session.execute(delete(InventoryMovement).where(InventoryMovement.product_id.in_(
            select(Product.id).where(Product.barcode == "999930")
        )))
        await session.execute(delete(Product).where(Product.barcode == "999930"))
        await session.execute(delete(AuditLog).where(AuditLog.username == "opening_admin"))
        await session.execute(delete(User).where(User.username == "opening_admin"))
        await session.execute(delete(Location).where(Location.name == "Opening Loc"))
        await session.commit()

    async with AsyncSessionLocal() as session:
        admin_user = User(
            username="opening_admin",
            hashed_password=get_password_hash("openingPass123"),
            role=UserRole.ADMIN,
            is_active=True
        )
        product = Product(
            name="Test Opening Prod",
            barcode="999930",
            current_stock=0
        )
        location = Location(name="Opening Loc")
        session.add_all([admin_user, product, location])
        await session.commit()
        await session.refresh(product)
        await session.refresh(location)
        
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=TEST_URL) as client:
            # Login
            login_resp = await client.post("/auth/login", data={
                "username": "opening_admin",
                "password": "openingPass123"
            })
            assert login_resp.status_code == 200
            token = login_resp.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}
            
            # Check movements
            check_resp = await client.post("/inventory/opening-stock/check-movements", json={
                "product_ids": [product.id]
            }, headers=headers)
            assert check_resp.status_code == 200
            assert check_resp.json()[product.id] is False
            
            # Apply opening stock
            apply_resp = await client.post("/inventory/opening-stock", json={
                "items": [
                    {
                        "product_id": product.id,
                        "quantity": 25,
                        "location_id": location.id
                    }
                ],
                "note": "Initial opening stock test"
            }, headers=headers)
            assert apply_resp.status_code == 200
            
            # Verify in DB
            async with AsyncSessionLocal() as session:
                # Product stock updated
                res = await session.execute(select(Product).where(Product.id == product.id))
                db_prod = res.scalar_one()
                assert db_prod.current_stock == 25
                
                # Movement created
                mv_res = await session.execute(
                    select(InventoryMovement)
                    .where(InventoryMovement.product_id == product.id)
                )
                db_mv = mv_res.scalar_one()
                assert db_mv.quantity_delta == 25
                assert db_mv.stock_before == 0
                assert db_mv.stock_after == 25
                assert db_mv.movement_type == MovementType.OPENING
                
            # Check movements now reports True
            check_resp2 = await client.post("/inventory/opening-stock/check-movements", json={
                "product_ids": [product.id]
            }, headers=headers)
            assert check_resp2.status_code == 200
            assert check_resp2.json()[product.id] is True
            
            # Try to apply again without force_apply -> should fail (409 Conflict)
            apply_fail_resp = await client.post("/inventory/opening-stock", json={
                "items": [
                    {
                        "product_id": product.id,
                        "quantity": 30,
                        "location_id": location.id
                    }
                ],
                "force_apply": False
            }, headers=headers)
            assert apply_fail_resp.status_code == 409
            
            # Apply again with force_apply -> should succeed
            apply_force_resp = await client.post("/inventory/opening-stock", json={
                "items": [
                    {
                        "product_id": product.id,
                        "quantity": 30,
                        "location_id": location.id
                    }
                ],
                "force_apply": True
            }, headers=headers)
            assert apply_force_resp.status_code == 200
            
            # Verify in DB again
            async with AsyncSessionLocal() as session:
                res = await session.execute(select(Product).where(Product.id == product.id))
                db_prod = res.scalar_one()
                assert db_prod.current_stock == 30
    finally:
        async with AsyncSessionLocal() as session:
            await session.execute(delete(AuditLog).where(AuditLog.username == "opening_admin"))
            if product:
                await session.execute(delete(InventoryMovement).where(InventoryMovement.product_id == product.id))
                await session.execute(delete(Product).where(Product.barcode == "999930"))
            if admin_user:
                await session.execute(delete(User).where(User.username == "opening_admin"))
            await session.execute(delete(Location).where(Location.name == "Opening Loc"))
            await session.commit()




