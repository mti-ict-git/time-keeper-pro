import { Router, Request, Response } from "express";
import sql from "mssql";
import { getPool } from "../db";
import { getTableColumns } from "../utils/introspection";

export const controllersRouter = Router();

function pickControllerColumn(cols: Array<{ name: string }>): string | null {
  const candidates = ["TrController", "controller_name", "Controller", "ControllerName"];
  for (const c of candidates) {
    const found = cols.find((col) => col.name.toLowerCase() === c.toLowerCase());
    if (found) return found.name;
  }
  return null;
}

function parseCsv(value: unknown): string[] {
  const s = typeof value === "string" ? value : "";
  return s
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function matchToken(n: string, token: string): boolean {
  const t = token.toLowerCase();
  if (t.startsWith("regex:")) {
    try {
      const body = t.slice(6);
      const re = new RegExp(body, "i");
      return re.test(n);
    } catch {
      return false;
    }
  }
  if (t.startsWith("^")) return n.startsWith(t.slice(1));
  if (t.endsWith("$")) return n.endsWith(t.slice(0, -1));
  return n.includes(t);
}

function shouldInclude(name: string, includes: string[], excludes: string[]): boolean {
  const n = name.toLowerCase();
  const inc = includes.length === 0 || includes.some((k) => matchToken(n, k));
  const exc = excludes.some((k) => matchToken(n, k));
  return inc && !exc;
}

controllersRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const cols = await getTableColumns(pool, "tblAttendanceReport");
    const ctrlCol = pickControllerColumn(cols);
    if (!ctrlCol) {
      res.json({ data: [] });
      return;
    }
    const req = pool.request();
    const query = `SELECT RTRIM(LTRIM([${ctrlCol}])) AS name, COUNT(1) AS records FROM tblAttendanceReport WHERE [${ctrlCol}] IS NOT NULL AND RTRIM(LTRIM([${ctrlCol}])) <> '' GROUP BY [${ctrlCol}] ORDER BY name ASC`;
    const result = await req.query(query);
    const rows = (result.recordset ?? []) as Array<Record<string, unknown>>;
    const includeEnv = parseCsv(process.env.CONTROLLER_INCLUDE ?? "^FR-,trial,face,fp,facial,biometric");
    const excludeEnv = parseCsv(process.env.CONTROLLER_EXCLUDE ?? "door,gate,barrier,turnstile,parking,boom");
    const data = rows
      .map((r) => ({
        name: String(r["name"] ?? ""),
        records: Number(r["records"] ?? 0),
      }))
      .filter((item) => shouldInclude(item.name, includeEnv, excludeEnv));
    res.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});
