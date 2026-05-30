## Plan Upgrade: Attendance 10 Menit + Schedule By-Date (Truth) + Sync Terpisah

### Latar Belakang
- Ada gap antara schedule ranHR (Orange, truth per tanggal) vs schedule yang dipakai attendance karena mekanisme lock (`AttendanceScheduleLock`) dapat “membekukan” schedule yang tidak lagi sama dengan Orange untuk shift-date yang sama.
- Orange berada di site berbeda dan high latency, jadi solusi tidak boleh “chatty” (per-employee/per-row realtime).
- Target perubahan: jadikan schedule ranHR sebagai truth per shift-date, tapi disajikan dari cache/snapshot lokal; attendance job dibuat incremental dan idempotent.

---

## Prinsip Desain
- Source of truth schedule untuk report attendance = **by-date (shift-date)**
- Hindari query Orange realtime untuk UI/report massal; gunakan **batch + cache + snapshot per tanggal**
- Pisahkan 3 concern:
  - Ingestion transaksi (10 menit) → fakta scan
  - Schedule sync (5 menit) → audit perubahan dan snapshot current (opsional)
  - Schedule by-date snapshot (prefetch) → truth per tanggal untuk report

---

## Definisi “Schedule” yang Dipakai Attendance (Pilihan Standar)
### Standar yang dipakai: Schedule truth per shift-date (Orange) via snapshot lokal
- Truth = `sp_it_get_day_type(site, staff, date)`
- Untuk mengatasi latency: hasilnya di-materialize di DB lokal per `(StaffNo, ShiftDate)` dan dipakai oleh UI/report.

Catatan:
- `ScheduleChangeLog` tetap dipertahankan untuk audit “siapa berubah kapan”, tapi tidak dipakai sebagai truth by-date untuk attendance.

---

## Phase 0 — Persiapan (Baseline & Observability)
Tujuan:
- Punya baseline mismatch yang repeatable dan bisa dipantau setelah perubahan.

Deliverables:
- Script/runner pembanding:
  - `Orange by-date` vs `ScheduleChangeLog as-of EOD`
  - `Orange by-date` vs `AttendanceScheduleLock` (untuk membuktikan gap lock)
- Dashboard/summary sederhana (jumlah match/mismatch per tanggal).

Exit Criteria:
- Bisa menghasilkan CSV mismatch untuk tanggal tertentu secara deterministik.

---

## Phase 1 — Schedule Snapshot By-Date (Anti Latency)
Tujuan:
- UI/report tidak query Orange realtime, tapi tetap pakai truth by-date.

Deliverables:
1) DB Table baru (local materialized snapshot), contoh:
   - `dbo.OrangeScheduleDaily (StaffNo, ShiftDate, TimeIn, TimeOut, NextDay, DayType, Description, FetchedAt, SourceHash)`
2) Backend job prefetch:
   - Prefetch untuk H dan H-1 (opsional H+1)
   - Pakai batch query `sp_it_get_day_type` dan upsert ke `OrangeScheduleDaily`
3) Endpoint untuk konsumsi UI/report:
   - `GET /api/scheduling/by-date?date=YYYY-MM-DD`
   - `GET /api/scheduling/by-date/employee?employeeId=...&date=...`
4) Endpoint admin untuk trigger manual + status/log prefetch.

Exit Criteria:
- Untuk tanggal tertentu, `OrangeScheduleDaily` match dengan `sp_it_get_day_type` untuk sampel user.
- Query schedule untuk 1000+ user di UI tidak melakukan query Orange langsung.

---

## Phase 2 — Refactor UI /scheduling (By-Date sebagai Default)
Tujuan:
- Menghilangkan kebingungan “snapshot vs historical vs by-date truth” di UI.

Deliverables:
- UI `/scheduling` punya mode/tab:
  - **By Date (Truth)** (default): baca `OrangeScheduleDaily` berdasarkan tanggal yang dipilih.
  - Current Snapshot: baca `MTIUsers` (opsional, untuk kebutuhan operasional).
  - History/As-Of: baca `ScheduleChangeLog` (audit/forensik).
- Clear labeling di UI: “By Date”, “Snapshot”, “History”.

Exit Criteria:
- User bisa pilih tanggal dan melihat schedule truth by-date tanpa query Orange.

---

## Phase 3 — Attendance Ingestion 10 Menit (Incremental & Idempotent)
Tujuan:
- Attendance job hanya ingest transaksi baru, aman dijalankan tiap 10 menit tanpa duplikasi.

Deliverables:
1) DB Table state watermark:
   - `dbo.AttendanceJobState (JobName PK, LastProcessedTrDateTime, LastProcessedCardNo, LastRunAt, LastError)`
2) Idempotency pada `tblAttendanceReport`:
   - Unique key opsi:
     - `(StaffNo, TrDateTime, ClockEvent)` atau
     - `(StaffNo, TrDateTime, TrController, ClockEvent)`
3) Python job diubah:
   - Ambil transaksi incremental (`TrDateTime > watermark` + tie-break)
   - Insert/upsert event scan ke `tblAttendanceReport`
   - “Missing Clock Out” hanya sebagai flag (jangan jadi actual out)

Exit Criteria:
- Running job 10 menit berulang tidak menambah row duplikat.
- Tidak ada “actual_out palsu” dari missing event di UI/report.

---

## Phase 4 — Attendance Report Menggunakan Schedule By-Date (Tanpa Lock)
Tujuan:
- Attendance report menggunakan schedule truth per shift-date dari `OrangeScheduleDaily`, tanpa `AttendanceScheduleLock`.

Deliverables:
- Backend `/api/attendance/report` join/lookup schedule dari `OrangeScheduleDaily` untuk shift-date efektif.
- `AttendanceScheduleLock` tidak lagi dibaca/ditulis oleh pipeline baru.

Exit Criteria:
- Untuk tanggal backdate, schedule di report match `OrangeScheduleDaily` (yang match Orange).

---

## Phase 5 — Push ke Orange (00:00 & 12:00, Idempotent)
Tujuan:
- Push ke `mcg_clocking_tbl` hanya untuk data yang “final” dan idempotent.

Deliverables:
- Definisi “final”:
  - contoh: shift-date <= kemarin, atau sudah ada OUT.
- Flag idempotent:
  - `PushedAt` / `Processed` per record (atau tabel mapping khusus).
- Trigger:
  - jalan di 00:00 dan 12:00 lokal.

Exit Criteria:
- Tidak ada double-push untuk record yang sama.
- Push hanya terjadi untuk record yang memenuhi kriteria final.

---

## Phase 6 — Parallel Run, Validasi, dan Cutover
Tujuan:
- Migrasi aman tanpa kehilangan data/ketidakcocokan besar.

Deliverables:
- Jalankan pipeline baru paralel 1–3 hari:
  - bandingkan output report vs ranHR (sample + aggregate).
- Matikan komponen lama bertahap:
  - stop generate/consume `AttendanceScheduleLock`.

Exit Criteria:
- Mismatch schedule report vs Orange turun drastis dan stabil.
- Operasional harian (UI scheduling/attendance) tidak terganggu.

---

## Risiko & Mitigasi
- Latency Orange tinggi:
  - Mitigasi: snapshot by-date lokal + batch prefetch terjadwal (Phase 1).
- Perubahan schedule di hari H:
  - Mitigasi: truth by-date disajikan dari snapshot per tanggal; definisikan kebijakan kapan data dianggap final untuk push.
- Banyak scan “Valid Entry Access” malam hari dianggap OUT (window out terlalu longgar):
  - Mitigasi: review `CLOCK_OUT_LATE_HOURS` atau ubah rule pemilihan OUT (mis. earliest valid, bukan latest).

---

## Kriteria Sukses (Acceptance Criteria)
- Untuk tanggal tertentu (backdate), schedule report match dengan truth `sp_it_get_day_type` (via `OrangeScheduleDaily`).
- Job attendance 10 menit idempotent (tanpa duplikasi).
- Missing clock-out tidak mengisi actual out (hanya status).
- Push Orange idempotent dan hanya untuk record final.
