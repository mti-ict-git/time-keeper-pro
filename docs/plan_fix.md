## Plan Fix — MTIBJ Schedule (Company ID) + Attendance “No Shift Data”

### Background
- Schedule by-date dibaca dari Orange function `dbo.sp_it_get_day_type(company_id, staff_no, date)`.
- Untuk `MTI*`, `company_id = MTI` menghasilkan schedule normal.
- Untuk `MTIBJ*`, schedule ada tapi `company_id` berbeda (contoh: `MTIB`). Jika kita panggil pakai `MTI`, hasilnya kosong → `OrangeScheduleDaily.TimeIn/TimeOut` menjadi NULL → attendance jatuh ke `No Shift Data`.
- Side effect lain: saat schedule sudah benar, ingestion bisa menghasilkan `Clock In/Out` untuk timestamp yang sama dan berpotensi “double record” karena dulu sudah terlanjur ada `No Shift Data`.

---

## Phase 0 — Confirm & Baseline (No Code Change)
**Goal:** pastikan mapping `company_id` dan scope karyawan yang terdampak.

Step-by-step:
1. Manual test Orange untuk 2 contoh:
   - MTI employee: `MTI230279` dengan `company_id=MTI`.
   - MTIBJ employee: `MTIBJ007` dengan `company_id=MTIB` (atau yang benar).
2. Verify di DB aplikasi:
   - `dbo.OrangeScheduleDaily` untuk MTIBJ: ada row tapi `TimeIn/TimeOut` NULL.
   - `dbo.tblAttendanceReport` ada `ClockEvent='No Shift Data'` pada MTIBJ.

Exit criteria:
1. Mapping prefix → `company_id` sudah jelas minimal:
   - `MTI* -> MTI`
   - `MTIBJ* -> MTIB`
2. Ada minimal 1 contoh MTIBJ yang confirm keluar schedule kalau pakai `MTIB`.

---

## Phase 1 — Make Company ID Prefix-Aware (Backend Prefetch Schedule)
**Goal:** `OrangeScheduleDaily` terisi `TimeIn/TimeOut` untuk MTI dan MTIBJ.

Step-by-step:
1. Implement mapping function di backend (konsep):
   - `employeeId.startsWith("MTIBJ") ? "MTIB" : "MTI"` (default ke env).
2. Update prefetch schedule (yang mengisi `dbo.OrangeScheduleDaily`) agar:
   - Split employeeIds jadi 2 group berdasarkan mapping company_id.
   - Query Orange TVF 2x (per company_id) untuk tanggal yang sama.
   - Merge hasilnya dan `upsert` ke `dbo.OrangeScheduleDaily`.
3. Update endpoint yang read by-date (optional tapi recommended):
   - Endpoint “By Date (Truth)” tetap baca dari `dbo.OrangeScheduleDaily` (cache), tapi pastikan prefetch sudah benar.
4. Tambahkan env opsional untuk konfigurasi mapping (biar fleksibel):
   - `ORANGE_COMPANY_ID_DEFAULT=MTI`
   - `ORANGE_COMPANY_ID_MTIBJ=MTIB`
   - (Jika ada prefix lain, tambah variabel baru atau satu env map).

Verification:
1. Prefetch 1 tanggal untuk sample MTIBJ memastikan `OrangeScheduleDaily.TimeIn/TimeOut` non-null.
2. Manual check `MTIBJ007`:
   - `OrangeScheduleDaily` untuk tanggal yang sama berisi `TimeIn/TimeOut`.

Exit criteria:
- `dbo.OrangeScheduleDaily` untuk MTIBJ tidak lagi NULL (minimal untuk hari yang diprefetch).

---

## Phase 2 — Backfill `OrangeScheduleDaily` (Repair Existing Dates)
**Goal:** perbaiki data schedule historis yang sudah terlanjur NULL.

Step-by-step:
1. Tentukan range backfill (contoh 30 hari terakhir).
2. Jalankan prefetch per-hari untuk range tersebut (bisa via endpoint admin atau script run-once):
   - Batas aman: batch per tanggal agar tidak overload Orange DB.
3. Pastikan row yang sebelumnya NULL di-update (by PK `(StaffNo, ShiftDate)`).

Verification:
1. Spot-check beberapa MTIBJ:
   - `ShiftDate` yang dulu NULL sekarang berisi `TimeIn/TimeOut`.
2. Pastikan `FetchedAt` dan `SourceHash` berubah untuk row yang updated.

Exit criteria:
- Untuk range yang disepakati, `nullTimeCnt` MTIBJ turun signifikan (idealnya 0).

---

## Phase 3 — Prevent Duplicate “No Shift Data” vs “Clock In/Out” (Ingestion Fix)
**Goal:** setelah schedule beres, ingestion tidak bikin duplikasi dan placeholder dibersihkan otomatis.

Policy:
- Jika ingestion menghasilkan event valid (`Clock In/Clock Out`) untuk `(StaffNo, TrDateTime, TrController)`,
  maka jika ada row existing dengan `ClockEvent='No Shift Data'` pada key yang sama, delete/replace row tersebut sebelum insert event valid.

Step-by-step:
1. Update logic insert `tblAttendanceReport` di python:
   - Before insert `Clock In/Out`, cari “placeholder” `No Shift Data` untuk key yang sama.
   - Delete placeholder lalu insert event valid.
2. Pastikan idempotency tetap aman:
   - Existing check tetap jalan untuk `(StaffNo, TrDateTime, TrController, ClockEvent)`.
3. Logging:
   - Tambahkan counter “replacedNoShift” (opsional) agar mudah audit.

Verification:
1. Pilih 1 MTIBJ employee yang dulu `No Shift Data`, re-run ingestion untuk 1 hari:
   - Row `No Shift Data` berkurang dan diganti `Clock In/Clock Out`.
2. Pastikan tidak ada duplikasi event untuk timestamp yang sama.

Exit criteria:
- Ingestion aman berjalan setelah schedule fix tanpa menambah “noise” `No Shift Data`.

---

## Phase 4 — Cleanup (Optional, One-Off)
**Goal:** bersihkan backlog `No Shift Data` yang tidak akan pernah bisa dikonversi.

Step-by-step:
1. Tentukan aturan cleanup:
   - Hanya MTIBJ
   - Hanya tanggal < “cutover date”
   - Hanya yang `Processed=1` dan `ClockEvent='No Shift Data'`
2. Jalankan SQL delete terkontrol (backup dulu jika perlu).
3. (Opsional) simpan hasil sebelum delete sebagai CSV untuk audit.

Exit criteria:
- Data report lebih bersih; jumlah `No Shift Data` turun drastis.

---

## Phase 5 — Ops & Deployment Checklist
**Goal:** memastikan production berjalan “1 sistem” dan mudah dicek.

Step-by-step:
1. Set env (production):
   - `ORANGE_COMPANY_ID_DEFAULT=MTI`
   - `ORANGE_COMPANY_ID_MTIBJ=MTIB`
   - `TR_CONTROLLER_LIST=ALL` (kalau mau semua controller masuk)
2. Rebuild + restart backend container.
3. Trigger:
   - Prefetch by-date untuk hari ini & kemarin.
   - Run attendance runner sekali (`/api/attendance/runner/run`).
4. Validasi:
   - `GET /api/attendance/runner/status` enabled/nextRunAt.
   - Spot-check `OrangeScheduleDaily` untuk MTIBJ hari ini.
   - Spot-check attendance report untuk 1 MTIBJ: schedule tidak lagi N/A.

Exit criteria:
- MTIBJ schedule terisi by-date, attendance tidak lagi massal `No Shift Data`, runner stabil.
