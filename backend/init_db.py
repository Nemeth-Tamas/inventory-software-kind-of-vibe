import asyncio
import os
from models import User, UserRole, Category, Supplier, Location
from database import AsyncSessionLocal
from auth import get_password_hash
from sqlalchemy import select

async def init_database():
    admin_username = os.getenv("ADMIN_USER", "admin")
    admin_password = os.getenv("ADMIN_PASSWORD", "admin123")
    
    # If using default admin password, force password change on first run
    must_change = (admin_username == "admin" and admin_password == "admin123")
    
    async with AsyncSessionLocal() as session:
        # Check if default admin exists
        result = await session.execute(select(User).where(User.username == admin_username))
        admin = result.scalar_one_or_none()
        
        if not admin:
            admin = User(
                username=admin_username,
                hashed_password=get_password_hash(admin_password),
                role=UserRole.ADMIN,
                is_active=True,
                must_change_password=must_change
            )
            session.add(admin)
            print(f"Admin user '{admin_username}' created. Force password change: {must_change}")
            
        # Create default locations if empty
        locs_result = await session.execute(select(Location))
        if not locs_result.scalars().first():
            locations = [
                Location(name="Üzlettér"),
                Location(name="Raktár"),
                Location(name="Szervizpolc"),
                Location(name="Kirakat"),
                Location(name="Selejt")
            ]
            session.add_all(locations)
            print("Default locations created.")
            
        # Create default categories if they do not exist
        default_cat_names = [
            "Termék", "Tartozék", "Telefon", "Tablet", "Laptop", "Asztali számítógép",
            "Alkatrész", "Telefonalkatrész", "Laptopalkatrész", "Számítógép-alkatrész",
            "Töltő", "Kábel", "Adapter", "Tok", "Kijelzővédő fólia", "Adathordozó",
            "Memóriakártya", "Pendrive", "Akkumulátor", "Szervizanyag", "Fogyóeszköz",
            "Irodaszer", "Egyéb", "Telefonok", "Kiegészítők", "Alkatrészek", "Szolgáltatások"
        ]
        existing_cats_res = await session.execute(select(Category.name))
        existing_cat_names = set(existing_cats_res.scalars().all())
        
        new_cats = []
        for name in default_cat_names:
            if name not in existing_cat_names:
                new_cats.append(Category(name=name))
        if new_cats:
            session.add_all(new_cats)
            print(f"Created {len(new_cats)} default categories.")
            
        # Create default suppliers if empty
        sups_result = await session.execute(select(Supplier))
        if not sups_result.scalars().first():
            suppliers = [
                Supplier(name="HRP Hungary Kft", email="info@hrp.hu", phone="+3614524600", address="Budapest"),
                Supplier(name="Expert Zrt", email="info@expert.hu", phone="+3614524700", address="Debrecen")
            ]
            session.add_all(suppliers)
            print("Default suppliers created.")
        # Check and add supplier_id to inventory_movements table
        from sqlalchemy import text
        try:
            await session.execute(text("ALTER TABLE inventory_movements ADD COLUMN supplier_id VARCHAR REFERENCES suppliers(id)"))
            await session.commit()
            print("Added supplier_id column to inventory_movements table.")
        except Exception:
            await session.rollback()

        # Check and add price_net to inventory_movements table
        try:
            await session.execute(text("ALTER TABLE inventory_movements ADD COLUMN price_net INTEGER"))
            await session.commit()
            print("Added price_net column to inventory_movements table.")
        except Exception:
            await session.rollback()
            
        await session.commit()

if __name__ == "__main__":
    print("Initializing database master data...")
    asyncio.run(init_database())
    print("Database initialization complete.")
