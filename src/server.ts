
import type { LogInput } from "./validation/log.js";
import { startRetentionCleanup } from "./services/retention.js";
import Fastify from "fastify";
import { checkDatabaseConnection } from "./db/pool.js";
import { runMigrations } from "./db/migrate.js";

import { logSchema , logsBatchSchema } from "./validation/log.js";
import {
  createLogs,
  getLogs,
  aggregateLogs,
} from "./repositories/logRepository.js";
import {
  logQuerySchema,
  aggregateQuerySchema,
} from "./validation/logQuery.js";

export const app = Fastify({
  logger: true,
  bodyLimit: 2 * 1024 * 1024,
});
app.get("/health", async () => {
  return { status: "ok" };
});

app.get("/logs", async (request, reply) => {
  const result = logQuerySchema.safeParse(request.query);

  if (!result.success) {
    return reply.status(400).send({
      error: "Invalid query parameters",
    });
  }

  if (
    result.data.since &&
    result.data.until &&
    result.data.until <= result.data.since
  ) {
    return reply.status(400).send({
      error: "until must be after since",
    });
  }

  try {
    return await getLogs(result.data);
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid cursor") {
      return reply.status(400).send({
        error: "Invalid cursor",
      });
    }

    throw error;
  }
});
app.get("/logs/aggregate", async (request, reply) => {
  const result = aggregateQuerySchema.safeParse(request.query);

  if (!result.success) {
    return reply.status(400).send({
      error: "Invalid query parameters",
    });
  }

  if (result.data.until <= result.data.since) {
    return reply.status(400).send({
      error: "until must be after since",
    });
  }

  return aggregateLogs(result.data);
});


app.post("/logs", async (request, reply) => {
  const batch = logsBatchSchema.safeParse(request.body);

  if (!batch.success) {
    return reply.status(400).send({
      error: "Invalid request body",
    });
  }

  const rejected: {
    index: number;
    reason: string;
  }[] = [];

  const validLogs: {
    data: LogInput;
    index: number;
  }[] = [];

  for (let i = 0; i < batch.data.logs.length; i++) {
    const result = logSchema.safeParse(batch.data.logs[i]);

    if (!result.success) {
      const issue = result.error.issues[0];

      rejected.push({
        index: i,
        reason: issue
          ? `${issue.path.join(".")}: ${issue.message}`
          : "Invalid log data",
      });

      continue;
    }

    const timestamp = new Date(result.data.timestamp);
    const fiveMinutesFromNow = new Date(
      Date.now() + 5 * 60 * 1000,
    );

    if (timestamp > fiveMinutesFromNow) {
      rejected.push({
        index: i,
        reason: "timestamp is more than five minutes in the future",
      });

      continue;
    }

    validLogs.push({
      data: result.data,
      index: i,
    });
  }

  let accepted = 0;

  if (validLogs.length > 0) {
 try {
  await createLogs(validLogs.map((item) => item.data));
  accepted = validLogs.length;
} catch (error) {
  console.error("CREATE LOGS ERROR:", error);

  for (const item of validLogs) {
    rejected.push({
      index: item.index,
      reason: "Failed to store log",
    });
  }
}
      
  }

  if (accepted === 0) {
    return reply.status(400).send({
      accepted: 0,
      rejected,
    });
  }

  return reply.status(200).send({
    accepted,
    rejected,
  });
});      

const start = async () => {
  try {
    await checkDatabaseConnection();
    await runMigrations();
    startRetentionCleanup();

    await app.listen({
      port: 8080,
      host: "0.0.0.0",
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

if (process.env.NODE_ENV !== "test") {
  start();
}
