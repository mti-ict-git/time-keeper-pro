import "dotenv/config";
import sql from "mssql";
import { dbConfig } from "../config";

async function main(): Promise<void> {
  const pool = await sql.connect(dbConfig);
  try {
    const like = process.argv[2] ? String(process.argv[2]).trim() : "%";
    const q = "SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' AND TABLE_NAME LIKE @like ORDER BY TABLE_SCHEMA, TABLE_NAME";
    const req = pool.request();
    req.input("like", sql.NVarChar, like);
    const res = await req.query(q);
    console.log(JSON.stringify({ rows: res.recordset ?? [] }));
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ error: msg }));
  process.exitCode = 1;
});
