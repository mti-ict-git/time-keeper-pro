import "dotenv/config";
import crypto from "crypto";
import sql from "mssql";
import { getPool } from "../db";

type CliArgs = {
  staffNo: string;
  timeIn: string;
  timeOut: string;
  nextDay: boolean;
  apply: boolean;
  changedAtIso: string | null;
  skipLog: boolean;
};

type MtiUserScheduleSnapshot = {
  employee_id: string;
  employee_name: string | null;
  gender: string | null;
  division: string | null;
  department: string | null;
  section: string | null;
  supervisor_id: string | null;
  supervisor_name: string | null;
  position_title: string | null;
  grade_interval: string | null;
  phone: string | null;
  day_type: string | null;
  description: string | null;
  time_in: string | null;
  time_out: string | null;
  next_day: string | number | boolean | null;
};

function s(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function coerceScalar(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

function hashMtiRow(row: MtiUserScheduleSnapshot): string {
  const payload = [
    s(row.employee_name),
    s(row.gender),
    s(row.division),
    s(row.department),
    s(row.section),
    s(row.supervisor_id),
    s(row.supervisor_name),
    s(row.position_title),
    s(row.grade_interval),
    s(row.phone),
    s(row.day_type),
    s(row.description),
    s(row.time_in),
    s(row.time_out),
    s(row.next_day),
  ].join("|");
  return crypto.createHash("sha256").update(payload, "utf-8").digest("hex");
}

function isTimeHHMM(v: string): boolean {
  const m = /^\d{2}:\d{2}$/.exec(v.trim());
  if (!m) return false;
  const [hh, mm] = v.split(":").map((x) => Number(x));
  return Number.isInteger(hh) && Number.isInteger(mm) && hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
}

function parseBool(v: string): boolean {
  const t = v.trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(t)) return true;
  if (["0", "false", "no", "n"].includes(t)) return false;
  throw new Error(`Invalid boolean value: ${v}`);
}

function requireArg(args: Record<string, string | undefined>, key: string): string {
  const v = args[key];
  if (!v) throw new Error(`Missing required arg: --${key}`);
  return v;
}

function parseArgs(argv: string[]): CliArgs {
  const map: Record<string, string | undefined> = {};
  const flags = new Set<string>();
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }
    const name = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      flags.add(name);
      continue;
    }
    map[name] = next;
    i += 1;
  }

  const staffNo = requireArg(map, "staff-no").trim();
  const timeIn = requireArg(map, "time-in").trim();
  const timeOut = requireArg(map, "time-out").trim();
  const nextDayRaw = requireArg(map, "next-day");
  const changedAtIso = (map["changed-at"] ?? "").trim() || null;

  if (!/^MTI\d+$/i.test(staffNo)) {
    throw new Error(`Invalid staff-no: ${staffNo}`);
  }
  if (!isTimeHHMM(timeIn)) {
    throw new Error(`Invalid --time-in (expected HH:MM): ${timeIn}`);
  }
  if (!isTimeHHMM(timeOut)) {
    throw new Error(`Invalid --time-out (expected HH:MM): ${timeOut}`);
  }

  if (changedAtIso) {
    const dt = new Date(changedAtIso);
    if (Number.isNaN(dt.getTime())) {
      throw new Error(`Invalid --changed-at (expected ISO datetime): ${changedAtIso}`);
    }
  }

  return {
    staffNo: staffNo.toUpperCase(),
    timeIn,
    timeOut,
    nextDay: parseBool(nextDayRaw),
    apply: flags.has("apply"),
    changedAtIso,
    skipLog: flags.has("skip-log"),
  };
}

async function fetchExisting(pool: sql.ConnectionPool, staffNo: string): Promise<MtiUserScheduleSnapshot | null> {
  const req = pool.request();
  req.input("employee_id", sql.NVarChar, staffNo);
  const res = await req.query(
    "SELECT employee_id, employee_name, gender, division, department, section, supervisor_id, supervisor_name, position_title, grade_interval, phone, day_type, description, CONVERT(varchar(5), time_in, 108) AS time_in, CONVERT(varchar(5), time_out, 108) AS time_out, next_day FROM dbo.MTIUsers WHERE employee_id=@employee_id"
  );
  const row = res.recordset?.[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    employee_id: s(row["employee_id"]),
    employee_name: s(row["employee_name"]) || null,
    gender: s(row["gender"]) || null,
    division: s(row["division"]) || null,
    department: s(row["department"]) || null,
    section: s(row["section"]) || null,
    supervisor_id: s(row["supervisor_id"]) || null,
    supervisor_name: s(row["supervisor_name"]) || null,
    position_title: s(row["position_title"]) || null,
    grade_interval: s(row["grade_interval"]) || null,
    phone: s(row["phone"]) || null,
    day_type: s(row["day_type"]) || null,
    description: s(row["description"]) || null,
    time_in: s(row["time_in"]) || null,
    time_out: s(row["time_out"]) || null,
    next_day: coerceScalar(row["next_day"]),
  };
}

async function applyChange(
  pool: sql.ConnectionPool,
  existing: MtiUserScheduleSnapshot,
  next: { timeIn: string; timeOut: string; nextDay: boolean; sourceHash: string },
  opts: { changedAtIso: string | null; skipLog: boolean }
): Promise<void> {
  const tx = pool.transaction();
  await tx.begin();
  try {
    const upd = tx.request();
    upd.input("employee_id", sql.NVarChar, existing.employee_id);
    upd.input("time_in", sql.NVarChar, next.timeIn);
    upd.input("time_out", sql.NVarChar, next.timeOut);
    upd.input("next_day", sql.NVarChar, next.nextDay ? "1" : "0");
    await upd.query(
      "UPDATE dbo.MTIUsers SET time_in=@time_in, time_out=@time_out, next_day=CASE WHEN LOWER(LTRIM(RTRIM(@next_day))) IN ('y','yes','true','1') THEN 1 ELSE 0 END WHERE employee_id=@employee_id"
    );

    if (!opts.skipLog) {
      const logReq = tx.request();
      logReq.input("StaffNo", sql.NVarChar, existing.employee_id);
      logReq.input("TimeInNew", sql.NVarChar, next.timeIn);
      logReq.input("TimeOutNew", sql.NVarChar, next.timeOut);
      logReq.input("NextDayNew", sql.NVarChar, next.nextDay ? "1" : "0");
      logReq.input("SourceHash", sql.NVarChar, next.sourceHash);

      if (opts.changedAtIso) {
        logReq.input("ChangedAt", sql.DateTime, new Date(opts.changedAtIso));
        await logReq.query(
          "INSERT INTO dbo.ScheduleChangeLog (StaffNo, ChangedAt, TimeInNew, TimeOutNew, NextDayNew, SourceHash) VALUES (@StaffNo, @ChangedAt, @TimeInNew, @TimeOutNew, CASE WHEN LOWER(LTRIM(RTRIM(@NextDayNew))) IN ('y','yes','true','1') THEN 1 ELSE 0 END, @SourceHash)"
        );
      } else {
        await logReq.query(
          "INSERT INTO dbo.ScheduleChangeLog (StaffNo, TimeInNew, TimeOutNew, NextDayNew, SourceHash) VALUES (@StaffNo, @TimeInNew, @TimeOutNew, CASE WHEN LOWER(LTRIM(RTRIM(@NextDayNew))) IN ('y','yes','true','1') THEN 1 ELSE 0 END, @SourceHash)"
        );
      }
    }

    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const pool = await getPool();
  try {
    const existing = await fetchExisting(pool, args.staffNo);
    if (!existing) {
      throw new Error(`MTIUsers row not found for employee_id=${args.staffNo}`);
    }

    const oldHash = hashMtiRow(existing);
    const nextRow: MtiUserScheduleSnapshot = {
      ...existing,
      time_in: args.timeIn,
      time_out: args.timeOut,
      next_day: args.nextDay ? "1" : "0",
    };
    const newHash = hashMtiRow(nextRow);

    const preview = {
      staffNo: existing.employee_id,
      existing: {
        timeIn: existing.time_in,
        timeOut: existing.time_out,
        nextDay: existing.next_day,
      },
      next: {
        timeIn: args.timeIn,
        timeOut: args.timeOut,
        nextDay: args.nextDay,
      },
      scheduleChangeLog: args.skipLog ? "skipped" : { changedAt: args.changedAtIso ?? "DEFAULT(GETDATE())" },
      sourceHash: { oldHash, newHash },
      mode: args.apply ? "APPLY" : "DRY_RUN",
    };

    console.log(JSON.stringify(preview, null, 2));

    if (!args.apply) {
      return;
    }

    await applyChange(
      pool,
      existing,
      { timeIn: args.timeIn, timeOut: args.timeOut, nextDay: args.nextDay, sourceHash: newHash },
      { changedAtIso: args.changedAtIso, skipLog: args.skipLog }
    );

    console.log(JSON.stringify({ ok: true }));
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ error: msg }));
  process.exitCode = 1;
});
