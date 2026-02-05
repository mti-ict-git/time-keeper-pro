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
    const schemaRes = await pool
      .request()
      .query(
        "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'tblAttendanceReport' ORDER BY ORDINAL_POSITION"
      );
    const columns: ColumnInfo[] = (schemaRes.recordset ?? []).map((r: Row) => ({
      name: String(r["COLUMN_NAME"]),
      dataType: String(r["DATA_TYPE"]).toLowerCase(),
    }));

    const dateCol = chooseDateColumn(columns);
    const colSummary = columns.map((c) => `${c.name}:${c.dataType}`).join(", ");
    console.log(JSON.stringify({ table: "tblAttendanceReport", columns: colSummary, chosenDateColumn: dateCol }));

    const request = pool.request();
    let query = "SELECT TOP 10 * FROM tblAttendanceReport";
    if (dateCol) query += ` ORDER BY [${dateCol}] DESC`;
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

