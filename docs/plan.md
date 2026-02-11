Time-Keeper Stabilization Plan (MTIUsers-Centric Locking + Smart Cutover)

Goal
- Stabilize clock-event classification even when MTIUsers schedules change mid-shift
- Respect overnight shifts and allow up to +8h overtime on Clock Out
- Avoid retroactive reclassification of scans while using MTIUsers as the single schedule source

Policy Summary
- Clock In window: [ScheduledIn − 5h, ScheduledIn + 60m]
- Clock Out window: [ScheduledOut − 60m, ScheduledOut + 8h]
  - Normal segment: +0m…+180m
  - Overtime segment: +180m…+480m (ranHR calculates overtime)
- If no Clock Out by ScheduledOut + 8h, mark "Missing Clock Out" and close the shift
- Schedule changes never apply mid-shift; they take effect at the next occurrence of ScheduledIn after a safe boundary

Two Systems
- Python job (attendance_report_modv7.py): runs 12:00 AM and 12:00 PM
- time-keeper-pro sync service: runs every 5 minutes, mirrors ranHR into EmployeeWorkflow.MTIUsers

Phase 0 — Alignment
- Confirm event windows, overtime cap, overnight handling, and cutover rules (complete)
- Confirm duplicate protection: StaffNo + TrDateTime unique, no reinsert with different ClockEvent
- Authoritative schedule source is MTIUsers; no direct reads from CardDBTimeSchedule

Phase 1 — Data Model (SQL Server)
- AttendanceScheduleLock (snapshot per staff+shift-date)
  - StaffNo (PK part), ShiftDate (PK part), ScheduledIn, ScheduledOut, NextDay, LockedAt, SourceHash/Label
  - Index: (StaffNo, ShiftDate)
- ScheduleChangeLog (audit of MTIUsers changes, written by sync service)
  - StaffNo, ChangedAt, TimeInNew, TimeOutNew, NextDayNew, SourceHash
  - Index: (StaffNo, ChangedAt)
- Rationale: snapshot stabilizes classification; change log provides visibility without forcing reclassification

Phase 2 — Sync Service (every 5 minutes)
- Continue updating MTIUsers from ranHR using env DB credentials
- On detected differences, append ScheduleChangeLog row
- Do not touch AttendanceScheduleLock; lock is owned by the Python job

Phase 3 — Python Job (12 AM/PM)
- For each staff and observed shift date in the processing window:
  - Load AttendanceScheduleLock; if absent, create using MTIUsers schedule at first scan (or job time if no scan yet)
  - Classify scans using the locked schedule and event windows
  - Overnight handling: assign morning Clock Out to previous shift date based on locked NextDay
- Smart Cutover when MTIUsers changes:
  - Boundary = ScheduledOut_locked if an Out exists; otherwise ScheduledOut_locked + 8h
  - New schedule becomes active at the next occurrence of its ScheduledIn strictly after Boundary
- Write results
  - tblAttendanceReport: Clock In/Out/Missing Clock Out, store ScheduledClockIn/Out from the lock
  - mcg_clocking_tbl: only Clock In/Out (ranHR handles overtime); do not send Missing Clock Out
- Idempotency
  - Use StaffNo + TrDateTime to avoid duplicates across runs

Phase 4 — Backfill & Migration
- Initialize AttendanceScheduleLock for current day using first scan per staff
- For days without scans, optionally skip or create lock on demand
- Verify change log is recording schedule edits but not altering locks mid-shift

Phase 5 — Test Scenarios

Test Setup (applies to all scenarios)
- Choose 1 test employee (StaffNo) with predictable scans and schedule edits
- Use WITA timestamps consistently for inputs and expectations
- Ensure ScheduleChangeLog rows exist for each schedule edit event
- Run modv7 in dry-run mode for safe validation of classification and shift-date assignment

Validation Queries (reusable)
- ScheduleChangeLog
  - SELECT TOP 50 StaffNo, ChangedAt, TimeInNew, TimeOutNew, NextDayNew FROM dbo.ScheduleChangeLog WHERE StaffNo = @StaffNo ORDER BY ChangedAt;
- AttendanceScheduleLock
  - SELECT StaffNo, ShiftDate, ScheduledIn, ScheduledOut, NextDay, LockedAt FROM dbo.AttendanceScheduleLock WHERE StaffNo = @StaffNo AND ShiftDate BETWEEN @StartDate AND @EndDate ORDER BY ShiftDate;
- Raw transactions (source)
  - SELECT TOP 200 Cdb.StaffNo, Lt.TrDateTime, Lt.TrController FROM dbo.tblTransaction Lt INNER JOIN dbo.CardDB Cdb ON Cdb.CardNo = Lt.CardNo WHERE Cdb.StaffNo = @StaffNo AND Lt.TrDateTime BETWEEN @StartDT AND @EndDT ORDER BY Lt.TrDateTime;

Execution (dry-run)
- Single date
  - python backend/attendance_report_modv7.py --date YYYY-MM-DD --staff-no MTIxxxxxx --dry-run
- Date range
  - python backend/attendance_report_modv7.py --start-date YYYY-MM-DD --end-date YYYY-MM-DD --staff-no MTIxxxxxx --dry-run

Scenario 5.1 — Day shift change at 10:00; user clocks out normally
- Given
  - Original schedule: ScheduledIn=A, ScheduledOut=B, NextDay=0
  - Schedule change at 10:00 to: ScheduledIn=C, ScheduledOut=D, NextDay=0
  - Scans: Clock In near A; Clock Out near B
- Expect
  - For ShiftDate=scan date of Clock In, the lock remains A→B for the whole shift
  - The change becomes active only at the next occurrence of ScheduledIn after Boundary
  - No reclassification of the already-processed shift

Scenario 5.2 — Night shift change at 02:00; user clocks out at 07:10
- Given
  - Locked overnight schedule: ScheduledIn=A, ScheduledOut=B, NextDay=1
  - Schedule change at 02:00 to a new schedule
  - Scans: Clock In near A; Clock Out at 07:10 (morning)
- Expect
  - 07:10 Clock Out is assigned to the previous ShiftDate based on locked NextDay=1
  - Lock for that shift remains the original overnight schedule
  - New schedule activates at the next ScheduledIn strictly after Boundary

Scenario 5.3 — Night shift change at 02:00; user never clocks out
- Given
  - Locked overnight schedule: ScheduledIn=A, ScheduledOut=B, NextDay=1
  - Schedule change at 02:00 to a new schedule
  - Scans: Clock In near A; no Clock Out scan
- Expect
  - A "Missing Clock Out" row is generated at ScheduledOut + 8h
  - The boundary uses ScheduledOut + 8h (because Out does not exist)
  - New schedule activates only after that boundary

Scenario 5.4 — Early clock-in at −4h; late clock-out at +7h (overtime segment)
- Given
  - Locked schedule: ScheduledIn=A, ScheduledOut=B
  - Scans: Clock In at A−4h; Clock Out at B+7h
- Expect
  - Clock In is classified as Clock In (within early window)
  - Clock Out is classified as Clock Out (within +8h cap)
  - Overtime is not split into multiple events in mcg_clocking_tbl (ranHR computes overtime)

Scenario 5.5 — Multiple same-day changes (2→3); verify next ScheduledIn activation
- Given
  - Two schedule edits occur after the shift starts, producing 2 ScheduleChangeLog rows
  - Scans cover at least one complete locked shift
- Expect
  - Only the next ScheduledIn strictly after Boundary determines when a new schedule becomes active
  - Intermediate changes do not cause mid-shift lock swaps or retroactive reclassification

Phase 6 — Monitoring & Alerts
- Daily report: Staff, ShiftDate, Scheduled vs Actual, duration, overtime, Missing Clock Out
- Optional alert when passing +8h without Clock Out

Phase 7 — Rollout
- Dry-run modv7 alongside current job for 2 cycles; compare tblAttendanceReport outputs
- Enable mcg_clocking_tbl writing from modv7 after validation
- Keep change log for audit; periodically review anomaly rates

Acceptance Criteria
- No reclassification of previously processed scans when ranHR schedules change
- Overnight shifts unaffected by edits made during the night
- Overtime accepted up to +8h and counted by ranHR
- Clear Missing Clock Out labeling after +8h without Out

Notes
- All implementation changes should target attendance_report_modv7.py
- Python job must read schedules exclusively from MTIUsers (no CardDBTimeSchedule queries)
- Sync service remains responsible only for mirroring ranHR to MTIUsers and logging changes
