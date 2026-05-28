# Database

## Databases (Connections)

The backend can connect to up to three MSSQL databases, configured via environment variables.

### Main DB (required)

- Used by most endpoints.
- Connection comes from [dbConfig](file:///c:/Scripts/Projects/time-keeper-pro/backend/config.ts#L6-L18) and [getPool](file:///c:/Scripts/Projects/time-keeper-pro/backend/db.ts#L6-L11).
- Env:
  - `DB_SERVER`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, optional `DB_PORT`

### Orange DB (required for schedule sync)

- Used by [runScheduleSync](file:///c:/Scripts/Projects/time-keeper-pro/backend/sync.ts#L102-L336) as the upstream source.
- Env:
  - `ORANGE_DB_SERVER`, `ORANGE_DB_USER`, `ORANGE_DB_PASSWORD`, `ORANGE_DB_NAME`, optional `ORANGE_DB_PORT`
  - `ORANGE_SCHEMA` (default `dbo`)
  - `ORANGE_EMPLOYEE_TABLE` (default `it_mti_employee_database_tbl`)
  - `ORANGE_PROC_SCHEMA` (default `dbo`)
  - `ORANGE_DAY_TYPE_PROC` (default `sp_it_get_day_type`)
  - `ORANGE_SITE_CODE` (default `MTI`)

### Data DB (optional)

- Used by scripts such as [sync_carddb_to_mtiusers.ts](file:///c:/Scripts/Projects/time-keeper-pro/backend/scripts/sync_carddb_to_mtiusers.ts).
- Env:
  - `DATADB_SERVER`, `DATADB_USER`, `DATADB_PASSWORD`, `DATADB_NAME`, optional `DATADB_PORT`

## Core Tables (Main DB)

### dbo.MTIUsers

- Target of schedule sync; also queried by scheduling endpoints.
- Not created by `backend/schema/*.sql` in this repo, so it is expected to exist already (or be created externally).
- Sync upserts into these columns (see [sync.ts](file:///c:/Scripts/Projects/time-keeper-pro/backend/sync.ts)):
  - `employee_id`, `employee_name`, `gender`, `division`, `department`, `section`
  - `supervisor_id`, `supervisor_name`, `position_title`, `grade_interval`, `phone`
  - `day_type`, `description`, `time_in`, `time_out`, `next_day`

### dbo.ScheduleChangeLog

- Created by: [schedule_changelog.sql](file:///c:/Scripts/Projects/time-keeper-pro/backend/schema/schedule_changelog.sql)
- Used by:
  - Schedule history endpoint: [GET /api/scheduling/history](file:///c:/Scripts/Projects/time-keeper-pro/backend/routes/scheduling.ts#L149-L204)
  - As-of endpoint: [GET /api/scheduling/as-of](file:///c:/Scripts/Projects/time-keeper-pro/backend/routes/scheduling.ts#L206-L310)
  - Sync writes inserts into this table on insert/update: [sync.ts](file:///c:/Scripts/Projects/time-keeper-pro/backend/sync.ts#L246-L324)
- Schema highlights:
  - `(StaffNo, ChangedAt)` index for quick employee timeline queries.
  - `SourceHash` column allows traceability to the sync’s content hash.

### dbo.AttendanceScheduleLock

- Created by: [attendance_schedule_lock.sql](file:///c:/Scripts/Projects/time-keeper-pro/backend/schema/attendance_schedule_lock.sql)
- Used by: [GET /api/scheduling/locks](file:///c:/Scripts/Projects/time-keeper-pro/backend/routes/scheduling.ts#L312-L360)
- Schema highlights:
  - Composite primary key `(StaffNo, ShiftDate)`.
  - Constraint to ensure overnight shifts are either strictly increasing time or marked `NextDay = 1`.

### SyncSettings / SyncLogs

Two definitions exist:

- DDL files:
  - [sync_settings.sql](file:///c:/Scripts/Projects/time-keeper-pro/backend/schema/sync_settings.sql)
  - [sync_logs.sql](file:///c:/Scripts/Projects/time-keeper-pro/backend/schema/sync_logs.sql)
- On-demand creation in code:
  - [ensureSettingsTable](file:///c:/Scripts/Projects/time-keeper-pro/backend/routes/sync.ts#L28-L33)
  - [ensureLogsTable](file:///c:/Scripts/Projects/time-keeper-pro/backend/routes/sync.ts#L35-L42)

These are used by the in-process sync scheduler to persist config and execution history.

### tblAttendanceReport

- Read by: [GET /api/attendance/report](file:///c:/Scripts/Projects/time-keeper-pro/backend/routes/attendance.ts#L20-L239)
- Expected to exist already (not created by schema scripts in this repo).
- The route uses runtime column introspection to adapt to different column naming conventions and still produce a normalized output.

### Users

- Used by: [routes/users.ts](file:///c:/Scripts/Projects/time-keeper-pro/backend/routes/users.ts) and [auth_local.ts](file:///c:/Scripts/Projects/time-keeper-pro/backend/routes/auth_local.ts)
- Expected to exist already (not created by schema scripts in this repo).
- Local auth is tolerant to missing password column and behaves accordingly.

## Applying Schema

The repo includes an automated schema runner:

- Script: [apply_schema.ts](file:///c:/Scripts/Projects/time-keeper-pro/backend/scripts/apply_schema.ts)
- Command: `npm run db:apply-schema` (from [package.json](file:///c:/Scripts/Projects/time-keeper-pro/package.json#L6-L13))

This applies the SQL files under `backend/schema/` to the main DB connection.

