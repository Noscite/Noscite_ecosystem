from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from uuid import UUID
from decimal import Decimal


class ServiceBase(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    service_type: str = "simple"
    unit_price: Optional[Decimal] = None
    cost_price: Optional[Decimal] = None
    billing_type: str = "fixed"
    unit_of_measure: str = "pz"
    category: Optional[str] = None
    subcategory: Optional[str] = None
    tags: Optional[List[str]] = None


class ServiceCreate(ServiceBase):
    pass


class ServiceUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    service_type: Optional[str] = None
    unit_price: Optional[Decimal] = None
    cost_price: Optional[Decimal] = None
    billing_type: Optional[str] = None
    unit_of_measure: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    tags: Optional[List[str]] = None
    is_active: Optional[bool] = None


class ServiceResponse(ServiceBase):
    id: UUID
    is_active: bool
    created_by: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
