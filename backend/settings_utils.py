import base64
import hashlib
from cryptography.fernet import Fernet
from config import settings


def get_encryptor() -> Fernet:
    # Derive a 32-byte key from the JWT_SECRET
    key = hashlib.sha256(settings.JWT_SECRET.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt_val(val: str) -> str:
    if not val:
        return ""
    fernet = get_encryptor()
    return fernet.encrypt(val.encode()).decode()


def decrypt_val(encrypted_val: str) -> str:
    if not encrypted_val:
        return ""
    fernet = get_encryptor()
    return fernet.decrypt(encrypted_val.encode()).decode()
