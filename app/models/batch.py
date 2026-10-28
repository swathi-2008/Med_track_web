import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Date, DateTime, ForeignKey, CheckConstraint, UniqueConstraint, Index
from sqlalchemy.orm import relationship
from app.database import Base

def generate_uuid() -> str:
    return str(uuid.uuid4())

class Batch(Base):
    __tablename__ = "batches"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    medicine_id = Column(String(36), ForeignKey("medicines.id"), nullable=False, index=True)
    supplier_id = Column(String(36), ForeignKey("suppliers.id"), nullable=True, index=True)
    batch_number = Column(String(64), nullable=False)
    expiry_date = Column(Date, nullable=False, index=True)
    quantity_received = Column(Integer, nullable=False)
    quantity_available = Column(Integer, nullable=False)
    purchase_price = Column(Integer, nullable=False)  # minor units (paise)
    status = Column(String(32), default="ACTIVE", nullable=False)  # ACTIVE, QUARANTINED, RECALLED, INACTIVE
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        UniqueConstraint("medicine_id", "batch_number", name="uq_medicine_batch_number"),
        CheckConstraint("quantity_received >= 0", name="chk_batch_quantity_received_non_negative"),
        CheckConstraint("quantity_available >= 0", name="chk_batch_quantity_available_non_negative"),
        CheckConstraint("purchase_price >= 0", name="chk_batch_purchase_price_non_negative"),
        CheckConstraint("status IN ('ACTIVE', 'QUARANTINED', 'RECALLED', 'INACTIVE')", name="chk_batch_status_valid"),
        Index("ix_batch_medicine_expiry", "medicine_id", "expiry_date"),
    )

    medicine = relationship("Medicine", back_populates="batches")
    supplier = relationship("Supplier", back_populates="batches")
    sale_items = relationship("SaleItem", back_populates="batch")
