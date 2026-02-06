import { Router, Request, Response } from "express";
import { Client } from "ldapts";

export const authRouter = Router();

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  return v && v.length ? v : fallback ?? "";
}

type LoginBody = { username?: unknown; password?: unknown };

authRouter.post("/login", async (req: Request, res: Response) => {
  const body = req.body as LoginBody;
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password) {
    res.status(400).json({ error: "Missing username or password" });
    return;
  }

  const url = env("LDAP_URL");
  const baseDN = env("LDAP_BASE_DN");
  const bindDN = env("LDAP_BIND_DN");
  const bindPassword = env("LDAP_BIND_PASSWORD");
  const userSearchBase = env("LDAP_USER_SEARCH_BASE", baseDN);
  const userFilterTpl = env("LDAP_USER_SEARCH_FILTER", "(sAMAccountName={username})");
  const rejectUnauthorized = env("LDAP_TLS_REJECT_UNAUTHORIZED", "false").toLowerCase() === "true";
  const timeoutMs = Number(env("LDAP_TIMEOUT", "5000"));
  const connectTimeoutMs = Number(env("LDAP_CONNECT_TIMEOUT", "10000"));

  const client = new Client({
    url,
    timeout: timeoutMs,
    connectTimeout: connectTimeoutMs,
    tlsOptions: { rejectUnauthorized },
  });

  try {
    await client.bind(bindDN, bindPassword);
    const filter = userFilterTpl.replace("{username}", username);
    const { searchEntries } = await client.search(userSearchBase, {
      scope: "sub",
      filter,
      attributes: ["dn", "cn", "sAMAccountName", "mail"],
      sizeLimit: 1,
    });
    const entry = searchEntries[0] as Record<string, unknown> | undefined;
    if (!entry || typeof entry["dn"] !== "string") {
      res.status(401).json({ error: "User not found" });
      return;
    }
    const userDN = String(entry["dn"]);
    await client.bind(userDN, password);
    const displayName = String(entry["cn"] ?? username);
    const mail = String(entry["mail"] ?? "");
    res.json({ success: true, user: username, name: displayName, email: mail });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Authentication error";
    res.status(401).json({ error: message });
  } finally {
    try {
      await client.unbind();
    } catch (e) {
      void e;
    }
  }
});
