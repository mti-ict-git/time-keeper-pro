import "dotenv/config";
import sql from "mssql";
import crypto from "crypto";
import { getPool } from "../db";
import { getOrangePool } from "../orangeDb";

type Row = {
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
  next_day: string | null;
};

function s(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function hash(row: Row): string {
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

async function main(): Promise<void> {
  const source = await getOrangePool();
  const target = await getPool();

  const orangeSchema = process.env.ORANGE_SCHEMA && process.env.ORANGE_SCHEMA.length ? String(process.env.ORANGE_SCHEMA) : "dbo";
  const orangeEmployeeTable = process.env.ORANGE_EMPLOYEE_TABLE && process.env.ORANGE_EMPLOYEE_TABLE.length ? String(process.env.ORANGE_EMPLOYEE_TABLE) : "it_mti_employee_database_tbl";
  const orangeProcSchema = process.env.ORANGE_PROC_SCHEMA && process.env.ORANGE_PROC_SCHEMA.length ? String(process.env.ORANGE_PROC_SCHEMA) : "dbo";
  const orangeDayTypeProc = process.env.ORANGE_DAY_TYPE_PROC && process.env.ORANGE_DAY_TYPE_PROC.length ? String(process.env.ORANGE_DAY_TYPE_PROC) : "sp_it_get_day_type";
  const orangeSiteCode = process.env.ORANGE_SITE_CODE && process.env.ORANGE_SITE_CODE.length ? String(process.env.ORANGE_SITE_CODE) : "MTI";

  const employeeQualified = `[${orangeSchema}].[${orangeEmployeeTable}]`;
  const dayTypeQualified = `[${orangeProcSchema}].[${orangeDayTypeProc}]`;

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

  const targetRes = await target.request().query(
    "SELECT employee_id, employee_name, gender, division, department, section, supervisor_id, supervisor_name, position_title, grade_interval, phone, day_type, description, CONVERT(varchar(5), time_in, 108) AS time_in, CONVERT(varchar(5), time_out, 108) AS time_out, next_day FROM [dbo].[MTIUsers]"
  );
  const targetRows = (targetRes.recordset ?? []) as Array<Record<string, unknown>>;

  const targetMap: Record<string, Row> = {};
  for (const r of targetRows) {
    const row: Row = {
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
    targetMap[row.employee_id] = row;
  }

  const diffs: Array<{ id: string; fields: Array<{ name: string; left: string; right: string }> }> = [];
  for (const r of orangeRows) {
    const row: Row = {
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
    const old = targetMap[row.employee_id];
    if (!old) continue;
    const h1 = hash(row);
    const h2 = hash(old);
    if (h1 !== h2) {
      const fields: Array<{ name: string; left: string; right: string }> = [];
      const keys = [
        "employee_name",
        "gender",
        "division",
        "department",
        "section",
        "supervisor_id",
        "supervisor_name",
        "position_title",
        "grade_interval",
        "phone",
        "day_type",
        "description",
        "time_in",
        "time_out",
        "next_day",
      ] as const;
      for (const k of keys) {
        const left = s((row as Record<string, unknown>)[k]);
        const right = s((old as Record<string, unknown>)[k]);
        if (left !== right) fields.push({ name: k, left, right });
      }
      diffs.push({ id: row.employee_id, fields });
    }
  }

  console.log(JSON.stringify({ count: diffs.length, diffs: diffs.slice(0, 20) }, null, 2));
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ error: msg }));
  process.exitCode = 1;
});
