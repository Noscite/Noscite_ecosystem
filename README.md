# Noscite CRM + Project Management

Sistema unificato per la gestione clienti, opportunità commerciali e project management.

## 🏗️ Architettura
```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (React)                         │
│  React 18 + TypeScript + Vite + Tailwind + shadcn/ui        │
│  Port: 5173 (dev) / 80 (prod via nginx)                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   BACKEND (FastAPI)                          │
│  Python 3.11 + FastAPI + SQLAlchemy 2.0 + Alembic           │
│  Port: 8000                                                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   DATABASE (PostgreSQL)                      │
│  PostgreSQL 16                                               │
│  Port: 5432                                                  │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start
```bash
# 1. Setup
cd ~/noscite-crm
cp .env.example .env
# Edit .env with your settings

# 2. Start with Docker
docker-compose up -d

# 3. Access
# Frontend: http://localhost:5173
# Backend API: http://localhost:8000/docs
```

## 🔐 Ruoli Utente

| Ruolo | Descrizione |
|-------|-------------|
| admin | Vede TUTTO, gestisce utenti |
| manager | Vede tutto, assegna risorse |
| account | Gestisce clienti e opportunità |
| pm | Gestisce progetti assegnati |
| user | Solo entità assegnate |

## 📝 License

Proprietary - Noscite S.r.l.
