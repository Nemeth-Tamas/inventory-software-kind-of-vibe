import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql+asyncpg://inventory_user:secure_dev_pass_123@localhost:15432/inventory")
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:16379/0")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "super_secret_jwt_token_for_jwt_auth_1234567890")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    BILLINGO_API_KEY: str = os.getenv("BILLINGO_API_KEY", "")
    ALLOW_MOCK_BILLINGO: bool = os.getenv("ALLOW_MOCK_BILLINGO", "false").lower() == "true"
    TIMEZONE: str = "Europe/Budapest"

settings = Settings()
