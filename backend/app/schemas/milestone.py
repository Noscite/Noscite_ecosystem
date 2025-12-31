from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import date, datetime
from decimal import Decimal

class MilestoneBase(BaseModel):
    project_id: UUID
    name: str
    description: Optional[str] = None
    milestone_type: Optional[str] = "deliverable"
    status: Optional[str] = "pending"
    due_date: date
    completed_date: Optional[date] = None
    payment_amount: Optional[Decimal] = None
    is_paid: Optional[bool] = False
    sort_order: Optional[int] = 0
    notes: Optional[str] = None

class MilestoneCreate(MilestoneBase):
    pass

class MilestoneUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    milestone_type: Optional[str] = None
    status: Optional[str] = None
    due_date: Optional[date] = None
    completed_date: Optional[date] = None
    payment_amount: Optional[Decimal] = None
    is_paid: Optional[bool] = None
    sort_order: Optional[int] = None
    notes: Optional[str] = None

class MilestoneResponse(MilestoneBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
