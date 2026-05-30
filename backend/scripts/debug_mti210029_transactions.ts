import "dotenv/config";
import { writeFileSync } from "node:fs";
import sql from "mssql";

type Output = {
  staff: string;
  range: { from: string; to: string };
  shiftDate: string;
  lock: Record<string, unknown> | null;
  dataDb_count: number;
  dataDb_rows: Array<Record<string, unknown>>;
  attendanceRaw_count: number;
  attendanceRaw_rows: Array<Record<string, unknown>>;
  attendanceByShiftDate_count: number;
  attendanceByShiftDate_rows: Array<Record<string, unknown>>;
  scheduleChangeLog_count: number;
  scheduleChangeLog_rows: Array<Record<string, unknown>>;
};

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function buildPoolConfig(prefix: "DATADB" | "DB"): sql.config {
  const port = process.env[`${prefix}_PORT`];
  return {
    user: mustEnv(`${prefix}_USER`),
    password: mustEnv(`${prefix}_PASSWORD`),
    server: mustEnv(`${prefix}_SERVER`),
    database: mustEnv(`${prefix}_NAME`),
    port: port ? Number(port) : 1433,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 8000,
    requestTimeout: 20000,
    pool: { max: 2, min: 0, idleTimeoutMillis: 5000 },
  };
}

async function main(): Promise<void> {
  const outPath = "c:/Scripts/Projects/time-keeper-pro/debug_mti210029_2026-05-27_data.json";
  const staff = "MTI210029";
  const fromDt = new Date("2026-05-26T12:00:00");
  const toDt = new Date("2026-05-28T02:00:00");
  const shiftDate = "2026-05-27";

  const dataPool = await new sql.ConnectionPool(buildPoolConfig("DATADB")).connect();
  const empPool = await new sql.ConnectionPool(buildPoolConfig("DB")).connect();

  try {
    const dataReq = dataPool.request();
    dataReq.input("staff", sql.NVarChar, staff);
    dataReq.input("fromDt", sql.DateTime, fromDt);
    dataReq.input("toDt", sql.DateTime, toDt);
    const dataQ = `
      SET LOCK_TIMEOUT 5000;
      SELECT TOP (500)
        Cdb.StaffNo,
        Cdb.Name,
        Lt.TrDateTime,
        Lt.TrDate,
        Lt.[Transaction] AS dtTransaction,
        Lt.TrController,
        Lt.UnitNo
      FROM dbo.CardDB Cdb
      INNER JOIN dbo.tblTransaction Lt ON Cdb.CardNo = Lt.CardNo
      WHERE Cdb.StaffNo = @staff
        AND Lt.TrDateTime BETWEEN @fromDt AND @toDt
        AND Lt.[Transaction] = 'Valid Entry Access'
      ORDER BY Lt.TrDateTime ASC;
    `;
    const dataRes = await dataReq.query(dataQ);

    const attReq = empPool.request();
    attReq.input("staff", sql.NVarChar, staff);
    attReq.input("fromDt", sql.DateTime, fromDt);
    attReq.input("toDt", sql.DateTime, toDt);
    const attQ = `
      SET LOCK_TIMEOUT 5000;
      SELECT TOP (500)
        StaffNo,
        TrDateTime,
        TrDate,
        ClockEvent,
        TrController,
        ScheduledClockIn,
        ScheduledClockOut
      FROM dbo.tblAttendanceReport
      WHERE StaffNo = @staff
        AND TrDateTime BETWEEN @fromDt AND @toDt
      ORDER BY TrDateTime ASC;
    `;
    const attRes = await attReq.query(attQ);

    const lockReq = empPool.request();
    lockReq.input("staff", sql.NVarChar, staff);
    lockReq.input("shiftDate", sql.Date, shiftDate);
    const lockQ = `
      SET LOCK_TIMEOUT 5000;
      SELECT TOP (1)
        StaffNo,
        ShiftDate,
        LockedAt,
        CONVERT(varchar(19), LockedAt, 120) AS LockedAtLocal,
        CONVERT(varchar(5), ScheduledIn, 108) AS ScheduledIn,
        CONVERT(varchar(5), ScheduledOut, 108) AS ScheduledOut,
        NextDay
      FROM dbo.AttendanceScheduleLock
      WHERE StaffNo = @staff AND ShiftDate = @shiftDate;
    `;
    const lockRes = await lockReq.query(lockQ);

    const attShiftReq = empPool.request();
    attShiftReq.input("staff", sql.NVarChar, staff);
    attShiftReq.input("shiftDate", sql.Date, shiftDate);
    const attShiftQ = `
      SET LOCK_TIMEOUT 5000;
      SELECT TOP (500)
        StaffNo,
        TrDateTime,
        TrDate,
        ClockEvent,
        TrController,
        ScheduledClockIn,
        ScheduledClockOut
      FROM dbo.tblAttendanceReport
      WHERE StaffNo = @staff
        AND TrDate = @shiftDate
      ORDER BY TrDateTime ASC;
    `;
    const attShiftRes = await attShiftReq.query(attShiftQ);

    const logReq = empPool.request();
    logReq.input("staff", sql.NVarChar, staff);
    logReq.input("startDt", sql.DateTime, new Date("2026-05-26T00:00:00"));
    logReq.input("endDt", sql.DateTime, new Date("2026-05-29T00:00:00"));
    const logQ = `
      SET LOCK_TIMEOUT 5000;
      SELECT TOP (200)
        ChangedAt,
        CONVERT(varchar(19), DATEADD(MINUTE, 420, ChangedAt), 120) AS ChangedAtLocal,
        StaffNo,
        CONVERT(varchar(5), TimeInNew, 108) AS TimeInNew,
        CONVERT(varchar(5), TimeOutNew, 108) AS TimeOutNew,
        NextDayNew,
        SourceHash
      FROM dbo.ScheduleChangeLog
      WHERE StaffNo = @staff
        AND ChangedAt BETWEEN @startDt AND @endDt
      ORDER BY ChangedAt ASC;
    `;
    const logRes = await logReq.query(logQ);

    const out: Output = {
      staff,
      range: { from: fromDt.toISOString(), to: toDt.toISOString() },
      shiftDate,
      lock: (lockRes.recordset?.[0] as Record<string, unknown> | undefined) ?? null,
      dataDb_count: (dataRes.recordset ?? []).length,
      dataDb_rows: (dataRes.recordset ?? []) as Array<Record<string, unknown>>,
      attendanceRaw_count: (attRes.recordset ?? []).length,
      attendanceRaw_rows: (attRes.recordset ?? []) as Array<Record<string, unknown>>,
      attendanceByShiftDate_count: (attShiftRes.recordset ?? []).length,
      attendanceByShiftDate_rows: (attShiftRes.recordset ?? []) as Array<Record<string, unknown>>,
      scheduleChangeLog_count: (logRes.recordset ?? []).length,
      scheduleChangeLog_rows: (logRes.recordset ?? []) as Array<Record<string, unknown>>,
    };

    writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
    process.stdout.write(outPath);
  } finally {
    await Promise.allSettled([dataPool.close(), empPool.close()]);
  }
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(msg);
  process.exit(1);
});
