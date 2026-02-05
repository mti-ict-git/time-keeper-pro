import { Router, Request, Response } from "express";
import sql from "mssql";
import { getPool } from "../db";
import { getTableColumns } from "../utils/introspection";
import { formatTime, formatDate } from "../utils/format";

export const attendanceRouter = Router();

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
    const from = typeof queryParams.from === "string" ? queryParams.from : "";
    const to = typeof queryParams.to === "string" ? queryParams.to : "";
    const employeeId = typeof queryParams.employeeId === "string" ? queryParams.employeeId : "";
    const department = typeof queryParams.department === "string" ? queryParams.department : "";
    const limitParam = typeof queryParams.limit === "string" ? Number(queryParams.limit) : undefined;
    const limit = Number.isFinite(limitParam || NaN) && (limitParam as number) > 0 ? (limitParam as number) : 200;

    const request = pool.request();
    const conditions: string[] = [];

    const dateCandidates = ["trdate", "trdatetime", "date", "attendance_date", "record_date", "event_date"];
    const dateColumn = dateCandidates.find((n) => cols.some((c) => c.name.toLowerCase() === n)) ||
      (cols.find((c) => c.dataType.toLowerCase().includes("date"))?.name ?? "");

    if (from && to && dateColumn) {
      request.input("from", sql.DateTime, new Date(`${from}T00:00:00`));
      request.input("to", sql.DateTime, new Date(`${to}T23:59:59`));
      conditions.push(`[${dateColumn}] BETWEEN @from AND @to`);
    }

    const empIdCandidates = ["employee_id", "employeeid", "emp_id", "empid", "StaffNo"];
    const empIdColumn = empIdCandidates.find((n) => cols.some((c) => c.name.toLowerCase() === n.toLowerCase()));
    if (employeeId && empIdColumn) {
      request.input("employeeId", sql.NVarChar, employeeId);
      conditions.push(`[${empIdColumn}] = @employeeId`);
    }

    const deptCandidates = ["department", "dept", "Department"];
    const deptColumn = deptCandidates.find((n) => cols.some((c) => c.name.toLowerCase() === n.toLowerCase()));
    if (department && deptColumn) {
      request.input("department", sql.NVarChar, department);
      conditions.push(`[${deptColumn}] = @department`);
    }

    const whereClause = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
    const query = `SELECT TOP ${limit} * FROM tblAttendanceReport${whereClause}`;
    const result = await request.query(query);
    const rows = (result.recordset ?? []) as unknown as Array<Record<string, unknown>>;

    

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
      const ev = String(evRaw).toLowerCase();
      const key = `${staff}|${formatDate(dateRaw)}`;
      const prev = agg.get(key);
      const next: Record<string, unknown> = prev ?? {
        employee_id: staff,
        employee_name: String(name),
        department: String(dept),
        position_title: String(position),
        date: formatDate(dateRaw),
        schedule_label: "",
        scheduled_in: "",
        scheduled_out: "",
        actual_in: "",
        actual_out: "",
        controller_in: "",
        controller_out: "",
        status_in: String(obj["StatusIn"] ?? obj["status_in"] ?? obj["statusin"] ?? ""),
        status_out: String(obj["StatusOut"] ?? obj["status_out"] ?? obj["statusout"] ?? ""),
      };
      
      const schedIn = formatTime(obj["ScheduledClockIn"] ?? obj["scheduled_clock_in"] ?? obj["scheduledin"] ?? "");
      const schedOut = formatTime(obj["ScheduledClockOut"] ?? obj["scheduled_clock_out"] ?? obj["scheduledout"] ?? "");
      if (schedIn) next["scheduled_in"] = schedIn;
      if (schedOut) next["scheduled_out"] = schedOut;
      const actual = formatTime(dtRaw);
      if (ev.includes("in")) {
        const existing = String(next["actual_in"] || "");
        next["actual_in"] = existing && actual ? (existing < actual ? existing : actual) : actual || existing;
        const ctrl = String(obj["TrController"] ?? obj["controller_name"] ?? obj["Controller"] ?? "");
        if (ctrl) next["controller_in"] = ctrl;
      }
      if (ev.includes("out")) {
        const existing = String(next["actual_out"] || "");
        next["actual_out"] = existing && actual ? (existing > actual ? existing : actual) : actual || existing;
        const ctrl = String(obj["TrController"] ?? obj["controller_name"] ?? obj["Controller"] ?? "");
        if (ctrl) next["controller_out"] = ctrl;
      }
      agg.set(key, next);
    }

    const data = Array.from(agg.values());
    res.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});
