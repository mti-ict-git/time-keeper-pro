# Debug Session: attendance-stop-june25 [OPEN]

## Symptoms
- Attendance report/data lokal berhenti di tanggal `2026-06-25`.
- Pada `2026-06-25`, banyak employee hanya punya satu sisi event: `Clock In` saja atau `Clock Out` saja.

## Hypotheses
1. Runner incremental memakai `now`/timezone yang salah, sehingga range query terpotong dan tidak pernah mengejar transaksi setelah `2026-06-25`.
2. Watermark `attendance_ingest_v1` maju ke nilai yang salah atau terlalu agresif, sehingga sebagian transaksi valid terlewati.
3. Logic klasifikasi `Clock In/Clock Out` untuk shift overnight menyebabkan pasangan event `2026-06-25 -> 2026-06-26` pecah dan hanya satu sisi yang tersimpan.
4. Perubahan `plan_fix` pada schedule/company mapping memperbaiki `No Shift Data`, tetapi meninggalkan data parsial/placeholder yang membuat agregasi report tampak satu sisi.
5. Data source transaksi setelah `2026-06-25` ada, tetapi ingestion lokal gagal/skip karena filter controller, duplicate/idempotency, atau aturan insert.

## Evidence To Collect
- Status dan log runner attendance yang sedang berjalan.
- Nilai watermark `attendance_ingest_v1`.
- Rentang tanggal maksimum di source transaksi vs tabel lokal `tblAttendanceReport`.
- Distribusi pola `both/inOnly/outOnly/noShift` untuk `2026-06-25`.
- Sample 1-2 employee untuk validasi source vs local vs report.

## Notes
- Tidak ada perubahan business logic pada tahap awal sesi ini.

## Evidence Log
- `GET /api/attendance/runner/status` saat ini menunjukkan runner sehat dan sudah memproses `2026-06-28`, dengan `lastRun.success=true`.
- `GET /api/attendance/report?from=2026-06-25&to=2026-06-28&limit=20000` mengembalikan `1622` row dengan distribusi date:
  - `2026-06-28: 208`
  - `2026-06-27: 442`
  - `2026-06-26: 444`
  - `2026-06-25: 435`
  - `2026-06-24: 93`
- `GET /api/attendance/report?from=2026-06-26&to=2026-06-28&limit=20000` masih mengandung `date=2026-06-25`.
- `GET /api/attendance/report?from=2026-06-25&to=2026-06-25&limit=20000` mengembalikan `514` row dengan pola:
  - `both=241`
  - `inOnly=147`
  - `outOnly=119`
  - `neither=7`
- Untuk schedule `23:00-07:00`, pola pada query `2026-06-25` sangat dominan satu sisi:
  - `both=1`
  - `inOnly=97`
  - `outOnly=93`
  - `neither=1`

## Interim Conclusion
- Hipotesis 1 (`runner berhenti di 25 Juni`) saat ini tidak lagi berlaku pada runtime terbaru.
- Hipotesis 3 paling kuat: route report memfilter raw row berdasarkan `TrDate/TrDateTime` terlebih dahulu, lalu baru menggeser `effectiveDate` untuk overnight `Clock Out`; akibatnya range filter dan grouping shift-date menjadi tidak konsisten.
- Gejala yang dihasilkan:
  - query range `26-28` masih memunculkan `date=25`
  - query `25` bisa membawa row yang secara effective date menjadi `24`
  - pasangan overnight banyak terbelah menjadi `inOnly` atau `outOnly`
