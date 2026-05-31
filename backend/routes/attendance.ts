import { Router, Request, Response } from "express";
import sql from "mssql";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
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
  const startedAt = new Date();
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

  return await new Promise<AttendanceRunLog>((resolve) => {
    const child = spawn(attPythonExe, args, { cwd: process.cwd(), env: process.env, windowsHide: true });
    let out = "";
    let err = "";
    child.stdout.on("data", (d: Buffer) => {
      out += d.toString("utf8");
    });
    child.stderr.on("data", (d: Buffer) => {
      err += d.toString("utf8");
    });
    child.on("error", (e) => {
      const finishedAt = new Date();
      resolve({
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
      resolve({
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        success: code === 0,
        exitCode: typeof code === "number" ? code : null,
        error: code === 0 ? undefined : `Exited with code ${String(code)}`,
        stdout: out,
        stderr: err,
      });
    });
  });
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
    lastRun: attLastRun,
  });
});

attendanceRouter.post("/runner/run", async (_req: Request, res: Response) => {
  await runAttendanceNow();
  res.json({ lastRun: attLastRun });
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
