import enum
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Enum
import uuid
from datetime import datetime, timezone

Base = declarative_base()

class UserRole(str, enum.Enum):
    ADMIN = "adminisztrátor"
    LEADER = "vezető"
    WAREHOUSE = "raktáros"
    SALES = "értékesítő"
    VIEWER = "csak megtekintés"

class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.VIEWER)
    is_active = Column(Boolean, default=True, nullable=False)
    must_change_password = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

class Category(Base):
    __tablename__ = "categories"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, unique=True, nullable=False)
    is_archived = Column(Boolean, default=False, nullable=False)

class Supplier(Base):
    __tablename__ = "suppliers"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, unique=True, nullable=False)
    contact_person = Column(String)
    email = Column(String)
    phone = Column(String)
    address = Column(String)
    tax_number = Column(String)
    customer_number = Column(String)
    comment = Column(String)
    billingo_partner_id = Column(String)
    is_active = Column(Boolean, default=True, nullable=False)
    is_archived = Column(Boolean, default=False, nullable=False)

class Location(Base):
    __tablename__ = "locations"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, unique=True, nullable=False)
    is_archived = Column(Boolean, default=False, nullable=False)


class BarcodeSequence(Base):
    __tablename__ = "barcode_sequences"
    year = Column(Integer, primary_key=True)
    current_counter = Column(Integer, nullable=False, default=0)

class Product(Base):
    __tablename__ = "products"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    barcode = Column(String(6), unique=True, nullable=False, index=True)
    ean = Column(String, index=True)
    name = Column(String, nullable=False)
    description = Column(String)
    sku = Column(String, unique=True, index=True)
    manufacturer_sku = Column(String)
    category_id = Column(String, ForeignKey("categories.id"))
    supplier_id = Column(String, ForeignKey("suppliers.id"))
    default_location_id = Column(String, ForeignKey("locations.id"))
    unit = Column(String, default="db")
    vat_rate = Column(Integer, default=27)  # Percentages e.g., 27, 18, 5, 0 (TAM/AAM)
    
    # Store prices in integer minor units (filler/cents/fillér or Hungarian HUF directly since HUF does not use fillér now, but standard decimals/ints are preferred)
    purchase_price_net = Column(Integer, default=0)
    purchase_price_gross = Column(Integer, default=0)
    sale_price_net = Column(Integer, default=0)
    sale_price_gross = Column(Integer, default=0)
    
    current_stock = Column(Integer, default=0)
    reserved_stock = Column(Integer, default=0)
    minimum_stock = Column(Integer, default=0)
    
    track_stock = Column(Boolean, default=True)
    allow_negative_stock = Column(Boolean, default=False)
    serial_number_tracking = Column(Boolean, default=False)
    
    billingo_product_id = Column(String)
    billingo_sync_state = Column(String, default="Nincs összekapcsolva")
    billingo_last_sync = Column(DateTime)
    
    is_active = Column(Boolean, default=True)
    is_archived = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    category = relationship("Category")
    supplier = relationship("Supplier")
    default_location = relationship("Location")

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"))
    username = Column(String)
    action = Column(String, nullable=False)
    details = Column(String)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None), nullable=False)

    user = relationship("User")


class SystemSetting(Base):
    __tablename__ = "system_settings"
    key = Column(String, primary_key=True)
    value = Column(String, nullable=False)
    is_encrypted = Column(Boolean, default=False, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class BillingoQueueAction(str, enum.Enum):
    CREATE = "létrehozás"
    UPDATE = "módosítás"
    DELETE = "törlés"


class BillingoQueueStatus(str, enum.Enum):
    PENDING = "várakozik"
    COMPLETED = "teljesítve"
    FAILED = "sikertelen"


class BillingoQueueItem(Base):
    __tablename__ = "billingo_queue_items"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    product_id = Column(String, ForeignKey("products.id"), nullable=False)
    action = Column(Enum(BillingoQueueAction), nullable=False)
    payload = Column(String, nullable=False)
    status = Column(Enum(BillingoQueueStatus), nullable=False, default=BillingoQueueStatus.PENDING)
    error_message = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    processed_at = Column(DateTime, nullable=True)

    product = relationship("Product")



