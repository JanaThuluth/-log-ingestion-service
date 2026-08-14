import { Pool } from "pg";

export const pool = new Pool({
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME ?? "logs_db",
  user: process.env.DB_USER ?? "logs_user",
  password: process.env.DB_PASSWORD ?? "logs_password",
  max: 20,
  min: 5,

  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export async function checkDatabaseConnection(): Promise<void> {
  await pool.query("SELECT 1");
}
