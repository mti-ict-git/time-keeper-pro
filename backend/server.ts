import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import sql, { config as SqlConfig } from "mssql";

dotenv.config();

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
    dayType: row.day_type ?? "",
    description: row.description ?? "",
    timeIn: formatTime(row.time_in),
    timeOut: formatTime(row.time_out),
    nextDay: toBoolNextDay(row.next_day),
  };
}

const app = express();
app.use(cors());
app.use(express.json());

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

let poolPromise: Promise<sql.ConnectionPool> | undefined;
function getPool(): Promise<sql.ConnectionPool> {
  if (!poolPromise) {
    poolPromise = sql.connect(dbConfig);
  }
  return poolPromise!;
}

app.get("/api/scheduling/employees", async (_req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .query(
        "SELECT employee_id, employee_name, gender, division, department, section, supervisor_id, supervisor_name, position_title, grade_interval, phone, day_type, description, CONVERT(varchar(5), time_in, 108) AS time_in, CONVERT(varchar(5), time_out, 108) AS time_out, next_day FROM MTIUsers"
      );

    const rows = (result.recordset ?? []) as MtiUserRow[];
    const data: SchedulingEmployee[] = rows.map(mapRow);
    res.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

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

async function getUsersColumns(pool: sql.ConnectionPool): Promise<ColumnInfo[]> {
  const result = await pool
    .request()
    .query(
      "SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Users' ORDER BY ORDINAL_POSITION"
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

app.get("/api/users/schema", async (_req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const columns = await getUsersColumns(pool);
    res.json({ columns });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.get("/api/users", async (_req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query("SELECT TOP 100 * FROM Users");
    const rows = (result.recordset ?? []) as unknown as Array<Record<string, unknown>>;
    res.json({ data: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.get("/api/users/search", async (req: Request, res: Response) => {
  try {
    const field = String(req.query.field ?? "");
    const value = String(req.query.value ?? "");
    if (!field || !value) {
      res.status(400).json({ error: "Missing field or value" });
      return;
    }
    const pool = await getPool();
    const cols = await getUsersColumns(pool);
    const col = cols.find((c) => c.name === field);
    if (!col) {
      res.status(400).json({ error: "Invalid field" });
      return;
    }
    const binding = mapBinding(col);
    const request = pool.request();
    let sqlType: sql.ISqlType;
    if (binding.kind === "simple") {
      sqlType = binding.type as unknown as sql.ISqlType;
    } else if (binding.kind === "length") {
      sqlType = binding.type(binding.length);
    } else {
      sqlType = binding.type(binding.precision, binding.scale);
    }
    request.input(field, sqlType, value);
    const result = await request.query(`SELECT TOP 100 * FROM Users WHERE ${field} = @${field}`);
    const rows = (result.recordset ?? []) as unknown as Array<Record<string, unknown>>;
    res.json({ data: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.get("/api/health", async (_req: Request, res: Response) => {
  try {
    const pool = await getPool();
    await pool.request().query("SELECT 1 AS ok");
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false });
  }
});

const port = process.env.PORT ? Number(process.env.PORT) : 5001;
app.listen(port, () => {
  // server started
});
