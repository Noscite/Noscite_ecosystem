from sqlalchemy import Column, String, Boolean, DateTime, Text, ForeignKey, ARRAY, Numeric, Integer
from sqlalchemy.dialects.postgresql import UUID, ENUM
from sqlalchemy.sql import func
import uuid
from app.core.database import Base


service_type_enum = ENUM('simple', 'kit', name='service_type', create_type=False)
billing_type_enum = ENUM('fixed', 'hourly', 'daily', 'monthly', 'yearly', name='billing_type', create_type=False)


class Service(Base):
    __tablename__ = "services"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String(50), unique=True, nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    service_type = Column(service_type_enum, default='simple', nullable=False)
    unit_price = Column(Numeric(12, 2))
    cost_price = Column(Numeric(12, 2))
    billing_type = Column(billing_type_enum, default='fixed')
    unit_of_measure = Column(String(50), default='pz')
    category = Column(String(100))
    subcategory = Column(String(100))
    tags = Column(ARRAY(Text))
    is_active = Column(Boolean, default=True, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
