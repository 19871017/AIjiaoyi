-- 添加银行卡表
CREATE TABLE IF NOT EXISTS bank_cards (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  bank_name VARCHAR(100) NOT NULL,
  card_number VARCHAR(32) NOT NULL,
  holder_name VARCHAR(50) NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bank_cards_user_id ON bank_cards(user_id);
