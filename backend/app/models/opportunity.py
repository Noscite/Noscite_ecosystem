from sqlalchemy import Column, String, Boolean, DateTime, Text, ForeignKey, ARRAY, Numeric, Integer, Date
from sqlalchemy.dialects.postgresql import UUID, ENUM
from sqlalchemy.sql import func
import uuid
from app.core.database import Base


opportunity_status_enum = ENUM('lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost', name='opportunity_status', create_type=False)
opportunity_source_enum = ENUM('website', 'referral', 'cold_call', 'event', 'social', 'partner', 'other', name='opportunity_source', create_type=False)


class Opportunity(Base):
    __tablename__ = "opportunities"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String(50), unique=True)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    contact_id = Column(UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="SET NULL"))
    title = Column(String(255), nullable=False)
    description = Column(Text)
    status = Column(opportunity_status_enum, default='lead', nullable=False)
    source = Column(opportunity_source_enum, default='other')
    amount = Column(Numeric(15, 2), default=0)
    win_probability = Column(Integer, default=50)
    expected_close_date = Column(Date)
    actual_close_date = Column(Date)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    competitors = Column(ARRAY(Text))
    close_reason = Column(Text)
    notes = Column(Text)
    tags = Column(ARRAY(Text))
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
