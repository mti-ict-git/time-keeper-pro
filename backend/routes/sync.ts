import { Router, Request, Response } from "express";
import { runScheduleSync, SyncResult } from "../sync";
import { getPool } from "../db";

export const syncRouter = Router();

type SyncLog = SyncResult & { success: boolean; error?: string };

let lastRun: SyncLog | null = null;
let running = false;
let intervalMinutes = process.env.SYNC_INTERVAL_MINUTES ? Number(process.env.SYNC_INTERVAL_MINUTES) : 5;
let enabled = true;
let nextRunAt: Date | null = null;
let timer: NodeJS.Timeout | null = null;
let retrying = false;
let retryCount = 0;
const retryBaseMs = process.env.SYNC_RETRY_BASE_MS ? Number(process.env.SYNC_RETRY_BASE_MS) : 30000;
const retryMaxMs = process.env.SYNC_RETRY_MAX_MS ? Number(process.env.SYNC_RETRY_MAX_MS) : 300000;

async function ensureSettingsTable(): Promise<void> {
  const pool = await getPool();
  await pool.request().query(
    "IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SyncSettings') BEGIN CREATE TABLE SyncSettings (id INT NOT NULL PRIMARY KEY, enabled BIT NOT NULL DEFAULT(1), intervalMinutes INT NOT NULL DEFAULT(5), updatedAt DATETIME NOT NULL DEFAULT(GETDATE())) END"
  );
}

async function ensureLogsTable(): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .query(
      "IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SyncLogs') BEGIN CREATE TABLE SyncLogs (id INT IDENTITY(1,1) NOT NULL PRIMARY KEY, timestamp DATETIME NOT NULL DEFAULT(GETDATE()), total INT NOT NULL, updated INT NOT NULL, inserted INT NOT NULL, unchanged INT NOT NULL, success BIT NOT NULL, error NVARCHAR(MAX) NULL, detailsUpdated NVARCHAR(MAX) NULL, detailsInserted NVARCHAR(MAX) NULL, runId UNIQUEIDENTIFIER NULL) END"
    );
}

async function saveLog(log: SyncLog): Promise<void> {
  await ensureLogsTable();
  const pool = await getPool();
  const req = pool.request();
  req.input("timestamp", log.timestamp);
  req.input("total", log.total);
  req.input("updated", log.updated);
  req.input("inserted", log.inserted);
  req.input("unchanged", log.unchanged);
  req.input("success", log.success ? 1 : 0);
  req.input("error", log.error ?? null);
  req.input("detailsUpdated", JSON.stringify(log.detailsUpdated));
  req.input("detailsInserted", JSON.stringify(log.detailsInserted));
  req.input("runId", log.runId);
  await req.query(
    "INSERT INTO SyncLogs (timestamp, total, updated, inserted, unchanged, success, error, detailsUpdated, detailsInserted, runId) VALUES (@timestamp, @total, @updated, @inserted, @unchanged, @success, @error, @detailsUpdated, @detailsInserted, @runId)"
  );
}

async function fetchLogs(limit: number, offset: number, withChangesOnly: boolean): Promise<{ rows: SyncLog[]; total: number }> {
  await ensureLogsTable();
  const pool = await getPool();
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 50;
  const safeOffset = Number.isFinite(offset) && offset >= 0 ? Math.floor(offset) : 0;

  const whereClause = withChangesOnly ? "WHERE (updated + inserted) > 0" : "";
  const countReq = pool.request();
  const countResult = await countReq.query(`SELECT COUNT(*) AS cnt FROM SyncLogs ${whereClause}`);
  const totalRow = countResult.recordset?.[0] as { cnt?: unknown } | undefined;
  const total = Number(totalRow?.cnt ?? 0);

  const dataReq = pool.request();
  dataReq.input("limit", safeLimit);
  dataReq.input("offset", safeOffset);
  const baseQuery =
    "SELECT timestamp, total, updated, inserted, unchanged, success, error, detailsUpdated, detailsInserted, runId FROM SyncLogs";
  const filterQuery = withChangesOnly ? " WHERE (updated + inserted) > 0" : "";
  const pagingQuery =
    " ORDER BY id DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY";
  const result = await dataReq.query(baseQuery + filterQuery + pagingQuery);
  const rows = result.recordset ?? [];
  const mapped = rows.map((r: Record<string, unknown>) => {
    const tsRaw = r["timestamp"];
    const ts = tsRaw instanceof Date ? tsRaw : new Date(String(tsRaw ?? ""));
    const total = Number(r["total"] ?? 0);
    const updated = Number(r["updated"] ?? 0);
    const inserted = Number(r["inserted"] ?? 0);
    const unchanged = Number(r["unchanged"] ?? 0);
    const successVal = r["success"];
    const success = String(successVal) === "true" || Number(successVal) === 1;
    const errRaw = r["error"];
    const error = errRaw === null || errRaw === undefined ? undefined : String(errRaw);
    const du = r["detailsUpdated"];
    const di = r["detailsInserted"];
    const runIdRaw = r["runId"];
    let detailsUpdated: string[] = [];
    let detailsInserted: string[] = [];
    try {
      detailsUpdated = typeof du === "string" ? (JSON.parse(du) as string[]) : [];
    } catch {
      detailsUpdated = [];
    }
    try {
      detailsInserted = typeof di === "string" ? (JSON.parse(di) as string[]) : [];
    } catch {
      detailsInserted = [];
    }
    const runId = runIdRaw === null || runIdRaw === undefined ? "" : String(runIdRaw);
    return { timestamp: ts, total, updated, inserted, unchanged, detailsUpdated, detailsInserted, success, error, runId };
  });

  return { rows: mapped, total };
}

async function loadSettings(): Promise<void> {
  await ensureSettingsTable();
  const pool = await getPool();
  const res = await pool.request().query("SELECT TOP 1 id, enabled, intervalMinutes FROM SyncSettings ORDER BY id ASC");
  const row = res.recordset?.[0] as { id?: unknown; enabled?: unknown; intervalMinutes?: unknown } | undefined;
  if (!row) {
    const req = pool.request();
    req.input("id", 1);
    req.input("enabled", enabled ? 1 : 0);
    req.input("intervalMinutes", intervalMinutes);
    await req.query("INSERT INTO SyncSettings (id, enabled, intervalMinutes) VALUES (@id, @enabled, @intervalMinutes)");
    return;
  }
  enabled = String(row.enabled) === "true" || Number(row.enabled) === 1;
  const m = Number(row.intervalMinutes);
  if (Number.isFinite(m) && m > 0) intervalMinutes = m;
}

async function saveSettings(nextEnabled: boolean, nextInterval: number): Promise<void> {
  await ensureSettingsTable();
  const pool = await getPool();
  const req = pool.request();
  req.input("id", 1);
  req.input("enabled", nextEnabled ? 1 : 0);
  req.input("intervalMinutes", nextInterval);
  await req.query(
    "MERGE SyncSettings AS t USING (SELECT @id AS id) AS s ON t.id = s.id WHEN MATCHED THEN UPDATE SET enabled = @enabled, intervalMinutes = @intervalMinutes, updatedAt = GETDATE() WHEN NOT MATCHED THEN INSERT (id, enabled, intervalMinutes, updatedAt) VALUES (@id, @enabled, @intervalMinutes, GETDATE());"
  );
}

function scheduleNext() {
  if (timer) clearTimeout(timer);
  if (!enabled) {
    nextRunAt = null;
    return;
  }
  const ms = Math.max(1, intervalMinutes) * 60 * 1000;
  nextRunAt = new Date(Date.now() + ms);
  timer = setTimeout(async () => {
    await runNow();
    if (retrying) {
      const m = Math.min(retryBaseMs * Math.pow(2, Math.max(0, retryCount - 1)), retryMaxMs);
      scheduleAfter(m);
    } else {
      scheduleNext();
    }
  }, ms);
}

function scheduleAfter(ms: number) {
  if (timer) clearTimeout(timer);
  nextRunAt = new Date(Date.now() + ms);
  timer = setTimeout(async () => {
    await runNow();
    if (retrying) {
      const m = Math.min(retryBaseMs * Math.pow(2, Math.max(0, retryCount - 1)), retryMaxMs);
      scheduleAfter(m);
    } else {
      scheduleNext();
    }
  }, ms);
}

async function runNow() {
  if (running) return;
  
  // Distributed check: Ensure we don't run if another instance just ran
  try {
    const logs = await fetchLogs(1);
    const lastLog = logs[0];
    if (lastLog && enabled) {
      const elapsed = Date.now() - lastLog.timestamp.getTime();
      const minInterval = (intervalMinutes * 60 * 1000) - 10000; // 10s buffer
      if (elapsed < minInterval) {
        console.log(`[Sync] Skipping run. Last run was ${Math.round(elapsed / 1000)}s ago (Interval: ${intervalMinutes}m)`);
        return;
      }
    }
  } catch (err) {
    console.warn("[Sync] Failed to check last run time:", err);
    // Proceed cautiously
  }

  running = true;
  try {
    const result = await runScheduleSync();
    lastRun = { ...result, success: true };
    await saveLog(lastRun);
    retrying = false;
    retryCount = 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    lastRun = {
      total: 0,
      updated: 0,
      inserted: 0,
      unchanged: 0,
      detailsUpdated: [],
      detailsInserted: [],
      timestamp: new Date(),
      runId: "",
      success: false,
      error: message,
    };
    await saveLog(lastRun);
    retrying = true;
    retryCount += 1;
  } finally {
    running = false;
  }
}

syncRouter.get("/status", (_req: Request, res: Response) => {
  res.json({
    running,
    intervalMinutes,
    enabled,
    nextRunAt,
    retrying,
    retryCount,
    lastRun,
  });
});

syncRouter.post("/run", async (_req: Request, res: Response) => {
  await runNow();
  res.json({ lastRun });
});

syncRouter.put("/config", async (req: Request, res: Response) => {
  const m = Number((req.body?.intervalMinutes as unknown) ?? 0);
  const en = Boolean(req.body?.enabled);
  if (!Number.isFinite(m) || m <= 0) {
    res.status(400).json({ error: "intervalMinutes must be a positive number" });
    return;
  }
  intervalMinutes = m;
  enabled = en;
  await saveSettings(enabled, intervalMinutes);
  scheduleNext();
  res.json({ intervalMinutes, enabled, nextRunAt });
});

syncRouter.get("/logs", async (req: Request, res: Response) => {
  const pageParam = Number(String(req.query.page ?? "").trim() || "0");
  const pageSizeParam = Number(String(req.query.pageSize ?? "").trim() || "0");
  const withChangesRaw = String(req.query.withChanges ?? "").toLowerCase();

  const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
  const pageSize = Number.isFinite(pageSizeParam) && pageSizeParam > 0 ? Math.floor(pageSizeParam) : 20;
  const withChangesOnly = withChangesRaw === "true" || withChangesRaw === "1";

  const offset = (page - 1) * pageSize;
  const { rows, total } = await fetchLogs(pageSize, offset, withChangesOnly);
  const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;

  res.json({ logs: rows, page, pageSize, total, totalPages });
});

Promise.all([loadSettings(), ensureLogsTable()]).then(() => scheduleNext());
