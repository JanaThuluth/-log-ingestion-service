# Log Ingestion and Query Service

A high-performance log ingestion and querying service built with **Node.js, TypeScript, Fastify, PostgreSQL, and Docker**.

The service is designed to ingest structured logs in batches, validate every log entry, store logs efficiently in PostgreSQL, support flexible filtering and cursor-based pagination, provide time-bucketed aggregations, and automatically remove logs according to a configurable retention policy.

---

## Features

* Batch log ingestion
* Per-entry validation with detailed rejection information
* Structured log storage using PostgreSQL
* JSONB attributes for flexible metadata
* Filtering by:

  * timestamp range
  * log level
  * service
  * message content
  * arbitrary attributes
* Cursor-based pagination
* Time-bucketed log aggregation
* Grouping by service or log level
* Automatic retention cleanup
* PostgreSQL performance indexes
* Docker Compose setup
* Health check endpoint
* Automated tests
* TypeScript type safety with Zod validation

---

## Tech Stack

* **Node.js**
* **TypeScript**
* **Fastify**
* **PostgreSQL 18**
* **Zod**
* **node-postgres (`pg`)**
* **Docker / Docker Compose**

---

## Architecture

The application follows a simple layered structure:

```text
                    ┌─────────────────────┐
                    │      HTTP Client    │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │      Fastify API    │
                    │                     │
                    │  /health            │
                    │  /logs              │
                    │  /logs/aggregate    │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │     Validation      │
                    │       Zod          │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │    Repository       │
                    │    Layer            │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │     PostgreSQL      │
                    │                     │
                    │  logs               │
                    │  indexes            │
                    │  JSONB attributes   │
                    └─────────────────────┘

                    ┌─────────────────────┐
                    │ Retention Service   │
                    │                    │
                    │ Periodic cleanup    │
                    └──────────┬──────────┘
                               │
                               ▼
                          PostgreSQL
```

---

## Project Structure

```text
.
├── src/
│   ├── db/
│   │   ├── migrations/
│   │   │   ├── 001_create_logs.sql
│   │   │   ├── 002_add_performance_indexes.sql
│   │   │   ├── 003_remove_redundant_indexes.sql
│   │   │   └── 004_add_service_timestamp_index.sql
│   │   ├── migrate.ts
│   │   └── pool.ts
│   │
│   ├── repositories/
│   │   └── logRepository.ts
│   │
│   ├── routes/
│   │
│   ├── services/
│   │   └── retention.ts
│   │
│   ├── validation/
│   │   ├── log.ts
│   │   └── logQuery.ts
│   │
│   └── server.ts
│
├── tests/
├── Dockerfile
├── docker-compose.yml
├── package.json
├── package-lock.json
└── tsconfig.json
```

---

## Getting Started

### Prerequisites

Make sure you have:

* Docker
* Docker Compose
* Node.js 22+ (for local development)

---

## Run with Docker

The project is configured to start both the application and PostgreSQL using Docker Compose.

```bash
docker compose up --build
```

The API will be available at:

```text
http://localhost:8080
```

The PostgreSQL database runs on:

```text
localhost:5432
```

The Docker setup uses:

* PostgreSQL: `postgres:18`
* PostgreSQL CPU limit: `1 CPU`
* PostgreSQL memory limit: `1 GB`
* Application CPU limit: `0.5 CPU`
* Application memory limit: `256 MB`

These limits match the constrained environment used for performance evaluation.

---

## Environment Variables

The application connects to PostgreSQL using the following variables:

```text
DB_HOST=postgres
DB_PORT=5432
DB_NAME=logs_db
DB_USER=logs_user
DB_PASSWORD=logs_password
```

Retention can be configured with:

```text
RETENTION_DAYS=30
```

If `RETENTION_DAYS` is not provided, the default retention period is **30 days**.

---

# API

## Health Check

### `GET /health`

Returns the current health status of the service.

### Example

```bash
curl http://localhost:8080/health
```

### Response

```json
{
  "status": "ok"
}
```

---

# Ingest Logs

## `POST /logs`

Accepts a batch of logs.

Each log is validated individually. Valid entries are stored, while invalid entries are returned in the `rejected` array together with their original index and validation reason.

### Request

```json
{
  "logs": [
    {
      "timestamp": "2026-08-18T10:00:00.000Z",
      "level": "info",
      "service": "api",
      "message": "Request completed",
      "attributes": {
        "request_id": "abc123",
        "status_code": 200
      }
    },
    {
      "timestamp": "2026-08-18T10:01:00.000Z",
      "level": "error",
      "service": "database",
      "message": "Database connection failed",
      "attributes": {
        "database": "postgres"
      }
    }
  ]
}
```

### Example

```bash
curl -X POST http://localhost:8080/logs \
  -H "Content-Type: application/json" \
  -d '{
    "logs": [
      {
        "timestamp": "2026-08-18T10:00:00.000Z",
        "level": "info",
        "service": "api",
        "message": "Request completed",
        "attributes": {
          "request_id": "abc123",
          "status_code": 200
        }
      }
    ]
  }'
```

### Successful Response

```json
{
  "accepted": 1,
  "rejected": []
}
```

### Partial Rejection

```json
{
  "accepted": 1,
  "rejected": [
    {
      "index": 1,
      "reason": "level: Invalid option: expected one of \"debug\"|\"info\"|\"warn\"|\"error\""
    }
  ]
}
```

If no valid logs can be stored, the service returns HTTP `400`.

---

# Log Validation

Every log entry must contain:

| Field        | Type         | Requirements                        |
| ------------ | ------------ | ----------------------------------- |
| `timestamp`  | ISO datetime | Required                            |
| `level`      | string       | `debug`, `info`, `warn`, or `error` |
| `service`    | string       | Non-empty                           |
| `message`    | string       | Non-empty                           |
| `attributes` | object       | Optional, defaults to `{}`          |

Attribute values support:

* strings
* numbers
* booleans

Logs with timestamps more than **5 minutes in the future** are rejected.

---

# Query Logs

## `GET /logs`

Returns logs using a combination of supported filters.

### Supported Parameters

| Parameter    | Description                              |
| ------------ | ---------------------------------------- |
| `limit`      | Number of logs to return, from 1 to 1000 |
| `since`      | Return logs after or at this timestamp   |
| `until`      | Return logs before this timestamp        |
| `level`      | Filter by log level                      |
| `service`    | Filter by service                        |
| `q`          | Search message content                   |
| `attr.<key>` | Filter by an attribute                   |
| `cursor`     | Continue pagination                      |

Filters can be combined.

### Example

```bash
curl "http://localhost:8080/logs?service=api&level=error&limit=50"
```

### Time Range Example

```bash
curl "http://localhost:8080/logs?since=2026-08-18T00:00:00.000Z&until=2026-08-19T00:00:00.000Z"
```

### Attribute Filter Example

```bash
curl "http://localhost:8080/logs?attr.status_code=500"
```

### Combined Query

```bash
curl "http://localhost:8080/logs?service=api&level=error&attr.environment=production&limit=100"
```

---

# Cursor-Based Pagination

The service uses cursor-based pagination instead of offset-based pagination.

The results are ordered by:

```sql
ORDER BY timestamp DESC, id DESC
```

When more results are available, the response contains a `next_cursor`.

### Example Response

```json
{
  "logs": [
    {
      "id": 100,
      "timestamp": "2026-08-18T10:00:00.000Z",
      "level": "info",
      "service": "api",
      "message": "Request completed",
      "attributes": {
        "status_code": 200
      },
      "created_at": "2026-08-18T10:00:01.000Z"
    }
  ],
  "next_cursor": "eyJ0aW1lc3RhbXAiOi..."
}
```

The returned cursor can be passed to the next request:

```bash
curl "http://localhost:8080/logs?limit=100&cursor=YOUR_CURSOR"
```

This allows pagination through large datasets without relying on increasingly expensive offsets.

---

# Log Aggregation

## `GET /logs/aggregate`

Returns logs grouped into time buckets.

### Required Parameters

| Parameter | Description                |
| --------- | -------------------------- |
| `since`   | Start of aggregation range |
| `until`   | End of aggregation range   |
| `bucket`  | `1m`, `5m`, `1h`, or `1d`  |

### Optional Parameters

| Parameter    | Description            |
| ------------ | ---------------------- |
| `group_by`   | `service` or `level`   |
| `level`      | Filter by level        |
| `service`    | Filter by service      |
| `q`          | Search message content |
| `attr.<key>` | Filter by attribute    |

### Example

```bash
curl "http://localhost:8080/logs/aggregate?since=2026-08-18T00:00:00.000Z&until=2026-08-19T00:00:00.000Z&bucket=1h"
```

### Group by Service

```bash
curl "http://localhost:8080/logs/aggregate?since=2026-08-18T00:00:00.000Z&until=2026-08-19T00:00:00.000Z&bucket=1h&group_by=service"
```

### Response

```json
{
  "buckets": [
    {
      "start": "2026-08-18T10:00:00.000Z",
      "group": "api",
      "count": 1520
    }
  ]
}
```

---

# Database

Logs are stored in PostgreSQL using the following structure:

```text
logs
├── id           BIGSERIAL PRIMARY KEY
├── timestamp    TIMESTAMPTZ
├── level        TEXT
├── service      TEXT
├── message      TEXT
├── attributes   JSONB
└── created_at   TIMESTAMPTZ
```

The database schema is created automatically through migrations when the application starts.

---

## Database Indexes

The project includes indexes designed around the supported query patterns:

### Timestamp + ID

```sql
(timestamp DESC, id DESC)
```

Used for ordered log retrieval and cursor-based pagination.

### Service + Level + Timestamp + ID

```sql
(service, level, timestamp DESC, id DESC)
```

Supports combined service/level filtering together with ordered retrieval.

### Service + Timestamp + ID

```sql
(service, timestamp DESC, id DESC)
```

Supports service-based queries while maintaining efficient timestamp ordering.

### JSONB Attributes

```sql
GIN (attributes)
```

Provides an index for JSONB attribute queries.

### Message Search

A PostgreSQL trigram GIN index is available for message substring searches:

```sql
GIN (message gin_trgm_ops)
```

---

# Retention Policy

The service automatically removes logs older than the configured retention period.

Default:

```text
30 days
```

The cleanup process:

* runs when the service starts
* runs every hour
* deletes logs in batches of 10,000
* continues until all expired records are removed

Configure the retention period with:

```text
RETENTION_DAYS=30
```

---

# Testing

Run the test suite with:

```bash
npm test
```

Build the TypeScript project with:

```bash
npm run build
```

Start the production build with:

```bash
npm start
```

For local development:

```bash
npm run dev
```

---

# Performance Benchmark

The project was evaluated using a constrained Docker environment with:

```text
Application:
CPU:    0.5 CPU
Memory: 256 MB

PostgreSQL:
CPU:    1 CPU
Memory: 1 GB
```

## Overall Result

```text
Score: 58.83 / 100
```

### Score Breakdown

| Category    |           Score |
| ----------- | --------------: |
| Performance |      17.83 / 50 |
| Reliability |      20.00 / 20 |
| Correctness |      15.00 / 15 |
| Queries     |       6.00 / 15 |
| **Total**   | **58.83 / 100** |

The benchmark also reported:

```text
75 / 75 correctness checks passed
```

---

## Load Test

### Configuration

```text
15,000 logs/s for 120 seconds
```

### Results

```text
HTTP Requests:        7.63K
Accepted Logs:        254.3K
Rejected Logs:        0
Throughput:           2,119.17 logs/s

Latency P95:          4.79 s
Ingestion P95:        4.25 s
Aggregate P95:        5.60 s

HTTP Success Rate:    100%
HTTP Error Rate:      0%

Application CPU Avg:  4.85%
Application Memory:   52.05 MiB

PostgreSQL CPU Avg:   77.65%
PostgreSQL CPU Max:   100.59%
PostgreSQL Memory Avg: 400.60 MiB
```

---

## Stress Test

The stress benchmark increased traffic through three stages:

```text
15,000 logs/s for 30s
22,500 logs/s for 60s
30,000 logs/s for 60s
```

Results:

```text
Accepted Logs:       135.7K
Rejected Logs:       34K
Throughput:          904.67 logs/s

Latency P95:         7.50 s
Ingestion P95:       5.28 s
Aggregate P95:       9.07 s

HTTP Success Rate:   79.96%
HTTP Error Rate:     20.15%

PostgreSQL CPU Avg:  82.01%
PostgreSQL CPU Max:  104.80%
```

---

## Spike Test

Traffic pattern:

```text
7,500 logs/s for 30s
30,000 logs/s for 10s
7,500 logs/s for 60s
```

Results:

```text
Accepted Logs:       54.4K
Rejected Logs:       5.5K
Throughput:          544 logs/s

Latency P95:         10.31 s
Ingestion P95:       5.00 s
Aggregate P95:       11.13 s

HTTP Success Rate:   90.82%
HTTP Error Rate:     15.58%

PostgreSQL CPU Avg:  75.76%
PostgreSQL CPU Max:  100.69%
```

---

## Breakpoint Test

Traffic was increased through four stages:

```text
15,000 logs/s for 30s
22,500 logs/s for 30s
30,000 logs/s for 30s
45,000 logs/s for 30s
```

Results:

```text
Accepted Logs:       97.4K
Rejected Logs:       37.1K
Throughput:          811.67 logs/s

Latency P95:         8.20 s
Ingestion P95:       5.22 s
Aggregate P95:       10.85 s

HTTP Success Rate:   72.42%
HTTP Error Rate:     29.19%

PostgreSQL CPU Avg:  78.66%
PostgreSQL CPU Max:  102.59%
```

---

# Performance Analysis

The benchmark indicates that the primary resource bottleneck is **PostgreSQL rather than the application layer**.

During the main load test:

```text
Application CPU Avg:  4.85%
PostgreSQL CPU Avg:   77.65%
```

PostgreSQL also reached approximately 100% CPU utilization.

Under higher traffic, PostgreSQL remained saturated while application CPU usage stayed relatively low. This indicates that increasing application-side concurrency alone would not solve the main throughput limitation.

The current implementation performs batched inserts rather than one database transaction per individual log, which reduces the overhead of high-volume ingestion.

The database also maintains several indexes to support query workloads. These indexes improve read performance but increase write cost because every inserted row must update the relevant indexes.

One important area for future performance optimization is therefore balancing **write throughput against query performance**, especially for indexes that are expensive to maintain during high-volume ingestion.

---

# Reliability and Correctness

Despite the performance limitations under extreme load, the benchmark showed strong correctness and reliability results.

```text
Reliability: 20 / 20
Correctness: 15 / 15
Correctness checks: 75 / 75 passed
```

The benchmark also confirmed that eventually all accepted records became visible:

```text
Accepted Records: 254.3K
Visible Records:  254.3K
Missing Records:   0
```

This demonstrates that the service maintains data correctness even when the system experiences high database pressure.

---

# Design Decisions

### Batch Inserts

Incoming valid logs are inserted using a single multi-row `INSERT` statement rather than issuing one SQL query per log.

This reduces database round trips during ingestion.

### Per-Entry Validation

The API validates each log individually so a batch can contain both valid and invalid entries.

Invalid records are reported with their original index and a reason.

### Cursor Pagination

Cursor-based pagination is used with:

```sql
ORDER BY timestamp DESC, id DESC
```

This provides stable pagination for large datasets without relying on large offsets.

### JSONB Attributes

Log attributes are stored as PostgreSQL `JSONB`, allowing applications to attach flexible key/value metadata without changing the table schema.

### Retention Cleanup

Expired logs are deleted periodically in batches rather than attempting to delete all expired records in a single large operation.

---

# Future Improvements

Potential improvements based on the benchmark results include:

* Further optimizing PostgreSQL write throughput
* Reviewing the cost/benefit of each index under heavy ingestion
* Optimizing message substring search for high-volume workloads
* Improving ingestion behavior under extreme traffic spikes
* Reducing latency during PostgreSQL saturation
* Exploring more efficient bulk-loading strategies
* Further optimizing attribute filtering
* Evaluating database configuration and connection-pool tuning
* Considering partitioning for very large log datasets

---

## License

This project was developed as a final project for the Boot.dev Stage program.
