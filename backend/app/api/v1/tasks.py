from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional
from uuid import UUID
from pydantic import BaseModel
from datetime import date
from decimal import Decimal

from app.core.database import get_db

router = APIRouter(prefix="/tasks", tags=["Tasks"])


class TaskCreate(BaseModel):
    project_id: UUID
    parent_task_id: Optional[UUID] = None
    name: str
    description: Optional[str] = None
    status: str = "todo"
    priority: str = "medium"
    assigned_to_user_id: Optional[UUID] = None
    assigned_to_company_id: Optional[UUID] = None
    planned_start_date: Optional[date] = None
    planned_end_date: Optional[date] = None
    estimated_hours: Optional[Decimal] = None
    is_milestone: bool = False
    notes: Optional[str] = None


class TaskUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_to_user_id: Optional[UUID] = None
    assigned_to_company_id: Optional[UUID] = None
    planned_start_date: Optional[date] = None
    planned_end_date: Optional[date] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    estimated_hours: Optional[Decimal] = None
    actual_hours: Optional[Decimal] = None
    progress_percentage: Optional[int] = None
    is_milestone: Optional[bool] = None
    notes: Optional[str] = None


async def propagate_status_to_children(db: AsyncSession, task_id: str, status: str, progress: int):
    """Propaga lo stato ai figli ricorsivamente."""
    await db.execute(
        text("""
            WITH RECURSIVE descendants AS (
                SELECT id FROM tasks WHERE parent_task_id = :task_id
                UNION ALL
                SELECT t.id FROM tasks t
                JOIN descendants d ON t.parent_task_id = d.id
            )
            UPDATE tasks SET status = CAST(:status AS task_status), 
                progress_percentage = :progress
            WHERE id IN (SELECT id FROM descendants)
        """),
        {"task_id": task_id, "status": status, "progress": progress}
    )


async def check_and_update_parent_status(db: AsyncSession, parent_task_id: str):
    """Controlla se tutti i figli sono completati e aggiorna il padre."""
    if not parent_task_id:
        return
    
    result = await db.execute(
        text("""
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'completed') as completed
            FROM tasks 
            WHERE parent_task_id = :parent_id
        """),
        {"parent_id": parent_task_id}
    )
    row = result.fetchone()
    
    if row and row.total > 0:
        if row.completed == row.total:
            await db.execute(
                text("UPDATE tasks SET status = CAST('completed' AS task_status), progress_percentage = 100 WHERE id = :id"),
                {"id": parent_task_id}
            )
            parent_result = await db.execute(
                text("SELECT parent_task_id FROM tasks WHERE id = :id"),
                {"id": parent_task_id}
            )
            parent_row = parent_result.fetchone()
            if parent_row and parent_row.parent_task_id:
                await check_and_update_parent_status(db, str(parent_row.parent_task_id))
        else:
            progress = int((row.completed / row.total) * 100)
            await db.execute(
                text("""
                    UPDATE tasks 
                    SET status = CASE WHEN status = 'completed' THEN CAST('in_progress' AS task_status) ELSE status END,
                        progress_percentage = :progress
                    WHERE id = :id
                """),
                {"id": parent_task_id, "progress": progress}
            )


@router.get("/by-project/{project_id}")
async def list_tasks_by_project(project_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("""
            SELECT t.*, 
                   COALESCE(
                       (SELECT json_agg(json_build_object(
                           'company_id', ta.company_id,
                           'company_name', c.name,
                           'role', ta.role
                       ))
                       FROM task_assignments ta
                       JOIN companies c ON ta.company_id = c.id
                       WHERE ta.task_id = t.id), '[]'
                   ) as assignments
            FROM tasks t
            WHERE t.project_id = :project_id
            ORDER BY t.wbs_code, t.sort_order, t.created_at
        """),
        {"project_id": str(project_id)}
    )
    
    tasks = []
    for row in result:
        tasks.append({
            "id": str(row.id),
            "project_id": str(row.project_id),
            "parent_task_id": str(row.parent_task_id) if row.parent_task_id else None,
            "wbs_code": row.wbs_code,
            "name": row.name,
            "description": row.description,
            "status": row.status,
            "priority": row.priority,
            "assigned_to_user_id": str(row.assigned_to_user_id) if row.assigned_to_user_id else None,
            "assigned_to_company_id": str(row.assigned_to_company_id) if row.assigned_to_company_id else None,
            "planned_start_date": row.planned_start_date.isoformat() if row.planned_start_date else None,
            "planned_end_date": row.planned_end_date.isoformat() if row.planned_end_date else None,
            "start_date": row.start_date.isoformat() if row.start_date else None,
            "end_date": row.end_date.isoformat() if row.end_date else None,
            "estimated_hours": float(row.estimated_hours) if row.estimated_hours else 0,
            "actual_hours": float(row.actual_hours) if row.actual_hours else 0,
            "progress_percentage": row.progress_percentage or 0,
            "is_milestone": row.is_milestone,
            "sort_order": row.sort_order,
            "notes": row.notes,
            "assignments": row.assignments if row.assignments else []
        })
    
    return tasks


@router.get("")
async def list_all_tasks(limit: int = 100, offset: int = 0, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("""
            SELECT t.*, p.name as project_name, p.code as project_code
            FROM tasks t
            JOIN projects p ON t.project_id = p.id
            ORDER BY t.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        {"limit": limit, "offset": offset}
    )
    
    return [{
        "id": str(row.id),
        "project_id": str(row.project_id),
        "project_name": row.project_name,
        "project_code": row.project_code,
        "parent_task_id": str(row.parent_task_id) if row.parent_task_id else None,
        "wbs_code": row.wbs_code,
        "name": row.name,
        "status": row.status,
        "priority": row.priority,
        "planned_start_date": row.planned_start_date.isoformat() if row.planned_start_date else None,
        "planned_end_date": row.planned_end_date.isoformat() if row.planned_end_date else None,
        "estimated_hours": float(row.estimated_hours) if row.estimated_hours else 0,
        "progress_percentage": row.progress_percentage or 0,
    } for row in result]


@router.get("/{task_id}")
async def get_task(task_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("SELECT * FROM tasks WHERE id = :id"), {"id": str(task_id)})
    row = result.fetchone()
    
    if not row:
        raise HTTPException(404, "Task non trovato")
    
    assignments_result = await db.execute(
        text("""
            SELECT ta.*, c.name as company_name, c.company_type
            FROM task_assignments ta JOIN companies c ON ta.company_id = c.id
            WHERE ta.task_id = :tid
        """),
        {"tid": str(task_id)}
    )
    
    return {
        "id": str(row.id),
        "project_id": str(row.project_id),
        "parent_task_id": str(row.parent_task_id) if row.parent_task_id else None,
        "wbs_code": row.wbs_code,
        "name": row.name,
        "description": row.description,
        "status": row.status,
        "priority": row.priority,
        "planned_start_date": row.planned_start_date.isoformat() if row.planned_start_date else None,
        "planned_end_date": row.planned_end_date.isoformat() if row.planned_end_date else None,
        "estimated_hours": float(row.estimated_hours) if row.estimated_hours else 0,
        "actual_hours": float(row.actual_hours) if row.actual_hours else 0,
        "progress_percentage": row.progress_percentage or 0,
        "is_milestone": row.is_milestone,
        "notes": row.notes,
        "assignments": [{
            "id": str(a.id),
            "company_id": str(a.company_id),
            "company_name": a.company_name,
            "role": a.role,
        } for a in assignments_result]
    }


@router.post("")
async def create_task(task: TaskCreate, db: AsyncSession = Depends(get_db)):
    if task.parent_task_id:
        parent_result = await db.execute(
            text("SELECT wbs_code FROM tasks WHERE id = :id"),
            {"id": str(task.parent_task_id)}
        )
        parent = parent_result.fetchone()
        parent_wbs = parent.wbs_code if parent else ""
        
        sibling_result = await db.execute(
            text("SELECT COUNT(*) FROM tasks WHERE parent_task_id = :pid"),
            {"pid": str(task.parent_task_id)}
        )
        wbs_code = f"{parent_wbs}.{sibling_result.scalar() + 1}"
    else:
        root_result = await db.execute(
            text("SELECT COUNT(*) FROM tasks WHERE project_id = :pid AND parent_task_id IS NULL"),
            {"pid": str(task.project_id)}
        )
        wbs_code = str(root_result.scalar() + 1)
    
    result = await db.execute(
        text("""
            INSERT INTO tasks (project_id, parent_task_id, wbs_code, name, description,
                              status, priority, planned_start_date, planned_end_date, 
                              estimated_hours, is_milestone, notes)
            VALUES (:project_id, :parent_task_id, :wbs_code, :name, :description,
                    CAST(:status AS task_status), CAST(:priority AS task_priority), 
                    :planned_start_date, :planned_end_date, :estimated_hours, :is_milestone, :notes)
            RETURNING id, wbs_code
        """),
        {
            "project_id": str(task.project_id),
            "parent_task_id": str(task.parent_task_id) if task.parent_task_id else None,
            "wbs_code": wbs_code,
            "name": task.name,
            "description": task.description,
            "status": task.status,
            "priority": task.priority,
            "planned_start_date": task.planned_start_date,
            "planned_end_date": task.planned_end_date,
            "estimated_hours": task.estimated_hours,
            "is_milestone": task.is_milestone,
            "notes": task.notes
        }
    )
    row = result.fetchone()
    await db.commit()
    
    return {"id": str(row.id), "wbs_code": row.wbs_code}


@router.put("/{task_id}")
async def update_task(
    task_id: UUID,
    task: TaskUpdate,
    propagate_status: bool = True,
    db: AsyncSession = Depends(get_db)
):
    # Get current task
    current = await db.execute(
        text("SELECT status, parent_task_id FROM tasks WHERE id = :id"),
        {"id": str(task_id)}
    )
    current_row = current.fetchone()
    if not current_row:
        raise HTTPException(404, "Task non trovato")
    
    old_status = current_row.status
    parent_task_id = str(current_row.parent_task_id) if current_row.parent_task_id else None
    new_status = task.status
    
    # Build update - handle status and priority separately with CAST
    data = task.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(400, "Nessun campo da aggiornare")
    
    # Remove status and priority for separate handling
    status_val = data.pop('status', None)
    priority_val = data.pop('priority', None)
    
    # Build SET clause
    set_parts = []
    params = {"id": str(task_id)}
    
    for field, value in data.items():
        if field.endswith("_id") and value:
            params[field] = str(value)
        else:
            params[field] = value
        set_parts.append(f"{field} = :{field}")
    
    # Add status with CAST if provided
    if status_val is not None:
        set_parts.append(f"status = CAST(:status AS task_status)")
        params["status"] = status_val
    
    # Add priority with CAST if provided
    if priority_val is not None:
        set_parts.append(f"priority = CAST(:priority AS task_priority)")
        params["priority"] = priority_val
    
    if set_parts:
        await db.execute(
            text(f"UPDATE tasks SET {', '.join(set_parts)} WHERE id = :id"),
            params
        )
    
    # Status propagation
    if propagate_status and status_val and status_val != old_status:
        if status_val == 'completed':
            await propagate_status_to_children(db, str(task_id), 'completed', 100)
        
        if parent_task_id:
            await check_and_update_parent_status(db, parent_task_id)
    
    await db.commit()
    return {"message": "Task aggiornato"}


@router.delete("/{task_id}")
async def delete_task(task_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT parent_task_id FROM tasks WHERE id = :id"),
        {"id": str(task_id)}
    )
    row = result.fetchone()
    parent_task_id = str(row.parent_task_id) if row and row.parent_task_id else None
    
    await db.execute(text("DELETE FROM tasks WHERE id = :id"), {"id": str(task_id)})
    
    if parent_task_id:
        await check_and_update_parent_status(db, parent_task_id)
    
    await db.commit()
    return {"message": "Task eliminato"}
