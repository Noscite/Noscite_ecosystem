from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from uuid import UUID


class ContactBase(BaseModel):
    first_name: str
    last_name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    job_title: Optional[str] = None
    department: Optional[str] = None
    is_primary: bool = False
    is_decision_maker: bool = False
    linkedin_url: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None


class ContactCreate(ContactBase):
    company_id: Optional[UUID] = None


class ContactUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    job_title: Optional[str] = None
    department: Optional[str] = None
    is_primary: Optional[bool] = None
    is_decision_maker: Optional[bool] = None
    linkedin_url: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    company_id: Optional[UUID] = None
    is_active: Optional[bool] = None


class ContactResponse(ContactBase):
    id: UUID
    company_id: Optional[UUID] = None
    is_active: bool
    created_by: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
