import { Router, Request, Response } from "express";
import sql from "mssql";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { getPool } from "../db";
import { getDataDbPool } from "../dataDb";
import { getTableColumns } from "../utils/introspection";
import { formatTime, formatDate, toBoolNextDay } from "../utils/format";

export const attendanceRouter = Router();

// Non-MTI contractor companies to surface read-only on /attendance.
// This never writes to tblAttendanceReport, so it can never reach the
// RanHR/MCG push (which only reads tblAttendanceReport rows with StaffNo LIKE 'MTI%').
// CardDB.Company is free text, so one company shows up under several
// spellings ("PT Agi Perkasa Konstruksi" vs "PT. AGI PERKASA KONSTRUKSI").
// Each pattern carries the canonical name reported to the client so those
// variants collapse into a single company in the table and its filter.
const CONTRACTOR_COMPANIES = [
  { name: "PT Cahaya Berkah Morowali", like: "%Cahaya Berkah Morowali%" },
  { name: "PT Triatra Sinergia Pratama", like: "%Triatra%" },
  { name: "PT Agi Perkasa Konstruksi", like: "%Agi Perkasa Konstruksi%" },
  { name: "PT Dale Esa Gardatama", like: "%Dale Esa Gardatama%" },
  { name: "PT Global Arrow", like: "%Global Arrow%" },
  { name: "PT Hajampo Asia Mineral", like: "%Hajampo Asia Mineral%" },
  { name: "PT Widya Industrial Multiteknik", like: "%Widya Ind%Multiteknik%" },
];
const CONTRACTOR_COMPANY_PATTERNS = CONTRACTOR_COMPANIES.map((c) => c.like);
const CONTRACTOR_DEFAULT_WINDOW_DAYS = 7;
const CONTRACTOR_QUERY_TIMEOUT_MS = 60000;

// Mirrors the SQL LIKE patterns above so the same rows match in both places.
const CONTRACTOR_COMPANY_MATCHERS = CONTRACTOR_COMPANIES.map((c) => ({
  name: c.name,
  pattern: new RegExp(`^${c.like.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`, "i"),
}));

function canonicalCompany(raw: string): string {
  const value = raw.trim();
  const match = CONTRACTOR_COMPANY_MATCHERS.find((m) => m.pattern.test(value));
  return match ? match.name : value;
}

attendanceRouter.get("/contractors", async (req: Request, res: Response) => {
  try {
    const queryParams = req.query as Record<string, unknown>;
    const fromParam = typeof queryParams.from === "string" ? queryParams.from : "";
    const toParam = typeof queryParams.to === "string" ? queryParams.to : "";
    // Mirrors /report: a single picked date means that one day, not an open range.
    const from = fromParam || toParam;
    const to = toParam || fromParam;
    const search = typeof queryParams.search === "string" ? queryParams.search.trim() : "";
    const limitParam = typeof queryParams.limit === "string" ? Number(queryParams.limit) : undefined;
    // Caps raw scans read, not grouped rows: a wide range aggregates many
    // scans into far fewer rows, so this has to stay well above the row count
    // the table shows or the oldest days in the range get silently dropped.
    const maxLimit = 20000;
    const limit =
      Number.isFinite(limitParam || NaN) && (limitParam as number) > 0
        ? Math.min(Math.floor(limitParam as number), maxLimit)
        : 5000;

    if (from && to) {
      const fromDate = new Date(`${from}T00:00:00Z`);
      const toDate = new Date(`${to}T00:00:00Z`);
      const diffDays = Math.floor((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000));
      if (!Number.isFinite(diffDays) || diffDays < 0) {
        res.status(400).json({ error: "Invalid date range" });
        return;
      }
      if (diffDays > 31) {
        res.status(400).json({ error: "Date range too large (max 31 days)" });
        return;
      }
    }

    const pool = await getDataDbPool();

    // Step 1: resolve the contractor cards from CardDB alone. Joining CardDB
    // to the 4M-row tblTransaction with leading-wildcard Company LIKEs makes
    // the optimizer scan the whole table and blows past the request timeout,
    // so the card set is resolved first and used as a sargable filter below.
    const cardReq = pool.request();
    cardReq.requestTimeout = CONTRACTOR_QUERY_TIMEOUT_MS;
    const companyParts = CONTRACTOR_COMPANY_PATTERNS.map((pattern, i) => {
      cardReq.input(`company${i}`, sql.NVarChar, pattern);
      return `Company LIKE @company${i}`;
    });
    const cardConditions = [
      "ISNULL(Del_State, 0) = 0",
      "CardNo IS NOT NULL AND CardNo <> ''",
      `(${companyParts.join(" OR ")})`,
    ];
    if (search) {
      cardReq.input("searchLike", sql.NVarChar, `%${search}%`);
      cardConditions.push("(Name LIKE @searchLike OR StaffNo LIKE @searchLike OR Company LIKE @searchLike)");
    }
    const cardRes = await cardReq.query(`
      SELECT CardNo, Name, Title, Position, Department, Company, StaffNo
      FROM dbo.CardDB
      WHERE ${cardConditions.join(" AND ")}
    `);
    const cardRows = (cardRes.recordset ?? []) as unknown as Array<{
      CardNo: string | null;
      Name: string | null;
      Title: string | null;
      Position: string | null;
      Department: string | null;
      Company: string | null;
      StaffNo: string | null;
    }>;

    const cardMap = new Map<string, (typeof cardRows)[number]>();
    for (const c of cardRows) {
      const cardNo = String(c.CardNo ?? "").trim();
      // Card numbers are DB-internal identifiers; anything outside this
      // charset is not safe to inline below, so it is skipped.
      if (cardNo && /^[A-Za-z0-9]+$/.test(cardNo)) cardMap.set(cardNo, c);
    }
    if (cardMap.size === 0) {
      res.json({ data: [] });
      return;
    }

    // Step 2: tblTransaction has no index on TrDateTime or CardNo, but it does
    // have one keyed on TrDate ('YYYY/MM/DD'), so the window is always bounded
    // on that column. Without an explicit range, fall back to a recent window
    // instead of scanning the full history.
    function toTrDate(ymd: string): string {
      return ymd.replace(/-/g, "/");
    }
    function shiftDays(ymd: string, days: number): string {
      const d = new Date(`${ymd}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0, 10);
    }
    const today = formatDate(new Date());
    const rangeTo = to || today;
    const rangeFrom = from || shiftDays(rangeTo, -CONTRACTOR_DEFAULT_WINDOW_DAYS);

    const txReq = pool.request();
    txReq.requestTimeout = CONTRACTOR_QUERY_TIMEOUT_MS;
    txReq.input("from", sql.VarChar, toTrDate(rangeFrom));
    txReq.input("to", sql.VarChar, toTrDate(rangeTo));
    const cardList = Array.from(cardMap.keys())
      .map((c) => `'${c}'`)
      .join(",");
    const txRes = await txReq.query(`
      SELECT TOP (${limit}) CardNo, TrDateTime, TrDate, TrController
      FROM dbo.tblTransaction
      WHERE [Transaction] = 'Valid Entry Access'
        AND TrDate BETWEEN @from AND @to
        AND CardNo IN (${cardList})
      ORDER BY TrDateTime DESC
    `);
    const txRows = (txRes.recordset ?? []) as unknown as Array<{
      CardNo: string | null;
      TrDateTime: Date;
      TrDate: string | null;
      TrController: string | null;
    }>;

    // Step 3: group scans into one row per employee per day and emit the same
    // field names as /report, so the attendance table renders contractors
    // through the exact same columns. schedule_label/scheduled_* and status_*
    // stay empty: contractors have no MTIUsers schedule to compare against,
    // so the table shows them as N/A rather than inventing one.
    const grouped = new Map<
      string,
      {
        employee_id: string;
        employee_name: string;
        company: string;
        department: string;
        position: string;
        date: string;
        scans: Array<{ time: Date; controller: string }>;
      }
    >();

    for (const t of txRows) {
      const cardNo = String(t.CardNo ?? "").trim();
      const card = cardMap.get(cardNo);
      if (!card || !(t.TrDateTime instanceof Date)) continue;
      const staffNo = String(card.StaffNo ?? "").trim();
      if (!staffNo) continue;
      // TrDate is the transaction's own local calendar day; use it directly
      // rather than re-deriving one from TrDateTime.
      const date = String(t.TrDate ?? "").trim().replace(/\//g, "-") || formatDate(t.TrDateTime);
      const key = `${staffNo}|${date}`;
      const entry = grouped.get(key) ?? {
        employee_id: staffNo,
        employee_name: String(card.Name ?? "").trim(),
        company: canonicalCompany(String(card.Company ?? "")),
        department: String(card.Department ?? "").trim(),
        position: String(card.Position ?? card.Title ?? "").trim(),
        date,
        scans: [],
      };
      entry.scans.push({ time: t.TrDateTime, controller: String(t.TrController ?? "").trim() });
      grouped.set(key, entry);
    }

    // Step 4: pick up whatever schedule the prefetch has cached for these
    // staff/date pairs. Contractors only resolve in Orange under their own
    // company id, so many rows are still blank while RanHR registers them —
    // a missing schedule is expected here, not an error.
    const scheduleMap = new Map<string, { scheduledIn: string; scheduledOut: string; label: string }>();
    const staffNos = Array.from(new Set(Array.from(grouped.values()).map((g) => g.employee_id)));
    if (staffNos.length > 0) {
      try {
        const mtiPool = await getPool();
        const schedReq = mtiPool.request();
        schedReq.input("staffNos", sql.NVarChar(sql.MAX), JSON.stringify(staffNos));
        schedReq.input("from", sql.Date, new Date(`${rangeFrom}T00:00:00Z`));
        schedReq.input("to", sql.Date, new Date(`${rangeTo}T00:00:00Z`));
        const schedRes = await schedReq.query(`
          SELECT d.StaffNo, d.ShiftDate, d.TimeIn, d.TimeOut, d.DayType, d.Description
          FROM dbo.OrangeScheduleDaily d
          INNER JOIN OPENJSON(@staffNos) AS s ON d.StaffNo = s.value
          WHERE d.ShiftDate BETWEEN @from AND @to
        `);
        for (const row of (schedRes.recordset ?? []) as Array<Record<string, unknown>>) {
          const staffNo = String(row["StaffNo"] ?? "").trim();
          const shiftDate = formatDate(row["ShiftDate"]);
          if (!staffNo || !shiftDate) continue;
          scheduleMap.set(`${staffNo}|${shiftDate}`, {
            scheduledIn: formatTime(row["TimeIn"]),
            scheduledOut: formatTime(row["TimeOut"]),
            label: String(row["Description"] ?? row["DayType"] ?? ""),
          });
        }
      } catch {
        // A schedule lookup failure must not take the scan listing down.
        scheduleMap.clear();
      }
    }

    const data = Array.from(grouped.values())
      .map((g) => {
        const sorted = g.scans.slice().sort((a, b) => a.time.getTime() - b.time.getTime());
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const hasOut = sorted.length > 1;
        const sched = scheduleMap.get(`${g.employee_id}|${g.date}`);
        return {
          employee_id: g.employee_id,
          employee_name: g.employee_name,
          company: g.company,
          department: g.department,
          position: g.position,
          date: g.date,
          schedule_label: sched?.label ?? "",
          scheduled_in: sched?.scheduledIn ?? "",
          scheduled_out: sched?.scheduledOut ?? "",
          // tblTransaction stores local wall-clock time and the driver reads
          // it back as UTC, so formatTime (UTC getters) yields the wall-clock
          // value. Shifting to WITA here would double-count the offset.
          actual_in: formatTime(first.time),
          actual_out: hasOut ? formatTime(last.time) : "",
          controller_in: first.controller,
          controller_out: hasOut ? last.controller : "",
          status_in: "",
          status_out: "",
        };
      })
      .sort((a, b) => (a.date === b.date ? a.employee_id.localeCompare(b.employee_id) : b.date < a.date ? -1 : 1));

    res.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

attendanceRouter.get("/report/schema", async (_req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const columns = await getTableColumns(pool, "tblAttendanceReport");
    res.json({ columns });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

attendanceRouter.get("/report", async (req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const cols = await getTableColumns(pool, "tblAttendanceReport");
    const queryParams = req.query as Record<string, unknown>;
    const fromParam = typeof queryParams.from === "string" ? queryParams.from : "";
    const toParam = typeof queryParams.to === "string" ? queryParams.to : "";
    // The range picker sends the first click as `from` with no `to` yet. Only
    // filtering when both are present dropped the filter entirely, so a single
    // picked date returned unrelated days. Treat one bound as that single day.
    const from = fromParam || toParam;
    const to = toParam || fromParam;
    const search = typeof queryParams.search === "string" ? queryParams.search.trim() : "";
    const employeeId = typeof queryParams.employeeId === "string" ? queryParams.employeeId : "";
    const department = typeof queryParams.department === "string" ? queryParams.department : "";
    const employeeGroup = typeof queryParams.employeeGroup === "string" ? queryParams.employeeGroup.trim().toLowerCase() : "";
    const limitParam = typeof queryParams.limit === "string" ? Number(queryParams.limit) : undefined;
    const maxLimit = 20000;
    const limit = Number.isFinite(limitParam || NaN) && (limitParam as number) > 0
      ? Math.min(Math.floor(limitParam as number), maxLimit)
      : 200;

    if (from && to) {
      const fromDate = new Date(`${from}T00:00:00Z`);
      const toDate = new Date(`${to}T00:00:00Z`);
      const diffDays = Math.floor((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000));
      if (!Number.isFinite(diffDays) || diffDays < 0) {
        res.status(400).json({ error: "Invalid date range" });
        return;
      }
      if (diffDays > 31) {
        res.status(400).json({ error: "Date range too large (max 31 days)" });
        return;
      }
    }

    const request = pool.request();
    const conditions: string[] = [];
    const hasDateRange = Boolean(from && to);

    function shiftYmd(dateStr: string, days: number): string {
      const d = new Date(`${dateStr}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0, 10);
    }

    function isDateWithinRange(dateStr: string, start: string, end: string): boolean {
      return dateStr >= start && dateStr <= end;
    }

    const dateCandidates = ["trdate", "trdatetime", "date", "attendance_date", "record_date", "event_date"];
    const dateColumn = dateCandidates.find((n) => cols.some((c) => c.name.toLowerCase() === n)) ||
      (cols.find((c) => c.dataType.toLowerCase().includes("date"))?.name ?? "");

    if (from && to && dateColumn) {
      const rawFrom = shiftYmd(from, -1);
      const rawTo = shiftYmd(to, 1);
      const isDateTimeCol = dateColumn.toLowerCase().includes("datetime");
      if (isDateTimeCol) {
        request.input("from", sql.DateTime, new Date(`${rawFrom}T16:00:00Z`));
        request.input("to", sql.DateTime, new Date(`${rawTo}T15:59:59Z`));
      } else {
        request.input("from", sql.DateTime, new Date(`${rawFrom}T00:00:00`));
        request.input("to", sql.DateTime, new Date(`${rawTo}T23:59:59`));
      }
      conditions.push(`[${dateColumn}] BETWEEN @from AND @to`);
    }

    const empIdCandidates = ["employee_id", "employeeid", "emp_id", "empid", "StaffNo"];
    const empIdColumns = empIdCandidates.filter((n) => cols.some((c) => c.name.toLowerCase() === n.toLowerCase()));
    const staffExpr = empIdColumns.length
      ? `COALESCE(${empIdColumns.map((c) => `NULLIF(RTRIM(LTRIM([${c}])), '')`).join(", ")}, '')`
      : "";
    if (employeeId && empIdColumns.length) {
      request.input("employeeId", sql.NVarChar, employeeId);
      const eqParts = empIdColumns.map((c) => `RTRIM(LTRIM([${c}])) = RTRIM(LTRIM(@employeeId))`);
      conditions.push(`(${eqParts.join(" OR ")})`);
    }

    if (employeeGroup && employeeGroup !== "all" && staffExpr) {
      if (employeeGroup === "expatriate") {
        conditions.push(`${staffExpr} LIKE 'MTIBJ%'`);
      } else if (employeeGroup === "indonesia") {
        conditions.push(`${staffExpr} <> '' AND ${staffExpr} NOT LIKE 'MTIBJ%'`);
      }
    }

    const deptCandidates = ["department", "dept", "Department"];
    const deptColumn = deptCandidates.find((n) => cols.some((c) => c.name.toLowerCase() === n.toLowerCase()));
    if (department && deptColumn) {
      request.input("department", sql.NVarChar, department);
      conditions.push(`[${deptColumn}] = @department`);
    }

    if (search) {
      const nameCandidates = ["Name", "employee_name", "name"];
      const nameCols = nameCandidates.filter((n) => cols.some((c) => c.name.toLowerCase() === n.toLowerCase()));
      const staffCols = empIdCandidates.filter((n) => cols.some((c) => c.name.toLowerCase() === n.toLowerCase()));
      request.input("searchLike", sql.NVarChar, `%${search}%`);
      const likeParts: string[] = [];
      for (const nc of nameCols) likeParts.push(`[${nc}] LIKE @searchLike`);
      for (const sc of staffCols) likeParts.push(`RTRIM(LTRIM([${sc}])) LIKE @searchLike`);
      if (likeParts.length) conditions.push(`(${likeParts.join(" OR ")})`);
    }

    const whereClause = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
    const timeCol = ["trdatetime"].find((n) => cols.some((c) => c.name.toLowerCase() === n)) || "";
    const orderClause = dateColumn ? ` ORDER BY [${dateColumn}] DESC${timeCol ? `, [${timeCol}] DESC` : ""}` : "";
    const queryLimit = hasDateRange ? Math.min(maxLimit, Math.max(limit * 3, limit + 500)) : limit;
    const query = `SELECT TOP (${queryLimit}) * FROM tblAttendanceReport${whereClause}${orderClause}`;
    const result = await request.query(query);
    const rows = (result.recordset ?? []) as unknown as Array<Record<string, unknown>>;

    const comboQuery =
      "SELECT description, CONVERT(varchar(5), time_in, 108) AS time_in, CONVERT(varchar(5), time_out, 108) AS time_out, next_day FROM MTIUsers GROUP BY description, CONVERT(varchar(5), time_in, 108), CONVERT(varchar(5), time_out, 108), next_day";
    const comboRes = await pool.request().query(comboQuery);
    const comboRows = (comboRes.recordset ?? []) as Array<Record<string, unknown>>;
    const comboMap = new Map<string, string>();
    for (const r of comboRows) {
      const ti = formatTime(r["time_in"]);
      const to = formatTime(r["time_out"]);
      const rawNd = r["next_day"] as string | number | boolean | null | undefined;
      const nd = toBoolNextDay(rawNd ?? null);
      const label = String(r["description"] ?? "");
      const key = `${ti}|${to}|${nd ? 1 : 0}`;
      if (ti && to && label) comboMap.set(key, label);
    }

    

    const earlyThreshold = Number(process.env.STATUS_EARLY_MINUTES || 10);
    const onTimeThreshold = Number(process.env.STATUS_ONTIME_MINUTES || 5);
    const lateThreshold = Number(process.env.STATUS_LATE_MINUTES || 15);

    function toMin(s: string): number {
      const parts = s.split(":");
      const h = Number(parts[0] || 0);
      const m = Number(parts[1] || 0);
      return h * 60 + m;
    }

    function computeStatus(sched: string, actual: string, isIn: boolean): string {
      if (!sched) return "";
      if (!actual) return "Missing";
      const sm = toMin(sched);
      const am = toMin(actual);
      const diff = isIn ? sm - am : am - sm;
      if (isIn) {
        if (diff > earlyThreshold) return "Early";
        if (diff >= -onTimeThreshold) return "On Time";
        if (diff >= -lateThreshold) return "Late";
        return "Late";
      } else {
        if (diff < -earlyThreshold) return "Early";
        if (diff <= onTimeThreshold) return "On Time";
        return "Late";
      }
    }

    function appendSourceIssue(existing: string, issue: string): string {
      const nextIssue = issue.trim();
      if (!nextIssue) return existing;
      const current = existing
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean);
      if (current.includes(nextIssue)) return existing;
      return current.length ? `${current.join("; ")}; ${nextIssue}` : nextIssue;
    }

    const agg = new Map<string, Record<string, unknown>>();
    for (const r of rows) {
      const obj = r as Record<string, unknown>;
      const staff = String(obj["StaffNo"] ?? obj["employee_id"] ?? obj["employeeid"] ?? obj["EmpID"] ?? obj["emp_id"] ?? obj["empid"] ?? "");
      const name = obj["Name"] ?? obj["employee_name"] ?? obj["name"] ?? "";
      const dept = obj["Department"] ?? obj["department"] ?? obj["dept"] ?? "";
      const position = obj["Position"] ?? obj["position_title"] ?? obj["position"] ?? obj["Title"] ?? "";
      const dateRaw = obj["TrDate"] ?? obj["trdate"] ?? obj["date"] ?? obj["attendance_date"] ?? obj["record_date"] ?? "";
      const dtRaw = obj["TrDateTime"] ?? obj["trdatetime"] ?? "";
      const evRaw = obj["ClockEvent"] ?? obj["clock_event"] ?? "";
      const ev = String(evRaw).trim().toLowerCase();
      const isClockIn = ev === "clock in" || ev === "in";
      const isClockOut = ev === "clock out" || ev === "out";
      const isMissingClockOut = ev === "missing clock out";

      // Determine the effective date (shift date)
      // If it's an overnight shift and we are clocking out in the morning, 
      // it belongs to the previous day's shift.
      const schedIn = formatTime(obj["ScheduledClockIn"] ?? obj["scheduled_clock_in"] ?? obj["scheduledin"] ?? "");
      const schedOut = formatTime(obj["ScheduledClockOut"] ?? obj["scheduled_clock_out"] ?? obj["scheduledout"] ?? "");
      
      let effectiveDateStr = formatDate(dateRaw);
      
      if (schedIn && schedOut) {
        const [hi, mi] = schedIn.split(":");
        const [ho, mo] = schedOut.split(":");
        const minI = Number(hi) * 60 + Number(mi);
        const minO = Number(ho) * 60 + Number(mo);
        const nextDay = minO <= minI;

        if (nextDay && isClockOut) {
           const actual = formatTime(dtRaw);
           if (actual) {
             const [ah] = actual.split(":").map(Number);
             // If clock out is before noon (12:00), assume it belongs to previous day
             if (ah < 12) {
               const d = new Date(dateRaw as string | Date);
               d.setDate(d.getDate() - 1);
               effectiveDateStr = formatDate(d);
             }
           }
        }
      }

      const key = `${staff}|${effectiveDateStr}`;
      const prev = agg.get(key);
      const next: Record<string, unknown> = prev ?? {
        employee_id: staff,
        employee_name: String(name),
        department: String(dept),
        position_title: String(position),
        date: effectiveDateStr,
        schedule_label: String(obj["Description"] ?? obj["Schedule"] ?? obj["ScheduleName"] ?? ""),
        scheduled_in: "",
        scheduled_out: "",
        actual_in: "",
        actual_out: "",
        controller_in: "",
        controller_out: "",
        status_in: String(obj["StatusIn"] ?? obj["status_in"] ?? obj["statusin"] ?? ""),
        status_out: String(obj["StatusOut"] ?? obj["status_out"] ?? obj["statusout"] ?? ""),
        source_issue: "",
      };
      
      if (schedIn) next["scheduled_in"] = schedIn;
      if (schedOut) next["scheduled_out"] = schedOut;
      if (schedIn && schedOut) {
        const [hi, mi] = schedIn.split(":");
        const [ho, mo] = schedOut.split(":");
        const minI = Number(hi) * 60 + Number(mi);
        const minO = Number(ho) * 60 + Number(mo);
        const nextDay = minO <= minI;
        const comboKey = `${schedIn}|${schedOut}|${nextDay ? 1 : 0}`;
        const labelFromCombo = comboMap.get(comboKey);
        if (!String(next["schedule_label"])) {
          if (labelFromCombo) next["schedule_label"] = labelFromCombo;
          else next["schedule_label"] = `${schedIn}-${schedOut}`;
        }
      }
      const actual = formatTime(dtRaw);
      if (isClockIn) {
        const existing = String(next["actual_in"] || "");
        next["actual_in"] = existing && actual ? (existing < actual ? existing : actual) : actual || existing;
        const ctrl = String(obj["TrController"] ?? obj["controller_name"] ?? obj["Controller"] ?? "");
        if (ctrl) next["controller_in"] = ctrl;
        const s = String(next["status_in"] || "");
        if (!s) {
          const si = String(next["scheduled_in"] || "");
          const ai = String(next["actual_in"] || "");
          next["status_in"] = computeStatus(si, ai, true);
        }
      }
      if (isMissingClockOut) {
        const s = String(next["status_out"] || "");
        if (!s) next["status_out"] = "Missing";
      }
      if (isClockOut) {
        const existing = String(next["actual_out"] || "");
        next["actual_out"] = existing && actual ? (existing > actual ? existing : actual) : actual || existing;
        const ctrl = String(obj["TrController"] ?? obj["controller_name"] ?? obj["Controller"] ?? "");
        if (ctrl) next["controller_out"] = ctrl;
        const s = String(next["status_out"] || "");
        if (!s) {
          const so = String(next["scheduled_out"] || "");
          const ao = String(next["actual_out"] || "");
          next["status_out"] = computeStatus(so, ao, false);
        }
      }
      if (!isClockIn && !isClockOut && !isMissingClockOut) {
        next["source_issue"] = appendSourceIssue(String(next["source_issue"] ?? ""), String(evRaw ?? ""));
      }
      agg.set(key, next);
    }

    type ScheduleDailyRow = {
      StaffNo: string;
      ShiftDate: Date | string;
      TimeIn: unknown;
      TimeOut: unknown;
      NextDay: string | number | boolean | null;
      DayType: string | null;
      Description: string | null;
    };

    const pairs = Array.from(agg.values())
      .map((v) => ({
        staffNo: String(v["employee_id"] ?? ""),
        shiftDate: String(v["date"] ?? ""),
      }))
      .filter((p) => p.staffNo.length > 0 && p.shiftDate.length > 0);

    const scheduleMap = new Map<string, { scheduledIn: string; scheduledOut: string; nextDay: boolean; label: string }>();
    if (pairs.length > 0) {
      try {
        const scheduleReq = pool.request();
        scheduleReq.input("pairs", sql.NVarChar(sql.MAX), JSON.stringify(pairs));
        const q = `
          WITH p AS (
            SELECT
              staffNo,
              shiftDate
            FROM OPENJSON(@pairs)
            WITH (
              staffNo NVARCHAR(50) '$.staffNo',
              shiftDate DATE '$.shiftDate'
            )
          )
          SELECT
            p.staffNo AS StaffNo,
            p.shiftDate AS ShiftDate,
            d.TimeIn,
            d.TimeOut,
            d.NextDay,
            d.DayType,
            d.Description
          FROM p
          LEFT JOIN dbo.OrangeScheduleDaily AS d
            ON d.StaffNo = p.staffNo AND d.ShiftDate = p.shiftDate
        `;
        const scheduleRes = await scheduleReq.query(q);
        const scheduleRows = (scheduleRes.recordset ?? []) as unknown as ScheduleDailyRow[];
        for (const r of scheduleRows) {
          const staffNo = String(r.StaffNo ?? "").trim();
          const shiftDate = formatDate(r.ShiftDate);
          const scheduledIn = formatTime(r.TimeIn);
          const scheduledOut = formatTime(r.TimeOut);
          const nextDay = toBoolNextDay(r.NextDay);
          const label = String(r.Description ?? r.DayType ?? "");
          if (staffNo && shiftDate) {
            scheduleMap.set(`${staffNo}|${shiftDate}`, { scheduledIn, scheduledOut, nextDay, label });
          }
        }
      } catch {
        scheduleMap.clear();
      }
    }

    for (const v of agg.values()) {
      const staffNo = String(v["employee_id"] ?? "");
      const shiftDate = String(v["date"] ?? "");
      const sched = scheduleMap.get(`${staffNo}|${shiftDate}`);
      if (sched) {
        v["scheduled_in"] = sched.scheduledIn;
        v["scheduled_out"] = sched.scheduledOut;
        if (sched.label && !String(v["schedule_label"] ?? "").length) v["schedule_label"] = sched.label;
      }
      const si = String(v["scheduled_in"] ?? "");
      const so = String(v["scheduled_out"] ?? "");
      const ai = String(v["actual_in"] ?? "");
      const ao = String(v["actual_out"] ?? "");
      const sourceIssue = String(v["source_issue"] ?? "");
      v["status_in"] = computeStatus(si, ai, true);
      v["status_out"] = computeStatus(so, ao, false);
      if (sourceIssue) {
        const issueLabel = `Source Issue (${sourceIssue})`;
        if (!ai && !ao) {
          v["status_in"] = issueLabel;
          v["status_out"] = issueLabel;
        } else if (!ai) {
          v["status_in"] = issueLabel;
        } else if (!ao) {
          v["status_out"] = issueLabel;
        }
      }
    }

    const data = Array.from(agg.values())
      .filter((row) => {
        if (!hasDateRange) return true;
        return isDateWithinRange(String(row["date"] ?? ""), from, to);
      })
      .sort((a, b) => String(b["date"] || "").localeCompare(String(a["date"] || "")));
    res.json({ data, scheduleSource: scheduleMap.size > 0 ? "OrangeScheduleDaily" : "tblAttendanceReport" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

type AttendanceRunLog = {
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  success: boolean;
  exitCode: number | null;
  error?: string;
  stdout?: string;
  stderr?: string;
};

let attLastRun: AttendanceRunLog | null = null;
let attRunning = false;
let attIntervalMinutes = process.env.ATTENDANCE_INTERVAL_MINUTES ? Number(process.env.ATTENDANCE_INTERVAL_MINUTES) : 10;
let attEnabled = String(process.env.ATTENDANCE_ENABLED ?? "").trim().toLowerCase() === "true";
let attNextRunAt: Date | null = null;
let attTimer: NodeJS.Timeout | null = null;
let attPushLimit = process.env.ATTENDANCE_PUSH_LIMIT ? Number(process.env.ATTENDANCE_PUSH_LIMIT) : 5000;
let attPushWindowMinutes = process.env.ATTENDANCE_PUSH_WINDOW_MINUTES ? Number(process.env.ATTENDANCE_PUSH_WINDOW_MINUTES) : 15;
let attLookbackMinutes = process.env.ATTENDANCE_LOOKBACK_MINUTES ? Number(process.env.ATTENDANCE_LOOKBACK_MINUTES) : 2;
const attPythonExe = (process.env.ATTENDANCE_PYTHON ?? "").trim() || "python";
const attScriptRel = (process.env.ATTENDANCE_SCRIPT ?? "").trim() || "backend/attendance_report_modv8_1.py";
const attJobName = (process.env.ATTENDANCE_JOB_NAME ?? "").trim() || "attendance_ingest_v1";
const attWaid = (process.env.ATTENDANCE_WAID ?? "").trim();
const defaultAttRunTimeoutMs = 30 * 60 * 1000;
const attRunTimeoutMsRaw = process.env.ATTENDANCE_RUN_TIMEOUT_MS ? Number(process.env.ATTENDANCE_RUN_TIMEOUT_MS) : defaultAttRunTimeoutMs;
const attRunTimeoutMs = Number.isFinite(attRunTimeoutMsRaw) && attRunTimeoutMsRaw >= 0
  ? Math.floor(attRunTimeoutMsRaw)
  : defaultAttRunTimeoutMs;
const attUseDbSettings = String(process.env.ATTENDANCE_USE_DB_SETTINGS ?? "")
  .trim()
  .toLowerCase() === "true";

function logRunner(event: string, payload: Record<string, unknown> = {}): void {
  const base = { event, at: new Date().toISOString() };
  console.log(`[AttendanceRunner] ${JSON.stringify({ ...base, ...payload })}`);
}

function parseRunnerSummary(stdout: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const mTotal = stdout.match(/Total transactions retrieved:\s*(\d+)/i);
  const mProcessed = stdout.match(/Total transactions processed.*:\s*(\d+)/i);
  const mValid = stdout.match(/Valid transactions.*:\s*(\d+)/i);
  const mInvalid = stdout.match(/Invalid transactions.*:\s*(\d+)/i);
  const mInsert = stdout.match(/Data insertion to tblAttendanceReport completed:\s*(\d+)\s+new,\s*(\d+)\s+skipped/i);
  const mPush = stdout.match(/Pushed to mcg_clocking_tbl:\s*(\d+)\s+rows,\s*skipped:\s*(\d+)/i);
  if (mTotal) out.totalRetrieved = Number(mTotal[1]);
  if (mProcessed) out.totalProcessed = Number(mProcessed[1]);
  if (mValid) out.valid = Number(mValid[1]);
  if (mInvalid) out.invalid = Number(mInvalid[1]);
  if (mInsert) {
    out.newInserted = Number(mInsert[1]);
    out.insertSkipped = Number(mInsert[2]);
  }
  if (mPush) {
    out.pushed = Number(mPush[1]);
    out.pushSkipped = Number(mPush[2]);
  }
  return out;
}

function extractExportedCsvName(stdout: string): string | null {
  const m = stdout.match(/Data exported to\s+(.+?)\s+successfully\./i);
  return m ? m[1].trim() : null;
}

function parseCsvRow(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}

async function readCsvPreview(csvName: string, maxRows = 20): Promise<{
  fileName: string;
  totalRows: number;
  previewRows: Record<string, string>[];
  controllers: string[];
}> {
  const csvPath = path.resolve(process.cwd(), csvName);
  const raw = await readFile(csvPath, "utf8");
  const lines = raw.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) {
    return { fileName: path.basename(csvPath), totalRows: 0, previewRows: [], controllers: [] };
  }

  const headers = parseCsvRow(lines[0]);
  const previewRows: Record<string, string>[] = [];
  const controllers = new Set<string>();
  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvRow(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] ?? "";
    });
    const controller = row.TrController ?? row.Controller ?? row.controller ?? "";
    if (controller) controllers.add(controller);
    if (previewRows.length < maxRows) previewRows.push(row);
  }

  try {
    await unlink(csvPath);
  } catch (err) {
    void err;
  }

  return {
    fileName: path.basename(csvPath),
    totalRows: Math.max(0, lines.length - 1),
    previewRows,
    controllers: Array.from(controllers).sort((a, b) => a.localeCompare(b)),
  };
}

function runAttendancePythonWithArgs(args: string[], envOverride?: Record<string, string | undefined>): Promise<AttendanceRunLog> {
  const startedAt = new Date();
  return new Promise<AttendanceRunLog>((resolve) => {
    const env = envOverride ? { ...process.env, ...envOverride } : process.env;
    const child = spawn(attPythonExe, args, { cwd: process.cwd(), env, windowsHide: true });
    let out = "";
    let err = "";
    let settled = false;
    let timedOut = false;
    let hardTimeout: NodeJS.Timeout | null = null;
    const timeout = attRunTimeoutMs > 0 ? setTimeout(() => {
      timedOut = true;
      try {
        child.kill();
      } catch {
        hardTimeout = setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {
            void 0;
          }
          const finishedAt = new Date();
          if (settled) return;
          settled = true;
          resolve({
            startedAt,
            finishedAt,
            durationMs: finishedAt.getTime() - startedAt.getTime(),
            success: false,
            exitCode: null,
            error: `Timed out after ${attRunTimeoutMs}ms`,
            stdout: out,
            stderr: err,
          });
        }, 5000);
        return;
      }

      hardTimeout = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          void 0;
        }
        const finishedAt = new Date();
        if (settled) return;
        settled = true;
        resolve({
          startedAt,
          finishedAt,
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          success: false,
          exitCode: null,
          error: `Timed out after ${attRunTimeoutMs}ms`,
          stdout: out,
          stderr: err,
        });
      }, 5000);
    }, attRunTimeoutMs) : null;
    const resolveOnce = (log: AttendanceRunLog): void => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (hardTimeout) clearTimeout(hardTimeout);
      resolve(log);
    };


    child.stdout.on("data", (d: Buffer) => {
      out += d.toString("utf8");
    });
    child.stderr.on("data", (d: Buffer) => {
      err += d.toString("utf8");
    });
    child.on("error", (e) => {
      const finishedAt = new Date();
      resolveOnce({
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        success: false,
        exitCode: null,
        error: e instanceof Error ? e.message : String(e),
        stdout: out,
        stderr: err,
      });
    });
    child.on("close", (code) => {
      const finishedAt = new Date();
      resolveOnce({
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        success: code === 0 && !timedOut,
        exitCode: typeof code === "number" ? code : null,
        error: timedOut ? `Timed out after ${attRunTimeoutMs}ms` : code === 0 ? undefined : `Exited with code ${String(code)}`,
        stdout: out,
        stderr: err,
      });
    });
  });
}

async function ensureAttendanceRunnerSettingsTable(): Promise<void> {
  const pool = await getPool();
  await pool.request().query(
    "IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AttendanceRunnerSettings') BEGIN CREATE TABLE dbo.AttendanceRunnerSettings (id INT NOT NULL PRIMARY KEY, enabled BIT NOT NULL DEFAULT(0), intervalMinutes INT NOT NULL DEFAULT(10), pushLimit INT NOT NULL DEFAULT(5000), pushWindowMinutes INT NOT NULL DEFAULT(15), lookbackMinutes INT NOT NULL DEFAULT(2), updatedAt DATETIME NOT NULL DEFAULT(GETDATE())) END"
  );
}

async function ensureAttendanceRunnerLogsTable(): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .query(
      "IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AttendanceRunnerLogs') BEGIN CREATE TABLE dbo.AttendanceRunnerLogs (id INT IDENTITY(1,1) NOT NULL PRIMARY KEY, timestamp DATETIME NOT NULL DEFAULT(GETDATE()), durationMs INT NOT NULL, success BIT NOT NULL, exitCode INT NULL, error NVARCHAR(MAX) NULL, stdout NVARCHAR(MAX) NULL, stderr NVARCHAR(MAX) NULL) END"
    );
}

async function loadAttendanceRunnerSettings(): Promise<void> {
  await ensureAttendanceRunnerSettingsTable();
  const pool = await getPool();
  const res = await pool.request().query(
    "SELECT TOP 1 id, enabled, intervalMinutes, pushLimit, pushWindowMinutes, lookbackMinutes FROM dbo.AttendanceRunnerSettings ORDER BY id ASC"
  );
  const row = res.recordset?.[0] as
    | {
        id?: unknown;
        enabled?: unknown;
        intervalMinutes?: unknown;
        pushLimit?: unknown;
        pushWindowMinutes?: unknown;
        lookbackMinutes?: unknown;
      }
    | undefined;
  if (!row) {
    const req = pool.request();
    req.input("id", 1);
    req.input("enabled", attEnabled ? 1 : 0);
    req.input("intervalMinutes", attIntervalMinutes);
    req.input("pushLimit", attPushLimit);
    req.input("pushWindowMinutes", attPushWindowMinutes);
    req.input("lookbackMinutes", attLookbackMinutes);
    await req.query(
      "INSERT INTO dbo.AttendanceRunnerSettings (id, enabled, intervalMinutes, pushLimit, pushWindowMinutes, lookbackMinutes) VALUES (@id, @enabled, @intervalMinutes, @pushLimit, @pushWindowMinutes, @lookbackMinutes)"
    );
    return;
  }
  attEnabled = String(row.enabled) === "true" || Number(row.enabled) === 1;
  const m = Number(row.intervalMinutes);
  const pl = Number(row.pushLimit);
  const pwm = Number(row.pushWindowMinutes);
  const lbm = Number(row.lookbackMinutes);
  if (Number.isFinite(m) && m > 0) attIntervalMinutes = m;
  if (Number.isFinite(pl) && pl > 0) attPushLimit = pl;
  if (Number.isFinite(pwm) && pwm > 0) attPushWindowMinutes = pwm;
  if (Number.isFinite(lbm) && lbm >= 0) attLookbackMinutes = lbm;
}

async function saveAttendanceRunnerSettings(nextEnabled: boolean, nextInterval: number, nextPushLimit: number, nextPushWindowMinutes: number, nextLookbackMinutes: number): Promise<void> {
  await ensureAttendanceRunnerSettingsTable();
  const pool = await getPool();
  const req = pool.request();
  req.input("id", 1);
  req.input("enabled", nextEnabled ? 1 : 0);
  req.input("intervalMinutes", nextInterval);
  req.input("pushLimit", nextPushLimit);
  req.input("pushWindowMinutes", nextPushWindowMinutes);
  req.input("lookbackMinutes", nextLookbackMinutes);
  await req.query(
    "MERGE dbo.AttendanceRunnerSettings AS t USING (SELECT @id AS id) AS s ON t.id = s.id WHEN MATCHED THEN UPDATE SET enabled = @enabled, intervalMinutes = @intervalMinutes, pushLimit = @pushLimit, pushWindowMinutes = @pushWindowMinutes, lookbackMinutes = @lookbackMinutes, updatedAt = GETDATE() WHEN NOT MATCHED THEN INSERT (id, enabled, intervalMinutes, pushLimit, pushWindowMinutes, lookbackMinutes, updatedAt) VALUES (@id, @enabled, @intervalMinutes, @pushLimit, @pushWindowMinutes, @lookbackMinutes, GETDATE());"
  );
}

function clampText(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen);
}

async function saveAttendanceRunnerLog(log: AttendanceRunLog): Promise<void> {
  await ensureAttendanceRunnerLogsTable();
  const pool = await getPool();
  const req = pool.request();
  req.input("durationMs", Math.max(0, Math.floor(log.durationMs)));
  req.input("success", log.success ? 1 : 0);
  req.input("exitCode", sql.Int, log.exitCode === null ? null : log.exitCode);
  req.input("error", log.error ?? null);
  req.input("stdout", log.stdout ? clampText(log.stdout, 20000) : null);
  req.input("stderr", log.stderr ? clampText(log.stderr, 20000) : null);
  await req.query(
    "INSERT INTO dbo.AttendanceRunnerLogs (durationMs, success, exitCode, error, stdout, stderr) VALUES (@durationMs, @success, @exitCode, @error, @stdout, @stderr)"
  );
}

async function runAttendancePython(): Promise<AttendanceRunLog> {
  const scriptAbs = path.resolve(process.cwd(), attScriptRel);
  const args: string[] = [
    scriptAbs,
    "--run-10min",
    "--job-name",
    attJobName,
    "--push-limit",
    String(attPushLimit),
    "--push-window-minutes",
    String(attPushWindowMinutes),
    "--lookback-minutes",
    String(attLookbackMinutes),
  ];
  if (attWaid) {
    args.push("--waid", attWaid);
  }
  return await runAttendancePythonWithArgs(args);
}

async function runAttendanceNow(): Promise<void> {
  if (attRunning) return;
  attRunning = true;
  const runId = randomUUID();
  logRunner("run_start", {
    runId,
    enabled: attEnabled,
    intervalMinutes: attIntervalMinutes,
    pushLimit: attPushLimit,
    pushWindowMinutes: attPushWindowMinutes,
    lookbackMinutes: attLookbackMinutes,
    script: attScriptRel,
    jobName: attJobName,
  });
  try {
    const log = await runAttendancePython();
    attLastRun = log;
    await saveAttendanceRunnerLog(log);
    const summary = parseRunnerSummary(log.stdout ?? "");
    logRunner("run_end", {
      runId,
      success: log.success,
      exitCode: log.exitCode,
      durationMs: log.durationMs,
      nextRunAt: attNextRunAt ? attNextRunAt.toISOString() : null,
      ...summary,
      error: log.success ? null : log.error ?? null,
    });
  } finally {
    attRunning = false;
  }
}

function scheduleAttendanceNext(): void {
  if (attTimer) clearTimeout(attTimer);
  if (!attEnabled) {
    attNextRunAt = null;
    logRunner("disabled", {});
    return;
  }
  const ms = Math.max(1, attIntervalMinutes) * 60 * 1000;
  attNextRunAt = new Date(Date.now() + ms);
  logRunner("scheduled", { nextRunAt: attNextRunAt.toISOString(), intervalMinutes: attIntervalMinutes });
  attTimer = setTimeout(async () => {
    await runAttendanceNow();
    scheduleAttendanceNext();
  }, ms);
}

function scheduleAttendanceInitRetry(delayMs: number): void {
  setTimeout(() => {
    void initializeAttendanceScheduler();
  }, delayMs);
}

async function initializeAttendanceScheduler(): Promise<void> {
  try {
    await Promise.all([attUseDbSettings ? loadAttendanceRunnerSettings() : Promise.resolve(), ensureAttendanceRunnerLogsTable()]);
    scheduleAttendanceNext();
    logRunner("initialized", {
      enabled: attEnabled,
      intervalMinutes: attIntervalMinutes,
      nextRunAt: attNextRunAt ? attNextRunAt.toISOString() : null,
      script: attScriptRel,
      jobName: attJobName,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[AttendanceRunner] Scheduler initialization failed:", message);
    scheduleAttendanceInitRetry(30000);
  }
}

attendanceRouter.get("/runner/status", (_req: Request, res: Response) => {
  res.json({
    configSource: attUseDbSettings ? "db" : "env",
    running: attRunning,
    enabled: attEnabled,
    intervalMinutes: attIntervalMinutes,
    nextRunAt: attNextRunAt,
    pushLimit: attPushLimit,
    pushWindowMinutes: attPushWindowMinutes,
    lookbackMinutes: attLookbackMinutes,
    python: attPythonExe,
    script: attScriptRel,
    jobName: attJobName,
    runTimeoutMs: attRunTimeoutMs,
    lastRun: attLastRun,
  });
});

attendanceRouter.post("/runner/run", async (_req: Request, res: Response) => {
  await runAttendanceNow();
  res.json({ lastRun: attLastRun });
});

attendanceRouter.post("/runner/dry-run", async (req: Request, res: Response) => {
  if (attRunning) {
    res.status(409).json({ error: "Attendance runner is already running" });
    return;
  }

  const date = typeof req.body?.date === "string" ? req.body.date.trim() : "";
  const startDate = typeof req.body?.startDate === "string" ? req.body.startDate.trim() : "";
  const endDate = typeof req.body?.endDate === "string" ? req.body.endDate.trim() : "";
  const staffNo = typeof req.body?.staffNo === "string" ? req.body.staffNo.trim() : "";
  const useFilo = Boolean(req.body?.useFilo);
  const previewLimitRaw = Number((req.body?.previewLimit as unknown) ?? 20);
  const previewLimit = Number.isFinite(previewLimitRaw) && previewLimitRaw > 0
    ? Math.min(100, Math.floor(previewLimitRaw))
    : 20;

  if (date && (startDate || endDate)) {
    res.status(400).json({ error: "Use either date or startDate/endDate, not both" });
    return;
  }

  const scriptAbs = path.resolve(process.cwd(), attScriptRel);
  const args: string[] = [scriptAbs, "--dry-run"];
  if (date) args.push("--date", date);
  if (startDate) args.push("--start-date", startDate);
  if (endDate) args.push("--end-date", endDate);
  if (staffNo) args.push("--staff-no", staffNo);
  if (useFilo) args.push("--use-filo");

  attRunning = true;
  try {
    const log = await runAttendancePythonWithArgs(args, { ATTENDANCE_WAID: "" });
    attLastRun = log;
    await saveAttendanceRunnerLog(log);
    const summary = parseRunnerSummary(log.stdout ?? "");
    const csvName = extractExportedCsvName(log.stdout ?? "");
    let csvPreview: Awaited<ReturnType<typeof readCsvPreview>> | null = null;
    let csvError: string | null = null;
    if (csvName) {
      try {
        csvPreview = await readCsvPreview(csvName, previewLimit);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        csvError = msg;
      }
    }
    res.status(log.success ? 200 : 500).json({
      mode: "dry-run",
      params: {
        date: date || null,
        startDate: startDate || null,
        endDate: endDate || null,
        staffNo: staffNo || null,
        useFilo,
        previewLimit,
      },
      success: log.success,
      exitCode: log.exitCode,
      error: log.error ?? null,
      summary,
      csvPreview,
      csvError,
      lastRun: log,
    });
  } finally {
    attRunning = false;
  }
});

attendanceRouter.post("/push-now", async (req: Request, res: Response) => {
  if (attRunning) {
    res.status(409).json({ error: "Attendance runner is already running" });
    return;
  }

  const pushLimitRaw = Number((req.body?.pushLimit as unknown) ?? attPushLimit);
  const dryRun = Boolean(req.body?.dryRun);
  const waidOverride = typeof req.body?.waid === "string" ? req.body.waid.trim() : "";
  const slotOverride = typeof req.body?.slotOverride === "string" ? req.body.slotOverride.trim() : "";

  if (!Number.isFinite(pushLimitRaw) || pushLimitRaw <= 0) {
    res.status(400).json({ error: "pushLimit must be a positive number" });
    return;
  }

  const pushLimit = Math.floor(pushLimitRaw);
  const scriptAbs = path.resolve(process.cwd(), attScriptRel);
  const args: string[] = [scriptAbs, "--push-now-report", "--push-limit", String(pushLimit)];
  if (dryRun) args.push("--dry-run");
  if (waidOverride) args.push("--waid", waidOverride);
  else if (attWaid) args.push("--waid", attWaid);
  if (slotOverride) args.push("--slot-override", slotOverride);

  attRunning = true;
  try {
    const log = await runAttendancePythonWithArgs(args);
    attLastRun = log;
    await saveAttendanceRunnerLog(log);
    const summary = parseRunnerSummary(log.stdout ?? "");
    res.status(log.success ? 200 : 500).json({
      mode: "push-now",
      dryRun,
      pushLimit,
      waid: waidOverride || attWaid || null,
      slotOverride: slotOverride || null,
      success: log.success,
      exitCode: log.exitCode,
      error: log.error ?? null,
      summary,
      lastRun: log,
    });
  } finally {
    attRunning = false;
  }
});

attendanceRouter.put("/runner/config", async (req: Request, res: Response) => {
  const en = Boolean(req.body?.enabled);
  const m = Number((req.body?.intervalMinutes as unknown) ?? attIntervalMinutes);
  const pl = Number((req.body?.pushLimit as unknown) ?? attPushLimit);
  const pwm = Number((req.body?.pushWindowMinutes as unknown) ?? attPushWindowMinutes);
  const lbm = Number((req.body?.lookbackMinutes as unknown) ?? attLookbackMinutes);
  if (!Number.isFinite(m) || m <= 0) {
    res.status(400).json({ error: "intervalMinutes must be a positive number" });
    return;
  }
  if (!Number.isFinite(pl) || pl <= 0) {
    res.status(400).json({ error: "pushLimit must be a positive number" });
    return;
  }
  if (!Number.isFinite(pwm) || pwm <= 0) {
    res.status(400).json({ error: "pushWindowMinutes must be a positive number" });
    return;
  }
  if (!Number.isFinite(lbm) || lbm < 0) {
    res.status(400).json({ error: "lookbackMinutes must be a non-negative number" });
    return;
  }

  const nextEnabled = en;
  const nextIntervalMinutes = Math.floor(m);
  const nextPushLimit = Math.floor(pl);
  const nextPushWindowMinutes = Math.floor(pwm);
  const nextLookbackMinutes = Math.floor(lbm);

  await saveAttendanceRunnerSettings(nextEnabled, nextIntervalMinutes, nextPushLimit, nextPushWindowMinutes, nextLookbackMinutes);

  if (attUseDbSettings) {
    attEnabled = nextEnabled;
    attIntervalMinutes = nextIntervalMinutes;
    attPushLimit = nextPushLimit;
    attPushWindowMinutes = nextPushWindowMinutes;
    attLookbackMinutes = nextLookbackMinutes;
    scheduleAttendanceNext();
  }

  res.json({
    configSource: attUseDbSettings ? "db" : "env",
    runtime: {
      enabled: attEnabled,
      intervalMinutes: attIntervalMinutes,
      nextRunAt: attNextRunAt,
      pushLimit: attPushLimit,
      pushWindowMinutes: attPushWindowMinutes,
      lookbackMinutes: attLookbackMinutes,
    },
    savedToDb: {
      enabled: nextEnabled,
      intervalMinutes: nextIntervalMinutes,
      pushLimit: nextPushLimit,
      pushWindowMinutes: nextPushWindowMinutes,
      lookbackMinutes: nextLookbackMinutes,
    },
  });
});

void initializeAttendanceScheduler();
