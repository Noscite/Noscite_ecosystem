from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from uuid import UUID
from enum import Enum


class CompanyType(str, Enum):
    client = "client"
    prospect = "prospect"
    supplier = "supplier"
    partner = "partner"
    freelance = "freelance"


class CompanyBase(BaseModel):
    name: str
    company_type: CompanyType = CompanyType.prospect
    vat_number: Optional[str] = None
    tax_code: Optional[str] = None
    sdi_code: Optional[str] = None
    pec_email: Optional[EmailStr] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    postal_code: Optional[str] = None
    country: str = "Italia"
    industry: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None


class CompanyCreate(CompanyBase):
    account_manager_id: Optional[UUID] = None


class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    company_type: Optional[CompanyType] = None
    vat_number: Optional[str] = None
    tax_code: Optional[str] = None
    sdi_code: Optional[str] = None
    pec_email: Optional[EmailStr] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    industry: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    account_manager_id: Optional[UUID] = None
    is_active: Optional[bool] = None


class CompanyResponse(CompanyBase):
    id: UUID
    account_manager_id: Optional[UUID] = None
    is_active: bool
    created_by: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
