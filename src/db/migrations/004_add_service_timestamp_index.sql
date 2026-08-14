CREATE INDEX IF NOT EXISTS idx_logs_service_timestamp_id
ON logs (service, timestamp DESC, id DESC);
