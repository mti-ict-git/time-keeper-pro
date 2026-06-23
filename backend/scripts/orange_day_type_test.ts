import "dotenv/config";
import sql from "mssql";
import { getOrangePool } from "../orangeDb";

function bracketIdent(name: string): string {
  return `[${name.replaceAll("]", "]]")}]`;
}

function parseDateArg(s: string | undefined): Date {
  const raw = (s ?? "").trim();
  if (!raw || raw.toLowerCase() === "now" || raw.toLowerCase() === "today") return new Date();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(`${raw}T00:00:00`);
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return new Date();
  return new Date(ms);
}

async function main(): Promise<void> {
  const staffNo = process.argv[2] ? String(process.argv[2]).trim() : "";
  const dateArg = process.argv[3] ? String(process.argv[3]).trim() : "";
  const siteArg = process.argv[4] ? String(process.argv[4]).trim() : "";

  if (!staffNo) {
    console.error(JSON.stringify({ ok: false, error: "Usage: npx tsx backend/scripts/orange_day_type_test.ts <StaffNo> [YYYY-MM-DD|now] [SiteCode]" }));
    process.exitCode = 1;
    return;
  }

  const orangeProcSchema =
    process.env.ORANGE_PROC_SCHEMA && process.env.ORANGE_PROC_SCHEMA.length ? String(process.env.ORANGE_PROC_SCHEMA) : "dbo";
  const orangeDayTypeProc =
    process.env.ORANGE_DAY_TYPE_PROC && process.env.ORANGE_DAY_TYPE_PROC.length ? String(process.env.ORANGE_DAY_TYPE_PROC) : "sp_it_get_day_type";
  const orangeSiteCode = siteArg || (process.env.ORANGE_SITE_CODE && process.env.ORANGE_SITE_CODE.length ? String(process.env.ORANGE_SITE_CODE) : "MTI");

  const dayTypeQualified = `${bracketIdent(orangeProcSchema)}.${bracketIdent(orangeDayTypeProc)}`;
  const dt = parseDateArg(dateArg);

  const pool = await getOrangePool();
  try {
    const req = pool.request();
    req.input("site", sql.NVarChar, orangeSiteCode);
    req.input("staff", sql.NVarChar, staffNo);
    req.input("dt", sql.DateTime, dt);
    const q = `SELECT TOP 10 company_id, day_type, description, time_in, time_out, next_day FROM ${dayTypeQualified}(@site, @staff, @dt)`;
    const res = await req.query(q);
    console.log(
      JSON.stringify(
        {
          ok: true,
          staffNo,
          siteCode: orangeSiteCode,
          at: dt.toISOString(),
          func: dayTypeQualified,
          rows: res.recordset ?? [],
        },
        null,
        2
      )
    );
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ ok: false, error: msg }));
  process.exitCode = 1;
});

