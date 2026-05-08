CREATE TABLE IF NOT EXISTS security_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  request_id TEXT NOT NULL,
  uid TEXT,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  ip INET,
  status INTEGER NOT NULL,
  user_agent TEXT,
  latency_ms INTEGER NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_audit_logs_created_at
  ON security_audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_audit_logs_uid
  ON security_audit_logs (uid);

CREATE INDEX IF NOT EXISTS idx_security_audit_logs_ip
  ON security_audit_logs (ip);

CREATE INDEX IF NOT EXISTS idx_security_audit_logs_endpoint
  ON security_audit_logs (endpoint);

-- Example security analyst queries:
-- SELECT * FROM security_audit_logs WHERE ip = '203.0.113.10' ORDER BY created_at DESC;
-- SELECT ip, COUNT(*) AS failed_requests FROM security_audit_logs WHERE status >= 400 GROUP BY ip ORDER BY failed_requests DESC;
-- SELECT uid, endpoint, COUNT(*) AS hits FROM security_audit_logs WHERE created_at > NOW() - INTERVAL '1 hour' GROUP BY uid, endpoint ORDER BY hits DESC;
