import sql from "mssql";
import { dbConfig } from "./config";

let poolPromise: Promise<sql.ConnectionPool> | undefined;

export function getPool(): Promise<sql.ConnectionPool> {
  if (!poolPromise) {
    poolPromise = sql.connect(dbConfig);
  }
  return poolPromise as Promise<sql.ConnectionPool>;
}
