import { pool } from "../db/pool.js";
import type { LogInput } from "../validation/log.js";
import type {
  LogQuery,
  AggregateQuery,
} from "../validation/logQuery.js";
function encodeCursor(timestamp: string, id: string): string {
  return Buffer.from(
    JSON.stringify({ timestamp, id }),
  ).toString("base64url");
}

function decodeCursor(cursor: string): { timestamp: string; id: string } {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded);

    if (
      typeof parsed.timestamp !== "string" ||
      typeof parsed.id !== "string"
    ) {
      throw new Error();
    }

    return parsed;
  } catch {
    throw new Error("Invalid cursor");
  }
}

export async function createLog(log: LogInput) {
  const result = await pool.query(
    `
      INSERT INTO logs (
        timestamp,
        level,
        service,
        message,
        attributes
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id,
        timestamp,
        level,
        service,
        message,
        attributes
    `,
    [
      log.timestamp,
      log.level,
      log.service,
      log.message,
      log.attributes,
    ],
  );

  return result.rows[0];
}

export async function createLogs(logs: LogInput[]) {
  if (logs.length === 0) {
    return [];
  }

  const values: unknown[] = [];
  const rows: string[] = [];

  for (const log of logs) {
    const offset = values.length;

    values.push(
      log.timestamp,
      log.level,
      log.service,
      log.message,
      log.attributes,
    );

    rows.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`,
    );
  }

  const result = await pool.query(
    `
      INSERT INTO logs (
        timestamp,
        level,
        service,
        message,
        attributes
      )
      VALUES ${rows.join(", ")}
      RETURNING
        id,
        timestamp,
        level,
        service,
        message,
        attributes,
        created_at
    `,
    values,
  );

  return result.rows;
}

export async function getLogs(query: LogQuery) {
  const values: unknown[] = [];
  const conditions: string[] = [];

  if (query.cursor) {
    const cursor = decodeCursor(query.cursor);

    values.push(cursor.timestamp);
    const timestampParam = values.length;

    values.push(cursor.id);
    const idParam = values.length;

    conditions.push(
      `(timestamp < $${timestampParam} OR (timestamp = $${timestampParam} AND id < $${idParam}::bigint))`,
    );
  }

  if (query.level) {
    values.push(query.level);
    conditions.push(`level = $${values.length}`);
  }

  if (query.service) {
    values.push(query.service);
    conditions.push(`service = $${values.length}`);
  }

  if (query.since) {
    values.push(query.since);
    conditions.push(`timestamp >= $${values.length}`);
  }

  if (query.until) {
    values.push(query.until);
    conditions.push(`timestamp < $${values.length}`);
  }

  if (query.q) {
    values.push(`%${query.q}%`);
    conditions.push(`message ILIKE $${values.length}`);
  }
  const attributeFilters = Object.entries(query).filter(
  ([key]) => key.startsWith("attr."),
);

for (const [key, value] of attributeFilters) {
  const attributeKey = key.slice(5);

  values.push(value);

  conditions.push(
    `attributes ->> '${attributeKey.replace(/'/g, "''")}' = $${values.length}`,
  );
}

  const whereClause =
    conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

  // Fetch one extra row so we can determine whether another page exists.
  values.push(query.limit + 1);
  const limitParam = values.length;

  const result = await pool.query(
    `
      SELECT
        id,
        timestamp,
        level,
        service,
        message,
        attributes,
        created_at
      FROM logs
      ${whereClause}
      ORDER BY timestamp DESC, id DESC
      LIMIT $${limitParam}
    `,
    values,
  );

  const hasMore = result.rows.length > query.limit;
  const logs = hasMore
    ? result.rows.slice(0, query.limit)
    : result.rows;

  let nextCursor: string | null = null;

  if (hasMore) {
    const lastLog = logs[logs.length - 1];

    nextCursor = encodeCursor(
      new Date(lastLog.timestamp).toISOString(),
      String(lastLog.id),
    );
  }

  return {
    logs,
    next_cursor: nextCursor,
  };
}
export async function aggregateLogs(query: AggregateQuery) {
  const values: unknown[] = [];
  const conditions: string[] = [];

  values.push(query.since);
  conditions.push(`timestamp >= $${values.length}`);

  values.push(query.until);
  conditions.push(`timestamp < $${values.length}`);

  if (query.level) {
    values.push(query.level);
    conditions.push(`level = $${values.length}`);
  }

  if (query.service) {
    values.push(query.service);
    conditions.push(`service = $${values.length}`);
  }

  if (query.q) {
    values.push(`%${query.q}%`);
    conditions.push(`message ILIKE $${values.length}`);
  }
  const attributeFilters = Object.entries(query).filter(
  ([key]) => key.startsWith("attr."),
);

for (const [key, value] of attributeFilters) {
  const attributeKey = key.slice(5);

  values.push(value);

  conditions.push(
    `attributes ->> '${attributeKey.replace(/'/g, "''")}' = $${values.length}`,
  );
}

  let bucketExpression: string;

  switch (query.bucket) {
    case "1m":
      bucketExpression = "date_trunc('minute', timestamp)";
      break;
    case "5m":
      bucketExpression =
        "date_trunc('hour', timestamp) + floor(extract(minute from timestamp) / 5) * interval '5 minutes'";
      break;
    case "1h":
      bucketExpression = "date_trunc('hour', timestamp)";
      break;
    case "1d":
      bucketExpression = "date_trunc('day', timestamp)";
      break;
  }

  const groupExpression =
  query.group_by === "service"
    ? "service"
    : query.group_by === "level"
      ? "level"
      : null;

const whereClause = `WHERE ${conditions.join(" AND ")}`;

const result = await pool.query(
  `
    SELECT
      ${bucketExpression} AS start,
      ${groupExpression ? groupExpression : "NULL"} AS "group",
      COUNT(*)::int AS count
    FROM logs
    ${whereClause}
    ${
      groupExpression
        ? `GROUP BY ${bucketExpression}, ${groupExpression}`
        : `GROUP BY ${bucketExpression}`
    }
    ORDER BY
      ${bucketExpression} ASC
  `,
  values,
);

  return {
    buckets: result.rows,
  };
}
