import { Router, Request, Response } from "express";
import sql from "mssql";
import { getPool } from "../db";
import { getTableColumns, mapBinding } from "../utils/introspection";

export const authLocalRouter = Router();

authLocalRouter.post("/login", async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const username = typeof body["username"] === "string" ? String(body["username"]).trim() : "";
    const password = typeof body["password"] === "string" ? String(body["password"]) : "";
    if (!username) {
      res.status(400).json({ error: "Missing username" });
      return;
    }
    const pool = await getPool();
    const cols = await getTableColumns(pool, "Users");
    const userCol = ["username", "UserName", "login", "Login", "UserID", "user_id"].find((n) =>
      cols.some((c) => c.name.toLowerCase() === n.toLowerCase())
    );
    if (!userCol) {
      res.status(500).json({ error: "Username column not found" });
      return;
    }
    const passCol = ["password", "Password", "pwd", "pass"].find((n) => cols.some((c) => c.name.toLowerCase() === n.toLowerCase()));
    const ci = cols.find((c) => c.name === userCol)!;
    const binding = mapBinding(ci);
    const request = pool.request();
    let sqlType: sql.ISqlType;
    if (binding.kind === "simple") sqlType = binding.type as unknown as sql.ISqlType;
    else if (binding.kind === "length") sqlType = binding.type(binding.length);
    else sqlType = binding.type(binding.precision, binding.scale);
    request.input("u", sqlType, username);
    const q = `SELECT TOP 1 * FROM Users WHERE [${userCol}] = @u`;
    const result = await request.query(q);
    const row = (result.recordset?.[0] as Record<string, unknown> | undefined) ?? undefined;
    if (!row) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    if (passCol) {
      const stored = row[passCol];
      if (typeof stored === "string" && stored.length) {
        if (stored !== password) {
          res.status(401).json({ error: "Invalid credentials" });
          return;
        }
      }
    }
    res.json({ success: true, user: username });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

