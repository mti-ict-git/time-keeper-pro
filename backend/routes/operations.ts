import { Router, Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import path from "node:path";
import { spawn } from "node:child_process";
import sql from "mssql";
import { getPool } from "../db";
import {
  fetchOrangeDayTypeBatch,
  fetchOrangeEmployeeIds,
  upsertOrangeScheduleDaily,
  type OrangeScheduleDailyUpsert,
} from "./scheduling";
import { formatTime, toBoolNextDay } from "../utils/format";

export const operationsRouter = Router();

type JobStatus = "queued" | "running" | "succeeded" | "failed";
type Job = {
  id: string;
  type: string;
  status: JobStatus;
  params: Record<string, unknown>;
  progress: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

const jobs = new Map<string, Job>();
let activeMutationJobId: string | null = null;

function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function ipv4ToInt(value: string): number | null {
  const parts = value.replace(/^::ffff:/, "").split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

function ipAllowed(ip: string, rules: string[]): boolean {
  const normalized = ip.replace(/^::ffff:/, "");
  return rules.some((rule) => {
    if (rule === normalized || (rule === "::1" && ip === "::1")) return true;
    const [network, bitsRaw] = rule.split("/");
    const bits = Number(bitsRaw);
    const addressInt = ipv4ToInt(normalized);
    const networkInt = ipv4ToInt(network);
    if (addressInt === null || networkInt === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (addressInt & mask) === (networkInt & mask);
  });
}

operationsRouter.use((req: Request, res: Response, next: NextFunction) => {
  const configured = String(process.env.OPERATIONS_API_KEY ?? "").trim();
  if (!configured) {
    res.status(503).json({ error: "Operations API is not configured" });
    return;
  }
  const supplied = String(req.header("X-Operations-Key") ?? "").trim();
  if (!supplied || !safeEqual(supplied, configured)) {
    res.status(401).json({ error: "Invalid operations API key" });
    return;
  }
  const rules = String(process.env.OPERATIONS_ALLOWED_IPS ?? "127.0.0.1,::1")
    .split(",").map((v) => v.trim()).filter(Boolean);
  if (!ipAllowed(req.ip || req.socket.remoteAddress || "", rules)) {
    res.status(403).json({ error: "Source IP is not allowed" });
    return;
  }
  next();
});

async function ensureJobsTable(): Promise<void> {
  const pool = await getPool();
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'OperationsJobs')
    BEGIN
      CREATE TABLE dbo.OperationsJobs (
        id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
        type NVARCHAR(80) NOT NULL,
        status NVARCHAR(20) NOT NULL,
        paramsJson NVARCHAR(MAX) NULL,
        progressJson NVARCHAR(MAX) NULL,
        resultJson NVARCHAR(MAX) NULL,
        error NVARCHAR(MAX) NULL,
        createdAt DATETIME2 NOT NULL,
        startedAt DATETIME2 NULL,
        finishedAt DATETIME2 NULL
      );
      CREATE INDEX IX_OperationsJobs_CreatedAt ON dbo.OperationsJobs(createdAt DESC);
    END
  `);
}

async function persistJob(job: Job): Promise<void> {
  await ensureJobsTable();
  const pool = await getPool();
  const req = pool.request();
  req.input("id", sql.UniqueIdentifier, job.id);
  req.input("type", sql.NVarChar, job.type);
  req.input("status", sql.NVarChar, job.status);
  req.input("paramsJson", sql.NVarChar(sql.MAX), JSON.stringify(job.params));
  req.input("progressJson", sql.NVarChar(sql.MAX), JSON.stringify(job.progress));
  req.input("resultJson", sql.NVarChar(sql.MAX), job.result ? JSON.stringify(job.result) : null);
  req.input("error", sql.NVarChar(sql.MAX), job.error);
  req.input("createdAt", sql.DateTime2, job.createdAt);
  req.input("startedAt", sql.DateTime2, job.startedAt);
  req.input("finishedAt", sql.DateTime2, job.finishedAt);
  await req.query(`
    MERGE dbo.OperationsJobs AS t
    USING (SELECT @id AS id) AS s ON t.id = s.id
    WHEN MATCHED THEN UPDATE SET status=@status, progressJson=@progressJson, resultJson=@resultJson,
      error=@error, startedAt=@startedAt, finishedAt=@finishedAt
    WHEN NOT MATCHED THEN INSERT (id,type,status,paramsJson,progressJson,resultJson,error,createdAt,startedAt,finishedAt)
      VALUES (@id,@type,@status,@paramsJson,@progressJson,@resultJson,@error,@createdAt,@startedAt,@finishedAt);
  `);
}

function publicJob(job: Job): Job {
  return { ...job };
}

async function enqueue(
  type: string,
  params: Record<string, unknown>,
  task: (update: (progress: Record<string, unknown>) => Promise<void>) => Promise<Record<string, unknown>>
): Promise<Job> {
  if (activeMutationJobId) throw new Error(`Another mutation job is active: ${activeMutationJobId}`);
  const job: Job = {
    id: crypto.randomUUID(), type, status: "queued", params, progress: {}, result: null, error: null,
    createdAt: new Date(), startedAt: null, finishedAt: null,
  };
  jobs.set(job.id, job);
  activeMutationJobId = job.id;
  try {
    await persistJob(job);
  } catch (err) {
    activeMutationJobId = null;
    jobs.delete(job.id);
    throw err;
  }
  setImmediate(async () => {
    try {
      job.status = "running";
      job.startedAt = new Date();
      await persistJob(job);
      const update = async (progress: Record<string, unknown>) => {
        job.progress = progress;
        await persistJob(job);
      };
      job.result = await task(update);
      job.status = "succeeded";
    } catch (err) {
      job.status = "failed";
      job.error = err instanceof Error ? err.message : String(err);
    } finally {
      job.finishedAt = new Date();
      activeMutationJobId = null;
      await persistJob(job);
    }
  });
  return job;
}

const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;
function dateRange(fromRaw: unknown, toRaw: unknown, maxDays: number): string[] {
  const from = String(fromRaw ?? "").trim();
  const to = String(toRaw ?? "").trim();
  if (!isoDateRe.test(from) || !isoDateRe.test(to)) throw new Error("from/to must use YYYY-MM-DD");
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const count = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  if (count <= 0 || count > maxDays) throw new Error(`Date range must be 1-${maxDays} days`);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

function parseEmployeeIds(body: Record<string, unknown>): string[] | null {
  if (body.scope === "all") return null;
  const raw = body.employeeIds ?? (body.employeeId ? [body.employeeId] : undefined);
  if (!Array.isArray(raw)) throw new Error("Use scope=all or provide employeeId/employeeIds");
  const ids = [...new Set(raw.map((v) => String(v).trim()).filter(Boolean))];
  if (!ids.length || ids.length > 5000) throw new Error("employeeIds must contain 1-5000 values");
  return ids;
}

function makeScheduleRow(employeeId: string, date: string, row: Record<string, unknown>): OrangeScheduleDailyUpsert {
  const timeInRaw = formatTime(row.time_in);
  const timeOutRaw = formatTime(row.time_out);
  const timeIn = timeInRaw ? `${timeInRaw}:00` : null;
  const timeOut = timeOutRaw ? `${timeOutRaw}:00` : null;
  const dayType = String(row.day_type ?? "");
  const description = String(row.description ?? "");
  const nextDay = toBoolNextDay((row.next_day as string | number | boolean | null) ?? null);
  const sourceHash = crypto.createHash("sha256")
    .update([employeeId, date, dayType, description, timeIn ?? "", timeOut ?? "", nextDay ? "1" : "0"].join("|"))
    .digest("hex");
  return { staffNo: employeeId, shiftDate: date, timeIn, timeOut, nextDay, dayType, description, fetchedAt: new Date().toISOString(), sourceHash };
}

operationsRouter.get("/jobs/:id", async (req: Request, res: Response) => {
  const inMemory = jobs.get(String(req.params.id));
  if (inMemory) { res.json(publicJob(inMemory)); return; }
  await ensureJobsTable();
  const pool = await getPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, String(req.params.id));
  const result = await request.query("SELECT TOP 1 * FROM dbo.OperationsJobs WHERE id=@id");
  if (!result.recordset?.[0]) { res.status(404).json({ error: "Job not found" }); return; }
  res.json(result.recordset[0]);
});

operationsRouter.get("/schedules/compare", async (req: Request, res: Response) => {
  try {
    const employeeId = String(req.query.employeeId ?? "").trim();
    if (!employeeId) throw new Error("employeeId is required");
    const dates = dateRange(req.query.from, req.query.to, 31);
    const pool = await getPool();
    const request = pool.request();
    request.input("employeeId", sql.NVarChar, employeeId);
    request.input("from", sql.NVarChar, dates[0]);
    request.input("to", sql.NVarChar, dates[dates.length - 1]);
    const cached = await request.query("SELECT StaffNo, CONVERT(varchar(10),ShiftDate,23) ShiftDate, CONVERT(varchar(5),TimeIn,108) TimeIn, CONVERT(varchar(5),TimeOut,108) TimeOut, NextDay, DayType, Description FROM dbo.OrangeScheduleDaily WHERE StaffNo=@employeeId AND ShiftDate BETWEEN @from AND @to");
    const cacheMap = new Map((cached.recordset ?? []).map((r: Record<string, unknown>) => [String(r.ShiftDate), r]));
    const rows = [];
    for (const date of dates) {
      const sourceRows = await fetchOrangeDayTypeBatch(date, [employeeId]);
      const source = (sourceRows[0] ?? null) as Record<string, unknown> | null;
      const cache = (cacheMap.get(date) ?? null) as Record<string, unknown> | null;
      const sourceSig = source ? [formatTime(source.time_in), formatTime(source.time_out), toBoolNextDay((source.next_day as never) ?? null), String(source.day_type ?? ""), String(source.description ?? "")].join("|") : "";
      const cacheSig = cache ? [formatTime(cache.TimeIn), formatTime(cache.TimeOut), toBoolNextDay((cache.NextDay as never) ?? null), String(cache.DayType ?? ""), String(cache.Description ?? "")].join("|") : "";
      rows.push({ date, status: !source ? "missing_source" : !cache ? "missing_cache" : sourceSig === cacheSig ? "matched" : "different", source, cache });
    }
    res.json({ employeeId, from: dates[0], to: dates[dates.length - 1], rows });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

operationsRouter.post("/schedules/backfill", async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const dates = dateRange(body.from, body.to, 120);
    const selectedIds = parseEmployeeIds(body);
    if (!selectedIds && body.confirm !== true) throw new Error("confirm=true is required for scope=all");
    const params = { from: dates[0], to: dates[dates.length - 1], employeeIds: selectedIds, scope: selectedIds ? "selected" : "all" };
    const job = await enqueue("schedule_backfill", params, async (update) => {
      const employeeIds = selectedIds ?? await fetchOrangeEmployeeIds();
      let inserted = 0, updated = 0, processed = 0;
      for (const date of dates) {
        for (let i = 0; i < employeeIds.length; i += 1000) {
          const chunk = employeeIds.slice(i, i + 1000);
          const source = await fetchOrangeDayTypeBatch(date, chunk);
          const result = await upsertOrangeScheduleDaily(source.map((r) => makeScheduleRow(String(r.employee_id), date, r as unknown as Record<string, unknown>)));
          inserted += result.inserted; updated += result.updated; processed += chunk.length;
          await update({ date, processed, total: employeeIds.length * dates.length, inserted, updated });
        }
      }
      return { employees: employeeIds.length, dates: dates.length, inserted, updated };
    });
    res.status(202).json(publicJob(job));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(message.startsWith("Another mutation") ? 409 : 400).json({ error: message });
  }
});

function runPython(args: string[], envOverride?: Record<string, string>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const python = String(process.env.ATTENDANCE_PYTHON ?? "python");
    const script = path.resolve(process.cwd(), String(process.env.ATTENDANCE_SCRIPT ?? "backend/attendance_report_modv8_1.py"));
    const child = spawn(python, [script, ...args], { cwd: process.cwd(), env: { ...process.env, ...envOverride }, windowsHide: true });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d: Buffer) => { stdout += d.toString("utf8"); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString("utf8"); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve({ exitCode: code, stdout: stdout.slice(-20000), stderr: stderr.slice(-20000) }) : reject(new Error(stderr || stdout || `Python exited ${code}`)));
  });
}

operationsRouter.post("/attendance/backfill", async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const dates = dateRange(body.from, body.to, 31);
    const ids = parseEmployeeIds(body);
    if ((!ids || body.replace === true) && body.confirm !== true) throw new Error("confirm=true is required for scope=all or replace=true");
    if (ids && ids.length > 1) throw new Error("Attendance backfill supports one employeeId or scope=all");
    const args = ["--insert-att", "--no-report", "--start-date", dates[0], "--end-date", dates[dates.length - 1]];
    if (ids?.[0]) args.push("--staff-no", ids[0]);
    if (body.replace === true) args.push("--force-replace");
    const params = { from: dates[0], to: dates[dates.length - 1], employeeId: ids?.[0] ?? null, scope: ids ? "selected" : "all", replace: body.replace === true };
    const job = await enqueue("attendance_backfill", params, async (update) => {
      await update({ phase: "processing" });
      return await runPython(args, { ATTENDANCE_WAID: "" });
    });
    res.status(202).json(publicJob(job));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(message.startsWith("Another mutation") ? 409 : 400).json({ error: message });
  }
});

async function attendanceCandidates(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const dates = dateRange(body.from, body.to, 31);
  const ids = parseEmployeeIds(body);
  if (ids && ids.length > 1) throw new Error("Attendance push supports one employeeId or scope=all");
  const repush = body.repush === true;
  const pool = await getPool();
  const request = pool.request();
  request.input("from", sql.NVarChar, dates[0]);
  request.input("to", sql.NVarChar, dates[dates.length - 1]);
  request.input("employeeId", sql.NVarChar, ids?.[0] ?? null);
  const result = await request.query(`SELECT COUNT(*) total, SUM(CASE WHEN Processed=0 THEN 1 ELSE 0 END) pending, MIN(TrDateTime) firstAt, MAX(TrDateTime) lastAt FROM dbo.tblAttendanceReport WHERE StaffNo LIKE 'MTI%' AND ClockEvent IN ('Clock In','Clock Out') AND TrDate BETWEEN @from AND @to AND (@employeeId IS NULL OR StaffNo=@employeeId) ${repush ? "" : "AND Processed=0"}`);
  return { from: dates[0], to: dates[dates.length - 1], employeeId: ids?.[0] ?? null, scope: ids ? "selected" : "all", repush, ...(result.recordset?.[0] ?? {}) };
}

operationsRouter.post("/attendance/push/preview", async (req: Request, res: Response) => {
  try { res.json(await attendanceCandidates((req.body ?? {}) as Record<string, unknown>)); }
  catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : String(err) }); }
});

operationsRouter.post("/attendance/push", async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const preview = await attendanceCandidates(body);
    if ((!preview.employeeId || preview.repush) && body.confirm !== true) throw new Error("confirm=true is required for scope=all or repush=true");
    const limit = Math.min(50000, Math.max(1, Number(body.limit ?? 5000)));
    const args = ["--push-mcg", "--push-limit", String(Math.floor(limit)), "--push-start-date", String(preview.from), "--push-end-date", String(preview.to)];
    if (preview.employeeId) args.push("--push-staff-no", String(preview.employeeId));
    if (preview.repush) args.push("--repush");
    const job = await enqueue("attendance_push", { ...preview, limit }, async (update) => {
      await update({ phase: "pushing", candidates: preview.total });
      return await runPython(args, { ATTENDANCE_WAID: "" });
    });
    res.status(202).json(publicJob(job));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(message.startsWith("Another mutation") ? 409 : 400).json({ error: message });
  }
});
