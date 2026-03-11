-- 添加安全码字段
ALTER TABLE users
ADD COLUMN IF NOT EXISTS security_code_hash VARCHAR(255);
