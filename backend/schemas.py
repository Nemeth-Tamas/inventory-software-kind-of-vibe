from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from models import UserRole

# Auth schemas
class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    role: str

class UserCreate(BaseModel):
    username: str
    password: str
    role: UserRole

# Category schemas
class CategoryBase(BaseModel):
    name: str

class CategoryResponse(CategoryBase):
    id: str
    is_archived: bool
    class Config:
        from_attributes = True

# Location schemas
class LocationBase(BaseModel):
    name: str

class LocationResponse(LocationBase):
    id: str
    is_archived: bool
    class Config:
        from_attributes = True

# Supplier schemas
class SupplierBase(BaseModel):
    name: str
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    tax_number: Optional[str] = None
    customer_number: Optional[str] = None
    comment: Optional[str] = None
    billingo_partner_id: Optional[str] = None
    is_active: bool = True

class SupplierResponse(SupplierBase):
    id: str
    is_archived: bool
    class Config:
        from_attributes = True

class MergeRequest(BaseModel):
    source_id: str
    target_id: str

# Product schemas
class ProductCreate(BaseModel):
    name: str
    barcode: Optional[str] = None
    ean: Optional[str] = None
    description: Optional[str] = None
    sku: Optional[str] = None
    manufacturer_sku: Optional[str] = None
    category_id: Optional[str] = None
    supplier_id: Optional[str] = None
    default_location_id: Optional[str] = None
    unit: str = "db"
    vat_rate: int = 27
    purchase_price_net: int = 0
    purchase_price_gross: int = 0
    sale_price_net: int = 0
    sale_price_gross: int = 0
    minimum_stock: int = 0
    current_stock: Optional[int] = None
    track_stock: bool = True
    allow_negative_stock: bool = False
    serial_number_tracking: bool = False

class ProductResponse(BaseModel):
    id: str
    barcode: str
    ean: Optional[str] = None
    name: str
    description: Optional[str] = None
    sku: Optional[str] = None
    manufacturer_sku: Optional[str] = None
    category_id: Optional[str] = None
    supplier_id: Optional[str] = None
    default_location_id: Optional[str] = None
    unit: str
    vat_rate: int
    purchase_price_net: int
    purchase_price_gross: int
    sale_price_net: int
    sale_price_gross: int
    current_stock: int
    reserved_stock: int
    minimum_stock: int
    track_stock: bool
    allow_negative_stock: bool
    serial_number_tracking: bool
    billingo_product_id: Optional[str] = None
    billingo_sync_state: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Stocktake schemas
class StocktakeCreate(BaseModel):
    name: str
    notes: Optional[str] = None

class StocktakeResponse(BaseModel):
    id: str
    name: str
    status: str
    created_at: datetime
    notes: Optional[str] = None
    class Config:
        from_attributes = True

class StocktakeItemResponse(BaseModel):
    id: str
    product_id: str
    product_name: str = ""
    product_barcode: str = ""
    expected_qty: int
    counted_qty: int
    difference: int
    note: Optional[str] = None
    class Config:
        from_attributes = True
