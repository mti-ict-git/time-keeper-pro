# Functional Specification

## Operations API

An authorized operator can:

1. Compare one employee's Orange/RANHR schedule with `OrangeScheduleDaily` for up to 31 days.
2. Backfill schedules for selected employees or all Orange employees for up to 120 days.
3. Rebuild attendance from DataDBEnt for one employee or all MTI employees for up to 31 days.
4. Preview attendance rows eligible for forwarding.
5. Forward pending rows or idempotently replay previously processed rows to Orange/RANHR.
6. Poll asynchronous mutation jobs by ID.

All operations require an API key and an allowed source IP. All-user, replace, and replay mutations require `confirm: true`.

