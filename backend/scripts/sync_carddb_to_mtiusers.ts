import "dotenv/config";
import sql from "mssql";
import { getDataDbPool } from "../dataDb";
import { getPool } from "../db";

type CardDbRow = {
  StaffNo: string | null;
  CardNo: string | null;
  AccessLevel: string | null;
  Name: string | null;
  FirstName: string | null;
  LastName: string | null;
};

function clean(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

async function ensureColumns(): Promise<void> {
  const pool = await getPool();
  const colsRes = await pool.request().query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='MTIUsers'"
  );
  const names = new Set((colsRes.recordset ?? []).map((r: Record<string, unknown>) => String(r["COLUMN_NAME"])));
  const needed = ["CardNo", "AccessLevel", "Name", "FirstName", "LastName", "StaffNo"];
  const missing = needed.filter((n) => !names.has(n));
  if (missing.length === 0) return;
  const alterParts: string[] = [];
  for (const m of missing) {
    // Use NVARCHAR(255) for text fields, can be adjusted later per requirements
    if (m === "CardNo") alterParts.push("ADD [CardNo] NVARCHAR(255) NULL");
    else if (m === "AccessLevel") alterParts.push("ADD [AccessLevel] NVARCHAR(255) NULL");
    else if (m === "Name") alterParts.push("ADD [Name] NVARCHAR(255) NULL");
    else if (m === "FirstName") alterParts.push("ADD [FirstName] NVARCHAR(255) NULL");
    else if (m === "LastName") alterParts.push("ADD [LastName] NVARCHAR(255) NULL");
    else if (m === "StaffNo") alterParts.push("ADD [StaffNo] NVARCHAR(255) NULL");
  }
  if (alterParts.length) {
    const q = `ALTER TABLE [dbo].[MTIUsers] ${alterParts.join(", ")}`;
    await pool.request().query(q);
  }
}

async function main(): Promise<void> {
  const source = await getDataDbPool();
  const target = await getPool();

  await ensureColumns();

  const q = `SELECT [StaffNo],[CardNo],[AccessLevel],[Name],[FirstName],[LastName]
             FROM [dbo].[CardDB]
             WHERE ISNULL([Del_State], 0) = 0`;
  const res = await source.request().query(q);
  const rows = (res.recordset ?? []) as Array<Record<string, unknown>>;

  let matched = 0;
  let updated = 0;
  const tx = target.transaction();
  await tx.begin();
  try {
    for (const r of rows) {
      const staffNo = clean(r["StaffNo"]);
      if (!staffNo) continue;
      const cardNo = clean(r["CardNo"]) || null;
      const accessLevel = clean(r["AccessLevel"]) || null;
      const name = clean(r["Name"]) || null;
      const firstName = clean(r["FirstName"]) || null;
      const lastName = clean(r["LastName"]) || null;

      const checkReq = tx.request();
      checkReq.input("employee_id", sql.NVarChar, staffNo);
      const existsRes = await checkReq.query("SELECT COUNT(1) AS c FROM [dbo].[MTIUsers] WHERE employee_id = @employee_id");
      const exists = Number((existsRes.recordset?.[0] as { c?: unknown })?.c || 0) > 0;
      if (!exists) continue;
      matched += 1;

      const upd = tx.request();
      upd.input("employee_id", sql.NVarChar, staffNo);
      upd.input("CardNo", sql.NVarChar, cardNo);
      upd.input("AccessLevel", sql.NVarChar, accessLevel);
      upd.input("Name", sql.NVarChar, name);
      upd.input("FirstName", sql.NVarChar, firstName);
      upd.input("LastName", sql.NVarChar, lastName);
      upd.input("StaffNo", sql.NVarChar, staffNo);
      await upd.query(
        "UPDATE [dbo].[MTIUsers] SET [CardNo]=@CardNo,[AccessLevel]=@AccessLevel,[Name]=@Name,[FirstName]=@FirstName,[LastName]=@LastName,[StaffNo]=@StaffNo WHERE employee_id=@employee_id"
      );
      updated += 1;
    }
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }

  console.log(JSON.stringify({ matched, updated }));
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ error: msg }));
  process.exitCode = 1;
});
