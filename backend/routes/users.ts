import { Router, Request, Response } from "express";
import sql from "mssql";
import { Client } from "ldapts";
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

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  return v && v.length ? v : fallback ?? "";
}

usersRouter.post("/", async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const pool = await getPool();
    const cols = await getTableColumns(pool, "Users");
    const map: Record<string, string> = {};
    function take(keys: string[], prop: string): void {
      const col = keys.find((k) => cols.some((c) => c.name.toLowerCase() === k.toLowerCase()));
      if (col && typeof body[prop] === "string") map[col] = String(body[prop]);
    }
    take(["username", "UserName", "login", "Login", "UserID", "user_id"], "username");
    take(["password", "Password", "pwd", "pass"], "password");
    take(["name", "FullName", "UserName", "employee_name"], "name");
    take(["email", "Email"], "email");
    take(["department", "Department"], "department");
    take(["source", "authType", "AuthType"], "authType");
    if (Object.keys(map).length === 0) {
      res.status(400).json({ error: "No compatible columns found" });
      return;
    }
    const request = pool.request();
    const names = Object.keys(map);
    for (const n of names) {
      const ci = cols.find((c) => c.name === n)!;
      const binding = mapBinding(ci);
      let sqlType: sql.ISqlType;
      if (binding.kind === "simple") sqlType = binding.type as unknown as sql.ISqlType;
      else if (binding.kind === "length") sqlType = binding.type(binding.length);
      else sqlType = binding.type(binding.precision, binding.scale);
      request.input(n, sqlType, map[n]);
    }
    const columnsSql = names.map((n) => `[${n}]`).join(", ");
    const valuesSql = names.map((n) => `@${n}`).join(", ");
    const q = `INSERT INTO Users (${columnsSql}) VALUES (${valuesSql})`;
    await request.query(q);
    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

usersRouter.get("/ad/search", async (req: Request, res: Response) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) {
    res.json({ data: [] });
    return;
  }
  const url = env("LDAP_URL");
  const baseDN = env("LDAP_BASE_DN");
  const bindDN = env("LDAP_BIND_DN");
  const bindPassword = env("LDAP_BIND_PASSWORD");
  const rejectUnauthorized = env("LDAP_TLS_REJECT_UNAUTHORIZED", "false").toLowerCase() === "true";
  const timeoutMs = Number(env("LDAP_TIMEOUT", "5000"));
  const connectTimeoutMs = Number(env("LDAP_CONNECT_TIMEOUT", "10000"));
  const client = new Client({ url, timeout: timeoutMs, connectTimeout: connectTimeoutMs, tlsOptions: { rejectUnauthorized } });
  try {
    await client.bind(bindDN, bindPassword);
    const filter = `(|(cn=*${q}*)(sAMAccountName=*${q}*)(mail=*${q}*)(userPrincipalName=*${q}*))`;
    const { searchEntries } = await client.search(baseDN, {
      scope: "sub",
      filter,
      attributes: ["dn", "cn", "displayName", "sAMAccountName", "mail", "userPrincipalName"],
      sizeLimit: 20,
    });
    const rows = (searchEntries ?? []) as Array<Record<string, unknown>>;
    const data = rows.map((r) => ({
      dn: String(r["dn"] ?? ""),
      username: String(r["sAMAccountName"] ?? r["userPrincipalName"] ?? ""),
      name: String(r["displayName"] ?? r["cn"] ?? ""),
      email: String(r["mail"] ?? ""),
    }));
    res.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "LDAP error";
    res.status(500).json({ error: message });
  } finally {
    try {
      await client.unbind();
    } catch {
      const _noop = null;
    }
  }
});

usersRouter.post("/ad/import", async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const username = typeof body["username"] === "string" ? body["username"] : "";
    const name = typeof body["name"] === "string" ? body["name"] : "";
    const email = typeof body["email"] === "string" ? body["email"] : "";
    const department = typeof body["department"] === "string" ? body["department"] : "";
    const pool = await getPool();
    const cols = await getTableColumns(pool, "Users");
    const map: Record<string, string> = {};
    function take(keys: string[], value: string): void {
      const col = keys.find((k) => cols.some((c) => c.name.toLowerCase() === k.toLowerCase()));
      if (col && value) map[col] = value;
    }
    take(["username", "UserName", "login", "Login", "UserID", "user_id"], String(username));
    take(["name", "FullName", "UserName"], String(name));
    take(["email", "Email"], String(email));
    take(["department", "Department"], String(department));
    take(["source", "authType", "AuthType"], "AD");
    if (Object.keys(map).length === 0) {
      res.status(400).json({ error: "No compatible columns found" });
      return;
    }
    const request = pool.request();
    const names = Object.keys(map);
    for (const n of names) {
      const ci = cols.find((c) => c.name === n)!;
      const binding = mapBinding(ci);
      let sqlType: sql.ISqlType;
      if (binding.kind === "simple") sqlType = binding.type as unknown as sql.ISqlType;
      else if (binding.kind === "length") sqlType = binding.type(binding.length);
      else sqlType = binding.type(binding.precision, binding.scale);
      request.input(n, sqlType, map[n]);
    }
    const columnsSql = names.map((n) => `[${n}]`).join(", ");
    const valuesSql = names.map((n) => `@${n}`).join(", ");
    const q = `INSERT INTO Users (${columnsSql}) VALUES (${valuesSql})`;
    await request.query(q);
    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});
