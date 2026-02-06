import "dotenv/config";
import sql from "mssql";
import { getPool } from "../db";

async function main(): Promise<void> {
  const pool = await getPool();
  try {
    const res = await pool.request().query("SELECT DB_NAME() AS db");
    console.log(JSON.stringify({ db: res.recordset?.[0]?.db }));
    const t = await pool.request().query("SELECT COUNT(1) AS c FROM [dbo].[MTIUsers]");
    console.log(JSON.stringify({ mtiUsersCount: t.recordset?.[0]?.c }));
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ error: msg }));
  process.exitCode = 1;
});
