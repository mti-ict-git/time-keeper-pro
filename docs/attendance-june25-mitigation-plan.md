# Attendance June 25 Mitigation Plan

## Scope
- Investigate why attendance around `2026-06-25` looks inconsistent.
- Explain why many rows show only `Clock In` or only `Clock Out`.
- Define a safe mitigation plan before changing business logic.

## Local Runtime Baseline
- Frontend local is running on `http://localhost:9000`.
- Backend local is running on `http://localhost:5001`.
- `http://localhost:5000` is not this project backend on this machine. It responds from another local service, so local validation must use port `5001`.

## Local Evidence Summary

### Backend Health
- `GET /api/health` on `localhost:5001` returns `200`.
- `GET /api/attendance/runner/status` shows the runner is enabled and the last run succeeds.
- This means the current local issue is not primarily "runner stopped forever on June 25".

### Attendance Report Evidence
- `GET /api/attendance/report?from=2026-06-25&to=2026-06-28&limit=20000` returns rows with these effective dates:
  - `2026-06-28`
  - `2026-06-27`
  - `2026-06-26`
  - `2026-06-25`
  - `2026-06-24`
- This is already a red flag because a query starting from `2026-06-25` still returns rows with `date=2026-06-24`.

- `GET /api/attendance/report?from=2026-06-26&to=2026-06-28&limit=20000` still returns rows with `date=2026-06-25`.
- This confirms the API range filter is not aligned with the final shift-date shown in the response.

### June 25 Pattern
- `GET /api/attendance/report?from=2026-06-25&to=2026-06-25&limit=20000` returns many one-sided rows.
- The strongest cluster is `23:00-07:00` overnight schedule:
  - `both = 1`
  - `inOnly = 97`
  - `outOnly = 93`
  - `neither = 1`

### What This Means
- The problem is dominated by overnight shifts.
- `Clock In` and `Clock Out` pairs are being split across different query windows.
- The final report date is being adjusted after raw rows have already been filtered by raw transaction date/time.

## Confirmed Root Cause

### Primary Cause
The `/api/attendance/report` route filters raw `tblAttendanceReport` rows by raw date columns first, then derives `effectiveDate` for overnight `Clock Out`.

That order is unsafe for overnight logic because:
- a raw row can pass the SQL filter for one calendar date,
- then be reassigned in memory to a different shift-date,
- causing range results to "leak" into previous or next dates.

### Practical Impact
- Querying `2026-06-25` can still show rows whose final `date` becomes `2026-06-24`.
- Querying `2026-06-26..2026-06-28` can still show rows whose final `date` becomes `2026-06-25`.
- Many overnight employees appear as `Clock In only` or `Clock Out only` because the pair is split by the report window.

## Secondary Findings
- The local UI issue is real because the API itself already returns inconsistent shift-date grouping.
- The current local setup must use backend port `5001`. Port `5000` should not be used for local debugging on this machine.

## Mitigation Plan

### Phase 1 - Immediate Safe Mitigation
Goal: make report results correct for date range queries without changing ingestion first.

Actions:
1. In `/api/attendance/report`, keep collecting raw rows needed for the range.
2. Derive `effectiveDate` first for each row.
3. Aggregate by `(StaffNo, effectiveDate)`.
4. Apply the final `from/to` filter against `effectiveDate`, not against only the raw SQL date window.

Expected result:
- Query `2026-06-25` only returns rows with final `date=2026-06-25`.
- Query `2026-06-26..2026-06-28` no longer returns `date=2026-06-25`.
- Overnight pairs stop appearing artificially split by the report window.

Risk:
- Slightly more in-memory processing for large ranges.

### Phase 2 - Stabilize Raw Fetch Window for Overnight Rows
Goal: avoid missing overnight partner rows near date boundaries.

Actions:
1. When a report query includes date range `from/to`, expand the raw SQL fetch window by a safety margin:
   - fetch one extra day before `from`
   - fetch one extra day after `to`
2. Continue filtering only after `effectiveDate` is known.

Expected result:
- Overnight `Clock Out` rows early in the morning are available for the previous shift-date.
- Overnight `Clock In` rows late at night are available for the next morning pair.

Risk:
- Larger raw dataset for the route, but still manageable for a max 31-day range.

### Phase 3 - Define a First-Class Shift Date
Goal: remove ambiguity between raw transaction date and attendance shift-date.

Actions:
1. Introduce a normalized `ShiftDate` concept in the reporting pipeline.
2. Prefer storing or deriving `ShiftDate` consistently from the same rule set.
3. Ensure every aggregation and filter uses `ShiftDate` as the primary attendance date.

Expected result:
- Report logic becomes deterministic.
- Overnight handling becomes easier to reason about and test.

Risk:
- Requires careful regression validation because this touches the reporting contract.

### Phase 4 - Validation Matrix
Goal: verify the fix against the exact failure mode seen on June 25.

Validation queries:
1. `from=2026-06-25&to=2026-06-25`
2. `from=2026-06-26&to=2026-06-28`
3. `from=2026-06-25&to=2026-06-28`

Validation expectations:
1. No returned row may have `date` outside the requested final range.
2. Overnight `23:00-07:00` should no longer dominate with split `inOnly` and `outOnly`.
3. Known sample employees should keep the same raw scans but land on the correct final shift-date.

### Phase 5 - Regression Protection
Goal: keep this issue from returning after future schedule or report changes.

Actions:
1. Add targeted tests for overnight aggregation.
2. Add at least one fixture covering:
   - `Clock In` before midnight
   - `Clock Out` after midnight
   - final report grouped under the previous shift-date
3. Add one test that proves date range filtering uses final shift-date semantics.

## Recommended Order
1. Fix report filtering to use `effectiveDate`.
2. Expand raw fetch window around the requested range.
3. Re-validate local API outputs for `2026-06-25`.
4. Re-check the local UI table.
5. Add regression tests.

## Non-Goals For The First Fix
- Do not modify attendance ingestion logic yet.
- Do not change WhatsApp push logic.
- Do not change Orange schedule prefetch logic in the first mitigation step.

## Success Criteria
- Local API range results contain only dates inside the requested final range.
- June 25 overnight rows no longer appear massively split into `Clock In only` and `Clock Out only` because of report-window mismatch.
- Local UI reflects the corrected grouping without manual data repair.
