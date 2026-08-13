CREATE INDEX IF NOT EXISTS idx_logs_message_trgm
ON logs USING GIN (message gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_logs_attributes
ON logs USING GIN (attributes);

CREATE INDEX IF NOT EXISTS idx_logs_service_level_timestamp_id
ON logs (service, level, timestamp DESC, id DESC);
