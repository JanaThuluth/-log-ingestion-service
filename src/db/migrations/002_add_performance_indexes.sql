CREATE INDEX IF NOT EXISTS idx_logs_message_trgm
ON logs USING GIN (message gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_logs_attributes
ON logs USING GIN (attributes);
