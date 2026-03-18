import { Router, Request, Response } from "express";
import sql from "mssql";
import { getPool } from "../db";
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

function isMissingObjectError(err: unknown, objectName: string): boolean {
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return message.includes("invalid object name") && message.includes(objectName.toLowerCase());
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
      "SELECT TOP (@limit) ChangeId, StaffNo, ChangedAt, CONVERT(varchar(5), TimeInNew, 108) AS TimeInNew, CONVERT(varchar(5), TimeOutNew, 108) AS TimeOutNew, NextDayNew, SourceHash FROM dbo.ScheduleChangeLog WHERE StaffNo = @employeeId";
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
      timeIn: formatTime(row.TimeInNew),
      timeOut: formatTime(row.TimeOutNew),
      nextDay: toBoolNextDay(row.NextDayNew),
      sourceHash: row.SourceHash ?? "",
    }));
    res.json({ data });
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
      "SELECT TOP 1 ChangeId, StaffNo, ChangedAt, CONVERT(varchar(5), TimeInNew, 108) AS TimeInNew, CONVERT(varchar(5), TimeOutNew, 108) AS TimeOutNew, NextDayNew, SourceHash FROM dbo.ScheduleChangeLog WHERE StaffNo = @employeeId AND ChangedAt <= @at ORDER BY ChangedAt DESC, ChangeId DESC"
    );
    const historyRow = (historyResult.recordset?.[0] as ScheduleChangeLogRow | undefined) ?? undefined;

    const nextReq = pool.request();
    nextReq.input("employeeId", sql.NVarChar, employeeId);
    nextReq.input("at", sql.DateTime, atDate);
    const nextResult = await nextReq.query(
      "SELECT TOP 1 ChangeId, ChangedAt, CONVERT(varchar(5), TimeInNew, 108) AS TimeInNew, CONVERT(varchar(5), TimeOutNew, 108) AS TimeOutNew, NextDayNew FROM dbo.ScheduleChangeLog WHERE StaffNo = @employeeId AND ChangedAt > @at ORDER BY ChangedAt ASC, ChangeId ASC"
    );
    const nextRow = (nextResult.recordset?.[0] as ScheduleChangeLogRow | undefined) ?? undefined;

    if (historyRow) {
      res.json({
        data: {
          employeeId,
          at: atDate.toISOString(),
          source: "history",
          changedAt: historyRow.ChangedAt instanceof Date ? historyRow.ChangedAt.toISOString() : String(historyRow.ChangedAt ?? ""),
          timeIn: formatTime(historyRow.TimeInNew),
          timeOut: formatTime(historyRow.TimeOutNew),
          nextDay: toBoolNextDay(historyRow.NextDayNew),
          sourceHash: historyRow.SourceHash ?? "",
          nextChangeAt: nextRow ? (nextRow.ChangedAt instanceof Date ? nextRow.ChangedAt.toISOString() : String(nextRow.ChangedAt ?? "")) : null,
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
          timeIn: "",
          timeOut: "",
          nextDay: false,
          sourceHash: "",
          nextChangeAt: nextRow ? (nextRow.ChangedAt instanceof Date ? nextRow.ChangedAt.toISOString() : String(nextRow.ChangedAt ?? "")) : null,
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
        timeIn: formatTime(currentRow.time_in),
        timeOut: formatTime(currentRow.time_out),
        nextDay: toBoolNextDay(currentRow.next_day),
        description: currentRow.description ?? "",
        dayType: currentRow.day_type ?? "",
        sourceHash: "",
        nextChangeAt: nextRow ? (nextRow.ChangedAt instanceof Date ? nextRow.ChangedAt.toISOString() : String(nextRow.ChangedAt ?? "")) : null,
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
      "SELECT TOP (@limit) StaffNo, ShiftDate, CONVERT(varchar(5), ScheduledIn, 108) AS ScheduledIn, CONVERT(varchar(5), ScheduledOut, 108) AS ScheduledOut, NextDay, LockedAt, SourceHash FROM dbo.AttendanceScheduleLock WHERE StaffNo = @employeeId";
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
      sourceHash: row.SourceHash ?? "",
    }));
    res.json({ data });
  } catch (err) {
    if (isMissingObjectError(err, "AttendanceScheduleLock")) {
      res.json({ data: [] });
      return;
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});
