import "dotenv/config";
import sql from "mssql";
import { getOrangePool } from "../orangeDb";

async function main(): Promise<void> {
  const pool = await getOrangePool();
  try {
    const name = process.argv[2] ? String(process.argv[2]).trim() : "it_mti_employee_database_tbl";
    const schema = process.argv[3] ? String(process.argv[3]).trim() : "dbo";
    const req = pool.request();
    req.input("name", sql.NVarChar, name);
    req.input("schema", sql.NVarChar, schema);
    const q = `SELECT 'table' AS kind, name, SCHEMA_NAME(schema_id) AS schema_name FROM sys.tables WHERE name = @name AND SCHEMA_NAME(schema_id) = @schema
               UNION ALL
               SELECT 'view' AS kind, name, SCHEMA_NAME(schema_id) AS schema_name FROM sys.views WHERE name = @name AND SCHEMA_NAME(schema_id) = @schema
               UNION ALL
               SELECT 'synonym' AS kind, name, SCHEMA_NAME(schema_id) AS schema_name FROM sys.synonyms WHERE name = @name AND SCHEMA_NAME(schema_id) = @schema`;
    const res = await req.query(q);
    const rows = res.recordset ?? [];
    console.log(JSON.stringify({ queryName: name, schema, matches: rows }));
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ error: message }));
  process.exitCode = 1;
});
