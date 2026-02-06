2026-02-05 23:07:27 WITA

Modularized backend structure and routes.

- Added backend/config.ts for environment-based app and DB config
- Added backend/db.ts for MSSQL connection pool management
- Added backend/utils/format.ts for time/overnight normalization
- Added backend/utils/introspection.ts for schema introspection and type binding
- Added backend/types/scheduling.ts for MTIUsers and schedule combo types
- Added backend/routes/scheduling.ts for scheduling employees and combos
- Added backend/routes/users.ts for users schema, list, and search
- Added backend/routes/attendance.ts for attendance report schema and query
- Updated backend/server.ts to mount routers and use modular config

Verification:

- npx tsc --noEmit ran successfully
 npm run lint executed; existing repo warnings/errors remain unrelated to changes

Fri Feb  6 14:06:53 WITA 2026

- Replaced Lovable brand mentions with MTI Attendance System in index.html meta tags and README
- Preserved external URLs and dev dependencies referencing lovable.dev (non-brand operational references)

Verification:

- npm run lint executed successfully
- npx tsc --noEmit executed successfully

2026-02-06 11:05:04 WITA

- Filtered /api/controllers to only include face print devices by default
- Added configurable filters via env: CONTROLLER_INCLUDE, CONTROLLER_EXCLUDE (comma-separated)
- Admin Controllers page now shows face print devices only

Verification:

- npm run lint executed successfully
- npx tsc --noEmit executed successfully

2026-02-06 11:17:43 WITA

- Enhanced /api/controllers filter patterns: supports prefix (^), suffix ($), regex: tokens
- Default includes now use ^FR- and trial to match provided Face Device naming

Verification:

- npm run lint executed successfully
- npx tsc --noEmit executed successfully

2026-02-06 11:20:55 WITA

- Updated Time Scheduling page to use real scheduling employees from /api/scheduling/employees
- Stats (Time In/Out Available/N/A) computed from real timeIn/timeOut presence
- Organization breakdown computed from real department data; total equals fetched employees

Verification:

- npm run lint executed successfully
- npx tsc --noEmit executed successfully

2026-02-06 11:28:35 WITA

- Admin Schedules: Employees count links to Time Scheduling with filters
- Backend /api/scheduling/employees supports description, timeIn, timeOut, nextDay
- Time Scheduling reads URL filters for overview and table
- Scheduling table filters by timeIn/timeOut/nextDay and description

Verification:

- npm run lint executed successfully
- npx tsc --noEmit executed successfully

2026-02-06 11:30:40 WITA

- Fixed Admin Schedules link path to /scheduling to avoid 404

Verification:

- npm run lint executed successfully
- npx tsc --noEmit executed successfully

2026-02-06 11:33:28 WITA

- Replaced navigation with modal for Employees in Admin Schedules
- Modal loads filtered users via /api/scheduling/employees and supports CSV export

Verification:

- npm run lint executed successfully
- npx tsc --noEmit executed successfully

2026-02-06 11:38:39 WITA

- Fixed duplicate import causing 'Identifier useEffect has already been declared' in AdminSchedules.tsx

Verification:

- npm run lint executed successfully
- npx tsc --noEmit executed successfully

2026-02-06 11:39:54 WITA

- Hardened /api/scheduling/employees nextDay filter using CAST and string set
- Prevented SQL conversion errors when next_day stored as text (e.g., 'Y'/'N')

Verification:

- npm run lint executed successfully
- npx tsc --noEmit executed successfully

2026-02-06 11:40:57 WITA

- Made employees modal scrollable (bounded height with overflow)

Verification:

- npm run lint executed successfully
- npx tsc --noEmit executed successfully

2026-02-06 11:43:58 WITA

- Fixed mismatch: employees modal now filters by day_type too
- Ensures modal list count equals the combo count for selected row

Verification:

- npm run lint executed successfully
- npx tsc --noEmit executed successfully
2026-02-06 10:52:33 WITA

- Added backend/controllers route [/api/controllers] to aggregate controller names from tblAttendanceReport
- Mounted /api/controllers in backend/server.ts
- Implemented src/lib/services/controllersApi.ts to fetch real controllers
- Updated Admin Controllers page to load real data and set actions as read-only

Verification:

- npm run lint executed successfully
- npx tsc --noEmit executed successfully

2026-02-06 10:11:52 WITA

- Added backend sync feature: Orange DB → EmployeeWorkflow MTIUsers
- Implemented backend/orangeDb.ts for source connection
- Implemented backend/sync.ts with hash-based update/insert and phone length handling
- Added backend/routes/sync.ts with endpoints: status, run, config, logs; scheduled repeating job (default 5 min)
- Mounted /api/sync in server; added Admin Sync page with interval control, run button, and logs

Verification:

- npx tsc --noEmit ran successfully
- npm run lint executed; existing repo errors/warnings remain unrelated to this change

2026-02-06 10:17:05 WITA

- Persisted sync enable/disable and interval to DB via SyncSettings table
- Added backend/schema/sync_settings.sql for reproducible schema
- Updated /api/sync/status to include enabled; /api/sync/config now saves to DB
- Admin Sync page now includes an Enable switch and Save button

Verification:

- npx tsc --noEmit ran successfully
- npm run lint executed; existing repo errors/warnings remain unrelated to this change

2026-02-06 10:19:12 WITA

- Added npm run db:apply-schema script to apply backend/schema/*.sql to EmployeeWorkflow DB
- Implemented backend/scripts/apply_schema.ts (ESM-safe __dirname via import.meta.url)
- Applied SyncSettings schema via npm run db:apply-schema (success)

Verification:

- npx tsc --noEmit ran successfully
- npm run lint executed; existing repo errors/warnings remain unrelated to this change

2026-02-06 10:24:34 WITA

- Added SyncLogs schema [backend/schema/sync_logs.sql] and applied via npm run db:apply-schema
- Persisted each sync run (success/failure) to SyncLogs with error message and details
- Updated /api/sync/logs to return history from DB (default limit 50)
- Extended Admin Sync to show Error column and display failure messages

Verification:

- npx tsc --noEmit ran successfully
- npm run lint executed; existing repo errors/warnings remain unrelated to this change

2026-02-06 10:28:54 WITA

- Executed Python sync: backend/sync_schedule.py
- Result: Sync completed total=1009 updated=0 inserted=0 unchanged=1009
- Concluded Orange objects are reachable with current credentials
- Relaxed Node pre-check to include sys.tables/views/synonyms and allow direct query

Verification:

- npx tsc --noEmit ran successfully
- npm run lint executed; existing repo errors/warnings remain unrelated to this change

2026-02-06 10:35:41 WITA

- Added Orange DB inspector script [backend/scripts/check_orange.ts]; verifies object kind across sys.tables/views/synonyms
- Added Orange query test script [backend/scripts/test_orange_query.ts]; confirmed sample rows with CROSS APPLY
- Qualified Orange objects with database name in backend sync query to avoid default DB mismatch

Verification:

- npx tsx backend/scripts/check_orange.ts it_mti_employee_database_tbl dbo → kind=view
- npx tsx backend/scripts/test_orange_query.ts → ok, sampleCount=5
- npx tsc --noEmit ran successfully

2026-02-06 10:38:20 WITA

- Reverted backend Orange query to two-part names ([dbo].[it_mti_employee_database_tbl])
- Rationale: avoid cross-database name qualification mismatch causing “Invalid object name”

Verification:

- npx tsc --noEmit ran successfully
- npm run lint executed; existing repo errors/warnings remain unrelated to this change

2026-02-06 10:46:06 WITA

- Implemented retry-until-success scheduler with exponential backoff
- Backoff settings via env: SYNC_RETRY_BASE_MS (default 30000), SYNC_RETRY_MAX_MS (default 300000)
- Status endpoint now includes retrying and retryCount; Admin UI shows "Retrying (Attempt N)"

Verification:

- npx tsc --noEmit ran successfully
- npm run lint executed; existing repo errors/warnings remain unrelated to this change

2026-02-06 10:52:39 WITA

- Tested backend sync end-to-end via run_sync_once script
- Fixed mssql connection pooling to use separate ConnectionPool for Orange and Target DBs
- Qualified target table explicitly as [dbo].[MTIUsers]
- Sync run succeeded: total=1009, updated=4, inserted=0, unchanged=1005

Verification:

- npx tsc --noEmit ran successfully
- npm run lint executed; no new errors (7 existing warnings)

2026-02-06 11:05:28 WITA

- Diagnosed repeated updates: hash mismatch due to phone length truncation
- Added debug script to compare Orange vs target values [backend/scripts/debug_hash_diffs.ts]
- Fixed sync hashing to use trimmed phone before hashing
- Validated sync run: now updated=0, inserted=0, unchanged=1009

Verification:

- npx tsc --noEmit ran successfully
- npm run lint executed; no new errors

2026-02-06 13:25:46 WITA

- Added DataDBEnt connection module [backend/dataDb.ts]
- Created CardDB test script to fetch CardNo/AccessLevel/Name/StaffNo [backend/scripts/test_carddb.ts]
- Verified data retrieval using DATADB_* env from .env

Verification:

- npx tsc --noEmit ran successfully
- npm run lint executed; no new errors

2026-02-06 13:34:19 WITA

- Implemented DataDBEnt → MTIUsers enrichment for CardDB fields (CardNo, AccessLevel, Name, FirstName, LastName, StaffNo)
- Added script with Del_State filter: ISNULL(Del_State,0)=0 [backend/scripts/sync_carddb_to_mtiusers.ts]
- Populated MTIUsers for matched employees; sample run updated 1263 rows

Verification:

- npx tsc --noEmit ran successfully
- npm run lint executed; no new errors

2026-02-06 13:40:05 WITA

- Added per-column filter buttons to Attendance report table headers
- Implemented client-side column filtering for Name, Employee ID, Department, Position, Date, Schedule, C IN/OUT, Actual IN/OUT, Controller, Status
- Verified UI launch via Vite dev server

Verification:

- npx tsc --noEmit ran successfully
- npm run lint executed; no new errors

2026-02-06 13:44:39 WITA

- Converted header filters to searchable dropdowns
- Each column now provides unique value options with search field and "All" reset
- Applied to Name, Employee ID, Department, Position, Date, Schedule, C IN/OUT, Actual IN/OUT, Controller, Status

Verification:

- npx tsc --noEmit ran successfully
- npm run lint executed; no new errors

2026-02-06 09:47:55 WITA

- Computed Status IN/OUT in attendance report when DB does not provide StatusIn/StatusOut
- Added configurable thresholds via env: STATUS_EARLY_MINUTES, STATUS_ONTIME_MINUTES, STATUS_LATE_MINUTES
- Status derives from scheduled vs actual times; defaults: early 10, on-time 5, late 15 minutes

Verification:

- npx tsc --noEmit ran successfully
- npm run lint executed; existing repo errors/warnings remain unrelated to this change

2026-02-05 23:59:07 WITA

- Updated attendance API to derive schedule_label from MTIUsers combos using ScheduledClockIn/Out and next_day
- Sorted attendance results from latest by date and time
- Fixed type narrowing for next_day in attendance route
- Enhanced inspect_attendance script to accept StaffNo argument and print scheduled times
- Verified MTI250115 schedules: mostly 07:00–17:00, with 08:00–17:00 and overnight 19:00–07:00

Verification:

- npx tsc --noEmit ran successfully
- npm run inspect:attendance ran successfully for StaffNo MTI250115

2026-02-06 00:01:05 WITA

- Restricted attendance report default date range to yesterday and today when from/to are not provided

Verification:

- npx tsc --noEmit ran successfully
- npm run lint executed; existing repo errors/warnings remain unrelated to changes

2026-02-06 00:04:30 WITA

- Reverted attendance route: removed default date range filter; route only filters when from/to are explicitly provided

Verification:

- npx tsc --noEmit ran successfully

2026-02-06 00:07:33 WITA

- Checked DB schedules for StaffNo MTI250115 for today and yesterday using inspect script; no rows present for 2026-02-05 and 2026-02-06; latest rows observed are from 2025-10

Verification:

- npm run inspect:attendance -- MTI250115 executed successfully; output shows TrDate and scheduled times for 2025 entries only

2026-02-06 00:10:17 WITA

- Enhanced inspect_attendance script to support last2days range and trim StaffNo in WHERE; verified MTI250115 has a row on 2026-02-05 with schedule 07:00–17:00

Verification:

- npm run inspect:attendance -- MTI250115 last2days executed successfully; output shows the 2026-02-05 entry

2026-02-06 00:26:48 WITA

- Applied WITA (UTC+8) timezone formatting for Actual times in attendance report via formatTimeWita; display remains consistent with DB timezone

Verification:

- npx tsc --noEmit ran successfully
- npm run lint executed; existing repo errors/warnings remain unrelated to this change

2026-02-06 00:29:31 WITA

- Added schedule label fallback to use ScheduledClockIn–ScheduledClockOut when MTIUsers combo is missing (e.g., 15:00–01:00 shows as label)

Verification:

- npx tsc --noEmit ran successfully

2026-02-06 00:32:48 WITA

- Investigated tblAttendanceRecord availability: listed tables with LIKE 'Attendance'; only tblAttendanceReport exists in current DB connection
- Extended inspect script to query either report or record tables and to list tables; record mode shows table missing, explaining mismatch vs expected source

Verification:

- npm run inspect:attendance -- list Attendance executed successfully; output shows tblAttendanceReport only

2026-02-06 00:35:16 WITA

- Fixed schedule time formatting to use UTC hours for SQL time types to avoid timezone shifting (07:00–17:00 remains 07:00–17:00)

Verification:

- npx tsc --noEmit ran successfully

2026-02-06 08:30:36 WITA

- Added server-side search support to attendance API (Name/StaffNo LIKE) and wired Attendance Records page to pass search and department to API; increased limit when searching

Verification:

- npx tsc --noEmit ran successfully

2026-02-06 09:15:31 WITA

- Optimized front-end search with 300ms debounce and StaffNo detection (MTIxxxxxx); reduced server load and improved responsiveness

Verification:

- npx tsc --noEmit ran successfully

2026-02-06 09:19:36 WITA

- Added Search button and Enter-to-search behavior for Attendance Records; eliminated per-keystroke server calls for name searches while keeping instant StaffNo detection

Verification:

- npx tsc --noEmit ran successfully

2026-02-06 09:23:59 WITA

- Enforced WITA (UTC+8) date boundaries in backend when filtering by TrDateTime: convert day range to UTC 16:00(previous day)–15:59:59 for requested WITA range; TrDate filters remain standard

Verification:

- npx tsc --noEmit ran successfully

2026-02-06 09:28:11 WITA

- Reverted Actual C IN/OUT display to UTC in attendance API (using formatTime on TrDateTime); scheduled times remain unshifted

Verification:

- npx tsc --noEmit ran successfully

2026-02-06 09:47:39 WITA

- Implemented unified schedule color mapping; added scheduleColors utility and updated ScheduleBadge to derive color from label/times/overnight; applied in Scheduling page and Attendance schedule column

Verification:

- npx tsc --noEmit ran successfully

2026-02-06 09:48:55 WITA

- Updated attendance schedule column to use Description rather than DayType; backend now prefers Description and only falls back to time-based labels when Description is missing

Verification:

- npx tsc --noEmit ran successfully

2026-02-06 09:53:18 WITA

- Switched ScheduleBadge to render Description when provided; Attendance and Scheduling tables now pass label to ScheduleBadge, so the UI shows descriptions instead of time ranges

Verification:

- npx tsc --noEmit ran successfully
- npm run lint executed; existing repo warnings/errors remain unrelated to this change

2026-02-06 09:54:33 WITA

- Updated ScheduleBadge to strip leading time range from labels (e.g., "07:00–15:00 3 Shift Pagi" shows "3 Shift Pagi"); falls back to time range when no text is present

Verification:

- npx tsc --noEmit ran successfully

2026-02-06 09:56:31 WITA

- Added Employee ID (Staff No) column to Attendance Records table; shows employee_id/StaffNo from API

Verification:

- npx tsc --noEmit ran successfully
- npm run lint executed; existing repo warnings/errors remain unrelated to this change

2026-02-06 09:57:33 WITA

- Widened Attendance Records Schedule column with a min-width to better display descriptions

Verification:

- npx tsc --noEmit ran successfully

2026-02-06 10:04:48 WITA

- Made Attendance Records table fit without horizontal scrolling: reduced font sizes, allowed text wrapping, responsive min-width for Schedule, and max-width for Controller; adjusted table headers to compact styling

Verification:

- npx tsc --noEmit ran successfully

2026-02-06 10:07:30 WITA

- Adjusted Schedule column to fit content width using w-fit + whitespace-nowrap so the column expands just enough to accommodate label text

Verification:

- npx tsc --noEmit ran successfully

2026-02-06 10:24:22 WITA

- Wired Dashboard to real attendance data via /api/attendance/report; removed dependency on mock store for statistics and charts; computed valid/invalid using presence of actual_in/out; built controller chart from controller_out/in

Verification:

- npx tsc --noEmit ran successfully

2026-02-06 10:27:03 WITA

- Added Attendance by Position chart to Dashboard: groups rows by normalized position (Staff, Non Staff, etc) and shows Valid/Invalid bars

Verification:

- npx tsc --noEmit ran successfully

2026-02-06 10:46:04 WITA

- Removed Assignments entry from Admin navigation and Admin Overview quick links, as assignments are handled by another system

Verification:

- npx tsc --noEmit ran successfully

2026-02-06 10:53:52 WITA

- Added Admin Users page and navigation item; lists Users from backend /api/users with search
- Implemented LDAP authentication via backend /api/auth/login using ldapts and wired AdminLogin to call it

Verification:

- Installed ldapts
- npx tsc --noEmit ran successfully

2026-02-06 13:08:38 WITA

- Added local login endpoint using Users table at /api/auth/local/login
- Added AD search and import endpoints under /api/users/ad/search and /api/users/ad/import
- Updated AdminLogin to include method toggle (Active Directory vs Local)
- Updated User Management to add Local and AD users with a dialog

Verification:

- npx tsc --noEmit ran successfully
- npm run lint ran without errors

2026-02-06 13:41:35 WITA

- Updated Docker configuration to use ports 9000 (frontend) and 5000 (backend)
- Changed Vite dev server port to 9000 and backend default port to 5000
- Updated compose environment VITE_BACKEND_URL to point to backend:5000

Verification:

- npx tsc --noEmit ran successfully
- npm run lint ran without errors

2026-02-06 13:43:20 WITA

- Removed MSSQL service from docker-compose; backend now connects to external MSSQL using DB_SERVER env

Verification:

- npx tsc --noEmit ran successfully
- npm run lint ran without errors

2026-02-06 13:47:09 WITA

- Fixed Vite proxy target to not depend on PORT env; it now defaults to http://localhost:5000 when VITE_BACKEND_URL is not set, preventing 403 from misrouted proxies

Verification:

- npx tsc --noEmit ran successfully
- npm run lint ran without errors

2026-02-06 13:49:02 WITA

- Added /api/health and /api/health/db endpoints to verify backend and DB connectivity, to help diagnose 403 issues

Verification:

- npx tsc --noEmit ran successfully
- npm run lint ran without errors

2026-02-06 14:04:24 WITA

- Updated attendanceApi to use absolute backend URL when VITE_BACKEND_URL is set, bypassing dev proxy to eliminate 403 from misrouted requests

Verification:

- npx tsc --noEmit ran successfully
- npm run lint ran without errors

2026-02-06 14:06:52 WITA

- Diagnosed backend port conflict on 5000 using lsof; found process "ControlCe" (PID 501) bound to TCP *:5000
- Prepared remediation steps to free port 5000 for backend dev server

2026-02-06 14:08:59 WITA

- Terminated conflicting process and verified it respawns; switched local dev backend to PORT=5001 and validated /api/health responds 200

2026-02-06 14:12:08 WITA

- Updated schedulingApi, usersApi, controllersApi, and syncApi to honor VITE_BACKEND_URL and build absolute URLs; this bypasses Vite proxy and prevents 403 from misrouted dev proxy targeting port 5000

2026-02-06 14:16:01 WITA

- Set VITE_BACKEND_URL=http://localhost:5001 in .env for local dev to direct frontend API calls to the backend on port 5001 and avoid macOS service on 5000

2026-02-06 14:24:07 WITA

- Ensured .env is excluded from git via .gitignore rule and removed from git index (git rm --cached .env); verified ignore with git check-ignore

2026-02-06 15:33:21 WITA

- Allowed host attendance.merdekabattery.com in Vite dev server via server.allowedHosts to fix 403 “Blocked request” when accessing frontend through that domain

2026-02-06 15:36:21 WITA

- Updated docker-compose web environment to set VITE_BACKEND_URL=https://attendance.merdekabattery.com to avoid mixed content and route API via same HTTPS origin

2026-02-06 15:38:03 WITA

- Configured Vite HMR for HTTPS domain: set server.host=true and server.hmr { protocol: 'wss', host: 'attendance.merdekabattery.com', clientPort: 443 } to fix websocket connection when accessing dev via attendance.merdekabattery.com

2026-02-06 15:39:17 WITA

- Switched backend service in docker-compose to use env_file (.env) and only override PORT=5000; containers now receive DB and LDAP settings from .env without listing each variable in compose

2026-02-06 15:45:46 WITA

- Reverted frontend to use relative /api paths across services and removed uppercase /API alias routes from backend; set VITE_BACKEND_URL=http://backend:5000 for web container to proxy /api internally; simplified Vite HMR to default ws

2026-02-06 15:50:51 WITA

- Added API base helper for frontend; services now build URLs via buildApiUrl respecting VITE_API_BASE_URL and VITE_USE_RELATIVE_API_URL; added Vite proxy rule to rewrite /API to /api; set envs in docker-compose and .env

2026-02-06 15:58:12 WITA

- Fixed Vite dev proxy to read env using loadEnv; proxy target now honors VITE_BACKEND_URL from .env and defaults to http://localhost:5001; prevents 403 when backend runs on 5001 in local dev

2026-02-06 16:04:03 WITA

- Made main content area full width by replacing Tailwind container with w-full max-w-none in MainLayout; attendance table now uses full viewport width, reducing horizontal scroll

2026-02-05 23:28:55 WITA

Dockerized local development environment.

- Added Dockerfile.backend to run Express API via tsx watch
- Added Dockerfile.web to run Vite dev server
- Added docker-compose.yml for web, backend, and MSSQL services
- Updated vite.config.ts to use VITE_BACKEND_URL for proxy target
- Added .dockerignore to reduce build context size

Verification:

- npx tsc --noEmit ran successfully
- npm run lint executed; existing repo warnings/errors remain unrelated to changes

Fri Feb  6 14:10:18 WITA 2026

- Replaced Open Graph and Twitter image URLs from lovable.dev to local /placeholder.svg
- Ensures no external Lovable branding remains in social metadata

Verification:

- npx tsc --noEmit executed successfully
- npm run lint executed successfully
