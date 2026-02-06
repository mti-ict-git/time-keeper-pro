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
- npm run lint executed; existing repo warnings/errors remain unrelated to changes

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
