import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sql, { ConnectionPool } from "mssql";
import { dbConfig } from "../config";

async function listSqlFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    if (e.isFile() && e.name.toLowerCase().endsWith(".sql")) {
      files.push(path.join(dir, e.name));
    }
  }
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

async function readFile(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  return buf.toString("utf-8");
}

async function runSql(pool: ConnectionPool, content: string): Promise<void> {
  const req = pool.request();
  await req.query(content);
}

async function main(): Promise<void> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const schemaDir = path.resolve(__dirname, "../schema");
  const files = (await listSqlFiles(schemaDir)).filter((filePath) => {
    const name = path.basename(filePath).toLowerCase();
    if (name.startsWith("mtiusers_lastupdate")) return false;
    return true;
  });
  if (files.length === 0) {
    console.log("No schema files found.");
    return;
  }
  const pool = await sql.connect(dbConfig);
  try {
    for (const file of files) {
      const content = await readFile(file);
      console.log(`Applying: ${path.basename(file)}`);
      await runSql(pool, content);
      console.log(`Applied: ${path.basename(file)}`);
    }
    console.log("Schema applied successfully.");
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("Schema apply failed:", msg);
  process.exitCode = 1;
});
