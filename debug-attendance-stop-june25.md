# Debug Session: attendance-stop-june25 [OPEN]

## Symptom
- Attendance terlihat berhenti di tanggal `2026-06-25`
- Pada tanggal `2026-06-25`, banyak record tampak hanya memiliki satu sisi event:
  - hanya `Clock In`, atau
  - hanya `Clock Out`

## Scope
- Backend attendance ingestion
- Attendance report aggregation
- Schedule by-date dependency after `plan_fix.md` changes

## Initial Hypotheses
1. Watermark ingestion `attendance_ingest_v1` berhenti atau lompat tidak benar setelah perubahan schedule/runner, sehingga data setelah titik tertentu tidak ikut masuk.
2. Schedule by-date hasil perubahan `company_id` membuat sebagian event di `2026-06-25` jatuh ke `Outside Range` atau `No Shift Data`, sehingga hanya satu sisi event yang lolos.
3. Aggregasi route `/api/attendance/report` mengelompokkan event ke `shift-date` yang salah, terutama untuk overnight shift, sehingga tanggal tampak berhenti atau pasangan `IN/OUT` terpecah.
4. Request report untuk range tertentu gagal/timeout di Docker, sehingga UI terlihat seolah data berhenti di `2026-06-25` padahal source/DB lokal masih punya data.
5. Backfill/fix sebelumnya memperbaiki `2026-06-24` tetapi tidak menutup `2026-06-25`, sehingga ada gap data harian yang belum ter-recover.

## Evidence Log
- `DataDBEnt.dbo.tblTransaction` masih memiliki `Valid Entry Access` pada:
  - `2026-06-25`: 3132
  - `2026-06-26`: 3186
  - `2026-06-27`: 3169
  - `2026-06-28`: 1566
- `dbo.tblAttendanceReport` saat ini berhenti di `2026-06-25`
  - `MAX(TrDate) = 2026-06-25`
  - Top date counts:
    - `2026-06-25`: 730
    - `2026-06-24`: 888
    - `2026-06-23`: 886
- `AttendanceJobState.attendance_ingest_v1`:
  - `LastProcessedTrDateTime = 2026-06-25 22:57:20`
  - `LastRunAt = 2026-06-26 02:37:24`
  - no error persisted
- Distribusi `2026-06-25` per staff di DB lokal:
  - `bothPresent = 240`
  - `inOnly = 148`
  - `outOnly = 26`
  - `neither = 7`
  - `noShift = 2`
  - `outsideMixed = 10`
- Route report attendance:
  - membaca `tblAttendanceReport`
  - lalu mengagregasi per `staff|effectiveDate`
  - overnight `Clock Out` sebelum jam 12 dipindah ke tanggal sebelumnya
- Script incremental attendance:
  - memakai `datetime.now()` naif untuk `start/end`
  - menyimpan watermark `LastProcessedTrDateTime` tanpa timezone
  - untuk incremental, `start_datetime = watermark - lookback`, `end_datetime = datetime.now()`

## Next Steps
1. Bedakan apakah gap setelah `2026-06-25 22:57:20` disebabkan timezone/clock proses atau query range incremental
2. Analisa pola `inOnly/outOnly` tanggal `2026-06-25` berdasarkan jenis shift
3. Tentukan hipotesis mana yang confirmed vs rejected sebelum fix
