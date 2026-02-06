import express, { Request, Response } from "express";
import cors from "cors";
import sql from "mssql";
import { appPort } from "./config";
import { getPool } from "./db";
import { schedulingRouter } from "./routes/scheduling";
import { usersRouter } from "./routes/users";
import { attendanceRouter } from "./routes/attendance";
import { syncRouter } from "./routes/sync";
import { authRouter } from "./routes/auth";
import { controllersRouter } from "./routes/controllers";
import { authLocalRouter } from "./routes/auth_local";

type MtiUserRow = {
  employee_id: string;
  employee_name: string;
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

type SchedulingEmployee = {
  employeeId: string;
  name: string;
  gender: string;
  division: string;
  department: string;
  section: string;
  supervisorId: string;
  supervisorName: string;
  positionTitle: string;
  gradeInterval: string;
  phone: string;
  dayType: string;
  description: string;
  timeIn: string;
  timeOut: string;
  nextDay: boolean;
};

type MtiScheduleComboRow = {
  description: string | null;
  day_type: string | null;
  time_in: string | null;
  time_out: string | null;
  next_day: string | number | boolean | null;
  count: number;
};

type ScheduleCombo = {
  label: string;
  dayType: string;
  timeIn: string;
  timeOut: string;
  nextDay: boolean;
  count: number;
};

function formatTime(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    const h = value.getHours();
    const m = value.getMinutes();
    const hh = h.toString().padStart(2, "0");
    const mm = m.toString().padStart(2, "0");
    return `${hh}:${mm}`;
  }
  const s = String(value);
  const match = s.match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    const h = match[1].padStart(2, "0");
    const m = match[2];
    return `${h}:${m}`;
  }
  return s;
}

function formatDate(value: unknown): string {
  if (value === null || value === undefined) return "";
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toBoolNextDay(value: string | number | boolean | null): boolean {
  if (value === null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const v = String(value).trim().toLowerCase();
  return v === "y" || v === "yes" || v === "true" || v === "1";
}

function mapRow(row: MtiUserRow): SchedulingEmployee {
  return {
    employeeId: String(row.employee_id),
    name: row.employee_name ?? "",
    gender: row.gender ?? "",
    division: row.division ?? "",
    department: row.department ?? "",
    section: row.section ?? "",
    supervisorId: row.supervisor_id ?? "",
    supervisorName: row.supervisor_name ?? "",
    positionTitle: row.position_title ?? "",
    gradeInterval: row.grade_interval ?? "",
    phone: row.phone ?? "",
    dayType: row.description ?? "",
    description: row.description ?? "",
    timeIn: formatTime(row.time_in),
    timeOut: formatTime(row.time_out),
    nextDay: toBoolNextDay(row.next_day),
  };
}

function mapComboRow(row: MtiScheduleComboRow): ScheduleCombo {
  return {
    label: row.description ?? "",
    dayType: row.day_type ?? "",
    timeIn: formatTime(row.time_in),
    timeOut: formatTime(row.time_out),
    nextDay: toBoolNextDay(row.next_day),
    count: Number(row.count) || 0,
  };
}

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/scheduling", schedulingRouter);
app.use("/api/users", usersRouter);
app.use("/api/attendance", attendanceRouter);
app.use("/api/sync", syncRouter);
app.use("/api/controllers", controllersRouter);
app.use("/api/auth/local", authLocalRouter);
app.use("/api/auth", authRouter);

 

 

 

type ColumnInfo = {
  name: string;
  dataType: string;
  characterMaximumLength: number | null;
  numericPrecision: number | null;
  numericScale: number | null;
  isNullable: boolean;
};

type ColumnBindingType =
  | { kind: "simple"; type: sql.ISqlTypeFactory }
  | { kind: "length"; type: sql.ISqlTypeFactoryWithLength; length: number }
  | { kind: "precision"; type: sql.ISqlTypeFactoryWithPrecisionScale; precision: number; scale: number };

async function getTableColumns(pool: sql.ConnectionPool, tableName: string): Promise<ColumnInfo[]> {
  const request = pool.request();
  request.input("tableName", sql.NVarChar, tableName);
  const result = await request.query(
    "SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tableName ORDER BY ORDINAL_POSITION"
  );
  const rows = result.recordset ?? [];
  const cols: ColumnInfo[] = rows.map((r: Record<string, unknown>) => {
    const obj = r as Record<string, unknown>;
    const name = String(obj["COLUMN_NAME"]);
    const dataType = String(obj["DATA_TYPE"]);
    const charLenRaw = obj["CHARACTER_MAXIMUM_LENGTH"];
    const numPrecRaw = obj["NUMERIC_PRECISION"];
    const numScaleRaw = obj["NUMERIC_SCALE"];
    const isNullableRaw = obj["IS_NULLABLE"];
    const characterMaximumLength = typeof charLenRaw === "number" ? charLenRaw : charLenRaw === null ? null : Number(charLenRaw);
    const numericPrecision = typeof numPrecRaw === "number" ? numPrecRaw : numPrecRaw === null ? null : Number(numPrecRaw);
    const numericScale = typeof numScaleRaw === "number" ? numScaleRaw : numScaleRaw === null ? null : Number(numScaleRaw);
    const isNullable = String(isNullableRaw).toUpperCase() === "YES";
    return { name, dataType, characterMaximumLength, numericPrecision, numericScale, isNullable };
  });
  return cols;
}

function mapBinding(ci: ColumnInfo): ColumnBindingType {
  const dt = ci.dataType.toLowerCase();
  if (dt === "int") return { kind: "simple", type: sql.Int };
  if (dt === "bigint") return { kind: "simple", type: sql.BigInt };
  if (dt === "smallint") return { kind: "simple", type: sql.SmallInt };
  if (dt === "tinyint") return { kind: "simple", type: sql.TinyInt };
  if (dt === "bit") return { kind: "simple", type: sql.Bit };
  if (dt === "float") return { kind: "simple", type: sql.Float };
  if (dt === "real") return { kind: "simple", type: sql.Real };
  if (dt === "date") return { kind: "simple", type: sql.Date };
  if (dt === "datetime" || dt === "datetime2" || dt === "smalldatetime") return { kind: "simple", type: sql.DateTime };
  if (dt === "time") return { kind: "simple", type: sql.Time };
  if (dt === "uniqueidentifier") return { kind: "simple", type: sql.UniqueIdentifier };
  if (dt === "decimal" || dt === "numeric") {
    const precision = ci.numericPrecision ?? 18;
    const scale = ci.numericScale ?? 0;
    return { kind: "precision", type: sql.Decimal, precision, scale };
  }
  if (dt === "money" || dt === "smallmoney") return { kind: "simple", type: sql.Money };
  if (dt === "binary" || dt === "varbinary") {
    const length = ci.characterMaximumLength ?? sql.MAX;
    return { kind: "length", type: sql.VarBinary, length };
  }
  const length = ci.characterMaximumLength ?? sql.MAX;
  return { kind: "length", type: sql.NVarChar, length };
}

 

 

app.get("/api/health", async (_req: Request, res: Response) => {
  try {
    const pool = await getPool();
    await pool.request().query("SELECT 1 AS ok");
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false });
  }
});

app.listen(appPort, () => {
});
