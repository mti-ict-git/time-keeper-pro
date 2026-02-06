import sql from "mssql";
import { dbConfig } from "./config";

let poolPromise: Promise<sql.ConnectionPool> | undefined;

export function getPool(): Promise<sql.ConnectionPool> {
  if (!poolPromise) {
    const pool = new sql.ConnectionPool(dbConfig);
    poolPromise = pool.connect();
  }
  return poolPromise as Promise<sql.ConnectionPool>;
}
