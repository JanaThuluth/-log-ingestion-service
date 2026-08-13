import test from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/server.js";
import { runMigrations } from "../src/db/migrate.js";
import { checkDatabaseConnection } from "../src/db/pool.js";

await checkDatabaseConnection();
await runMigrations();
test("GET /health returns 200", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/health",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    status: "ok",
  });
});

test("POST /logs accepts a valid log", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/logs",
    payload: {
      logs: [
        {
          timestamp: new Date().toISOString(),
          level: "info",
          service: "test-service",
          message: "test log",
          attributes: {
            user_id: "123",
            retries: 2,
          },
        },
      ],
    },
  });
   console.log(response.body);
  assert.equal(response.statusCode, 200);

  const body = response.json();

  assert.equal(body.accepted, 1);
  assert.deepEqual(body.rejected, []);
});
