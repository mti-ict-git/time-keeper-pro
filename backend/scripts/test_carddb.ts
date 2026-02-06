import "dotenv/config";
import sql from "mssql";
import { getDataDbPool } from "../dataDb";

type CardRow = {
  ID: number;
  CardNo: string | null;
  AccessLevel: string | null;
  Name: string | null;
  FirstName: string | null;
  LastName: string | null;
  StaffNo: string | null;
};

function s(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

async function main(): Promise<void> {
  const pool = await getDataDbPool();
  const q = "SELECT TOP (20) [ID],[CardNo],[AccessLevel],[Name],[FirstName],[LastName],[StaffNo] FROM [dbo].[CardDB] ORDER BY [ID] DESC";
  const result = await pool.request().query(q);
  const rows = (result.recordset ?? []) as Array<Record<string, unknown>>;
  const out: CardRow[] = rows.map((r) => ({
    ID: Number(r["ID"] ?? 0),
    CardNo: s(r["CardNo"]) || null,
    AccessLevel: s(r["AccessLevel"]) || null,
    Name: s(r["Name"]) || null,
    FirstName: s(r["FirstName"]) || null,
    LastName: s(r["LastName"]) || null,
    StaffNo: s(r["StaffNo"]) || null,
  }));
  console.log(JSON.stringify({ count: out.length, rows: out }, null, 2));
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ error: msg }));
  process.exitCode = 1;
});
