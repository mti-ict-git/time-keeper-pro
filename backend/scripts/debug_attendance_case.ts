
import { getPool } from "../db";
import { formatDate, formatTime } from "../utils/format";

async function main() {
  try {
    const pool = await getPool();
    const staffNo = "MTI230143";
    
    // Fetch logs from Feb 5 to Feb 8 to cover surrounding days
    const res = await pool.request().query(`
      SELECT * 
      FROM tblAttendanceReport 
      WHERE StaffNo = '${staffNo}'
      AND TrDate >= '2026-02-05' AND TrDate <= '2026-02-08'
      ORDER BY TrDateTime ASC
    `);
    
    const rows = res.recordset;
    console.log(`\n=== Raw Logs for ${staffNo} ===`);
    rows.forEach((r: any) => {
      console.log(`${formatDate(r.TrDate)} ${formatTime(r.TrDateTime)} | Event: ${r.ClockEvent} | Sched: ${formatTime(r.ScheduledClockIn)}-${formatTime(r.ScheduledClockOut)}`);
    });

    console.log(`\n=== Aggregation Logic Simulation ===`);
    const agg = new Map<string, any>();

    for (const r of rows) {
      const obj = r as any;
      const staff = obj.StaffNo;
      const dateRaw = obj.TrDate;
      const dtRaw = obj.TrDateTime;
      const ev = String(obj.ClockEvent || "").toLowerCase();
      
      const schedIn = formatTime(obj.ScheduledClockIn);
      const schedOut = formatTime(obj.ScheduledClockOut);
      
      let effectiveDateStr = formatDate(dateRaw);
      let shifted = false;
      
      if (schedIn && schedOut) {
        const [hi, mi] = schedIn.split(":");
        const [ho, mo] = schedOut.split(":");
        const minI = Number(hi) * 60 + Number(mi);
        const minO = Number(ho) * 60 + Number(mo);
        const nextDay = minO <= minI;

        if (nextDay && ev.includes("out")) {
           const actual = formatTime(dtRaw);
           if (actual) {
             const [ah] = actual.split(":").map(Number);
             // Shift if clock out is before noon
             if (ah < 12) {
               const d = new Date(dateRaw);
               d.setDate(d.getDate() - 1);
               effectiveDateStr = formatDate(d);
               shifted = true;
             }
           }
        }
      }

      const key = `${staff}|${effectiveDateStr}`;
      const prev = agg.get(key);
      const next: any = prev ?? {
        date: effectiveDateStr,
        actual_in: "",
        actual_out: "",
        scheduled_in: schedIn,
        scheduled_out: schedOut
      };

      const actual = formatTime(dtRaw);
      
      if (ev.includes("in")) {
         const existing = String(next.actual_in || "");
         next.actual_in = existing && actual ? (existing < actual ? existing : actual) : actual || existing;
      }
      if (ev.includes("out")) {
         const existing = String(next.actual_out || "");
         next.actual_out = existing && actual ? (existing > actual ? existing : actual) : actual || existing;
      }
      
      console.log(`Processing Log: ${formatTime(dtRaw)} (${ev}) -> Assigned to Date: ${effectiveDateStr} ${shifted ? "[SHIFTED]" : ""}`);
      agg.set(key, next);
    }

    console.log(`\n=== Final Aggregated Result ===`);
    agg.forEach((val, key) => {
      console.log(`Date: ${val.date} | In: ${val.actual_in || "N/A"} | Out: ${val.actual_out || "N/A"} | Sched: ${val.scheduled_in}-${val.scheduled_out}`);
    });

  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}

main();
