import os
from pydantic_settings import BaseSettings
from pydantic import model_validator


class Settings(BaseSettings):
    APP_ENV: str = "production"
    DATABASE_URL: str = ""
    REDIS_URL: str = ""
    JWT_SECRET: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120
    BILLINGO_API_KEY: str = ""
    ALLOW_MOCK_BILLINGO: bool = False
    ALLOW_SEEDING: bool = False
    TIMEZONE: str = "Europe/Budapest"
    ADMIN_USER: str = ""
    ADMIN_PASSWORD: str = ""
    CORS_ALLOWED_ORIGINS: str = ""

    @model_validator(mode="before")
    @classmethod
    def set_defaults_and_validate(cls, data):
        env = os.getenv("APP_ENV", "production").lower()
        if env not in ("development", "production"):
            env = "production"

        db_url = os.getenv("DATABASE_URL", "")
        redis_url = os.getenv("REDIS_URL", "")
        jwt_sec = os.getenv("JWT_SECRET", "")
        admin_usr = os.getenv("ADMIN_USER", "")
        admin_pwd = os.getenv("ADMIN_PASSWORD", "")
        billingo_key = os.getenv("BILLINGO_API_KEY", "")
        cors_origins = os.getenv("CORS_ALLOWED_ORIGINS", "")

        mock_billingo = os.getenv("ALLOW_MOCK_BILLINGO", "false").lower() == "true"
        seeding = os.getenv("ALLOW_SEEDING", "false").lower() == "true"

        if env == "development":
            if not db_url:
                db_url = "postgresql+asyncpg://inventory_user:secure_dev_pass_123@localhost:15432/inventory"
            if not redis_url:
                redis_url = "redis://localhost:16379/0"
            if not jwt_sec:
                jwt_sec = "super_secret_jwt_token_for_jwt_auth_1234567890"
            if not admin_usr:
                admin_usr = "admin"
            if not admin_pwd:
                admin_pwd = "admin123"
        else:
            # Production strict validation
            if not db_url:
                raise ValueError(
                    "DATABASE_URL environment variable is required in production mode"
                )
            if not redis_url:
                raise ValueError(
                    "REDIS_URL environment variable is required in production mode"
                )
            if (
                not jwt_sec
                or jwt_sec == "super_secret_jwt_token_for_jwt_auth_1234567890"
            ):
                raise ValueError(
                    "A secure JWT_SECRET environment variable is required in production mode"
                )
            if not admin_usr:
                raise ValueError("ADMIN_USER cannot be empty in production mode")
            if not admin_pwd or admin_pwd == "admin123":
                raise ValueError(
                    "ADMIN_PASSWORD cannot be empty or 'admin123' in production mode"
                )

            # Production strict disables
            mock_billingo = False
            seeding = False

        output = {
            "APP_ENV": env,
            "DATABASE_URL": db_url,
            "REDIS_URL": redis_url,
            "JWT_SECRET": jwt_sec,
            "BILLINGO_API_KEY": billingo_key,
            "ALLOW_MOCK_BILLINGO": mock_billingo,
            "ALLOW_SEEDING": seeding,
            "ADMIN_USER": admin_usr,
            "ADMIN_PASSWORD": admin_pwd,
            "CORS_ALLOWED_ORIGINS": cors_origins,
        }

        expire = os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES")
        if expire:
            output["ACCESS_TOKEN_EXPIRE_MINUTES"] = int(expire)

        return output


settings = Settings()
