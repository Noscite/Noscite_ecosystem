from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel
from decimal import Decimal

from app.core.database import get_db

router = APIRouter(prefix="/projects/{project_id}/team", tags=["Project Team"])


class TeamMemberCreate(BaseModel):
    company_id: UUID
    role: Optional[str] = None
    hourly_rate: Optional[Decimal] = None
    estimated_hours: Optional[Decimal] = None
    notes: Optional[str] = None


class TeamMemberUpdate(BaseModel):
    role: Optional[str] = None
    hourly_rate: Optional[Decimal] = None
    estimated_hours: Optional[Decimal] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("")
async def list_team_members(
    project_id: UUID,
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_db)
):
    """List all team members for a project with company details."""
    query = """
        SELECT pt.id, pt.company_id, pt.role, pt.hourly_rate, pt.estimated_hours,
               pt.notes, pt.is_active, pt.joined_at, pt.created_at,
               c.name as company_name, c.company_type, c.email, c.phone,
               (SELECT COUNT(*) FROM tasks t WHERE t.project_id = pt.project_id 
                AND t.assigned_to_company_id = pt.company_id) as assigned_tasks,
               (SELECT COALESCE(SUM(t.estimated_hours), 0) FROM tasks t 
                WHERE t.project_id = pt.project_id AND t.assigned_to_company_id = pt.company_id) as total_estimated_hours,
               (SELECT COALESCE(SUM(ts.hours), 0) FROM timesheets ts 
                JOIN tasks t ON ts.task_id = t.id 
                WHERE t.project_id = pt.project_id AND t.assigned_to_company_id = pt.company_id) as total_actual_hours
        FROM project_team pt
        JOIN companies c ON pt.company_id = c.id
        WHERE pt.project_id = :project_id
    """
    if not include_inactive:
        query += " AND pt.is_active = TRUE"
    query += " ORDER BY pt.joined_at"
    
    result = await db.execute(text(query), {"project_id": str(project_id)})
    
    members = []
    for row in result:
        members.append({
            "id": str(row.id),
            "company_id": str(row.company_id),
            "company_name": row.company_name,
            "company_type": row.company_type,
            "email": row.email,
            "phone": row.phone,
            "role": row.role,
            "hourly_rate": float(row.hourly_rate) if row.hourly_rate else None,
            "estimated_hours": float(row.estimated_hours) if row.estimated_hours else None,
            "notes": row.notes,
            "is_active": row.is_active,
            "joined_at": row.joined_at.isoformat() if row.joined_at else None,
            "assigned_tasks": row.assigned_tasks,
            "total_estimated_hours": float(row.total_estimated_hours),
            "total_actual_hours": float(row.total_actual_hours)
        })
    
    return {"team": members}


@router.post("")
async def add_team_member(
    project_id: UUID,
    member: TeamMemberCreate,
    db: AsyncSession = Depends(get_db)
):
    """Add a company to the project team."""
    # Check if already in team
    existing = await db.execute(
        text("SELECT id FROM project_team WHERE project_id = :pid AND company_id = :cid"),
        {"pid": str(project_id), "cid": str(member.company_id)}
    )
    if existing.fetchone():
        raise HTTPException(400, "Questa azienda è già nel team del progetto")
    
    # Verify company exists and is suitable type
    company = await db.execute(
        text("SELECT id, name, company_type FROM companies WHERE id = :id"),
        {"id": str(member.company_id)}
    )
    company_row = company.fetchone()
    if not company_row:
        raise HTTPException(404, "Azienda non trovata")
    
    if company_row.company_type not in ('supplier', 'partner', 'freelance'):
        raise HTTPException(400, "Solo fornitori, partner e freelance possono essere aggiunti al team")
    
    result = await db.execute(
        text("""
            INSERT INTO project_team (project_id, company_id, role, hourly_rate, estimated_hours, notes)
            VALUES (:project_id, :company_id, :role, :hourly_rate, :estimated_hours, :notes)
            RETURNING id
        """),
        {
            "project_id": str(project_id),
            "company_id": str(member.company_id),
            "role": member.role,
            "hourly_rate": member.hourly_rate,
            "estimated_hours": member.estimated_hours,
            "notes": member.notes
        }
    )
    team_id = result.scalar()
    await db.commit()
    
    return {
        "id": str(team_id),
        "company_id": str(member.company_id),
        "company_name": company_row.name,
        "message": f"{company_row.name} aggiunto al team"
    }


@router.put("/{team_id}")
async def update_team_member(
    project_id: UUID,
    team_id: UUID,
    member: TeamMemberUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update a team member's details."""
    updates = []
    params = {"team_id": str(team_id), "project_id": str(project_id)}
    
    if member.role is not None:
        updates.append("role = :role")
        params["role"] = member.role
    if member.hourly_rate is not None:
        updates.append("hourly_rate = :hourly_rate")
        params["hourly_rate"] = member.hourly_rate
    if member.estimated_hours is not None:
        updates.append("estimated_hours = :estimated_hours")
        params["estimated_hours"] = member.estimated_hours
    if member.notes is not None:
        updates.append("notes = :notes")
        params["notes"] = member.notes
    if member.is_active is not None:
        updates.append("is_active = :is_active")
        params["is_active"] = member.is_active
    
    if not updates:
        raise HTTPException(400, "Nessun campo da aggiornare")
    
    await db.execute(
        text(f"UPDATE project_team SET {', '.join(updates)} WHERE id = :team_id AND project_id = :project_id"),
        params
    )
    await db.commit()
    
    return {"message": "Team member aggiornato"}


@router.delete("/{team_id}")
async def remove_team_member(
    project_id: UUID,
    team_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Remove a company from the project team."""
    # Check if has assigned tasks
    result = await db.execute(
        text("""
            SELECT COUNT(*) as count FROM tasks t
            JOIN project_team pt ON t.assigned_to_company_id = pt.company_id
            WHERE pt.id = :team_id AND t.project_id = :project_id
        """),
        {"team_id": str(team_id), "project_id": str(project_id)}
    )
    task_count = result.scalar()
    
    if task_count > 0:
        # Just deactivate instead of delete
        await db.execute(
            text("UPDATE project_team SET is_active = FALSE WHERE id = :id"),
            {"id": str(team_id)}
        )
        await db.commit()
        return {"message": "Membro disattivato (ha task assegnati)", "deactivated": True}
    
    await db.execute(
        text("DELETE FROM project_team WHERE id = :id AND project_id = :project_id"),
        {"id": str(team_id), "project_id": str(project_id)}
    )
    await db.commit()
    
    return {"message": "Membro rimosso dal team", "deleted": True}


@router.get("/available-companies")
async def list_available_companies(
    project_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """List companies that can be added to the team (suppliers, partners, freelancers not already in team)."""
    result = await db.execute(
        text("""
            SELECT c.id, c.name, c.company_type, c.email, c.phone
            FROM companies c
            WHERE c.company_type IN ('supplier', 'partner', 'freelance')
            AND c.id NOT IN (
                SELECT company_id FROM project_team WHERE project_id = :project_id
            )
            ORDER BY c.name
        """),
        {"project_id": str(project_id)}
    )
    
    companies = []
    for row in result:
        companies.append({
            "id": str(row.id),
            "name": row.name,
            "company_type": row.company_type,
            "email": row.email,
            "phone": row.phone
        })
    
    return {"companies": companies}
