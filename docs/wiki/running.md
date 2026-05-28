# Running & Operations

## Prerequisites

- Node.js (Dockerfiles use Node 20; local dev should be compatible).
- Access to the required MSSQL instances (Main DB, and optionally Orange/DataDB).
- Optional: LDAP server connectivity for AD auth and user import.

## Install

From the repository root:

```bash
npm install
```

## Environment Variables

### Backend

Minimum required for most API endpoints:

- `DB_SERVER`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `DB_PORT` (optional, default 1433)
- `PORT` (optional, default 5000)

Optional features:

- Schedule sync from Orange DB: `ORANGE_DB_*` + `ORANGE_SCHEMA`/`ORANGE_EMPLOYEE_TABLE`/`ORANGE_DAY_TYPE_PROC` (see [database.md](./database.md))
- Sync scheduler tuning:
  - `SYNC_INTERVAL_MINUTES` (default 5)
  - `SYNC_RETRY_BASE_MS` (default 30000)
  - `SYNC_RETRY_MAX_MS` (default 300000)
- Attendance status thresholds:
  - `STATUS_EARLY_MINUTES`, `STATUS_ONTIME_MINUTES`, `STATUS_LATE_MINUTES`
- Controller list filtering:
  - `CONTROLLER_INCLUDE`, `CONTROLLER_EXCLUDE`
- LDAP auth:
  - `LDAP_URL`, `LDAP_BASE_DN`, `LDAP_BIND_DN`, `LDAP_BIND_PASSWORD`

### Frontend (Vite)

- `VITE_API_BASE_URL` (default `/api`)
- `VITE_USE_RELATIVE_API_URL` (default `true`)
- `VITE_BACKEND_URL` (when `VITE_USE_RELATIVE_API_URL=false`, build absolute API URLs)
- `VITE_SUPERADMIN_USER`, `VITE_SUPERADMIN_PASS` (client-side “superadmin” fallback for admin UI)

## Run (Local, Recommended for Development)

Run frontend and backend together:

```bash
npm run dev:full
```

Or run separately:

```bash
npm run server:dev
npm run dev
```

Expected ports:

- Frontend: `http://localhost:9000` (see [vite.config.ts](file:///c:/Scripts/Projects/time-keeper-pro/vite.config.ts))
- Backend: `http://localhost:5000` (default `PORT`)

Health checks:

- `GET http://localhost:5000/api/health`
- `GET http://localhost:5000/api/health/db`

## Run (Docker)

1. Create a `.env` file at the repo root with your backend env vars (at least `DB_*`; add `ORANGE_DB_*` if using sync).
2. Start:

```bash
docker compose up --build
```

Notes:

- The `web` container uses `VITE_BACKEND_URL=http://backend:5000` (see [docker-compose.yml](file:///c:/Scripts/Projects/time-keeper-pro/docker-compose.yml#L27-L44)).
- The MSSQL server is not provisioned by Compose and must be reachable from the containers.

## Database Schema Setup

Apply the repo’s schema scripts to the Main DB:

```bash
npm run db:apply-schema
```

This applies SQL files under [backend/schema](file:///c:/Scripts/Projects/time-keeper-pro/backend/schema).

## Tests

```bash
npm test
```

Watch mode:

```bash
npm run test:watch
```

## Troubleshooting

- Vite proxy backend port mismatch:
  - If the frontend is proxying `/api` to a different port than your backend, set `VITE_BACKEND_URL=http://localhost:5000` or adjust the Vite proxy target in [vite.config.ts](file:///c:/Scripts/Projects/time-keeper-pro/vite.config.ts).
- Missing tables:
  - Some endpoints return empty results when optional tables are absent (e.g., `ScheduleChangeLog`, `AttendanceScheduleLock`).
  - `tblAttendanceReport`, `MTIUsers`, and `Users` are expected to exist already; ensure they are present in the Main DB.

