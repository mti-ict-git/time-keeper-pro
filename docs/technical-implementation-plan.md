# Technical Implementation Plan

## Operations gateway

`backend/routes/operations.ts` is mounted at `/api/operations`. It reuses typed schedule functions and invokes the existing attendance Python processor with validated arguments. It never accepts executable paths or commands from requests.

Mutations run asynchronously, one at a time. State is recorded in `dbo.OperationsJobs`; current-process jobs also expose live progress from memory.

Authentication uses `X-Operations-Key` with constant-time comparison. Network access is restricted using `OPERATIONS_ALLOWED_IPS`, supporting individual IPv4 addresses and IPv4 CIDR rules.

Attendance replay is idempotent at the Orange target through the existing `(finger_print_id, date_time, function_key)` lookup.

