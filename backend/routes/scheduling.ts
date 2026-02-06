import { Router, Request, Response } from "express";
import sql from "mssql";
import { getPool } from "../db";
import { formatTime, toBoolNextDay } from "../utils/format";
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
