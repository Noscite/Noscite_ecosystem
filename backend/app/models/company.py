from sqlalchemy import Column, String, Boolean, DateTime, Text, ForeignKey, ARRAY
from sqlalchemy.dialects.postgresql import UUID, ENUM
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from app.core.database import Base


# Use existing PostgreSQL enum type
company_type_enum = ENUM(
    'client', 'prospect', 'supplier', 'partner', 'freelance',
    name='company_type',
    create_type=False  # Don't try to create, it already exists
)


class Company(Base):
    __tablename__ = "companies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    company_type = Column(company_type_enum, default='prospect', nullable=False)
    vat_number = Column(String(50))
    tax_code = Column(String(50))
    sdi_code = Column(String(10))
    pec_email = Column(String(255))
    email = Column(String(255))
    phone = Column(String(50))
    mobile = Column(String(50))
    website = Column(String(255))
    address = Column(Text)
    city = Column(String(100))
    province = Column(String(50))
    postal_code = Column(String(20))
    country = Column(String(100), default="Italia")
    industry = Column(String(100))
    notes = Column(Text)
    tags = Column(ARRAY(Text))
    account_manager_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    is_active = Column(Boolean, default=True, nullable=False)
    onedrive_folder_id = Column(String(255))
    onedrive_folder_path = Column(Text)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    contacts = relationship("Contact", back_populates="company", cascade="all, delete-orphan")
