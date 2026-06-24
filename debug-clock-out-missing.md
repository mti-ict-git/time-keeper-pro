# Debug Session: clock-out-missing
- **Status**: [OPEN]
- **Issue**: Clock out appears as missing/N/A for many employees on 2026-06-24 even though current time is already past scheduled end time.
- **Debug Server**: Pending startup
- **Log File**: .dbg/trae-debug-log-clock-out-missing.ndjson

## Reproduction Steps
1. Open attendance records for date `2026-06-24`.
2. Inspect rows with schedule out times `16:00`, `17:00`, or `18:00`.
3. Observe `Actual C OUT = N/A` and `OUT: Missing` for many rows.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | Attendance runner is failing or stalling, so late-day out transactions are not ingested into `tblAttendanceReport`. | High | Med | Pending |
| B | Source transactions exist, but out scans are being classified into the wrong shift/date bucket and therefore do not surface as same-day `actual_out`. | High | Med | Pending |
| C | Out scans exist in `tblAttendanceReport`, but report aggregation/query logic drops or misassigns them. | Med | Med | Pending |
| D | Controller/source filters exclude some valid out transactions, so only a small subset reaches the ingestion pipeline. | Med | Med | Pending |
| E | Some employees truly have no out scan yet, but the scale of missing rows is amplified by a runtime issue elsewhere. | Low | Low | Pending |

## Log Evidence
- `GET /api/attendance/runner/status` on `2026-06-24 23:02 WITA` showed repeated runner failures with `durationMs ≈ 300000`, `success=false`, `exitCode=null`, `error="Exited with code null"`, and empty stdout/stderr.
- `dbo.AttendanceRunnerLogs` confirms a repeating pattern every 15 minutes:
  - `timestamp=2026-06-24 19:24:32` through `22:09:32`
  - `durationMs` consistently around `300010-300036`
  - `success=false`, `exitCode=null`, `stdout=''`, `stderr=''`
- `dbo.AttendanceJobState` for `attendance_ingest_v1` is stale:
  - `LastProcessedTrDateTime = 2026-06-24 07:59:48`
  - `LastRunAt = 2026-06-24 02:52:34`
- `dbo.tblAttendanceReport` for `TrDate='2026-06-24'` contains very few out rows:
  - `Clock In = 298`
  - `Clock Out = 13`
  - `Outside Range = 9`
  - `No Shift Data = 1`
- Raw source transactions in `DataDBEnt.dbo.tblTransaction` continue well into the evening for `MTI*`, e.g. `22:43-23:06`, proving out-side scans exist upstream.
- Existing code evidence in `backend/routes/attendance.ts`:
  - `attRunTimeoutMs` defaults to `5 * 60 * 1000`
  - `runAttendancePythonWithArgs()` force-kills the Python child after that timeout
  - This matches the runtime pattern exactly.

## Verification Conclusion
- Hypothesis A: **Confirmed**. Attendance runner is being force-killed after 5 minutes, preventing late-day transactions from being ingested.
- Hypothesis B: **Not primary**. Some clock-out classification may still deserve review, but the dominant issue is upstream ingestion interruption.
- Hypothesis C: **Rejected as primary**. Report aggregation reflects what little `Clock Out` data exists in `tblAttendanceReport`; it is not the main cause of missing rows.
- Hypothesis D: **Possible secondary factor**. Source contains controllers outside the current FR list, but this does not explain the hard 5-minute failure pattern.
- Hypothesis E: **Rejected as primary**. The scale of missing outs cannot be explained by normal behavior alone because raw evening transactions exist while ingestion state is stale.

## Fix Applied
- Added minimal runtime instrumentation to `backend/routes/attendance.ts` for:
  - runner spawn
  - timeout trigger
  - child process close
- Changed runner timeout strategy:
  - default timeout increased from 5 minutes to 30 minutes
  - `ATTENDANCE_RUN_TIMEOUT_MS=0` is now supported to disable timeout entirely
  - timeout-related failures now resolve as `Timed out after ...` instead of the misleading `Exited with code null`
- Set local env override:
  - `ATTENDANCE_RUN_TIMEOUT_MS=1800000`

## Pending Verification
- Rebuild/restart backend container
- Trigger attendance runner again
- Confirm `AttendanceRunnerLogs` no longer shows repeated ~300000ms failures
- Confirm `Clock Out` rows for `2026-06-24` increase materially after re-ingestion
