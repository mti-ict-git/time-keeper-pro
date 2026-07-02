import "dotenv/config";
import sql from "mssql";
import { getPool } from "../db";
import { getTableColumns } from "../utils/introspection";

type CliArgs = {
  execute: boolean;
  backup: boolean;
  from?: string;
  to?: string;
};

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { execute: false, backup: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i] ?? "";
    if (a === "--execute") out.execute = true;
    else if (a === "--backup") out.backup = true;
    else if (a === "--from") out.from = argv[i + 1];
    else if (a === "--to") out.to = argv[i + 1];
  }
  return out;
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function toDateAtStartOfDayLocal(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map((x) => Number(x));
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

function fmtIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function controllerAllowlist(): string[] {
  const raw = String(process.env.TR_CONTROLLER_LIST ?? "").trim();
  if (raw && !["all", "*", "any"].includes(raw.toLowerCase())) {
    return raw
      .split(",")
      .map((x) => x.trim())
      .filter((x) => x.length > 0);
  }
  return [
    "FR-Acid Halte-4626",
    "FR-Acid Roaster-4102",
    "FR-CCP Office 1 Temp",
    "FR-CCP Office 2 Temp",
    "FR-Chloride Office-5633",
    "FR-Chloride Pos Security-5633",
    "FR-Pyrite Office-5635",
    "FR-Pyrite Toilet-3104",
    "FR-Pyrite Warehouse-4522",
  ];
}

function pickControllerColumn(cols: Array<{ name: string }>): string | null {
  const candidates = ["TrController", "Controller", "controller_name"];
  for (const c of candidates) {
    const hit = cols.find((x) => x.name.toLowerCase() === c.toLowerCase());
    if (hit) return hit.name;
  }
  return null;
}

function pickDateColumn(cols: Array<{ name: string }>): string | null {
  const candidates = ["TrDateTime", "TrDate", "Transaction Date Time", "Transaction Date"];
  for (const c of candidates) {
    const hit = cols.find((x) => x.name.toLowerCase() === c.toLowerCase());
    if (hit) return hit.name;
  }
  const fallback = cols.find((x) => x.name.toLowerCase().includes("date"));
  return fallback ? fallback.name : null;
}

function buildNotInParams(list: string[]): { placeholders: string; binds: Array<{ key: string; value: string }> } {
  const binds = list.map((v, idx) => ({ key: `c${idx}`, value: v }));
  const placeholders = binds.map((b) => `@${b.key}`).join(", ");
  return { placeholders, binds };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const allow = controllerAllowlist();

  const now = new Date();
  const todayIso = fmtIso(now);
  const defaultToIso = todayIso;
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  defaultFrom.setDate(defaultFrom.getDate() - 6);
  const defaultFromIso = fmtIso(defaultFrom);

  const fromIso = args.from && isIsoDate(args.from) ? args.from : defaultFromIso;
  const toIso = args.to && isIsoDate(args.to) ? args.to : defaultToIso;
  const fromStart = toDateAtStartOfDayLocal(fromIso);
  const toStart = toDateAtStartOfDayLocal(toIso);
  const toNext = new Date(toStart);
  toNext.setDate(toNext.getDate() + 1);

  const pool = await getPool();
  const cols = await getTableColumns(pool, "tblAttendanceReport");
  const controllerCol = pickControllerColumn(cols);
  const dateCol = pickDateColumn(cols);

  if (!controllerCol) {
    throw new Error("Cannot find controller column in tblAttendanceReport (expected TrController/Controller).");
  }
  if (!dateCol) {
    throw new Error("Cannot find date column in tblAttendanceReport (expected TrDateTime/TrDate).");
  }

  const { placeholders, binds } = buildNotInParams(allow);
  const trimmedController = `RTRIM(LTRIM([${controllerCol}]))`;
  const dateExpr = `[${dateCol}]`;
  const rangeClause = `${dateExpr} >= @fromDt AND ${dateExpr} < @toNextDt`;

  const baseReq = pool.request();
  baseReq.input("fromDt", sql.DateTime, fromStart);
  baseReq.input("toNextDt", sql.DateTime, toNext);
  for (const b of binds) baseReq.input(b.key, sql.NVarChar, b.value);

  const countsReq = pool.request();
  countsReq.input("fromDt", sql.DateTime, fromStart);
  countsReq.input("toNextDt", sql.DateTime, toNext);
  for (const b of binds) countsReq.input(b.key, sql.NVarChar, b.value);

  const totalRes = await countsReq.query(
    `SELECT COUNT(1) AS c FROM dbo.tblAttendanceReport WHERE ${rangeClause}`
  );
  const totalInRange = Number((totalRes.recordset?.[0] as Record<string, unknown> | undefined)?.["c"] ?? 0);

  const outRes = await baseReq.query(
    `SELECT COUNT(1) AS c FROM dbo.tblAttendanceReport WHERE ${rangeClause} AND [${controllerCol}] IS NOT NULL AND ${trimmedController} NOT IN (${placeholders})`
  );
  const outsideAllow = Number((outRes.recordset?.[0] as Record<string, unknown> | undefined)?.["c"] ?? 0);

  const nullRes = await pool
    .request()
    .input("fromDt", sql.DateTime, fromStart)
    .input("toNextDt", sql.DateTime, toNext)
    .query(`SELECT COUNT(1) AS c FROM dbo.tblAttendanceReport WHERE ${rangeClause} AND [${controllerCol}] IS NULL`);
  const nullControllers = Number((nullRes.recordset?.[0] as Record<string, unknown> | undefined)?.["c"] ?? 0);

  const sampleReq = pool.request();
  sampleReq.input("fromDt", sql.DateTime, fromStart);
  sampleReq.input("toNextDt", sql.DateTime, toNext);
  for (const b of binds) sampleReq.input(b.key, sql.NVarChar, b.value);
  const sampleRes = await sampleReq.query(
    `SELECT TOP 30 ${trimmedController} AS controller, COUNT(1) AS c
     FROM dbo.tblAttendanceReport
     WHERE ${rangeClause} AND [${controllerCol}] IS NOT NULL AND ${trimmedController} NOT IN (${placeholders})
     GROUP BY ${trimmedController}
     ORDER BY COUNT(1) DESC`
  );
  const sample = (sampleRes.recordset ?? []) as Array<Record<string, unknown>>;

  if (!args.execute) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: "dry-run",
          table: "dbo.tblAttendanceReport",
          dateColumn: dateCol,
          controllerColumn: controllerCol,
          range: { from: fromIso, to: toIso },
          allowlistCount: allow.length,
          counts: {
            totalInRange,
            outsideAllowlist: outsideAllow,
            nullControllers,
          },
          topOutsideControllers: sample.map((r) => ({
            controller: String(r["controller"] ?? ""),
            count: Number(r["c"] ?? 0),
          })),
          runExecute:
            "npx tsx backend/scripts/cleanup_attendance_controllers.ts --execute --from YYYY-MM-DD --to YYYY-MM-DD",
          optionalBackup:
            "Add --backup to create dbo.tblAttendanceReport_CleanupBackup_<timestamp> before DELETE",
        },
        null,
        2
      )
    );
    return;
  }

  const tx = new sql.Transaction(pool);
  await tx.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
  try {
    const ts = new Date();
    const stamp = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, "0")}${String(ts.getDate()).padStart(2, "0")}_${String(
      ts.getHours()
    ).padStart(2, "0")}${String(ts.getMinutes()).padStart(2, "0")}${String(ts.getSeconds()).padStart(2, "0")}`;

    if (args.backup) {
      const backupName = `dbo.tblAttendanceReport_CleanupBackup_${stamp}`;
      const backupReq = new sql.Request(tx);
      backupReq.input("fromDt", sql.DateTime, fromStart);
      backupReq.input("toNextDt", sql.DateTime, toNext);
      for (const b of binds) backupReq.input(b.key, sql.NVarChar, b.value);
      await backupReq.query(
        `SELECT *
         INTO ${backupName}
         FROM dbo.tblAttendanceReport
         WHERE ${rangeClause} AND [${controllerCol}] IS NOT NULL AND ${trimmedController} NOT IN (${placeholders});`
      );
    }

    const delReq = new sql.Request(tx);
    delReq.input("fromDt", sql.DateTime, fromStart);
    delReq.input("toNextDt", sql.DateTime, toNext);
    for (const b of binds) delReq.input(b.key, sql.NVarChar, b.value);

    const delRes = await delReq.query(
      `DELETE FROM dbo.tblAttendanceReport
       WHERE ${rangeClause} AND [${controllerCol}] IS NOT NULL AND ${trimmedController} NOT IN (${placeholders});
       SELECT @@ROWCOUNT AS deleted;`
    );
    const deleted = Number((delRes.recordset?.[0] as Record<string, unknown> | undefined)?.["deleted"] ?? 0);
    await tx.commit();

    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: "execute",
          table: "dbo.tblAttendanceReport",
          range: { from: fromIso, to: toIso },
          deleted,
        },
        null,
        2
      )
    );
  } catch (err) {
    try {
      await tx.rollback();
    } catch {
      void 0;
    }
    throw err;
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ ok: false, error: msg }));
  process.exitCode = 1;
});

