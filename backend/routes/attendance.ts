import { Router, Request, Response } from "express";
import sql from "mssql";
import { getPool } from "../db";
import { getTableColumns } from "../utils/introspection";
import { formatTime, formatDate, toBoolNextDay } from "../utils/format";

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
    const search = typeof queryParams.search === "string" ? queryParams.search.trim() : "";
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
      const isDateTimeCol = dateColumn.toLowerCase().includes("datetime");
      if (isDateTimeCol) {
        request.input("from", sql.DateTime, new Date(`${from}T16:00:00Z`));
        request.input("to", sql.DateTime, new Date(`${to}T15:59:59Z`));
      } else {
        request.input("from", sql.DateTime, new Date(`${from}T00:00:00`));
        request.input("to", sql.DateTime, new Date(`${to}T23:59:59`));
      }
      conditions.push(`[${dateColumn}] BETWEEN @from AND @to`);
    }

    const empIdCandidates = ["employee_id", "employeeid", "emp_id", "empid", "StaffNo"];
    const empIdColumns = empIdCandidates.filter((n) => cols.some((c) => c.name.toLowerCase() === n.toLowerCase()));
    if (employeeId && empIdColumns.length) {
      request.input("employeeId", sql.NVarChar, employeeId);
      const eqParts = empIdColumns.map((c) => `RTRIM(LTRIM([${c}])) = RTRIM(LTRIM(@employeeId))`);
      conditions.push(`(${eqParts.join(" OR ")})`);
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
    const query = `SELECT TOP ${limit} * FROM tblAttendanceReport${whereClause}${orderClause}`;
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
      v["status_in"] = computeStatus(si, ai, true);
      v["status_out"] = computeStatus(so, ao, false);
    }

    const data = Array.from(agg.values()).sort((a, b) => String(b["date"] || "").localeCompare(String(a["date"] || "")));
    res.json({ data, scheduleSource: scheduleMap.size > 0 ? "OrangeScheduleDaily" : "tblAttendanceReport" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});
