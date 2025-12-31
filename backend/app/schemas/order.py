from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date
from uuid import UUID
from decimal import Decimal


class OrderBase(BaseModel):
    title: str
    company_id: UUID
    contact_id: Optional[UUID] = None
    opportunity_id: Optional[UUID] = None
    parent_order_id: Optional[UUID] = None
    description: Optional[str] = None
    status: str = "draft"
    priority: str = "medium"
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    total_amount: Decimal = Decimal("0")
    estimated_hours: Optional[Decimal] = None
    assigned_user_id: Optional[UUID] = None
    account_manager_id: Optional[UUID] = None
    notes: Optional[str] = None
    contract_reference: Optional[str] = None
    po_number: Optional[str] = None


class OrderCreate(OrderBase):
    order_number: Optional[str] = None


class OrderUpdate(BaseModel):
    title: Optional[str] = None
    company_id: Optional[UUID] = None
    contact_id: Optional[UUID] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    total_amount: Optional[Decimal] = None
    invoiced_amount: Optional[Decimal] = None
    estimated_hours: Optional[Decimal] = None
    actual_hours: Optional[Decimal] = None
    progress_percentage: Optional[int] = None
    assigned_user_id: Optional[UUID] = None
    account_manager_id: Optional[UUID] = None
    notes: Optional[str] = None
    contract_reference: Optional[str] = None
    po_number: Optional[str] = None


class OrderResponse(OrderBase):
    id: UUID
    order_number: str
    invoiced_amount: Decimal
    actual_hours: Decimal
    progress_percentage: int
    created_by: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
