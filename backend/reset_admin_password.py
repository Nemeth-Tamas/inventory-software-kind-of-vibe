import asyncio
import sys
from database import AsyncSessionLocal
from models import User
from auth import get_password_hash
from sqlalchemy import select


async def reset_password(username: str, new_password: str):
    if len(new_password) < 8:
        print("Error: A jelszónak legalább 8 karakter hosszúnak kell lennie!")
        return

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.username == username))
        user = result.scalar_one_or_none()

        if not user:
            print(
                f"Error: Nem található '{username}' nevű felhasználó az adatbázisban!"
            )
            return

        user.hashed_password = get_password_hash(new_password)
        user.must_change_password = False
        user.is_active = True

        await session.commit()
        print(f"Success: A(z) '{username}' felhasználó jelszava sikeresen frissítve!")
        print("Kötelező jelszócsere feloldva, fiók aktiválva.")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Használat: python reset_admin_password.py <felhasznalonev> <uj_jelszo>")
        sys.exit(1)

    username = sys.argv[1]
    new_password = sys.argv[2]

    asyncio.run(reset_password(username, new_password))
