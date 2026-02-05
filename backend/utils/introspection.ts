import sql from "mssql";
import type { ConnectionPool } from "mssql";

export type ColumnInfo = {
  name: string;
  dataType: string;
  characterMaximumLength: number | null;
  numericPrecision: number | null;
  numericScale: number | null;
  isNullable: boolean;
};

export type ColumnBindingType =
  | { kind: "simple"; type: sql.ISqlTypeFactory }
  | { kind: "length"; type: sql.ISqlTypeFactoryWithLength; length: number }
  | { kind: "precision"; type: sql.ISqlTypeFactoryWithPrecisionScale; precision: number; scale: number };

export async function getTableColumns(pool: ConnectionPool, tableName: string): Promise<ColumnInfo[]> {
  const request = pool.request();
  request.input("tableName", sql.NVarChar, tableName);
  const result = await request.query(
    "SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tableName ORDER BY ORDINAL_POSITION"
  );
  const rows = result.recordset ?? [];
  const cols: ColumnInfo[] = rows.map((r) => {
    const obj = r as Record<string, unknown>;
    const name = String(obj["COLUMN_NAME"]);
    const dataType = String(obj["DATA_TYPE"]);
    const charLenRaw = obj["CHARACTER_MAXIMUM_LENGTH"];
    const numPrecRaw = obj["NUMERIC_PRECISION"];
    const numScaleRaw = obj["NUMERIC_SCALE"];
    const isNullableRaw = obj["IS_NULLABLE"];
    const characterMaximumLength = typeof charLenRaw === "number" ? charLenRaw : charLenRaw === null ? null : Number(charLenRaw);
    const numericPrecision = typeof numPrecRaw === "number" ? numPrecRaw : numPrecRaw === null ? null : Number(numPrecRaw);
    const numericScale = typeof numScaleRaw === "number" ? numScaleRaw : numScaleRaw === null ? null : Number(numScaleRaw);
    const isNullable = String(isNullableRaw).toUpperCase() === "YES";
    return { name, dataType, characterMaximumLength, numericPrecision, numericScale, isNullable };
  });
  return cols;
}

export function mapBinding(ci: ColumnInfo): ColumnBindingType {
  const dt = ci.dataType.toLowerCase();
  if (dt === "int") return { kind: "simple", type: sql.Int };
  if (dt === "bigint") return { kind: "simple", type: sql.BigInt };
  if (dt === "smallint") return { kind: "simple", type: sql.SmallInt };
  if (dt === "tinyint") return { kind: "simple", type: sql.TinyInt };
  if (dt === "bit") return { kind: "simple", type: sql.Bit };
  if (dt === "float") return { kind: "simple", type: sql.Float };
  if (dt === "real") return { kind: "simple", type: sql.Real };
  if (dt === "date") return { kind: "simple", type: sql.Date };
  if (dt === "datetime" || dt === "datetime2" || dt === "smalldatetime") return { kind: "simple", type: sql.DateTime };
  if (dt === "time") return { kind: "simple", type: sql.Time };
  if (dt === "uniqueidentifier") return { kind: "simple", type: sql.UniqueIdentifier };
  if (dt === "decimal" || dt === "numeric") {
    const precision = ci.numericPrecision ?? 18;
    const scale = ci.numericScale ?? 0;
    return { kind: "precision", type: sql.Decimal, precision, scale };
  }
  if (dt === "money" || dt === "smallmoney") return { kind: "simple", type: sql.Money };
  if (dt === "binary" || dt === "varbinary") {
    const length = ci.characterMaximumLength ?? sql.MAX;
    return { kind: "length", type: sql.VarBinary, length };
  }
  const length = ci.characterMaximumLength ?? sql.MAX;
  return { kind: "length", type: sql.NVarChar, length };
}
