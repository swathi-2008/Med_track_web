import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, CheckConstraint, Index
from sqlalchemy.orm import relationship
from app.database import Base

def generate_uuid() -> str:
    return str(uuid.uuid4())

class Sale(Base):
    __tablename__ = "sales"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    reference_number = Column(String(64), unique=True, nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    total_amount = Column(Integer, nullable=False)  # minor units (paise)
    status = Column(String(32), default="COMPLETED", nullable=False)  # COMPLETED, CANCELLED
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True)

    __table_args__ = (
        CheckConstraint("total_amount >= 0", name="chk_sale_total_amount_non_negative"),
        CheckConstraint("status IN ('COMPLETED', 'CANCELLED')", name="chk_sale_status_valid"),
    )

    user = relationship("User")
    items = relationship("SaleItem", back_populates="sale", cascade="all, delete-orphan")


class SaleItem(Base):
    __tablename__ = "sale_items"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    sale_id = Column(String(36), ForeignKey("sales.id", ondelete="CASCADE"), nullable=False, index=True)
    batch_id = Column(String(36), ForeignKey("batches.id"), nullable=False, index=True)
    medicine_id = Column(String(36), ForeignKey("medicines.id"), nullable=False, index=True)
    quantity = Column(Integer, nullable=False)
    unit_price_snapshot = Column(Integer, nullable=False)  # minor units (paise)
    subtotal = Column(Integer, nullable=False)  # minor units (paise)

    __table_args__ = (
        CheckConstraint("quantity > 0", name="chk_sale_item_quantity_positive"),
        CheckConstraint("unit_price_snapshot >= 0", name="chk_sale_item_unit_price_non_negative"),
        CheckConstraint("subtotal >= 0", name="chk_sale_item_subtotal_non_negative"),
    )

    sale = relationship("Sale", back_populates="items")
    batch = relationship("Batch", back_populates="sale_items")
    medicine = relationship("Medicine")
