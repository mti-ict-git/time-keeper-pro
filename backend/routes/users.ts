import { Router, Request, Response } from "express";
import sql from "mssql";
import { getPool } from "../db";
import { getTableColumns, mapBinding } from "../utils/introspection";

export const usersRouter = Router();

usersRouter.get("/schema", async (_req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const columns = await getTableColumns(pool, "Users");
    res.json({ columns });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

usersRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query("SELECT TOP 100 * FROM Users");
    const rows = (result.recordset ?? []) as unknown as Array<Record<string, unknown>>;
    res.json({ data: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

usersRouter.get("/search", async (req: Request, res: Response) => {
  try {
    const field = String(req.query.field ?? "");
    const value = String(req.query.value ?? "");
    if (!field || !value) {
      res.status(400).json({ error: "Missing field or value" });
      return;
    }
    const pool = await getPool();
    const cols = await getTableColumns(pool, "Users");
    const col = cols.find((c) => c.name === field);
    if (!col) {
      res.status(400).json({ error: "Invalid field" });
      return;
    }
    const binding = mapBinding(col);
    const request = pool.request();
    let sqlType: sql.ISqlType;
    if (binding.kind === "simple") {
      sqlType = binding.type as unknown as sql.ISqlType;
    } else if (binding.kind === "length") {
      sqlType = binding.type(binding.length);
    } else {
      sqlType = binding.type(binding.precision, binding.scale);
    }
    request.input(field, sqlType, value);
    const result = await request.query(`SELECT TOP 100 * FROM Users WHERE ${field} = @${field}`);
    const rows = (result.recordset ?? []) as unknown as Array<Record<string, unknown>>;
    res.json({ data: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});
