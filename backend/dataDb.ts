import { createPoolGetter } from "./pool";

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v && v.length) return v;
  return fallback !== undefined ? fallback : "";
}

export const getDataDbPool = createPoolGetter("DataDBEnt", () => ({
  user: env("DATADB_USER"),
  password: env("DATADB_PASSWORD"),
  server: env("DATADB_SERVER"),
  database: env("DATADB_NAME"),
  port: process.env.DATADB_PORT ? Number(process.env.DATADB_PORT) : 1433,
  options: { encrypt: false, trustServerCertificate: true },
}));
