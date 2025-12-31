from fastapi import APIRouter
from app.api.v1 import auth, users, companies, project_team, task_assignments, contacts, services, opportunities, orders, projects, tasks, timesheets, milestones, ai

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(companies.router)
api_router.include_router(contacts.router)
api_router.include_router(services.router)
api_router.include_router(opportunities.router)
api_router.include_router(orders.router)
api_router.include_router(projects.router)
api_router.include_router(tasks.router)
api_router.include_router(timesheets.router)
api_router.include_router(milestones.router)
api_router.include_router(ai.router)
api_router.include_router(project_team.router)
api_router.include_router(task_assignments.router)
