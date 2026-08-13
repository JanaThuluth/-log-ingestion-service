import { pool } from "../db/pool.js";

const retentionDays = Number(process.env.RETENTION_DAYS || 30);

const cleanupIntervalMs = 60 * 60 * 1000; // 1 hour
const batchSize = 10_000;

export async function runRetentionCleanup(): Promise<void> {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    throw new Error("RETENTION_DAYS must be a positive number");
  }

  const cutoff = new Date(
    Date.now() - retentionDays * 24 * 60 * 60 * 1000,
  );

  let deleted = 0;

  do {
    const result = await pool.query(
      `
        DELETE FROM logs
        WHERE id IN (
          SELECT id
          FROM logs
          WHERE timestamp < $1
          ORDER BY timestamp ASC
          LIMIT $2
        )
      `,
      [cutoff, batchSize],
    );

    deleted = result.rowCount ?? 0;

    if (deleted > 0) {
      console.log(`Retention cleanup deleted ${deleted} logs`);
    }
  } while (deleted === batchSize);
}

export function startRetentionCleanup(): void {
  void runRetentionCleanup().catch((error) => {
    console.error("Initial retention cleanup failed:", error);
  });

  setInterval(() => {
    void runRetentionCleanup().catch((error) => {
      console.error("Retention cleanup failed:", error);
    });
  }, cleanupIntervalMs);
}
