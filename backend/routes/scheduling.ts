import { Router, Request, Response } from "express";
import crypto from "node:crypto";
import sql from "mssql";
import { getPool } from "../db";
import { getOrangePool } from "../orangeDb";
import { formatDate, formatTime, toBoolNextDay } from "../utils/format";
import type { MtiUserRow, SchedulingEmployee, MtiScheduleComboRow, ScheduleCombo } from "../types/scheduling";

function mapRow(row: MtiUserRow): SchedulingEmployee {
  return {
    employeeId: String(row.employee_id),
    name: row.employee_name ?? "",
    gender: row.gender ?? "",
    division: row.division ?? "",
    department: row.department ?? "",
    section: row.section ?? "",
    supervisorId: row.supervisor_id ?? "",
    supervisorName: row.supervisor_name ?? "",
    positionTitle: row.position_title ?? "",
    gradeInterval: row.grade_interval ?? "",
    phone: row.phone ?? "",
    dayType: row.description ?? "",
    description: row.description ?? "",
    timeIn: formatTime(row.time_in),
    timeOut: formatTime(row.time_out),
    nextDay: toBoolNextDay(row.next_day),
  };
}

function mapComboRow(row: MtiScheduleComboRow): ScheduleCombo {
  return {
    label: row.description ?? "",
    dayType: row.day_type ?? "",
    timeIn: formatTime(row.time_in),
    timeOut: formatTime(row.time_out),
    nextDay: toBoolNextDay(row.next_day),
    count: Number(row.count) || 0,
  };
}

export const schedulingRouter = Router();

type ScheduleChangeLogRow = {
  ChangeId: number;
  StaffNo: string;
  ChangedAt: Date | string;
  ChangedAtLocal: string | null;
  TimeInNew: string | null;
  TimeOutNew: string | null;
  NextDayNew: string | number | boolean | null;
  SourceHash: string | null;
};

type AttendanceScheduleLockRow = {
  StaffNo: string;
  ShiftDate: Date | string;
  ScheduledIn: string | null;
  ScheduledOut: string | null;
  NextDay: string | number | boolean | null;
  LockedAt: Date | string;
  LockedAtLocal: string | null;
  SourceHash: string | null;
};

type MtiUserScheduleRow = {
  employee_id: string;
  description: string | null;
  day_type: string | null;
  time_in: string | null;
  time_out: string | null;
  next_day: string | number | boolean | null;
};

type OrangeDayTypeRow = {
  employee_id: string;
  day_type: string | null;
  description: string | null;
  time_in: string | null;
  time_out: string | null;
  next_day: string | number | boolean | null;
};

type OrangeScheduleDailyRow = {
  StaffNo: string;
  ShiftDate: Date | string;
  TimeIn: unknown;
  TimeOut: unknown;
  NextDay: string | number | boolean | null;
  DayType: string | null;
  Description: string | null;
  FetchedAt: Date | string;
  SourceHash: string | null;
};

function isMissingObjectError(err: unknown, objectName: string): boolean {
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return message.includes("invalid object name") && message.includes(objectName.toLowerCase());
}

const scheduleSourceUtcOffsetMinutes = 420;

const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoDateParam(value: unknown): string | null {
  const s = String(value ?? "").trim();
  if (!s.length) return null;
  if (!isoDateRe.test(s)) return null;
  return s;
}

function toTimeHmsOrNull(hhmm: string): string | null {
  const s = String(hhmm ?? "").trim();
  if (!s.length) return null;
  const m1 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m1) {
    const hh = m1[1].padStart(2, "0");
    const mm = m1[2];
    return `${hh}:${mm}:00`;
  }
  const m2 = s.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (m2) {
    const hh = m2[1].padStart(2, "0");
    const mm = m2[2];
    const ss = m2[3];
    return `${hh}:${mm}:${ss}`;
  }
  return null;
}

function todayWibIsoDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date()
  );
}

function addDaysIsoDate(iso: string, deltaDays: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function ensureOrangeScheduleDailyTable(): Promise<void> {
  const pool = await getPool();
  await pool.request().query(
    "IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'OrangeScheduleDaily') BEGIN CREATE TABLE dbo.OrangeScheduleDaily (StaffNo NVARCHAR(50) NOT NULL, ShiftDate DATE NOT NULL, TimeIn TIME(0) NULL, TimeOut TIME(0) NULL, NextDay BIT NOT NULL DEFAULT(0), DayType NVARCHAR(50) NULL, Description NVARCHAR(255) NULL, FetchedAt DATETIME NOT NULL DEFAULT(GETDATE()), SourceHash NVARCHAR(64) NULL, CONSTRAINT PK_OrangeScheduleDaily PRIMARY KEY (StaffNo, ShiftDate), CONSTRAINT CK_OrangeScheduleDaily_Overnight CHECK (TimeIn IS NULL OR TimeOut IS NULL OR TimeOut > TimeIn OR NextDay = 1) ); END; IF NOT EXISTS (SELECT name FROM sys.indexes WHERE name = 'IX_OrangeScheduleDaily_ShiftDate') BEGIN CREATE INDEX IX_OrangeScheduleDaily_ShiftDate ON dbo.OrangeScheduleDaily (ShiftDate) INCLUDE (StaffNo, TimeIn, TimeOut, NextDay, DayType, Description, FetchedAt, SourceHash); END;"
  );
}

type OrangeScheduleDailyUpsert = {
  staffNo: string;
  shiftDate: string;
  timeIn: string | null;
  timeOut: string | null;
  nextDay: boolean;
  dayType: string;
  description: string;
  fetchedAt: string;
  sourceHash: string;
};

async function upsertOrangeScheduleDaily(rows: OrangeScheduleDailyUpsert[]): Promise<{ inserted: number; updated: number }> {
  if (rows.length === 0) return { inserted: 0, updated: 0 };
  await ensureOrangeScheduleDailyTable();
  const pool = await getPool();
  const req = pool.request();
  req.input("json", sql.NVarChar(sql.MAX), JSON.stringify(rows));
  const q = `
    DECLARE @out TABLE (action NVARCHAR(10) NOT NULL);

    WITH src AS (
      SELECT
        staffNo,
        shiftDate,
        timeIn,
        timeOut,
        nextDay,
        dayType,
        description,
        fetchedAt,
        sourceHash
      FROM OPENJSON(@json)
      WITH (
        staffNo NVARCHAR(50) '$.staffNo',
        shiftDate DATE '$.shiftDate',
        timeIn TIME(0) '$.timeIn',
        timeOut TIME(0) '$.timeOut',
        nextDay BIT '$.nextDay',
        dayType NVARCHAR(50) '$.dayType',
        description NVARCHAR(255) '$.description',
        fetchedAt DATETIME2 '$.fetchedAt',
        sourceHash NVARCHAR(64) '$.sourceHash'
      )
    )
    MERGE dbo.OrangeScheduleDaily AS t
    USING src AS s
      ON t.StaffNo = s.staffNo AND t.ShiftDate = s.shiftDate
    WHEN MATCHED THEN
      UPDATE SET
        TimeIn = s.timeIn,
        TimeOut = s.timeOut,
        NextDay = s.nextDay,
        DayType = NULLIF(s.dayType, ''),
        Description = NULLIF(s.description, ''),
        FetchedAt = s.fetchedAt,
        SourceHash = s.sourceHash
    WHEN NOT MATCHED THEN
      INSERT (StaffNo, ShiftDate, TimeIn, TimeOut, NextDay, DayType, Description, FetchedAt, SourceHash)
      VALUES (s.staffNo, s.shiftDate, s.timeIn, s.timeOut, s.nextDay, NULLIF(s.dayType, ''), NULLIF(s.description, ''), s.fetchedAt, s.sourceHash)
    OUTPUT $action INTO @out;

    SELECT
      SUM(CASE WHEN action = 'INSERT' THEN 1 ELSE 0 END) AS inserted,
      SUM(CASE WHEN action = 'UPDATE' THEN 1 ELSE 0 END) AS updated
    FROM @out;
  `;
  const r = await req.query(q);
  const row = (r.recordset?.[0] as { inserted?: unknown; updated?: unknown } | undefined) ?? undefined;
  return { inserted: Number(row?.inserted ?? 0), updated: Number(row?.updated ?? 0) };
}

async function fetchOrangeEmployeeIds(): Promise<string[]> {
  const orangeSchema = process.env.ORANGE_SCHEMA && process.env.ORANGE_SCHEMA.length ? String(process.env.ORANGE_SCHEMA) : "dbo";
  const orangeEmployeeTable =
    process.env.ORANGE_EMPLOYEE_TABLE && process.env.ORANGE_EMPLOYEE_TABLE.length ? String(process.env.ORANGE_EMPLOYEE_TABLE) : "it_mti_employee_database_tbl";
  const employeeQualified = `[${orangeSchema}].[${orangeEmployeeTable}]`;
  const pool = await getOrangePool();
  const q = `SELECT DISTINCT LTRIM(RTRIM(employee_id)) AS employee_id FROM ${employeeQualified} WHERE employee_id IS NOT NULL AND LTRIM(RTRIM(employee_id)) <> '' ORDER BY employee_id ASC`;
  const result = await pool.request().query(q);
  const rows = result.recordset ?? [];
  return rows.map((r: Record<string, unknown>) => String(r["employee_id"] ?? "").trim()).filter((v) => v.length > 0);
}

async function fetchOrangeDayTypeBatch(date: string, employeeIds: string[]): Promise<OrangeDayTypeRow[]> {
  if (employeeIds.length === 0) return [];
  const orangeSchema = process.env.ORANGE_PROC_SCHEMA && process.env.ORANGE_PROC_SCHEMA.length ? String(process.env.ORANGE_PROC_SCHEMA) : "dbo";
  const orangeDayTypeProc = process.env.ORANGE_DAY_TYPE_PROC && process.env.ORANGE_DAY_TYPE_PROC.length ? String(process.env.ORANGE_DAY_TYPE_PROC) : "sp_it_get_day_type";
  const orangeSiteCode = process.env.ORANGE_SITE_CODE && process.env.ORANGE_SITE_CODE.length ? String(process.env.ORANGE_SITE_CODE) : "MTI";
  const orangeCompanyIdDefault =
    process.env.ORANGE_COMPANY_ID_DEFAULT && process.env.ORANGE_COMPANY_ID_DEFAULT.length
      ? String(process.env.ORANGE_COMPANY_ID_DEFAULT)
      : orangeSiteCode;
  const orangeCompanyIdMtibj =
    process.env.ORANGE_COMPANY_ID_MTIBJ && process.env.ORANGE_COMPANY_ID_MTIBJ.length ? String(process.env.ORANGE_COMPANY_ID_MTIBJ) : "MTIB";
  const dayTypeQualified = `[${orangeSchema}].[${orangeDayTypeProc}]`;

  const pool = await getOrangePool();
  const request = pool.request();
  request.input("employeeIds", sql.NVarChar, employeeIds.join(","));
  request.input("date", sql.NVarChar, date);
  request.input("companyIdDefault", sql.NVarChar, orangeCompanyIdDefault);
  request.input("companyIdMtibj", sql.NVarChar, orangeCompanyIdMtibj);

  const q = `
    SELECT
      ids.employee_id,
      dt.day_type,
      dt.description,
      dt.time_in,
      dt.time_out,
      dt.next_day
    FROM (
      SELECT DISTINCT LTRIM(RTRIM(value)) AS employee_id
      FROM STRING_SPLIT(@employeeIds, ',')
      WHERE LTRIM(RTRIM(value)) <> ''
    ) AS ids
    OUTER APPLY (
      SELECT TOP 1 day_type, description, time_in, time_out, next_day
      FROM ${dayTypeQualified}(CASE WHEN ids.employee_id LIKE 'MTIBJ%' THEN @companyIdMtibj ELSE @companyIdDefault END, ids.employee_id, @date)
    ) AS dt
    ORDER BY ids.employee_id ASC
  `;
  const result = await request.query(q);
  return (result.recordset ?? []) as OrangeDayTypeRow[];
}

schedulingRouter.get("/employees", async (req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const descriptionParam = String(req.query.description ?? "").trim();
    const dayTypeParam = String(req.query.dayType ?? "").trim();
    const timeInParam = String(req.query.timeIn ?? "").trim();
    const timeOutParam = String(req.query.timeOut ?? "").trim();
    const nextDayParam = String(req.query.nextDay ?? "").trim();

    const request = pool.request();
    let query =
      "SELECT employee_id, employee_name, gender, division, department, section, supervisor_id, supervisor_name, position_title, grade_interval, phone, day_type, description, CONVERT(varchar(5), time_in, 108) AS time_in, CONVERT(varchar(5), time_out, 108) AS time_out, next_day FROM MTIUsers";

    const where: string[] = [];
    if (descriptionParam) {
      request.input("description", sql.NVarChar, descriptionParam);
      where.push("description = @description");
    }
    if (dayTypeParam) {
      request.input("dayType", sql.NVarChar, dayTypeParam);
      where.push("day_type = @dayType");
    }
    if (timeInParam) {
      request.input("timeIn", sql.NVarChar, timeInParam);
      where.push("CONVERT(varchar(5), time_in, 108) = @timeIn");
    }
    if (timeOutParam) {
      request.input("timeOut", sql.NVarChar, timeOutParam);
      where.push("CONVERT(varchar(5), time_out, 108) = @timeOut");
    }
    if (nextDayParam) {
      const isNext = toBoolNextDay(nextDayParam);
      if (isNext) {
        where.push("LOWER(LTRIM(RTRIM(CAST(next_day AS nvarchar(10))))) IN ('y','yes','true','1')");
      } else {
        where.push("LOWER(LTRIM(RTRIM(CAST(next_day AS nvarchar(10))))) IN ('n','no','false','0')");
      }
    }

    if (where.length > 0) {
      query += " WHERE " + where.join(" AND ");
    }

    const result = await request.query(query);
    const rows = (result.recordset ?? []) as MtiUserRow[];
    const data: SchedulingEmployee[] = rows.map(mapRow);
    res.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

schedulingRouter.get("/combos", async (_req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const query =
      "SELECT description, day_type, CONVERT(varchar(5), time_in, 108) AS time_in, CONVERT(varchar(5), time_out, 108) AS time_out, next_day, COUNT(*) AS count FROM MTIUsers GROUP BY description, day_type, CONVERT(varchar(5), time_in, 108), CONVERT(varchar(5), time_out, 108), next_day ORDER BY description ASC, time_in ASC, time_out ASC";
    const result = await pool.request().query(query);
    const rows = (result.recordset ?? []) as MtiScheduleComboRow[];
    const data: ScheduleCombo[] = rows
      .filter((r) => (r.time_in !== null && String(r.time_in).trim() !== "") || (r.time_out !== null && String(r.time_out).trim() !== ""))
      .map(mapComboRow);
    res.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

schedulingRouter.get("/history", async (req: Request, res: Response) => {
  try {
    const employeeId = String(req.query.employeeId ?? "").trim();
    const from = String(req.query.from ?? "").trim();
    const to = String(req.query.to ?? "").trim();
    const limitRaw = Number(String(req.query.limit ?? "").trim() || "200");
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 1000) : 200;
    if (!employeeId) {
      res.status(400).json({ error: "employeeId is required" });
      return;
    }

    const pool = await getPool();
    const request = pool.request();
    request.input("employeeId", sql.NVarChar, employeeId);
    request.input("limit", sql.Int, limit);
    let query =
      "SELECT TOP (@limit) ChangeId, StaffNo, ChangedAt, CONVERT(varchar(19), ChangedAt, 120) AS ChangedAtLocal, CONVERT(varchar(5), TimeInNew, 108) AS TimeInNew, CONVERT(varchar(5), TimeOutNew, 108) AS TimeOutNew, NextDayNew, SourceHash FROM dbo.ScheduleChangeLog WHERE StaffNo = @employeeId";
    if (from) {
      const fromDate = new Date(from);
      if (!Number.isNaN(fromDate.getTime())) {
        request.input("from", sql.DateTime, fromDate);
        query += " AND ChangedAt >= @from";
      }
    }
    if (to) {
      const toDate = new Date(to);
      if (!Number.isNaN(toDate.getTime())) {
        request.input("to", sql.DateTime, toDate);
        query += " AND ChangedAt <= @to";
      }
    }
    query += " ORDER BY ChangedAt DESC, ChangeId DESC";
    const result = await request.query(query);
    const rows = (result.recordset ?? []) as ScheduleChangeLogRow[];
    const data = rows.map((row) => ({
      changeId: Number(row.ChangeId) || 0,
      employeeId: String(row.StaffNo ?? ""),
      changedAt: row.ChangedAt instanceof Date ? row.ChangedAt.toISOString() : String(row.ChangedAt ?? ""),
      changedAtLocal: row.ChangedAtLocal ?? "",
      timeIn: formatTime(row.TimeInNew),
      timeOut: formatTime(row.TimeOutNew),
      nextDay: toBoolNextDay(row.NextDayNew),
      sourceHash: row.SourceHash ?? "",
      sourceUtcOffsetMinutes: scheduleSourceUtcOffsetMinutes,
    }));
    res.json({ data, sourceUtcOffsetMinutes: scheduleSourceUtcOffsetMinutes });
  } catch (err) {
    if (isMissingObjectError(err, "ScheduleChangeLog")) {
      res.json({ data: [] });
      return;
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

schedulingRouter.get("/as-of", async (req: Request, res: Response) => {
  try {
    const employeeId = String(req.query.employeeId ?? "").trim();
    const at = String(req.query.at ?? "").trim();
    if (!employeeId || !at) {
      res.status(400).json({ error: "employeeId and at are required" });
      return;
    }
    const atDate = new Date(at);
    if (Number.isNaN(atDate.getTime())) {
      res.status(400).json({ error: "Invalid 'at' datetime" });
      return;
    }

    const pool = await getPool();
    const historyReq = pool.request();
    historyReq.input("employeeId", sql.NVarChar, employeeId);
    historyReq.input("at", sql.DateTime, atDate);
    const historyResult = await historyReq.query(
      "SELECT TOP 1 ChangeId, StaffNo, ChangedAt, CONVERT(varchar(19), ChangedAt, 120) AS ChangedAtLocal, CONVERT(varchar(5), TimeInNew, 108) AS TimeInNew, CONVERT(varchar(5), TimeOutNew, 108) AS TimeOutNew, NextDayNew, SourceHash FROM dbo.ScheduleChangeLog WHERE StaffNo = @employeeId AND ChangedAt <= @at ORDER BY ChangedAt DESC, ChangeId DESC"
    );
    const historyRow = (historyResult.recordset?.[0] as ScheduleChangeLogRow | undefined) ?? undefined;

    const nextReq = pool.request();
    nextReq.input("employeeId", sql.NVarChar, employeeId);
    nextReq.input("at", sql.DateTime, atDate);
    const nextResult = await nextReq.query(
      "SELECT TOP 1 ChangeId, ChangedAt, CONVERT(varchar(19), ChangedAt, 120) AS ChangedAtLocal, CONVERT(varchar(5), TimeInNew, 108) AS TimeInNew, CONVERT(varchar(5), TimeOutNew, 108) AS TimeOutNew, NextDayNew FROM dbo.ScheduleChangeLog WHERE StaffNo = @employeeId AND ChangedAt > @at ORDER BY ChangedAt ASC, ChangeId ASC"
    );
    const nextRow = (nextResult.recordset?.[0] as ScheduleChangeLogRow | undefined) ?? undefined;

    if (historyRow) {
      res.json({
        data: {
          employeeId,
          at: atDate.toISOString(),
          source: "history",
          changedAt: historyRow.ChangedAt instanceof Date ? historyRow.ChangedAt.toISOString() : String(historyRow.ChangedAt ?? ""),
          changedAtLocal: historyRow.ChangedAtLocal ?? "",
          timeIn: formatTime(historyRow.TimeInNew),
          timeOut: formatTime(historyRow.TimeOutNew),
          nextDay: toBoolNextDay(historyRow.NextDayNew),
          sourceHash: historyRow.SourceHash ?? "",
          nextChangeAt: nextRow ? (nextRow.ChangedAt instanceof Date ? nextRow.ChangedAt.toISOString() : String(nextRow.ChangedAt ?? "")) : null,
          nextChangeAtLocal: nextRow?.ChangedAtLocal ?? null,
          sourceUtcOffsetMinutes: scheduleSourceUtcOffsetMinutes,
        },
      });
      return;
    }

    const currentReq = pool.request();
    currentReq.input("employeeId", sql.NVarChar, employeeId);
    const currentResult = await currentReq.query(
      "SELECT TOP 1 employee_id, description, day_type, CONVERT(varchar(5), time_in, 108) AS time_in, CONVERT(varchar(5), time_out, 108) AS time_out, next_day FROM dbo.MTIUsers WHERE employee_id = @employeeId"
    );
    const currentRow = (currentResult.recordset?.[0] as MtiUserScheduleRow | undefined) ?? undefined;
    if (!currentRow) {
      res.json({
        data: {
          employeeId,
          at: atDate.toISOString(),
          source: "none",
          changedAt: null,
          changedAtLocal: null,
          timeIn: "",
          timeOut: "",
          nextDay: false,
          sourceHash: "",
          nextChangeAt: nextRow ? (nextRow.ChangedAt instanceof Date ? nextRow.ChangedAt.toISOString() : String(nextRow.ChangedAt ?? "")) : null,
          nextChangeAtLocal: nextRow?.ChangedAtLocal ?? null,
          sourceUtcOffsetMinutes: scheduleSourceUtcOffsetMinutes,
        },
      });
      return;
    }

    res.json({
      data: {
        employeeId,
        at: atDate.toISOString(),
        source: "current",
        changedAt: null,
        changedAtLocal: null,
        timeIn: formatTime(currentRow.time_in),
        timeOut: formatTime(currentRow.time_out),
        nextDay: toBoolNextDay(currentRow.next_day),
        description: currentRow.description ?? "",
        dayType: currentRow.day_type ?? "",
        sourceHash: "",
        nextChangeAt: nextRow ? (nextRow.ChangedAt instanceof Date ? nextRow.ChangedAt.toISOString() : String(nextRow.ChangedAt ?? "")) : null,
        nextChangeAtLocal: nextRow?.ChangedAtLocal ?? null,
        sourceUtcOffsetMinutes: scheduleSourceUtcOffsetMinutes,
      },
    });
  } catch (err) {
    if (isMissingObjectError(err, "ScheduleChangeLog")) {
      const message = "ScheduleChangeLog table is not available yet";
      res.status(500).json({ error: message });
      return;
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

schedulingRouter.get("/locks", async (req: Request, res: Response) => {
  try {
    const employeeId = String(req.query.employeeId ?? "").trim();
    const fromDate = String(req.query.fromDate ?? "").trim();
    const toDate = String(req.query.toDate ?? "").trim();
    const limitRaw = Number(String(req.query.limit ?? "").trim() || "120");
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 1000) : 120;
    if (!employeeId) {
      res.status(400).json({ error: "employeeId is required" });
      return;
    }
    const pool = await getPool();
    const request = pool.request();
    request.input("employeeId", sql.NVarChar, employeeId);
    request.input("limit", sql.Int, limit);
    let query =
      "SELECT TOP (@limit) StaffNo, ShiftDate, CONVERT(varchar(5), ScheduledIn, 108) AS ScheduledIn, CONVERT(varchar(5), ScheduledOut, 108) AS ScheduledOut, NextDay, LockedAt, CONVERT(varchar(19), LockedAt, 120) AS LockedAtLocal, SourceHash FROM dbo.AttendanceScheduleLock WHERE StaffNo = @employeeId";
    if (fromDate) {
      request.input("fromDate", sql.Date, fromDate);
      query += " AND ShiftDate >= @fromDate";
    }
    if (toDate) {
      request.input("toDate", sql.Date, toDate);
      query += " AND ShiftDate <= @toDate";
    }
    query += " ORDER BY ShiftDate DESC";
    const result = await request.query(query);
    const rows = (result.recordset ?? []) as AttendanceScheduleLockRow[];
    const data = rows.map((row) => ({
      employeeId: String(row.StaffNo ?? ""),
      shiftDate: formatDate(row.ShiftDate),
      scheduledIn: formatTime(row.ScheduledIn),
      scheduledOut: formatTime(row.ScheduledOut),
      nextDay: toBoolNextDay(row.NextDay),
      lockedAt: row.LockedAt instanceof Date ? row.LockedAt.toISOString() : String(row.LockedAt ?? ""),
      lockedAtLocal: row.LockedAtLocal ?? "",
      sourceHash: row.SourceHash ?? "",
      sourceUtcOffsetMinutes: scheduleSourceUtcOffsetMinutes,
    }));
    res.json({ data, sourceUtcOffsetMinutes: scheduleSourceUtcOffsetMinutes });
  } catch (err) {
    if (isMissingObjectError(err, "AttendanceScheduleLock")) {
      res.json({ data: [] });
      return;
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

schedulingRouter.get("/locks/by-date", async (req: Request, res: Response) => {
  try {
    const shiftDate = String(req.query.date ?? "").trim();
    const limitRaw = Number(String(req.query.limit ?? "").trim() || "5000");
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 10000) : 5000;
    if (!shiftDate) {
      res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
      return;
    }

    const pool = await getPool();
    const request = pool.request();
    request.input("shiftDate", sql.Date, shiftDate);
    request.input("limit", sql.Int, limit);
    const query =
      "SELECT TOP (@limit) StaffNo, ShiftDate, CONVERT(varchar(5), ScheduledIn, 108) AS ScheduledIn, CONVERT(varchar(5), ScheduledOut, 108) AS ScheduledOut, NextDay, LockedAt, CONVERT(varchar(19), LockedAt, 120) AS LockedAtLocal, SourceHash FROM dbo.AttendanceScheduleLock WHERE ShiftDate = @shiftDate ORDER BY StaffNo ASC";
    const result = await request.query(query);
    const rows = (result.recordset ?? []) as AttendanceScheduleLockRow[];
    const data = rows.map((row) => ({
      employeeId: String(row.StaffNo ?? ""),
      shiftDate: formatDate(row.ShiftDate),
      scheduledIn: formatTime(row.ScheduledIn),
      scheduledOut: formatTime(row.ScheduledOut),
      nextDay: toBoolNextDay(row.NextDay),
      lockedAt: row.LockedAt instanceof Date ? row.LockedAt.toISOString() : String(row.LockedAt ?? ""),
      lockedAtLocal: row.LockedAtLocal ?? "",
      sourceHash: row.SourceHash ?? "",
      sourceUtcOffsetMinutes: scheduleSourceUtcOffsetMinutes,
    }));
    res.json({ data, sourceUtcOffsetMinutes: scheduleSourceUtcOffsetMinutes });
  } catch (err) {
    if (isMissingObjectError(err, "AttendanceScheduleLock")) {
      res.json({ data: [] });
      return;
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

schedulingRouter.get("/by-date", async (req: Request, res: Response) => {
  try {
    const date = parseIsoDateParam(req.query.date);
    if (!date) {
      res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
      return;
    }
    await ensureOrangeScheduleDailyTable();
    const pool = await getPool();
    const request = pool.request();
    request.input("date", sql.Date, date);
    const q =
      "SELECT StaffNo, ShiftDate, TimeIn, TimeOut, NextDay, DayType, Description, FetchedAt, SourceHash FROM dbo.OrangeScheduleDaily WHERE ShiftDate = @date ORDER BY StaffNo ASC";
    const result = await request.query(q);
    const rows = (result.recordset ?? []) as OrangeScheduleDailyRow[];
    const data = rows.map((row) => ({
      employeeId: String(row.StaffNo ?? ""),
      date,
      dayType: row.DayType ?? "",
      description: row.Description ?? "",
      timeIn: formatTime(row.TimeIn),
      timeOut: formatTime(row.TimeOut),
      nextDay: toBoolNextDay(row.NextDay),
      fetchedAt: row.FetchedAt instanceof Date ? row.FetchedAt.toISOString() : String(row.FetchedAt ?? ""),
      sourceHash: row.SourceHash ?? "",
    }));
    res.json({ date, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

schedulingRouter.get("/by-date/employee", async (req: Request, res: Response) => {
  try {
    const employeeId = String(req.query.employeeId ?? "").trim();
    const date = parseIsoDateParam(req.query.date);
    if (!employeeId) {
      res.status(400).json({ error: "employeeId is required" });
      return;
    }
    if (!date) {
      res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
      return;
    }
    await ensureOrangeScheduleDailyTable();
    const pool = await getPool();
    const request = pool.request();
    request.input("employeeId", sql.NVarChar, employeeId);
    request.input("date", sql.Date, date);
    const q =
      "SELECT TOP 1 StaffNo, ShiftDate, TimeIn, TimeOut, NextDay, DayType, Description, FetchedAt, SourceHash FROM dbo.OrangeScheduleDaily WHERE StaffNo = @employeeId AND ShiftDate = @date";
    const result = await request.query(q);
    const row = (result.recordset?.[0] as OrangeScheduleDailyRow | undefined) ?? undefined;
    if (!row) {
      res.json({
        data: { employeeId, date, dayType: "", description: "", timeIn: "", timeOut: "", nextDay: false, fetchedAt: "", sourceHash: "" },
      });
      return;
    }
    res.json({
      data: {
        employeeId,
        date,
        dayType: row.DayType ?? "",
        description: row.Description ?? "",
        timeIn: formatTime(row.TimeIn),
        timeOut: formatTime(row.TimeOut),
        nextDay: toBoolNextDay(row.NextDay),
        fetchedAt: row.FetchedAt instanceof Date ? row.FetchedAt.toISOString() : String(row.FetchedAt ?? ""),
        sourceHash: row.SourceHash ?? "",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

type OrangePrefetchLog = {
  timestamp: Date;
  dates: string[];
  totalEmployees: number;
  inserted: number;
  updated: number;
  success: boolean;
  error?: string;
  durationMs: number;
};

let orangePrefetchLastRun: OrangePrefetchLog | null = null;
let orangePrefetchRunning = false;
let orangePrefetchIntervalMinutes = process.env.ORANGE_SCHEDULE_PREFETCH_INTERVAL_MINUTES
  ? Number(process.env.ORANGE_SCHEDULE_PREFETCH_INTERVAL_MINUTES)
  : 30;
let orangePrefetchEnabled = true;
let orangePrefetchDaysBack = process.env.ORANGE_SCHEDULE_PREFETCH_DAYS_BACK ? Number(process.env.ORANGE_SCHEDULE_PREFETCH_DAYS_BACK) : 1;
let orangePrefetchDaysForward = process.env.ORANGE_SCHEDULE_PREFETCH_DAYS_FORWARD ? Number(process.env.ORANGE_SCHEDULE_PREFETCH_DAYS_FORWARD) : 1;
let orangePrefetchNextRunAt: Date | null = null;
let orangePrefetchTimer: NodeJS.Timeout | null = null;

async function ensureOrangePrefetchSettingsTable(): Promise<void> {
  const pool = await getPool();
  await pool.request().query(
    "IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'OrangeSchedulePrefetchSettings') BEGIN CREATE TABLE OrangeSchedulePrefetchSettings (id INT NOT NULL PRIMARY KEY, enabled BIT NOT NULL DEFAULT(1), intervalMinutes INT NOT NULL DEFAULT(30), daysBack INT NOT NULL DEFAULT(1), daysForward INT NOT NULL DEFAULT(1), updatedAt DATETIME NOT NULL DEFAULT(GETDATE())) END"
  );
}

async function ensureOrangePrefetchLogsTable(): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .query(
      "IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'OrangeSchedulePrefetchLogs') BEGIN CREATE TABLE OrangeSchedulePrefetchLogs (id INT IDENTITY(1,1) NOT NULL PRIMARY KEY, timestamp DATETIME NOT NULL DEFAULT(GETDATE()), dates NVARCHAR(200) NOT NULL, totalEmployees INT NOT NULL, inserted INT NOT NULL, updated INT NOT NULL, durationMs INT NOT NULL, success BIT NOT NULL, error NVARCHAR(MAX) NULL) END"
    );
}

async function saveOrangePrefetchLog(log: OrangePrefetchLog): Promise<void> {
  await ensureOrangePrefetchLogsTable();
  const pool = await getPool();
  const req = pool.request();
  req.input("timestamp", log.timestamp);
  req.input("dates", log.dates.join(","));
  req.input("totalEmployees", log.totalEmployees);
  req.input("inserted", log.inserted);
  req.input("updated", log.updated);
  req.input("durationMs", log.durationMs);
  req.input("success", log.success ? 1 : 0);
  req.input("error", log.error ?? null);
  await req.query(
    "INSERT INTO OrangeSchedulePrefetchLogs (timestamp, dates, totalEmployees, inserted, updated, durationMs, success, error) VALUES (@timestamp, @dates, @totalEmployees, @inserted, @updated, @durationMs, @success, @error)"
  );
}

async function loadOrangePrefetchSettings(): Promise<void> {
  await ensureOrangePrefetchSettingsTable();
  const pool = await getPool();
  const res = await pool.request().query("SELECT TOP 1 id, enabled, intervalMinutes, daysBack, daysForward FROM OrangeSchedulePrefetchSettings ORDER BY id ASC");
  const row = res.recordset?.[0] as
    | { id?: unknown; enabled?: unknown; intervalMinutes?: unknown; daysBack?: unknown; daysForward?: unknown }
    | undefined;
  if (!row) {
    const req = pool.request();
    req.input("id", 1);
    req.input("enabled", orangePrefetchEnabled ? 1 : 0);
    req.input("intervalMinutes", orangePrefetchIntervalMinutes);
    req.input("daysBack", orangePrefetchDaysBack);
    req.input("daysForward", orangePrefetchDaysForward);
    await req.query(
      "INSERT INTO OrangeSchedulePrefetchSettings (id, enabled, intervalMinutes, daysBack, daysForward) VALUES (@id, @enabled, @intervalMinutes, @daysBack, @daysForward)"
    );
    return;
  }
  orangePrefetchEnabled = String(row.enabled) === "true" || Number(row.enabled) === 1;
  const interval = Number(row.intervalMinutes);
  if (Number.isFinite(interval) && interval > 0) orangePrefetchIntervalMinutes = interval;
  const back = Number(row.daysBack);
  const fwd = Number(row.daysForward);
  if (Number.isFinite(back) && back >= 0) orangePrefetchDaysBack = Math.floor(back);
  if (Number.isFinite(fwd) && fwd >= 0) orangePrefetchDaysForward = Math.floor(fwd);
}

async function saveOrangePrefetchSettings(nextEnabled: boolean, nextIntervalMinutes: number, nextDaysBack: number, nextDaysForward: number): Promise<void> {
  await ensureOrangePrefetchSettingsTable();
  const pool = await getPool();
  const req = pool.request();
  req.input("id", 1);
  req.input("enabled", nextEnabled ? 1 : 0);
  req.input("intervalMinutes", nextIntervalMinutes);
  req.input("daysBack", nextDaysBack);
  req.input("daysForward", nextDaysForward);
  await req.query(
    "MERGE OrangeSchedulePrefetchSettings AS t USING (SELECT @id AS id) AS s ON t.id = s.id WHEN MATCHED THEN UPDATE SET enabled = @enabled, intervalMinutes = @intervalMinutes, daysBack = @daysBack, daysForward = @daysForward, updatedAt = GETDATE() WHEN NOT MATCHED THEN INSERT (id, enabled, intervalMinutes, daysBack, daysForward, updatedAt) VALUES (@id, @enabled, @intervalMinutes, @daysBack, @daysForward, GETDATE());"
  );
}

async function fetchOrangePrefetchLastLog(): Promise<{ timestamp: Date } | null> {
  try {
    await ensureOrangePrefetchLogsTable();
    const pool = await getPool();
    const res = await pool.request().query("SELECT TOP 1 timestamp FROM OrangeSchedulePrefetchLogs ORDER BY id DESC");
    const row = res.recordset?.[0] as { timestamp?: unknown } | undefined;
    if (!row || !row.timestamp) return null;
    const ts = row.timestamp instanceof Date ? row.timestamp : new Date(String(row.timestamp));
    if (Number.isNaN(ts.getTime())) return null;
    return { timestamp: ts };
  } catch {
    return null;
  }
}

async function runOrangePrefetchNow(opts?: { force?: boolean }): Promise<void> {
  const force = Boolean(opts?.force);
  if (orangePrefetchRunning) return;
  if (!force) {
    const last = await fetchOrangePrefetchLastLog();
    if (last && orangePrefetchEnabled) {
      const elapsed = Date.now() - last.timestamp.getTime();
      const minInterval = (orangePrefetchIntervalMinutes * 60 * 1000) - 10000;
      if (elapsed < minInterval) return;
    }
  }

  orangePrefetchRunning = true;
  const startedAt = Date.now();
  const timestamp = new Date();
  try {
    const employeeIds = await fetchOrangeEmployeeIds();
    const baseDate = todayWibIsoDate();
    const dates: string[] = [];
    for (let d = -orangePrefetchDaysBack; d <= orangePrefetchDaysForward; d += 1) {
      dates.push(addDaysIsoDate(baseDate, d));
    }

    let inserted = 0;
    let updated = 0;
    const chunkSize = 1000;
    for (const date of dates) {
      for (let i = 0; i < employeeIds.length; i += chunkSize) {
        const chunk = employeeIds.slice(i, i + chunkSize);
        const orangeRows = await fetchOrangeDayTypeBatch(date, chunk);
        const fetchedAt = new Date().toISOString();
        const upsertRows: OrangeScheduleDailyUpsert[] = orangeRows.map((r) => {
          const employeeId = String(r.employee_id ?? "").trim();
          const dayType = r.day_type ? String(r.day_type) : "";
          const description = r.description ? String(r.description) : "";
          const timeIn = toTimeHmsOrNull(formatTime(r.time_in));
          const timeOut = toTimeHmsOrNull(formatTime(r.time_out));
          const nextDay = toBoolNextDay(r.next_day);
          const hashInput = [employeeId, date, dayType, description, timeIn ?? "", timeOut ?? "", nextDay ? "1" : "0"].join("|");
          return {
            staffNo: employeeId,
            shiftDate: date,
            timeIn,
            timeOut,
            nextDay,
            dayType,
            description,
            fetchedAt,
            sourceHash: sha256Hex(hashInput),
          };
        });
        const upserted = await upsertOrangeScheduleDaily(upsertRows);
        inserted += upserted.inserted;
        updated += upserted.updated;
      }
    }

    orangePrefetchLastRun = {
      timestamp,
      dates,
      totalEmployees: employeeIds.length,
      inserted,
      updated,
      durationMs: Date.now() - startedAt,
      success: true,
    };
    await saveOrangePrefetchLog(orangePrefetchLastRun);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    orangePrefetchLastRun = {
      timestamp,
      dates: [],
      totalEmployees: 0,
      inserted: 0,
      updated: 0,
      durationMs: Date.now() - startedAt,
      success: false,
      error: message,
    };
    await saveOrangePrefetchLog(orangePrefetchLastRun);
  } finally {
    orangePrefetchRunning = false;
  }
}

function scheduleOrangePrefetchNext(): void {
  if (orangePrefetchTimer) clearTimeout(orangePrefetchTimer);
  if (!orangePrefetchEnabled) {
    orangePrefetchNextRunAt = null;
    return;
  }
  const ms = Math.max(1, orangePrefetchIntervalMinutes) * 60 * 1000;
  orangePrefetchNextRunAt = new Date(Date.now() + ms);
  orangePrefetchTimer = setTimeout(async () => {
    await runOrangePrefetchNow();
    scheduleOrangePrefetchNext();
  }, ms);
}

async function initializeOrangePrefetchScheduler(): Promise<void> {
  try {
    await Promise.all([loadOrangePrefetchSettings(), ensureOrangePrefetchLogsTable()]);
    scheduleOrangePrefetchNext();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[OrangeScheduleDaily] Scheduler initialization failed:", message);
    setTimeout(() => {
      void initializeOrangePrefetchScheduler();
    }, 30000);
  }
}

schedulingRouter.get("/by-date/prefetch/status", (_req: Request, res: Response) => {
  res.json({
    running: orangePrefetchRunning,
    intervalMinutes: orangePrefetchIntervalMinutes,
    enabled: orangePrefetchEnabled,
    daysBack: orangePrefetchDaysBack,
    daysForward: orangePrefetchDaysForward,
    nextRunAt: orangePrefetchNextRunAt,
    lastRun: orangePrefetchLastRun,
  });
});

schedulingRouter.post("/by-date/prefetch/run", async (_req: Request, res: Response) => {
  await runOrangePrefetchNow({ force: true });
  res.json({ lastRun: orangePrefetchLastRun });
});

schedulingRouter.post("/by-date/prefetch/backfill", async (req: Request, res: Response) => {
  const from = parseIsoDateParam((req.body as { from?: unknown })?.from);
  const to = parseIsoDateParam((req.body as { to?: unknown })?.to);
  const prefixRaw = String((req.body as { prefix?: unknown })?.prefix ?? "MTIBJ").trim();
  const prefix = prefixRaw.toUpperCase();

  if (!from || !to) {
    res.status(400).json({ error: "from/to is required (YYYY-MM-DD)" });
    return;
  }
  if (to < from) {
    res.status(400).json({ error: "to must be >= from" });
    return;
  }

  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    res.status(400).json({ error: "Invalid from/to" });
    return;
  }

  const maxDays = 120;
  const days = Math.floor((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  if (days <= 0 || days > maxDays) {
    res.status(400).json({ error: `Range too large (max ${maxDays} days)` });
    return;
  }

  if (orangePrefetchRunning) {
    res.status(409).json({ error: "Prefetch is running" });
    return;
  }

  orangePrefetchRunning = true;
  const startedAt = Date.now();
  const timestamp = new Date();
  try {
    const allEmployeeIds = await fetchOrangeEmployeeIds();
    const employeeIds = allEmployeeIds.filter((id) => id.toUpperCase().startsWith(prefix));
    if (employeeIds.length === 0) {
      res.status(400).json({ error: `No employees matched prefix ${prefix}` });
      return;
    }

    const dates: string[] = [];
    for (let d = 0; d < days; d += 1) {
      dates.push(addDaysIsoDate(from, d));
    }

    let inserted = 0;
    let updated = 0;
    const chunkSize = 1000;
    for (const date of dates) {
      for (let i = 0; i < employeeIds.length; i += chunkSize) {
        const chunk = employeeIds.slice(i, i + chunkSize);
        const orangeRows = await fetchOrangeDayTypeBatch(date, chunk);
        const fetchedAt = new Date().toISOString();
        const upsertRows: OrangeScheduleDailyUpsert[] = orangeRows.map((r) => {
          const employeeId = String(r.employee_id ?? "").trim();
          const dayType = r.day_type ? String(r.day_type) : "";
          const description = r.description ? String(r.description) : "";
          const timeIn = toTimeHmsOrNull(formatTime(r.time_in));
          const timeOut = toTimeHmsOrNull(formatTime(r.time_out));
          const nextDay = toBoolNextDay(r.next_day);
          const hashInput = [employeeId, date, dayType, description, timeIn ?? "", timeOut ?? "", nextDay ? "1" : "0"].join("|");
          return {
            staffNo: employeeId,
            shiftDate: date,
            timeIn,
            timeOut,
            nextDay,
            dayType,
            description,
            fetchedAt,
            sourceHash: sha256Hex(hashInput),
          };
        });
        const upserted = await upsertOrangeScheduleDaily(upsertRows);
        inserted += upserted.inserted;
        updated += upserted.updated;
      }
    }

    orangePrefetchLastRun = {
      timestamp,
      dates,
      totalEmployees: employeeIds.length,
      inserted,
      updated,
      durationMs: Date.now() - startedAt,
      success: true,
    };
    await saveOrangePrefetchLog({
      timestamp,
      dates,
      totalEmployees: employeeIds.length,
      inserted,
      updated,
      durationMs: Date.now() - startedAt,
      success: true,
    });
    res.json({ lastRun: orangePrefetchLastRun });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    orangePrefetchLastRun = {
      timestamp,
      dates: [],
      totalEmployees: 0,
      inserted: 0,
      updated: 0,
      durationMs: Date.now() - startedAt,
      success: false,
      error: message,
    };
    await saveOrangePrefetchLog({
      timestamp,
      dates: [`${from}..${to}`],
      totalEmployees: 0,
      inserted: 0,
      updated: 0,
      durationMs: Date.now() - startedAt,
      success: false,
      error: message,
    });
    res.status(500).json({ error: message });
  } finally {
    orangePrefetchRunning = false;
  }
});

schedulingRouter.put("/by-date/prefetch/config", async (req: Request, res: Response) => {
  const intervalMinutes = Number((req.body as { intervalMinutes?: unknown })?.intervalMinutes ?? 0);
  const enabled = Boolean((req.body as { enabled?: unknown })?.enabled);
  const daysBack = Number((req.body as { daysBack?: unknown })?.daysBack ?? orangePrefetchDaysBack);
  const daysForward = Number((req.body as { daysForward?: unknown })?.daysForward ?? orangePrefetchDaysForward);

  if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
    res.status(400).json({ error: "intervalMinutes must be a positive number" });
    return;
  }
  if (!Number.isFinite(daysBack) || daysBack < 0 || !Number.isFinite(daysForward) || daysForward < 0) {
    res.status(400).json({ error: "daysBack/daysForward must be >= 0" });
    return;
  }

  orangePrefetchIntervalMinutes = Math.floor(intervalMinutes);
  orangePrefetchEnabled = enabled;
  orangePrefetchDaysBack = Math.floor(daysBack);
  orangePrefetchDaysForward = Math.floor(daysForward);
  await saveOrangePrefetchSettings(orangePrefetchEnabled, orangePrefetchIntervalMinutes, orangePrefetchDaysBack, orangePrefetchDaysForward);
  scheduleOrangePrefetchNext();
  res.json({
    enabled: orangePrefetchEnabled,
    intervalMinutes: orangePrefetchIntervalMinutes,
    daysBack: orangePrefetchDaysBack,
    daysForward: orangePrefetchDaysForward,
    nextRunAt: orangePrefetchNextRunAt,
  });
});

schedulingRouter.get("/by-date/prefetch/logs", async (req: Request, res: Response) => {
  await ensureOrangePrefetchLogsTable();
  const pageParam = Number(String(req.query.page ?? "").trim() || "0");
  const pageSizeParam = Number(String(req.query.pageSize ?? "").trim() || "0");
  const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
  const pageSize = Number.isFinite(pageSizeParam) && pageSizeParam > 0 ? Math.floor(pageSizeParam) : 20;
  const offset = (page - 1) * pageSize;

  const pool = await getPool();
  const countRes = await pool.request().query("SELECT COUNT(*) AS cnt FROM OrangeSchedulePrefetchLogs");
  const total = Number((countRes.recordset?.[0] as { cnt?: unknown } | undefined)?.cnt ?? 0);
  const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;

  const dataReq = pool.request();
  dataReq.input("limit", pageSize);
  dataReq.input("offset", offset);
  const dataRes = await dataReq.query(
    "SELECT timestamp, dates, totalEmployees, inserted, updated, durationMs, success, error FROM OrangeSchedulePrefetchLogs ORDER BY id DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY"
  );
  const rows = dataRes.recordset ?? [];
  const logs = rows.map((r: Record<string, unknown>) => {
    const tsRaw = r["timestamp"];
    const ts = tsRaw instanceof Date ? tsRaw : new Date(String(tsRaw ?? ""));
    const successVal = r["success"];
    const success = String(successVal) === "true" || Number(successVal) === 1;
    const errRaw = r["error"];
    const error = errRaw === null || errRaw === undefined ? undefined : String(errRaw);
    return {
      timestamp: ts,
      dates: String(r["dates"] ?? ""),
      totalEmployees: Number(r["totalEmployees"] ?? 0),
      inserted: Number(r["inserted"] ?? 0),
      updated: Number(r["updated"] ?? 0),
      durationMs: Number(r["durationMs"] ?? 0),
      success,
      error,
    };
  });
  res.json({ logs, page, pageSize, total, totalPages });
});

void initializeOrangePrefetchScheduler();

schedulingRouter.get("/orange/day-type", async (req: Request, res: Response) => {
  try {
    const employeeId = String(req.query.employeeId ?? "").trim();
    const date = String(req.query.date ?? "").trim();
    if (!employeeId) {
      res.status(400).json({ error: "employeeId is required" });
      return;
    }
    if (!date) {
      res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
      return;
    }

    const orangeSchema = process.env.ORANGE_PROC_SCHEMA && process.env.ORANGE_PROC_SCHEMA.length ? String(process.env.ORANGE_PROC_SCHEMA) : "dbo";
    const orangeDayTypeProc = process.env.ORANGE_DAY_TYPE_PROC && process.env.ORANGE_DAY_TYPE_PROC.length ? String(process.env.ORANGE_DAY_TYPE_PROC) : "sp_it_get_day_type";
    const orangeSiteCode = process.env.ORANGE_SITE_CODE && process.env.ORANGE_SITE_CODE.length ? String(process.env.ORANGE_SITE_CODE) : "MTI";
    const orangeCompanyIdDefault =
      process.env.ORANGE_COMPANY_ID_DEFAULT && process.env.ORANGE_COMPANY_ID_DEFAULT.length
        ? String(process.env.ORANGE_COMPANY_ID_DEFAULT)
        : orangeSiteCode;
    const orangeCompanyIdMtibj =
      process.env.ORANGE_COMPANY_ID_MTIBJ && process.env.ORANGE_COMPANY_ID_MTIBJ.length ? String(process.env.ORANGE_COMPANY_ID_MTIBJ) : "MTIB";
    const orangeCompanyId = employeeId.toUpperCase().startsWith("MTIBJ") ? orangeCompanyIdMtibj : orangeCompanyIdDefault;
    const dayTypeQualified = `[${orangeSchema}].[${orangeDayTypeProc}]`;

    const pool = await getOrangePool();
    const request = pool.request();
    request.input("employeeId", sql.NVarChar, employeeId);
    request.input("date", sql.NVarChar, date);
    request.input("companyId", sql.NVarChar, orangeCompanyId);
    const q = `
      SELECT TOP 1
        @employeeId AS employee_id,
        dt.day_type,
        dt.description,
        CONVERT(varchar(5), dt.time_in, 108) AS time_in,
        CONVERT(varchar(5), dt.time_out, 108) AS time_out,
        dt.next_day
      FROM ${dayTypeQualified}(@companyId, @employeeId, @date) AS dt
    `;
    const result = await request.query(q);
    const row = (result.recordset?.[0] as OrangeDayTypeRow | undefined) ?? undefined;
    if (!row) {
      res.json({
        data: {
          employeeId,
          date,
          dayType: "",
          description: "",
          timeIn: "",
          timeOut: "",
          nextDay: false,
        },
      });
      return;
    }
    res.json({
      data: {
        employeeId,
        date,
        dayType: row.day_type ?? "",
        description: row.description ?? "",
        timeIn: formatTime(row.time_in),
        timeOut: formatTime(row.time_out),
        nextDay: toBoolNextDay(row.next_day),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

schedulingRouter.post("/orange/day-type/batch", async (req: Request, res: Response) => {
  try {
    const rawEmployeeIds = (req.body as { employeeIds?: unknown }).employeeIds;
    const date = typeof (req.body as { date?: unknown }).date === "string" ? String((req.body as { date?: unknown }).date).trim() : "";

    if (!Array.isArray(rawEmployeeIds)) {
      res.status(400).json({ error: "employeeIds must be an array of strings" });
      return;
    }
    const employeeIds = rawEmployeeIds.map((v) => String(v).trim()).filter((v) => v.length > 0);
    if (employeeIds.length === 0) {
      res.status(400).json({ error: "employeeIds must not be empty" });
      return;
    }
    if (!date) {
      res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
      return;
    }
    if (employeeIds.length > 5000) {
      res.status(400).json({ error: "employeeIds is too large (max 5000)" });
      return;
    }

    const orangeSchema = process.env.ORANGE_PROC_SCHEMA && process.env.ORANGE_PROC_SCHEMA.length ? String(process.env.ORANGE_PROC_SCHEMA) : "dbo";
    const orangeDayTypeProc = process.env.ORANGE_DAY_TYPE_PROC && process.env.ORANGE_DAY_TYPE_PROC.length ? String(process.env.ORANGE_DAY_TYPE_PROC) : "sp_it_get_day_type";
    const orangeSiteCode = process.env.ORANGE_SITE_CODE && process.env.ORANGE_SITE_CODE.length ? String(process.env.ORANGE_SITE_CODE) : "MTI";
    const orangeCompanyIdDefault =
      process.env.ORANGE_COMPANY_ID_DEFAULT && process.env.ORANGE_COMPANY_ID_DEFAULT.length
        ? String(process.env.ORANGE_COMPANY_ID_DEFAULT)
        : orangeSiteCode;
    const orangeCompanyIdMtibj =
      process.env.ORANGE_COMPANY_ID_MTIBJ && process.env.ORANGE_COMPANY_ID_MTIBJ.length ? String(process.env.ORANGE_COMPANY_ID_MTIBJ) : "MTIB";
    const dayTypeQualified = `[${orangeSchema}].[${orangeDayTypeProc}]`;

    const pool = await getOrangePool();
    const request = pool.request();
    request.input("employeeIds", sql.NVarChar, employeeIds.join(","));
    request.input("date", sql.NVarChar, date);
    request.input("companyIdDefault", sql.NVarChar, orangeCompanyIdDefault);
    request.input("companyIdMtibj", sql.NVarChar, orangeCompanyIdMtibj);

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
        FROM ${dayTypeQualified}(CASE WHEN ids.employee_id LIKE 'MTIBJ%' THEN @companyIdMtibj ELSE @companyIdDefault END, ids.employee_id, @date)
      ) AS dt
      ORDER BY ids.employee_id ASC
    `;

    const result = await request.query(q);
    const rows = (result.recordset ?? []) as OrangeDayTypeRow[];
    const data = rows.map((row) => ({
      employeeId: String(row.employee_id),
      date,
      dayType: row.day_type ?? "",
      description: row.description ?? "",
      timeIn: formatTime(row.time_in),
      timeOut: formatTime(row.time_out),
      nextDay: toBoolNextDay(row.next_day),
    }));
    res.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});
