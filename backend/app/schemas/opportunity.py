from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date
from uuid import UUID
from decimal import Decimal


class OpportunityBase(BaseModel):
    title: str
    company_id: UUID
    contact_id: Optional[UUID] = None
    description: Optional[str] = None
    status: str = "lead"
    source: str = "other"
    amount: Decimal = Decimal("0")
    win_probability: int = 50
    expected_close_date: Optional[date] = None
    owner_id: Optional[UUID] = None
    competitors: Optional[List[str]] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None


class OpportunityCreate(OpportunityBase):
    pass


class OpportunityUpdate(BaseModel):
    title: Optional[str] = None
    company_id: Optional[UUID] = None
    contact_id: Optional[UUID] = None
    description: Optional[str] = None
    status: Optional[str] = None
    source: Optional[str] = None
    amount: Optional[Decimal] = None
    win_probability: Optional[int] = None
    expected_close_date: Optional[date] = None
    actual_close_date: Optional[date] = None
    owner_id: Optional[UUID] = None
    competitors: Optional[List[str]] = None
    close_reason: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None


class OpportunityResponse(OpportunityBase):
    id: UUID
    code: Optional[str] = None
    actual_close_date: Optional[date] = None
    close_reason: Optional[str] = None
    created_by: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
