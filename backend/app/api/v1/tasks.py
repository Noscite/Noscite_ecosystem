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

# Pesi per priorità
PRIORITY_WEIGHTS = {
    'urgent': 4,
    'high': 3,
    'medium': 2,
    'low': 1
}


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


async def calculate_weighted_progress(db: AsyncSession, task_id: str) -> int:
    """Calcola il progresso pesato di un task basato sui figli (priorità * ore stimate)."""
    result = await db.execute(
        text("""
            SELECT 
                progress_percentage,
                priority,
                COALESCE(estimated_hours, 1) as estimated_hours
            FROM tasks 
            WHERE parent_task_id = :parent_id
        """),
        {"parent_id": task_id}
    )
    children = result.fetchall()
    
    if not children:
        return -1  # Nessun figlio, non calcolare
    
    total_weight = 0
    weighted_sum = 0
    
    for child in children:
        priority_weight = PRIORITY_WEIGHTS.get(child.priority, 2)
        hours = float(child.estimated_hours) if child.estimated_hours else 1
        combined_weight = priority_weight * hours
        
        total_weight += combined_weight
        weighted_sum += (child.progress_percentage or 0) * combined_weight
    
    if total_weight == 0:
        return 0
    
    return round(weighted_sum / total_weight)


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


async def update_parent_progress_recursive(db: AsyncSession, parent_task_id: str):
    """Aggiorna ricorsivamente il progresso dei task padre."""
    if not parent_task_id:
        return
    
    # Calcola progresso pesato
    weighted_progress = await calculate_weighted_progress(db, parent_task_id)
    
    if weighted_progress < 0:
        return  # Nessun figlio
    
    # Verifica se tutti i figli sono completati
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
            # Tutti completati -> completa il padre con 100%
            await db.execute(
                text("""
                    UPDATE tasks 
                    SET status = CAST('completed' AS task_status), 
                        progress_percentage = 100 
                    WHERE id = :id
                """),
                {"id": parent_task_id}
            )
        else:
            # Aggiorna il progresso pesato e gestisci lo stato
            await db.execute(
                text("""
                    UPDATE tasks 
                    SET progress_percentage = :progress,
                        status = CASE 
                            WHEN status = 'completed' THEN CAST('in_progress' AS task_status)
                            WHEN status = 'todo' AND :progress > 0 THEN CAST('in_progress' AS task_status)
                            ELSE status 
                        END
                    WHERE id = :id
                """),
                {"id": parent_task_id, "progress": weighted_progress}
            )
    
    # Risali al nonno
    parent_result = await db.execute(
        text("SELECT parent_task_id FROM tasks WHERE id = :id"),
        {"id": parent_task_id}
    )
    parent_row = parent_result.fetchone()
    if parent_row and parent_row.parent_task_id:
        await update_parent_progress_recursive(db, str(parent_row.parent_task_id))


async def update_project_progress(db: AsyncSession, project_id: str):
    """Aggiorna il progresso complessivo del progetto."""
    result = await db.execute(
        text("""
            SELECT 
                progress_percentage,
                priority,
                COALESCE(estimated_hours, 1) as estimated_hours
            FROM tasks 
            WHERE project_id = :project_id AND parent_task_id IS NULL
        """),
        {"project_id": project_id}
    )
    root_tasks = result.fetchall()
    
    if not root_tasks:
        return
    
    total_weight = 0
    weighted_sum = 0
    
    for task in root_tasks:
        priority_weight = PRIORITY_WEIGHTS.get(task.priority, 2)
        hours = float(task.estimated_hours) if task.estimated_hours else 1
        combined_weight = priority_weight * hours
        
        total_weight += combined_weight
        weighted_sum += (task.progress_percentage or 0) * combined_weight
    
    if total_weight > 0:
        project_progress = round(weighted_sum / total_weight)
        await db.execute(
            text("UPDATE projects SET progress_percentage = :progress WHERE id = :id"),
            {"id": project_id, "progress": project_progress}
        )


def sync_status_and_progress(status: str | None, progress: int | None, old_status: str, old_progress: int) -> tuple[str, int]:
    """
    Sincronizza stato e progresso:
    - Se status diventa 'completed' → progress = 100
    - Se progress diventa 100 → status = 'completed'
    - Se status da 'completed' a altro → progress rimane come impostato o vecchio
    - Se progress da 100 a meno → status = 'in_progress' se era 'completed'
    """
    final_status = status if status is not None else old_status
    final_progress = progress if progress is not None else old_progress
    
    # Status → Progress: completato significa 100%
    if final_status == 'completed':
        final_progress = 100
    
    # Progress → Status: 100% significa completato
    elif final_progress == 100 and final_status != 'cancelled':
        final_status = 'completed'
    
    # Se era completato e ora progress < 100, torna in_progress
    elif old_status == 'completed' and final_progress < 100:
        final_status = 'in_progress'
    
    # Se progress > 0 e stato è todo, passa a in_progress
    elif final_progress > 0 and final_status == 'todo':
        final_status = 'in_progress'
    
    return final_status, final_progress


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
    
    # Sincronizza status e progress per nuovi task
    final_status = task.status
    final_progress = 0
    if task.status == 'completed':
        final_progress = 100
    
    result = await db.execute(
        text("""
            INSERT INTO tasks (project_id, parent_task_id, wbs_code, name, description,
                              status, priority, planned_start_date, planned_end_date, 
                              estimated_hours, is_milestone, notes, progress_percentage)
            VALUES (:project_id, :parent_task_id, :wbs_code, :name, :description,
                    CAST(:status AS task_status), CAST(:priority AS task_priority), 
                    :planned_start_date, :planned_end_date, :estimated_hours, :is_milestone, :notes, :progress)
            RETURNING id, wbs_code
        """),
        {
            "project_id": str(task.project_id),
            "parent_task_id": str(task.parent_task_id) if task.parent_task_id else None,
            "wbs_code": wbs_code,
            "name": task.name,
            "description": task.description,
            "status": final_status,
            "priority": task.priority,
            "planned_start_date": task.planned_start_date,
            "planned_end_date": task.planned_end_date,
            "estimated_hours": task.estimated_hours,
            "is_milestone": task.is_milestone,
            "notes": task.notes,
            "progress": final_progress
        }
    )
    row = result.fetchone()
    
    # Aggiorna progresso padre se esiste
    if task.parent_task_id:
        await update_parent_progress_recursive(db, str(task.parent_task_id))
    
    # Aggiorna progresso progetto
    await update_project_progress(db, str(task.project_id))
    
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
        text("SELECT status, parent_task_id, project_id, progress_percentage FROM tasks WHERE id = :id"),
        {"id": str(task_id)}
    )
    current_row = current.fetchone()
    if not current_row:
        raise HTTPException(404, "Task non trovato")
    
    old_status = current_row.status
    old_progress = current_row.progress_percentage or 0
    parent_task_id = str(current_row.parent_task_id) if current_row.parent_task_id else None
    project_id = str(current_row.project_id)
    
    # Build update
    data = task.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(400, "Nessun campo da aggiornare")
    
    # Estrai status e progress per sincronizzazione
    input_status = data.pop('status', None)
    input_progress = data.pop('progress_percentage', None)
    priority_val = data.pop('priority', None)
    
    # Sincronizza status e progress
    final_status, final_progress = sync_status_and_progress(
        input_status, input_progress, old_status, old_progress
    )
    
    # Build SET clause
    set_parts = []
    params = {"id": str(task_id)}
    
    for field, value in data.items():
        if field.endswith("_id") and value:
            params[field] = str(value)
        else:
            params[field] = value
        set_parts.append(f"{field} = :{field}")
    
    # Aggiungi sempre status e progress (sincronizzati)
    set_parts.append("status = CAST(:status AS task_status)")
    params["status"] = final_status
    
    set_parts.append("progress_percentage = :progress")
    params["progress"] = final_progress
    
    if priority_val is not None:
        set_parts.append("priority = CAST(:priority AS task_priority)")
        params["priority"] = priority_val
    
    await db.execute(
        text(f"UPDATE tasks SET {', '.join(set_parts)} WHERE id = :id"),
        params
    )
    
    # Propagazione ai figli se status cambiato a completed
    if propagate_status and final_status == 'completed' and old_status != 'completed':
        await propagate_status_to_children(db, str(task_id), 'completed', 100)
    
    # Update parent progress
    if parent_task_id:
        await update_parent_progress_recursive(db, parent_task_id)
    
    # Update project progress
    await update_project_progress(db, project_id)
    
    await db.commit()
    return {"message": "Task aggiornato", "status": final_status, "progress": final_progress}


@router.delete("/{task_id}")
async def delete_task(task_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT parent_task_id, project_id FROM tasks WHERE id = :id"),
        {"id": str(task_id)}
    )
    row = result.fetchone()
    parent_task_id = str(row.parent_task_id) if row and row.parent_task_id else None
    project_id = str(row.project_id) if row else None
    
    await db.execute(text("DELETE FROM tasks WHERE id = :id"), {"id": str(task_id)})
    
    if parent_task_id:
        await update_parent_progress_recursive(db, parent_task_id)
    
    if project_id:
        await update_project_progress(db, project_id)
    
    await db.commit()
    return {"message": "Task eliminato"}


@router.post("/{task_id}/recalculate-progress")
async def recalculate_task_progress(task_id: UUID, db: AsyncSession = Depends(get_db)):
    """Ricalcola il progresso di un task e di tutti i suoi antenati."""
    result = await db.execute(
        text("SELECT parent_task_id, project_id FROM tasks WHERE id = :id"),
        {"id": str(task_id)}
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(404, "Task non trovato")
    
    weighted_progress = await calculate_weighted_progress(db, str(task_id))
    if weighted_progress >= 0:
        # Sincronizza anche lo stato
        new_status = 'completed' if weighted_progress == 100 else 'in_progress' if weighted_progress > 0 else 'todo'
        await db.execute(
            text("UPDATE tasks SET progress_percentage = :progress, status = CAST(:status AS task_status) WHERE id = :id"),
            {"id": str(task_id), "progress": weighted_progress, "status": new_status}
        )
    
    if row.parent_task_id:
        await update_parent_progress_recursive(db, str(row.parent_task_id))
    
    await update_project_progress(db, str(row.project_id))
    
    await db.commit()
    return {"message": "Progresso ricalcolato", "progress": weighted_progress}


@router.post("/project/{project_id}/recalculate-all")
async def recalculate_all_progress(project_id: UUID, db: AsyncSession = Depends(get_db)):
    """Ricalcola il progresso di tutti i task del progetto dal basso verso l'alto."""
    # Ottieni tutti i task ordinati per profondità (foglie prima)
    result = await db.execute(
        text("""
            WITH RECURSIVE task_depth AS (
                SELECT id, parent_task_id, 0 as depth
                FROM tasks 
                WHERE project_id = :pid AND parent_task_id IS NULL
                UNION ALL
                SELECT t.id, t.parent_task_id, td.depth + 1
                FROM tasks t
                JOIN task_depth td ON t.parent_task_id = td.id
            )
            SELECT id, parent_task_id, depth 
            FROM task_depth 
            ORDER BY depth DESC
        """),
        {"pid": str(project_id)}
    )
    
    tasks_by_depth = result.fetchall()
    
    # Processa dal basso verso l'alto
    processed_parents = set()
    for task in tasks_by_depth:
        if task.parent_task_id and str(task.parent_task_id) not in processed_parents:
            await update_parent_progress_recursive(db, str(task.parent_task_id))
            processed_parents.add(str(task.parent_task_id))
    
    await update_project_progress(db, str(project_id))
    await db.commit()
    
    return {"message": "Progresso ricalcolato per tutti i task"}
