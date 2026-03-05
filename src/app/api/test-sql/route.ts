import { NextResponse } from "next/server";
import sql from "mssql";

const config: sql.config = {
  server: process.env.SQL_SERVER || "",
  database: process.env.SQL_DATABASE || "",
  user: process.env.SQL_USER || "",
  password: process.env.SQL_PASSWORD || "",
  options: {
    encrypt: false,
    trustServerCertificate: true,
    instanceName: process.env.SQL_INSTANCE || undefined,
  },
};

let pool: sql.ConnectionPool | null = null;

async function getPool(): Promise<sql.ConnectionPool> {
  if (!pool) {
    pool = await sql.connect(config);
  }
  return pool;
}

export async function GET() {
  try {
    const connectionPool = await getPool();
    const result = await connectionPool.request().query<{ TABLE_NAME: string }>(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'`
    );

    const tables = result.recordset.map((row) => row.TABLE_NAME);

    return NextResponse.json({
      success: true,
      tableCount: tables.length,
      tables,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error connecting to SQL Server";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
