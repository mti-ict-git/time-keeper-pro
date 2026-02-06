import sql from "mssql";

let dataPoolPromise: Promise<sql.ConnectionPool> | undefined;

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v && v.length) return v;
  return fallback !== undefined ? fallback : "";
}

export function getDataDbPool(): Promise<sql.ConnectionPool> {
  if (!dataPoolPromise) {
    const pool = new sql.ConnectionPool({
      user: env("DATADB_USER"),
      password: env("DATADB_PASSWORD"),
      server: env("DATADB_SERVER"),
      database: env("DATADB_NAME"),
      port: process.env.DATADB_PORT ? Number(process.env.DATADB_PORT) : 1433,
      options: { encrypt: false, trustServerCertificate: true },
    });
    dataPoolPromise = pool.connect();
  }
  return dataPoolPromise as Promise<sql.ConnectionPool>;
}
