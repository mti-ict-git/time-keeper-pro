import dotenv from "dotenv";
import sql, { config as SqlConfig } from "mssql";

dotenv.config();

type ColumnInfo = {
  name: string;
  dataType: string;
};

type Row = Record<string, unknown>;

const dbConfig: SqlConfig = {
  user: process.env.DB_USER as string,
  password: process.env.DB_PASSWORD as string,
  server: process.env.DB_SERVER as string,
  database: process.env.DB_NAME as string,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 1433,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

function chooseDateColumn(columns: ColumnInfo[]): string | null {
  const dateTypes = new Set(["date", "datetime", "datetime2", "smalldatetime"]);
  const firstByType = columns.find((c) => dateTypes.has(c.dataType.toLowerCase()));
  if (firstByType) return firstByType.name;
  const nameHeuristics = ["date", "attendance_date", "record_date", "event_date"];
  const byName = columns.find((c) => nameHeuristics.includes(c.name.toLowerCase()));
  if (byName) return byName.name;
  const containsDate = columns.find((c) => c.name.toLowerCase().includes("date"));
  if (containsDate) return containsDate.name;
  return null;
}

async function main(): Promise<void> {
  const pool = await sql.connect(dbConfig);
  try {
    const arg2 = process.argv[2] ? String(process.argv[2]).trim() : "";
    const mode = ["record", "report", "checkcombo", "list"].includes(arg2.toLowerCase()) ? arg2.toLowerCase() : "report";
    const staffArg = mode === "record" ? (process.argv[3] ? String(process.argv[3]).trim() : "") : mode === "checkcombo" ? "" : arg2;
    const rangeArg = mode === "record" ? (process.argv[4] ? String(process.argv[4]).trim().toLowerCase() : "") : (process.argv[3] ? String(process.argv[3]).trim().toLowerCase() : "");
    const onDateArg = (() => {
      const raw = mode === "record" ? (process.argv[5] ? String(process.argv[5]).trim() : "") : (process.argv[4] ? String(process.argv[4]).trim() : "");
      if (rangeArg === "on" && raw) return raw;
      if (rangeArg.startsWith("on:")) return rangeArg.slice(3);
      return "";
    })();

    const tableName = mode === "record" ? "tblAttendanceRecord" : "tblAttendanceReport";
    if (mode === "list") {
      const like = process.argv[3] ? String(process.argv[3]).trim() : "Attendance";
      const listRes = await pool
        .request()
        .query(
          `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' AND TABLE_NAME LIKE '%${like}%' ORDER BY TABLE_NAME`
        );
      const tables = (listRes.recordset ?? []).map((r: Row) => String(r["TABLE_NAME"])) as string[];
      console.log(JSON.stringify({ tables }));
      return;
    }

    const schemaRes = await pool
      .request()
      .query(
        `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${tableName}' ORDER BY ORDINAL_POSITION`
      );
    const columns: ColumnInfo[] = (schemaRes.recordset ?? []).map((r: Row) => ({
      name: String(r["COLUMN_NAME"]),
      dataType: String(r["DATA_TYPE"]).toLowerCase(),
    }));

    const dateCol = chooseDateColumn(columns);
    const colSummary = columns.map((c) => `${c.name}:${c.dataType}`).join(", ");
    console.log(JSON.stringify({ table: tableName, columns: colSummary, chosenDateColumn: dateCol }));
    const request = pool.request();
    let query = "";
    if (mode === "checkcombo") {
      const ti = process.argv[3] ? String(process.argv[3]).trim() : "";
      const to = process.argv[4] ? String(process.argv[4]).trim() : "";
      if (!ti || !to) {
        console.error(JSON.stringify({ error: "Usage: npm run inspect:attendance -- checkcombo HH:MM HH:MM" }));
        return;
      }
      request.input("ti", sql.VarChar, ti);
      request.input("to", sql.VarChar, to);
      query =
        "SELECT description, day_type, CONVERT(varchar(5), time_in, 108) AS time_in, CONVERT(varchar(5), time_out, 108) AS time_out, next_day FROM MTIUsers WHERE CONVERT(varchar(5), time_in, 108) = @ti AND CONVERT(varchar(5), time_out, 108) = @to";
      const res = await request.query(query);
      const rows: Row[] = res.recordset ?? [];
      for (const row of rows) {
        console.log(JSON.stringify(row));
      }
      return;
    } else if (staffArg) {
      request.input("staff", sql.NVarChar, staffArg);
      const timeCol = columns.find((c) => c.name.toLowerCase() === "trdatetime") ? "TrDateTime" : dateCol ?? "";
      const preferDateCol = columns.find((c) => c.name.toLowerCase() === "trdate") ? "TrDate" : dateCol ?? timeCol ?? "";
      const selectCandidates = [
        "StaffNo",
        "Name",
        "Department",
        "Position",
        "ClockEvent",
        "TrController",
        "TrDate",
        timeCol || "",
        "ScheduledClockIn",
        "ScheduledClockOut",
        "Description",
        "DayType",
      ].filter((f) => f && columns.some((c) => c.name.toLowerCase() === f.toLowerCase()));
      const selectList = selectCandidates.map((f) => `[${f}]`).join(", ");
      const staffColCandidates = ["StaffNo", "employee_id", "employeeid", "EmpID", "emp_id", "empid"];
      const staffCol = staffColCandidates.find((n) => columns.some((c) => c.name.toLowerCase() === n.toLowerCase())) ?? "StaffNo";
      if (rangeArg === "last2days") {
        const now = new Date();
        const start = new Date(now);
        start.setDate(now.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        const end = new Date(now);
        end.setHours(23, 59, 59, 999);
        request.input("from", sql.DateTime, start);
        request.input("to", sql.DateTime, end);
        query = `SELECT ${selectList} FROM ${tableName} WHERE RTRIM(LTRIM([${staffCol}])) = @staff AND [${preferDateCol}] BETWEEN @from AND @to`;
        const extra = preferDateCol !== timeCol ? `, [${timeCol}] DESC` : "";
        query += ` ORDER BY [${preferDateCol}] DESC${extra}`;
      } else if (rangeArg === "on" && onDateArg) {
        request.input("onDate", sql.DateTime, new Date(`${onDateArg}T00:00:00`));
        query = `SELECT ${selectList} FROM ${tableName} WHERE RTRIM(LTRIM([${staffCol}])) = @staff AND CAST([${preferDateCol}] AS date) = CAST(@onDate AS date)`;
        const extra = preferDateCol !== timeCol ? `, [${timeCol}] DESC` : "";
        query += ` ORDER BY [${preferDateCol}] DESC${extra}`;
      } else {
        query = `SELECT TOP 50 ${selectList} FROM ${tableName} WHERE RTRIM(LTRIM([${staffCol}])) = @staff`;
        if (dateCol) {
          const extra = dateCol !== timeCol ? `, [${timeCol}] DESC` : "";
          query += ` ORDER BY [${dateCol}] DESC${extra}`;
        }
      }
    } else {
      query = `SELECT TOP 10 * FROM ${tableName}`;
      if (dateCol) query += ` ORDER BY [${dateCol}] DESC`;
    }
    const res = await request.query(query);
    const rows: Row[] = res.recordset ?? [];
    for (const row of rows) {
      console.log(JSON.stringify(row));
    }
  } finally {
    pool.close();
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ error: message }));
  process.exit(1);
});
