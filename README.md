# Multi-Format Document Automation & E-Sign Platform

Monorepo for a document automation and e-signature platform that generates
documents from a single HTML template and exports to **PDF / DOCX / RTF**.

## Workspaces

- `apps/backend` — Node.js + Express + Prisma API

## Status

**Phase 1 — Core Backend & Template Engine** (current)
- Prisma schema with format-aware `Document` entity
- HTML template storage + `{{variable}}` rendering engine
- `POST /api/documents` creates a format-tagged HTML snapshot (no file generation yet)

See `apps/backend/README` behavior via setup instructions below, or the phase plan
in `doctemplate-requirements.docx`.

## Quick start

```bash
# 1. Install deps
npm install

# 2. Configure env
cp apps/backend/.env.example apps/backend/.env
# edit DATABASE_URL to point at a running Postgres

# 3. Generate Prisma client + migrate
npm run prisma:migrate

# 4. Run the dev server
npm run dev
```
