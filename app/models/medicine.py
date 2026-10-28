import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Boolean, DateTime, CheckConstraint, Index
from sqlalchemy.orm import relationship
from app.database import Base

def generate_uuid() -> str:
    return str(uuid.uuid4())

class Medicine(Base):
    __tablename__ = "medicines"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(128), nullable=False, index=True)
    category = Column(String(64), nullable=False, index=True)
    strength = Column(String(64), nullable=False)
    unit = Column(String(32), nullable=False)  # Tablet, Capsule, Syrup, Vial, etc.
    reorder_level = Column(Integer, nullable=False, default=10)
    selling_price = Column(Integer, nullable=False)  # minor units (paise)
    active = Column(Boolean, default=True, nullable=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        CheckConstraint("reorder_level >= 0", name="chk_medicine_reorder_level_non_negative"),
        CheckConstraint("selling_price >= 0", name="chk_medicine_selling_price_non_negative"),
    )

    batches = relationship("Batch", back_populates="medicine")


class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(128), unique=True, nullable=False, index=True)
    contact_person = Column(String(128), nullable=False)
    email = Column(String(128), nullable=False)
    phone = Column(String(32), nullable=False)
    address = Column(String(256), nullable=False)
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    batches = relationship("Batch", back_populates="supplier")
    purchase_orders = relationship("PurchaseOrder", back_populates="supplier")
