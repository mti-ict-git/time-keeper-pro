import dotenv from "dotenv";
import type { config as SqlConfig } from "mssql";

dotenv.config();

export const dbConfig: SqlConfig = {
  user: process.env.DB_USER as string,
  password: process.env.DB_PASSWORD as string,
  server: process.env.DB_SERVER as string,
  database: process.env.DB_NAME as string,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 1433,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

export const appPort = process.env.PORT ? Number(process.env.PORT) : 5000;
