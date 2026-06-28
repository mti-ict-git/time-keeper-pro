import dotenv from "dotenv";
import type { config as SqlConfig } from "mssql";

dotenv.config();

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export const dbConfig: SqlConfig = {
  user: process.env.DB_USER as string,
  password: process.env.DB_PASSWORD as string,
  server: process.env.DB_SERVER as string,
  database: process.env.DB_NAME as string,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 1433,
  connectionTimeout: readPositiveInt("DB_CONNECTION_TIMEOUT_MS", 15000),
  requestTimeout: readPositiveInt("DB_REQUEST_TIMEOUT_MS", 120000),
  pool: {
    max: readPositiveInt("DB_POOL_MAX", 20),
    min: 0,
    idleTimeoutMillis: readPositiveInt("DB_POOL_IDLE_TIMEOUT_MS", 30000),
  },
  options: {
    encrypt: false,
    trustServerCertificate: true,
    cancelTimeout: readPositiveInt("DB_CANCEL_TIMEOUT_MS", 15000),
  },
};

export const appPort = process.env.PORT ? Number(process.env.PORT) : 5000;
