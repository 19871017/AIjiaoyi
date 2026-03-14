CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT,
  action VARCHAR(100) NOT NULL,
  module VARCHAR(50) NOT NULL,
  level VARCHAR(20) DEFAULT 'info',
  detail JSONB,
  ip_address VARCHAR(64),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON audit_logs(module);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS alerts (
  id BIGSERIAL PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  level VARCHAR(20) NOT NULL,
  message VARCHAR(255) NOT NULL,
  detail JSONB,
  status SMALLINT DEFAULT 0, -- 0:未处理 1:已处理
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status, created_at DESC);
