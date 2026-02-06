import sql from "mssql";

let orangePoolPromise: Promise<sql.ConnectionPool> | undefined;

function getEnv(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v && v.length) return v;
  return fallback !== undefined ? fallback : "";
}

export function getOrangePool(): Promise<sql.ConnectionPool> {
  if (!orangePoolPromise) {
    orangePoolPromise = sql.connect({
      user: getEnv("ORANGE_DB_USER"),
      password: getEnv("ORANGE_DB_PASSWORD"),
      server: getEnv("ORANGE_DB_SERVER"),
      database: getEnv("ORANGE_DB_NAME"),
      port: process.env.ORANGE_DB_PORT ? Number(process.env.ORANGE_DB_PORT) : 1433,
      options: { encrypt: false, trustServerCertificate: true },
    });
  }
  return orangePoolPromise as Promise<sql.ConnectionPool>;
}
