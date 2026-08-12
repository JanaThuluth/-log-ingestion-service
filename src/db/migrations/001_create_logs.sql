CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS logs (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    level TEXT NOT NULL,
    service TEXT NOT NULL,
    message TEXT NOT NULL,
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT logs_level_check
    CHECK (level IN ('debug', 'info', 'warn', 'error'))
);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp_id
ON logs (timestamp DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_logs_service
ON logs (service);

CREATE INDEX IF NOT EXISTS idx_logs_level
ON logs (level);
