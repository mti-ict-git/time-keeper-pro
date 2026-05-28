# Backend (API + Sync)

## Overview

- Runtime: Node.js + TypeScript (executed with `tsx` in dev).
- Web framework: Express.
- Data: Microsoft SQL Server via `mssql`.
- Entry: [server.ts](file:///c:/Scripts/Projects/time-keeper-pro/backend/server.ts)

The backend exposes REST-ish endpoints under `/api/*` and includes an in-process scheduler to periodically sync schedule data from the “Orange” database into the main database.

## Entrypoint

### server.ts

- Builds the Express app and mounts routers:
  - `/api/scheduling` → [schedulingRouter](file:///c:/Scripts/Projects/time-keeper-pro/backend/routes/scheduling.ts)
  - `/api/attendance` → [attendanceRouter](file:///c:/Scripts/Projects/time-keeper-pro/backend/routes/attendance.ts)
  - `/api/sync` → [syncRouter](file:///c:/Scripts/Projects/time-keeper-pro/backend/routes/sync.ts)
  - `/api/controllers` → [controllersRouter](file:///c:/Scripts/Projects/time-keeper-pro/backend/routes/controllers.ts)
  - `/api/users` → [usersRouter](file:///c:/Scripts/Projects/time-keeper-pro/backend/routes/users.ts)
  - `/api/auth` → [authRouter](file:///c:/Scripts/Projects/time-keeper-pro/backend/routes/auth.ts)
  - `/api/auth/local` → [authLocalRouter](file:///c:/Scripts/Projects/time-keeper-pro/backend/routes/auth_local.ts)
- Health checks:
  - `GET /api/health` returns `{ ok: true }`.
  - `GET /api/health/db` validates a DB connection by executing a trivial query.

## Database Connectivity

### Main DB

- Pool singleton: [getPool](file:///c:/Scripts/Projects/time-keeper-pro/backend/db.ts#L6-L11)
- Configuration: [dbConfig](file:///c:/Scripts/Projects/time-keeper-pro/backend/config.ts#L6-L18)
- Purpose: primary application data (MTIUsers, ScheduleChangeLog, SyncLogs/SyncSettings, Users, etc.)

### Orange DB

- Pool singleton: [getOrangePool](file:///c:/Scripts/Projects/time-keeper-pro/backend/orangeDb.ts#L7-L24)
- Purpose: source system for schedule sync (employee list + day-type schedule procedure)

### Data DB (Optional)

- Pool singleton: [getDataDbPool](file:///c:/Scripts/Projects/time-keeper-pro/backend/dataDb.ts#L7-L24)
- Purpose: used by some scripts and tools (e.g., CardDB sync script).

## Core Modules

## Schedule Sync Core

### sync.ts

- Main function: [runScheduleSync](file:///c:/Scripts/Projects/time-keeper-pro/backend/sync.ts#L102-L336)
- Responsibilities:
  - Query schedule rows from Orange using:
    - A table/view/synonym (configurable via env)
    - A stored procedure (CROSS APPLY) that returns “day type” schedule info
  - Hash each row (SHA-256) and compare with current `dbo.MTIUsers` data to skip unchanged records.
  - Upsert into `dbo.MTIUsers` inside a transaction.
  - Append an audit row to `dbo.ScheduleChangeLog` on insert/update.
- Key helpers:
  - [hashRow](file:///c:/Scripts/Projects/time-keeper-pro/backend/sync.ts#L30-L49) — stable content hash for change detection.
  - [getExistingHashes](file:///c:/Scripts/Projects/time-keeper-pro/backend/sync.ts#L61-L89) — builds current hash map from `dbo.MTIUsers`.

### Scheduler (in routes/sync.ts)

The scheduler is implemented inside the API process (not an external worker). It persists:

- Settings in a `SyncSettings` table (created on demand).
- Execution logs in a `SyncLogs` table (created on demand).

Key functions:

- [initializeScheduler](file:///c:/Scripts/Projects/time-keeper-pro/backend/routes/sync.ts#L283-L294) — loads settings and schedules the first run.
- [runNow](file:///c:/Scripts/Projects/time-keeper-pro/backend/routes/sync.ts#L181-L228) — executes `runScheduleSync()` with a “distributed check” (skip if another instance ran too recently), and writes a log row.
- [fetchLogs](file:///c:/Scripts/Projects/time-keeper-pro/backend/routes/sync.ts#L63-L116) — server-side paging for sync logs.

Endpoints:

- `GET /api/sync/status` — current scheduler state + last run.
- `POST /api/sync/run` — trigger sync immediately.
- `PUT /api/sync/config` — change enabled flag and interval (minutes).
- `GET /api/sync/logs` — paged log history, optional `withChanges=true`.

## API Routers

### Scheduling Router (MTIUsers + history/locks)

Source: [routes/scheduling.ts](file:///c:/Scripts/Projects/time-keeper-pro/backend/routes/scheduling.ts)

- `GET /api/scheduling/employees` — filtered view of `MTIUsers`.
  - Query params: `description`, `dayType`, `timeIn`, `timeOut`, `nextDay`.
- `GET /api/scheduling/combos` — aggregated schedule combinations (grouped by time in/out and next-day).
- `GET /api/scheduling/history` — schedule change history from `dbo.ScheduleChangeLog` (returns empty if table missing).
- `GET /api/scheduling/as-of` — schedule snapshot for an employee at a timestamp.
  - Uses latest history row before `at`, else falls back to current `dbo.MTIUsers`.
- `GET /api/scheduling/locks` — reads `dbo.AttendanceScheduleLock` (returns empty if table missing).

Key data shaping helpers:

- [formatTime / formatDate / toBoolNextDay](file:///c:/Scripts/Projects/time-keeper-pro/backend/utils/format.ts)

### Attendance Router (tblAttendanceReport)

Source: [routes/attendance.ts](file:///c:/Scripts/Projects/time-keeper-pro/backend/routes/attendance.ts)

- `GET /api/attendance/report/schema` — returns columns of `tblAttendanceReport` (introspection).
- `GET /api/attendance/report` — dynamic query + aggregation that normalizes the report to “one row per employee per effective shift date”.
  - Supports `from`, `to`, `search`, `employeeId`, `department`, `limit`.
  - Picks the most likely date column from a candidate list, then filters using `BETWEEN`.
  - Infers “effective date” for overnight shifts (clock-out before noon counts for previous day’s shift).
  - Computes status buckets (Early / On Time / Late / Missing) with thresholds:
    - `STATUS_EARLY_MINUTES`, `STATUS_ONTIME_MINUTES`, `STATUS_LATE_MINUTES`

### Controllers Router

Source: [routes/controllers.ts](file:///c:/Scripts/Projects/time-keeper-pro/backend/routes/controllers.ts)

- `GET /api/controllers` — extracts distinct controller names from `tblAttendanceReport`.
- Supports optional include/exclude filtering via:
  - `CONTROLLER_INCLUDE`, `CONTROLLER_EXCLUDE`

### Auth Routers

- LDAP: [routes/auth.ts](file:///c:/Scripts/Projects/time-keeper-pro/backend/routes/auth.ts)
  - `POST /api/auth/login`
  - Uses `ldapts` to bind with a service account and then bind as the user.
- Local DB: [routes/auth_local.ts](file:///c:/Scripts/Projects/time-keeper-pro/backend/routes/auth_local.ts)
  - `POST /api/auth/local/login`
  - Looks up a record in `Users` and compares password (only if a password column exists).

### Users Router

Source: [routes/users.ts](file:///c:/Scripts/Projects/time-keeper-pro/backend/routes/users.ts)

- User admin endpoints for schema discovery, listing/searching, inserts, and AD import/search.
- Uses LDAP search to find candidates and then inserts them into the `Users` table.

## Utilities

- Schema introspection: [utils/introspection.ts](file:///c:/Scripts/Projects/time-keeper-pro/backend/utils/introspection.ts)
  - `getTableColumns(pool, tableName)` — uses `INFORMATION_SCHEMA.COLUMNS`.
  - `mapBinding(columnInfo)` — maps SQL types to `mssql` binding types.
- Formatting helpers: [utils/format.ts](file:///c:/Scripts/Projects/time-keeper-pro/backend/utils/format.ts)
  - `formatTime(value)` normalizes various time formats.
  - `formatDate(value)` normalizes to `YYYY-MM-DD`.
  - `toBoolNextDay(value)` converts a heterogeneous “next day” value to boolean.

