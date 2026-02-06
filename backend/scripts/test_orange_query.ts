import "dotenv/config";
import sql from "mssql";
import { getOrangePool } from "../orangeDb";

async function main(): Promise<void> {
  const orangeSchema = process.env.ORANGE_SCHEMA && process.env.ORANGE_SCHEMA.length ? String(process.env.ORANGE_SCHEMA) : "dbo";
  const orangeEmployeeTable = process.env.ORANGE_EMPLOYEE_TABLE && process.env.ORANGE_EMPLOYEE_TABLE.length ? String(process.env.ORANGE_EMPLOYEE_TABLE) : "it_mti_employee_database_tbl";
  const orangeProcSchema = process.env.ORANGE_PROC_SCHEMA && process.env.ORANGE_PROC_SCHEMA.length ? String(process.env.ORANGE_PROC_SCHEMA) : "dbo";
  const orangeDayTypeProc = process.env.ORANGE_DAY_TYPE_PROC && process.env.ORANGE_DAY_TYPE_PROC.length ? String(process.env.ORANGE_DAY_TYPE_PROC) : "sp_it_get_day_type";
  const orangeSiteCode = process.env.ORANGE_SITE_CODE && process.env.ORANGE_SITE_CODE.length ? String(process.env.ORANGE_SITE_CODE) : "MTI";

  const employeeQualified = `[${orangeSchema}].[${orangeEmployeeTable}]`;
  const dayTypeQualified = `[${orangeProcSchema}].[${orangeDayTypeProc}]`;

  const pool = await getOrangePool();
  try {
    const q = `SELECT TOP 5 e.employee_id, e.employee_name, dt.day_type, dt.description, dt.time_in, dt.time_out, dt.next_day
               FROM ${employeeQualified} AS e
               CROSS APPLY ${dayTypeQualified}('${orangeSiteCode}', e.employee_id, GETDATE()) AS dt`;
    const res = await pool.request().query(q);
    const count = res.recordset?.length ?? 0;
    console.log(JSON.stringify({ ok: true, schema: orangeSchema, table: orangeEmployeeTable, procSchema: orangeProcSchema, proc: orangeDayTypeProc, siteCode: orangeSiteCode, sampleCount: count }));
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ ok: false, error: msg }));
  process.exitCode = 1;
});
