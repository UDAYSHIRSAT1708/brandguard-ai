# BrandGuard AI — Intelligent Brand Governance & Editorial Review Platform

BrandGuard AI reviews content before publication to ensure alignment with approved brand guidelines, authorized claims and facts, consistent terminology, and editorial standards.

**Core Principle**: *AI recommends. Evidence supports. Humans approve.*

---

## Architecture Overview

```
[ React + TypeScript + Tailwind Frontend ] (:3000)
                   │
                   ▼ (REST / JWT)
[ Node.js + Express Application Backend ] (:5000)
       │                              │
       ▼ (Mongoose)                   ▼ (Internal REST / Shared Secret)
[ MongoDB Atlas / In-Memory DB ]      [ Python FastAPI RAG Service ] (:8000)
                                      ├── Google Gemini (Primary)
                                      └── OpenAI GPT-4o-mini (Fallback)
```

- **Frontend (`/frontend`)**: React, TypeScript, Tailwind CSS, customized with the editorial design specification (`DESIGN.md`).
- **Application Backend (`/backend`)**: Node.js, Express, TypeScript, Mongoose. Owns authentication, RBAC, content management, versioning, review orchestration, approval workflows, and audit logging.
- **AI & RAG Service (`/ai-service`)**: Python, FastAPI, Pydantic. Owns hybrid retrieval, approved evidence ranking, AI provider abstraction with autonomous failover, and citation validation.
- **Zero-Config Local Development**: If no `MONGODB_URI` is provided in `.env`, the backend automatically starts an in-memory MongoDB instance for local demonstration.

---

## Local Development Quickstart

### Prerequisites
- Node.js >= 20.x
- Python >= 3.10
- npm >= 10.x

### 1. Configuration
Copy `.env.example` to `.env` or set environment variables:
```bash
cp .env.example .env
```

### 2. Start Services

**Terminal 1 — Python AI Service**
```powershell
cd ai-service
.\venv\Scripts\activate
uvicorn app.main:app --port 8000 --reload
# Endpoint: http://localhost:8000/health
```

**Terminal 2 — Application Backend**
```powershell
cd backend
npm run dev
# Endpoint: http://localhost:5000/api/health
```

**Terminal 3 — Frontend**
```powershell
cd frontend
npm run dev
# UI: http://localhost:3000
```

---

## Automated Tests

- **AI Service Tests (Pytest)**:
  ```powershell
  cd ai-service
  .\venv\Scripts\pytest -v
  ```
- **Backend Tests (Jest & Supertest)**:
  ```powershell
  cd backend
  npm test
  ```
- **Frontend Type & Build Verification**:
  ```powershell
  cd frontend
  npm run build
  ```

---

## Security Architecture Summary

1. **Strict Service Boundaries**: Frontend never communicates directly with AI providers or Python service.
2. **Internal API Authentication**: Python AI service verifies `X-Internal-API-Key` on all private endpoints.
3. **Multi-Tenant Data Isolation**: Database queries enforce `organisationId` extracted from signed JWTs.
4. **Helmet & Strict CORS**: Origin-restricted to authorized client domains.
5. **Prompt Injection Defense**: Content and guidelines delimited in strict XML blocks; model instructed to treat content solely as data.
