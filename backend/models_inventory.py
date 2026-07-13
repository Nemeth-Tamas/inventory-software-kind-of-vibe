import enum
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Enum, Boolean
from sqlalchemy.orm import relationship
from models import Base
import uuid
from datetime import datetime

class MovementType(str, enum.Enum):
    OPENING = "Nyitó egyenleg"
    RECEIPT = "Bevételezés"
    SALE = "Kiadás/Értékesítés"
    TRANSFER = "Átadás helyszínek között"
    CORRECTION = "Készletkorrekció"
    DAMAGE = "Selejtezés/Sérülés"

class InventoryMovement(Base):
    __tablename__ = "inventory_movements"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    product_id = Column(String, ForeignKey("products.id"), nullable=False)
    quantity_delta = Column(Integer, nullable=False)
    stock_before = Column(Integer, nullable=False)
    stock_after = Column(Integer, nullable=False)
    source_location_id = Column(String, ForeignKey("locations.id"))
    destination_location_id = Column(String, ForeignKey("locations.id"))
    supplier_id = Column(String, ForeignKey("suppliers.id"))
    movement_type = Column(Enum(MovementType), nullable=False)
    reason = Column(String)
    reference_number = Column(String)
    user_id = Column(String, ForeignKey("users.id"))
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
    note = Column(String)
    idempotency_key = Column(String, unique=True)

    product = relationship("Product")
    user = relationship("User")
    source_location = relationship("Location", foreign_keys=[source_location_id])
    destination_location = relationship("Location", foreign_keys=[destination_location_id])
    supplier = relationship("Supplier")

class StocktakeStatus(str, enum.Enum):
    DRAFT = "Piszkozat"
    IN_PROGRESS = "Folyamatban"
    PAUSED = "Szüneteltetve"
    COMPLETED = "Lezárt"
    APPLIED = "Javítás alkalmazva"

class Stocktake(Base):
    __tablename__ = "stocktakes"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    status = Column(Enum(StocktakeStatus), default=StocktakeStatus.DRAFT, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_by = Column(String, ForeignKey("users.id"))
    notes = Column(String)

    creator = relationship("User")
    items = relationship("StocktakeItem", back_populates="stocktake", cascade="all, delete-orphan")

class StocktakeItem(Base):
    __tablename__ = "stocktake_items"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    stocktake_id = Column(String, ForeignKey("stocktakes.id"), nullable=False)
    product_id = Column(String, ForeignKey("products.id"), nullable=False)
    expected_qty = Column(Integer, default=0, nullable=False)
    counted_qty = Column(Integer, default=0, nullable=False)
    difference = Column(Integer, default=0, nullable=False)
    note = Column(String)

    stocktake = relationship("Stocktake", back_populates="items")
    product = relationship("Product")

class StocktakeUnknownBarcode(Base):
    __tablename__ = "stocktake_unknown_barcodes"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    stocktake_id = Column(String, ForeignKey("stocktakes.id"), nullable=False)
    barcode = Column(String, nullable=False)
    user_id = Column(String, ForeignKey("users.id"))
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
    resolved = Column(Boolean, default=False, nullable=False)
    resolved_product_id = Column(String, ForeignKey("products.id"))
    resolved_user_id = Column(String, ForeignKey("users.id"))
    resolved_at = Column(DateTime)
    resolution_type = Column(String) # e.g. "linked", "ignored"
    ignore_reason = Column(String)

    stocktake = relationship("Stocktake")
    user = relationship("User", foreign_keys=[user_id])
    resolved_product = relationship("Product")
    resolved_user = relationship("User", foreign_keys=[resolved_user_id])

