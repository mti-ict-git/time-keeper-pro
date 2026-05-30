import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sql from "mssql";
import { getPool } from "../db";
import { getOrangePool } from "../orangeDb";

type ScheduleTuple = {
  timeIn: string;
  timeOut: string;
  nextDay: boolean;
  description: string;
  dayType: string;
};

type AsOfTuple = ScheduleTuple & { fromHistory: boolean };

type LockTuple = {
  scheduledIn: string;
  scheduledOut: string;
  nextDay: boolean;
  lockedAtLocal: string;
};

function parseArgs(argv: string[]): { dates: string[] } {
  const datesArg = argv.find((a) => a.startsWith("--dates="))?.slice("--dates=".length);
  if (datesArg && datesArg.trim().length > 0) {
    const dates = datesArg
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));
    if (dates.length > 0) return { dates };
  }
  return { dates: [] };
}

function getYyyyMmDdInTz(timeZone: string, at: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const d = parts.find((p) => p.type === "day")?.value ?? "";
  return `${y}-${m}-${d}`;
}

function addDaysYyyyMmDd(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split("-").map((v) => Number(v));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function toBoolNextDay(v: unknown): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "y" || s === "yes" || s === "true" || s === "1";
}

function isOff(desc: string): boolean {
  return desc.trim().toLowerCase() === "off";
}

function normalizeTimeForOff(time: string, desc: string): string {
  const t = time.trim();
  if (t.length > 0) return t;
  return isOff(desc) ? "00:00" : "";
}

function sameTupleStrict(a: Pick<ScheduleTuple, "timeIn" | "timeOut" | "nextDay">, b: Pick<ScheduleTuple, "timeIn" | "timeOut" | "nextDay">): boolean {
  return a.timeIn === b.timeIn && a.timeOut === b.timeOut && a.nextDay === b.nextDay;
}

function sameTupleNormalized(a: ScheduleTuple, b: ScheduleTuple): boolean {
  const aIn = normalizeTimeForOff(a.timeIn, a.description);
  const aOut = normalizeTimeForOff(a.timeOut, a.description);
  const bIn = normalizeTimeForOff(b.timeIn, b.description);
  const bOut = normalizeTimeForOff(b.timeOut, b.description);
  return aIn === bIn && aOut === bOut && a.nextDay === b.nextDay;
}

function readEmployeeIds(csvPath: string): string[] {
  const raw = fs.readFileSync(csvPath, "utf8");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const firstCell = String(line.split(",")[0] ?? "").trim();
    if (!/^MTI\d{6}$/.test(firstCell)) continue;
    if (seen.has(firstCell)) continue;
    seen.add(firstCell);
    out.push(firstCell);
  }
  return out;
}

function csvEscape(v: string): string {
  const needs = /[",\r\n]/.test(v);
  const escaped = v.replace(/"/g, '""');
  return needs ? `"${escaped}"` : escaped;
}

function writeCsv(filePath: string, headers: string[], rows: Array<Record<string, string | number | boolean>>): void {
  const lines: string[] = [];
  lines.push(headers.map(csvEscape).join(","));
  for (const row of rows) {
    const line = headers
      .map((h) => {
        const v = row[h];
        return csvEscape(typeof v === "string" ? v : typeof v === "number" ? String(v) : typeof v === "boolean" ? (v ? "true" : "false") : "");
      })
      .join(",");
    lines.push(line);
  }
  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
}

async function fetchOrangeByDate(pool: sql.ConnectionPool, employeeIds: string[], date: string): Promise<Map<string, ScheduleTuple>> {
  const orangeSchema = process.env.ORANGE_PROC_SCHEMA && process.env.ORANGE_PROC_SCHEMA.length ? String(process.env.ORANGE_PROC_SCHEMA) : "dbo";
  const orangeDayTypeProc = process.env.ORANGE_DAY_TYPE_PROC && process.env.ORANGE_DAY_TYPE_PROC.length ? String(process.env.ORANGE_DAY_TYPE_PROC) : "sp_it_get_day_type";
  const orangeSiteCode = process.env.ORANGE_SITE_CODE && process.env.ORANGE_SITE_CODE.length ? String(process.env.ORANGE_SITE_CODE) : "MTI";
  const dayTypeQualified = `[${orangeSchema}].[${orangeDayTypeProc}]`;

  const req = pool.request();
  req.input("employeeIds", sql.NVarChar, employeeIds.join(","));
  req.input("date", sql.NVarChar, date);
  req.input("siteCode", sql.NVarChar, orangeSiteCode);

  const q = `
    SELECT
      ids.employee_id,
      dt.day_type,
      dt.description,
      CONVERT(varchar(5), dt.time_in, 108) AS time_in,
      CONVERT(varchar(5), dt.time_out, 108) AS time_out,
      dt.next_day
    FROM (
      SELECT DISTINCT LTRIM(RTRIM(value)) AS employee_id
      FROM STRING_SPLIT(@employeeIds, ',')
      WHERE LTRIM(RTRIM(value)) <> ''
    ) AS ids
    OUTER APPLY (
      SELECT TOP 1 day_type, description, time_in, time_out, next_day
      FROM ${dayTypeQualified}(@siteCode, ids.employee_id, @date)
    ) AS dt
    ORDER BY ids.employee_id ASC
  `;

  const res = await req.query(q);
  const map = new Map<string, ScheduleTuple>();
  for (const r of res.recordset as Array<Record<string, unknown>>) {
    const employeeId = String(r["employee_id"] ?? "").trim();
    map.set(employeeId, {
      timeIn: String(r["time_in"] ?? "").trim(),
      timeOut: String(r["time_out"] ?? "").trim(),
      nextDay: toBoolNextDay(r["next_day"]),
      description: String(r["description"] ?? "").trim(),
      dayType: String(r["day_type"] ?? "").trim(),
    });
  }
  return map;
}

async function fetchAsOfEodFromDb(pool: sql.ConnectionPool, employeeIds: string[], date: string): Promise<Map<string, AsOfTuple>> {
  const atIso = `${date}T23:59:59+07:00`;
  const atDate = new Date(atIso);

  const req = pool.request();
  req.input("ids", sql.NVarChar, employeeIds.join(","));
  req.input("at", sql.DateTime, atDate);

  const q = `
    WITH ids AS (
      SELECT DISTINCT LTRIM(RTRIM(value)) AS StaffNo
      FROM STRING_SPLIT(@ids, ',')
      WHERE LTRIM(RTRIM(value)) <> ''
    ),
    hist AS (
      SELECT
        scl.StaffNo,
        CONVERT(varchar(5), scl.TimeInNew, 108) AS time_in,
        CONVERT(varchar(5), scl.TimeOutNew, 108) AS time_out,
        CAST(scl.NextDayNew AS nvarchar(10)) AS next_day,
        ROW_NUMBER() OVER (PARTITION BY scl.StaffNo ORDER BY scl.ChangedAt DESC, scl.ChangeId DESC) AS rn
      FROM dbo.ScheduleChangeLog scl
      INNER JOIN ids ON ids.StaffNo = scl.StaffNo
      WHERE scl.ChangedAt <= @at
    ),
    mti AS (
      SELECT
        employee_id AS StaffNo,
        CAST(day_type AS nvarchar(255)) AS day_type,
        CAST(description AS nvarchar(255)) AS description,
        CONVERT(varchar(5), time_in, 108) AS time_in,
        CONVERT(varchar(5), time_out, 108) AS time_out,
        CAST(next_day AS nvarchar(10)) AS next_day
      FROM dbo.MTIUsers
    )
    SELECT
      ids.StaffNo,
      COALESCE(hist.time_in, mti.time_in, '') AS time_in,
      COALESCE(hist.time_out, mti.time_out, '') AS time_out,
      COALESCE(hist.next_day, mti.next_day, '0') AS next_day,
      COALESCE(mti.description, '') AS description,
      COALESCE(mti.day_type, '') AS day_type,
      CASE WHEN hist.StaffNo IS NULL THEN 0 ELSE 1 END AS from_history
    FROM ids
    LEFT JOIN hist ON hist.StaffNo = ids.StaffNo AND hist.rn = 1
    LEFT JOIN mti ON mti.StaffNo = ids.StaffNo
    ORDER BY ids.StaffNo ASC;
  `;

  const res = await req.query(q);
  const map = new Map<string, AsOfTuple>();
  for (const r of res.recordset as Array<Record<string, unknown>>) {
    const staffNo = String(r["StaffNo"] ?? "").trim();
    map.set(staffNo, {
      timeIn: String(r["time_in"] ?? "").trim(),
      timeOut: String(r["time_out"] ?? "").trim(),
      nextDay: toBoolNextDay(r["next_day"]),
      description: String(r["description"] ?? "").trim(),
      dayType: String(r["day_type"] ?? "").trim(),
      fromHistory: String(r["from_history"] ?? "") === "1" || String(r["from_history"] ?? "") === "true",
    });
  }
  return map;
}

async function fetchLocksFromDb(pool: sql.ConnectionPool, employeeIds: string[], date: string): Promise<Map<string, LockTuple>> {
  const req = pool.request();
  req.input("ids", sql.NVarChar, employeeIds.join(","));
  req.input("shiftDate", sql.Date, date);
  const q = `
    WITH ids AS (
      SELECT DISTINCT LTRIM(RTRIM(value)) AS StaffNo
      FROM STRING_SPLIT(@ids, ',')
      WHERE LTRIM(RTRIM(value)) <> ''
    )
    SELECT
      l.StaffNo,
      CONVERT(varchar(5), l.ScheduledIn, 108) AS scheduled_in,
      CONVERT(varchar(5), l.ScheduledOut, 108) AS scheduled_out,
      CAST(l.NextDay AS nvarchar(10)) AS next_day,
      CONVERT(varchar(19), l.LockedAt, 120) AS locked_at_local
    FROM dbo.AttendanceScheduleLock l
    INNER JOIN ids ON ids.StaffNo = l.StaffNo
    WHERE l.ShiftDate = @shiftDate
    ORDER BY l.StaffNo ASC;
  `;
  const res = await req.query(q);
  const map = new Map<string, LockTuple>();
  for (const r of res.recordset as Array<Record<string, unknown>>) {
    const staffNo = String(r["StaffNo"] ?? "").trim();
    map.set(staffNo, {
      scheduledIn: String(r["scheduled_in"] ?? "").trim(),
      scheduledOut: String(r["scheduled_out"] ?? "").trim(),
      nextDay: toBoolNextDay(r["next_day"]),
      lockedAtLocal: String(r["locked_at_local"] ?? "").trim(),
    });
  }
  return map;
}

async function runForDate(params: {
  date: string;
  employeeIds: string[];
  targetDb: sql.ConnectionPool;
  orangeDb: sql.ConnectionPool;
}): Promise<void> {
  const { date, employeeIds, targetDb, orangeDb } = params;
  const [orangeByDate, asOfEod, locks] = await Promise.all([
    fetchOrangeByDate(orangeDb, employeeIds, date),
    fetchAsOfEodFromDb(targetDb, employeeIds, date),
    fetchLocksFromDb(targetDb, employeeIds, date),
  ]);

  const mismatchAsOfRows: Array<Record<string, string | number | boolean>> = [];
  let comparedAsOf = 0;
  let strictMatchAsOf = 0;
  let strictMismatchAsOf = 0;
  let normalizedMismatchAsOf = 0;
  let missingOrangeAsOf = 0;

  for (const employeeId of employeeIds) {
    const orange = orangeByDate.get(employeeId);
    const asOf = asOfEod.get(employeeId);
    if (!orange || (!orange.timeIn && !orange.timeOut && !orange.description && !orange.dayType)) {
      missingOrangeAsOf += 1;
      continue;
    }
    if (!asOf) continue;
    comparedAsOf += 1;
    const strictOk = sameTupleStrict(asOf, orange);
    const normalizedOk = sameTupleNormalized(asOf, orange);
    if (strictOk) strictMatchAsOf += 1;
    else {
      strictMismatchAsOf += 1;
      if (!normalizedOk) normalizedMismatchAsOf += 1;
      mismatchAsOfRows.push({
        employeeId,
        date,
        asOf_timeIn: asOf.timeIn,
        asOf_timeOut: asOf.timeOut,
        asOf_nextDay: asOf.nextDay,
        asOf_fromHistory: asOf.fromHistory,
        asOf_desc: asOf.description,
        asOf_dayType: asOf.dayType,
        orange_timeIn: orange.timeIn,
        orange_timeOut: orange.timeOut,
        orange_nextDay: orange.nextDay,
        orange_desc: orange.description,
        orange_dayType: orange.dayType,
        mismatchNormalizedStill: !normalizedOk,
      });
    }
  }

  const mismatchLockRows: Array<Record<string, string | number | boolean>> = [];
  let comparedLock = 0;
  let strictMatchLock = 0;
  let strictMismatchLock = 0;
  let normalizedMismatchLock = 0;
  let missingOrangeLock = 0;

  for (const [employeeId, lock] of locks.entries()) {
    const orange = orangeByDate.get(employeeId);
    if (!orange || (!orange.timeIn && !orange.timeOut && !orange.description && !orange.dayType)) {
      missingOrangeLock += 1;
      continue;
    }
    comparedLock += 1;
    const lockAsSchedule: ScheduleTuple = {
      timeIn: lock.scheduledIn,
      timeOut: lock.scheduledOut,
      nextDay: lock.nextDay,
      description: "",
      dayType: "",
    };
    const strictOk = sameTupleStrict(lockAsSchedule, orange);
    const normalizedOk = sameTupleNormalized(lockAsSchedule, orange);
    if (strictOk) strictMatchLock += 1;
    else {
      strictMismatchLock += 1;
      if (!normalizedOk) normalizedMismatchLock += 1;
      mismatchLockRows.push({
        employeeId,
        date,
        lock_in: lock.scheduledIn,
        lock_out: lock.scheduledOut,
        lock_nextDay: lock.nextDay,
        lock_lockedAtLocal: lock.lockedAtLocal,
        orange_timeIn: orange.timeIn,
        orange_timeOut: orange.timeOut,
        orange_nextDay: orange.nextDay,
        orange_desc: orange.description,
        mismatchNormalizedStill: !normalizedOk,
      });
    }
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(scriptDir, "..", "..");
  const asOfCsv = path.join(root, `phase0_orange_vs_asof_${date}.csv`);
  const lockCsv = path.join(root, `phase0_orange_vs_lock_${date}.csv`);
  writeCsv(
    asOfCsv,
    [
      "employeeId",
      "date",
      "asOf_timeIn",
      "asOf_timeOut",
      "asOf_nextDay",
      "asOf_fromHistory",
      "asOf_desc",
      "asOf_dayType",
      "orange_timeIn",
      "orange_timeOut",
      "orange_nextDay",
      "orange_desc",
      "orange_dayType",
      "mismatchNormalizedStill",
    ],
    mismatchAsOfRows
  );
  writeCsv(
    lockCsv,
    [
      "employeeId",
      "date",
      "lock_in",
      "lock_out",
      "lock_nextDay",
      "lock_lockedAtLocal",
      "orange_timeIn",
      "orange_timeOut",
      "orange_nextDay",
      "orange_desc",
      "mismatchNormalizedStill",
    ],
    mismatchLockRows
  );

  const summary = {
    date,
    employeeCount: employeeIds.length,
    orangeVsAsOf: {
      compared: comparedAsOf,
      missingOrange: missingOrangeAsOf,
      strictMatch: strictMatchAsOf,
      strictMismatch: strictMismatchAsOf,
      normalizedMismatch: normalizedMismatchAsOf,
      mismatchCsv: path.basename(asOfCsv),
    },
    orangeVsLock: {
      compared: comparedLock,
      missingOrange: missingOrangeLock,
      strictMatch: strictMatchLock,
      strictMismatch: strictMismatchLock,
      normalizedMismatch: normalizedMismatchLock,
      mismatchCsv: path.basename(lockCsv),
    },
  };

  const summaryPath = path.join(root, `phase0_summary_${date}.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf8");
  console.log(JSON.stringify(summary, null, 2));
}

async function main(): Promise<void> {
  const { dates: datesArg } = parseArgs(process.argv.slice(2));
  const tz = "Asia/Jakarta";
  const today = getYyyyMmDdInTz(tz, new Date());
  const yesterday = addDaysYyyyMmDd(today, -1);
  const dates = datesArg.length > 0 ? datesArg : [today, yesterday];

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(scriptDir, "..", "..");
  const employeeIds = readEmployeeIds(path.join(root, "all_employee.csv"));

  console.log(JSON.stringify({ ok: true, timeZone: tz, today, yesterday, dates, employeeCount: employeeIds.length }, null, 2));
  const targetDb = await getPool();
  const orangeDb = await getOrangePool();
  try {
    for (const date of dates) {
      await runForDate({ date, employeeIds, targetDb, orangeDb });
    }
  } finally {
    await Promise.allSettled([targetDb.close(), orangeDb.close()]);
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ ok: false, error: msg }));
  process.exitCode = 1;
});
