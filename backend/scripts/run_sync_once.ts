import "dotenv/config";
import { runScheduleSync } from "../sync";

async function main(): Promise<void> {
  try {
    const res = await runScheduleSync();
    console.log(
      JSON.stringify({
        ok: true,
        result: {
          total: res.total,
          updated: res.updated,
          inserted: res.inserted,
          unchanged: res.unchanged,
          runId: res.runId,
        },
      })
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ ok: false, error: msg }));
    process.exitCode = 1;
  }
}

main();
