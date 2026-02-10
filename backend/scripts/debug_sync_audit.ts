import sql from "mssql";
import { dbConfig } from "../config";

async function main(): Promise<void> {
  const pool = await sql.connect(dbConfig);
  try {
    const logsRes = await pool
      .request()
      .query(
        "SELECT TOP 10 id, timestamp, total, updated, inserted, unchanged, success, runId FROM SyncLogs ORDER BY id DESC"
      );
    const logs = logsRes.recordset ?? [];

    const changesRes = await pool
      .request()
      .query(
        "SELECT TOP 20 id, runId, employee_id, field_name, old_value, new_value, updated_at FROM MTIUsersLastUpdate ORDER BY id DESC"
      );
    const changes = changesRes.recordset ?? [];

    console.log(JSON.stringify({ logs, changes }, null, 2));
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("debug_sync_audit error:", message);
  process.exitCode = 1;
});

