import asyncio
from models import User, UserRole, Category, Supplier, Location
from database import AsyncSessionLocal
from auth import get_password_hash
from sqlalchemy import select
from config import settings


async def init_database():
    admin_username = settings.ADMIN_USER
    admin_password = settings.ADMIN_PASSWORD

    # Force password change if default admin username/password is used (only in development)

    async with AsyncSessionLocal() as session:
        # Check if any admin exists in the database
        result = await session.execute(select(User).where(User.role == UserRole.ADMIN))
        existing_admin = result.scalars().first()

        if existing_admin:
            print(
                f"Initial admin setup skipped: An administrator already exists (e.g. '{existing_admin.username}')."
            )
        else:
            admin = User(
                username=admin_username,
                hashed_password=get_password_hash(admin_password),
                role=UserRole.ADMIN,
                is_active=True,
                must_change_password=True,  # Force change on first login for safety
            )
            session.add(admin)
            print(
                f"Initial admin user '{admin_username}' created successfully. Password change forced on next login."
            )

        # Create default locations if empty
        locs_result = await session.execute(select(Location))
        if not locs_result.scalars().first():
            locations = [
                Location(name="Üzlettér"),
                Location(name="Raktár"),
                Location(name="Szervizpolc"),
                Location(name="Kirakat"),
                Location(name="Selejt"),
            ]
            session.add_all(locations)
            print("Default locations created.")

        # Create default categories if they do not exist
        default_cat_names = [
            "Termék",
            "Tartozék",
            "Telefon",
            "Tablet",
            "Laptop",
            "Asztali számítógép",
            "Alkatrész",
            "Telefonalkatrész",
            "Laptopalkatrész",
            "Számítógép-alkatrész",
            "Töltő",
            "Kábel",
            "Adapter",
            "Tok",
            "Kijelzővédő fólia",
            "Adathordozó",
            "Memóriakártya",
            "Pendrive",
            "Akkumulátor",
            "Szervizanyag",
            "Fogyóeszköz",
            "Irodaszer",
            "Egyéb",
            "Telefonok",
            "Kiegészítők",
            "Alkatrészek",
            "Szolgáltatások",
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
                Supplier(
                    name="HRP Hungary Kft",
                    email="info@hrp.hu",
                    phone="+3614524600",
                    address="Budapest",
                ),
                Supplier(
                    name="Expert Zrt",
                    email="info@expert.hu",
                    phone="+3614524700",
                    address="Debrecen",
                ),
            ]
            session.add_all(suppliers)
            print("Default suppliers created.")

        await session.commit()


if __name__ == "__main__":
    print("Initializing database master data...")
    asyncio.run(init_database())
    print("Database initialization complete.")
