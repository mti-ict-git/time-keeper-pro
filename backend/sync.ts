import sql from "mssql";
import crypto from "crypto";
import { getPool } from "./db";
import { getOrangePool } from "./orangeDb";

type OrangeRow = {
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

function hashRow(row: OrangeRow): string {
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

async function getPhoneMaxLength(target: sql.ConnectionPool): Promise<number> {
  const res = await target.request().query(
    "SELECT CHARACTER_MAXIMUM_LENGTH AS len FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'MTIUsers' AND COLUMN_NAME = 'phone'"
  );
  const row = res.recordset?.[0] as { len?: unknown } | undefined;
  const v = row?.len;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Number(n) : 0;
}

async function getExistingHashes(target: sql.ConnectionPool): Promise<Record<string, string>> {
  const res = await target.request().query(
    "SELECT employee_id, employee_name, gender, division, department, section, supervisor_id, supervisor_name, position_title, grade_interval, phone, day_type, description, CONVERT(varchar(5), time_in, 108) AS time_in, CONVERT(varchar(5), time_out, 108) AS time_out, next_day FROM [dbo].[MTIUsers]"
  );
  const map: Record<string, string> = {};
  const rows = (res.recordset ?? []) as Array<Record<string, unknown>>;
  for (const r of rows) {
    const row: OrangeRow = {
      employee_id: s(r["employee_id"]),
      employee_name: s(r["employee_name"]) || null,
      gender: s(r["gender"]) || null,
      division: s(r["division"]) || null,
      department: s(r["department"]) || null,
      section: s(r["section"]) || null,
      supervisor_id: s(r["supervisor_id"]) || null,
      supervisor_name: s(r["supervisor_name"]) || null,
      position_title: s(r["position_title"]) || null,
      grade_interval: s(r["grade_interval"]) || null,
      phone: s(r["phone"]) || null,
      day_type: s(r["day_type"]) || null,
      description: s(r["description"]) || null,
      time_in: s(r["time_in"]) || null,
      time_out: s(r["time_out"]) || null,
      next_day: s(r["next_day"]) || null,
    };
    map[row.employee_id] = hashRow(row);
  }
  return map;
}

export type SyncResult = {
  total: number;
  updated: number;
  inserted: number;
  unchanged: number;
  detailsUpdated: string[];
  detailsInserted: string[];
  timestamp: Date;
  runId: string;
};

export async function runScheduleSync(): Promise<SyncResult> {
  const source = await getOrangePool();
  const target = await getPool();

  const orangeSchema = process.env.ORANGE_SCHEMA && process.env.ORANGE_SCHEMA.length ? String(process.env.ORANGE_SCHEMA) : "dbo";
  const orangeEmployeeTable = process.env.ORANGE_EMPLOYEE_TABLE && process.env.ORANGE_EMPLOYEE_TABLE.length ? String(process.env.ORANGE_EMPLOYEE_TABLE) : "it_mti_employee_database_tbl";
  const orangeProcSchema = process.env.ORANGE_PROC_SCHEMA && process.env.ORANGE_PROC_SCHEMA.length ? String(process.env.ORANGE_PROC_SCHEMA) : "dbo";
  const orangeDayTypeProc = process.env.ORANGE_DAY_TYPE_PROC && process.env.ORANGE_DAY_TYPE_PROC.length ? String(process.env.ORANGE_DAY_TYPE_PROC) : "sp_it_get_day_type";
  const orangeSiteCode = process.env.ORANGE_SITE_CODE && process.env.ORANGE_SITE_CODE.length ? String(process.env.ORANGE_SITE_CODE) : "MTI";

  const employeeQualified = `[${orangeSchema}].[${orangeEmployeeTable}]`;
  const dayTypeQualified = `[${orangeProcSchema}].[${orangeDayTypeProc}]`;

  // Verify object exists (table/view/synonym); allow synonyms which INFORMATION_SCHEMA does not list
  {
    const req = source.request();
    req.input("schema", sql.NVarChar, orangeSchema);
    req.input("table", sql.NVarChar, orangeEmployeeTable);
    const existsRes = await req.query(
      "SELECT\n       (SELECT COUNT(1) FROM sys.tables WHERE name = @table AND SCHEMA_NAME(schema_id) = @schema) +\n       (SELECT COUNT(1) FROM sys.views WHERE name = @table AND SCHEMA_NAME(schema_id) = @schema) +\n       (SELECT COUNT(1) FROM sys.synonyms WHERE name = @table AND SCHEMA_NAME(schema_id) = @schema) AS c"
    );
    const cRaw = (existsRes.recordset?.[0] as { c?: unknown } | undefined)?.c;
    const cNum = typeof cRaw === "number" ? cRaw : Number(cRaw);
    if (!Number.isFinite(cNum) || cNum <= 0) {
      // Proceed without throwing; the subsequent query will produce a precise error message if the object truly doesn't exist
    }
  }

  const orangeQuery = `
    SELECT
      e.employee_id,
      e.employee_name,
      e.gender,
      e.division,
      e.department,
      e.section,
      e.supervisor_id,
      e.supervisor_name,
      e.position_title,
      e.grade_interval,
      e.phone,
      dt.day_type,
      dt.description,
      CONVERT(varchar(5), dt.time_in, 108) AS time_in,
      CONVERT(varchar(5), dt.time_out, 108) AS time_out,
      dt.next_day
    FROM ${employeeQualified} AS e
    CROSS APPLY ${dayTypeQualified}('${orangeSiteCode}', e.employee_id, GETDATE()) AS dt
  `;

  const orangeRes = await source.request().query(orangeQuery);
  const orangeRows = (orangeRes.recordset ?? []) as Array<Record<string, unknown>>;

  const existingHashes = await getExistingHashes(target);
  const phoneMax = await getPhoneMaxLength(target);

  const updatedDetails: string[] = [];
  const insertedDetails: string[] = [];
  let updated = 0;
  let inserted = 0;

  const runId = crypto.randomUUID();

  const tx = target.transaction();
  await tx.begin();
  try {
    for (const r of orangeRows) {
      const row: OrangeRow = {
        employee_id: s(r["employee_id"]),
        employee_name: s(r["employee_name"]) || null,
        gender: s(r["gender"]) || null,
        division: s(r["division"]) || null,
        department: s(r["department"]) || null,
        section: s(r["section"]) || null,
        supervisor_id: s(r["supervisor_id"]) || null,
        supervisor_name: s(r["supervisor_name"]) || null,
        position_title: s(r["position_title"]) || null,
        grade_interval: s(r["grade_interval"]) || null,
        phone: s(r["phone"]) || null,
        day_type: s(r["day_type"]) || null,
        description: s(r["description"]) || null,
        time_in: s(r["time_in"]) || null,
        time_out: s(r["time_out"]) || null,
        next_day: s(r["next_day"]) || null,
      };

      let phone = s(row.phone);
      if (phoneMax > 0 && phone.length > phoneMax) {
        phone = phone.slice(0, phoneMax);
      }

      const newHash = hashRow({ ...row, phone });
      const oldHash = existingHashes[row.employee_id];

      const req = tx.request();
      req.input("employee_id", sql.NVarChar, row.employee_id);
      const existsRes = await req.query(
        "SELECT employee_name, gender, division, department, section, supervisor_id, supervisor_name, position_title, grade_interval, phone, day_type, description, CONVERT(varchar(5), time_in, 108) AS time_in, CONVERT(varchar(5), time_out, 108) AS time_out, next_day FROM [dbo].[MTIUsers] WHERE employee_id = @employee_id"
      );
      const existsRow = existsRes.recordset?.[0] as Record<string, unknown> | undefined;
      const exists = Boolean(existsRow);

      if (oldHash === newHash) {
        continue;
      }

      if (exists) {
        const q = `
          UPDATE [dbo].[MTIUsers] SET
            employee_name = @employee_name,
            gender = @gender,
            division = @division,
            department = @department,
            section = @section,
            supervisor_id = @supervisor_id,
            supervisor_name = @supervisor_name,
            position_title = @position_title,
            grade_interval = @grade_interval,
            phone = @phone,
            day_type = @day_type,
            description = @description,
            time_in = @time_in,
            time_out = @time_out,
            next_day = @next_day
          WHERE employee_id = @employee_id
        `;
        const r2 = tx.request();
        r2.input("employee_id", sql.NVarChar, row.employee_id);
        r2.input("employee_name", sql.NVarChar, s(row.employee_name));
        r2.input("gender", sql.NVarChar, s(row.gender));
        r2.input("division", sql.NVarChar, s(row.division));
        r2.input("department", sql.NVarChar, s(row.department));
        r2.input("section", sql.NVarChar, s(row.section));
        r2.input("supervisor_id", sql.NVarChar, s(row.supervisor_id));
        r2.input("supervisor_name", sql.NVarChar, s(row.supervisor_name));
        r2.input("position_title", sql.NVarChar, s(row.position_title));
        r2.input("grade_interval", sql.NVarChar, s(row.grade_interval));
        r2.input("phone", sql.NVarChar, phone);
        r2.input("day_type", sql.NVarChar, s(row.day_type));
        r2.input("description", sql.NVarChar, s(row.description));
        r2.input("time_in", sql.NVarChar, s(row.time_in));
        r2.input("time_out", sql.NVarChar, s(row.time_out));
        r2.input("next_day", sql.NVarChar, s(row.next_day));
        await r2.query(q);
        updated += 1;
        updatedDetails.push(`${row.employee_id} | ${s(row.employee_name)} | ${s(row.day_type)} | ${s(row.time_in)}-${s(row.time_out)} | ${s(row.next_day)}`);
      } else {
        const q = `
          INSERT INTO [dbo].[MTIUsers] (
            employee_id,
            employee_name,
            gender,
            division,
            department,
            section,
            supervisor_id,
            supervisor_name,
            position_title,
            grade_interval,
            phone,
            day_type,
            description,
            time_in,
            time_out,
            next_day
          ) VALUES (
            @employee_id,
            @employee_name,
            @gender,
            @division,
            @department,
            @section,
            @supervisor_id,
            @supervisor_name,
            @position_title,
            @grade_interval,
            @phone,
            @day_type,
            @description,
            @time_in,
            @time_out,
            @next_day
          )
        `;
        const r2 = tx.request();
        r2.input("employee_id", sql.NVarChar, row.employee_id);
        r2.input("employee_name", sql.NVarChar, s(row.employee_name));
        r2.input("gender", sql.NVarChar, s(row.gender));
        r2.input("division", sql.NVarChar, s(row.division));
        r2.input("department", sql.NVarChar, s(row.department));
        r2.input("section", sql.NVarChar, s(row.section));
        r2.input("supervisor_id", sql.NVarChar, s(row.supervisor_id));
        r2.input("supervisor_name", sql.NVarChar, s(row.supervisor_name));
        r2.input("position_title", sql.NVarChar, s(row.position_title));
        r2.input("grade_interval", sql.NVarChar, s(row.grade_interval));
        r2.input("phone", sql.NVarChar, phone);
        r2.input("day_type", sql.NVarChar, s(row.day_type));
        r2.input("description", sql.NVarChar, s(row.description));
        r2.input("time_in", sql.NVarChar, s(row.time_in));
        r2.input("time_out", sql.NVarChar, s(row.time_out));
        r2.input("next_day", sql.NVarChar, s(row.next_day));
        await r2.query(q);
        inserted += 1;
        insertedDetails.push(`${row.employee_id} | ${s(row.employee_name)} | ${s(row.day_type)} | ${s(row.time_in)}-${s(row.time_out)} | ${s(row.next_day)}`);
      }
    }
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }

  const total = orangeRows.length;
  const unchanged = total - updated - inserted;
  const timestamp = new Date();
  return { total, updated, inserted, unchanged, detailsUpdated: updatedDetails, detailsInserted: insertedDetails, timestamp, runId };
}
