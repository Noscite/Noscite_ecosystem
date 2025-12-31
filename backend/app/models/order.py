from sqlalchemy import Column, String, Boolean, DateTime, Text, ForeignKey, ARRAY, Numeric, Integer, Date
from sqlalchemy.dialects.postgresql import UUID, ENUM
from sqlalchemy.sql import func
import uuid
from app.core.database import Base


order_status_enum = ENUM('draft', 'confirmed', 'in_progress', 'on_hold', 'completed', 'cancelled', name='order_status', create_type=False)
order_priority_enum = ENUM('low', 'medium', 'high', 'urgent', name='order_priority', create_type=False)


class Order(Base):
    __tablename__ = "orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_number = Column(String(50), unique=True, nullable=False)
    opportunity_id = Column(UUID(as_uuid=True), ForeignKey("opportunities.id", ondelete="SET NULL"))
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False)
    contact_id = Column(UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="SET NULL"))
    parent_order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"))
    title = Column(String(255), nullable=False)
    description = Column(Text)
    status = Column(order_status_enum, default='draft', nullable=False)
    priority = Column(order_priority_enum, default='medium')
    start_date = Column(Date)
    end_date = Column(Date)
    total_amount = Column(Numeric(15, 2), default=0)
    invoiced_amount = Column(Numeric(15, 2), default=0)
    estimated_hours = Column(Numeric(10, 2))
    actual_hours = Column(Numeric(10, 2), default=0)
    progress_percentage = Column(Integer, default=0)
    assigned_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    account_manager_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    notes = Column(Text)
    contract_reference = Column(String(100))
    po_number = Column(String(100))
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
