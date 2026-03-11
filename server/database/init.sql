-- ====================================================
-- 贵金属期货交易系统 - 数据库初始化脚本
-- PostgreSQL 14+
-- ====================================================

-- 创建数据库
-- CREATE DATABASE precious_metals_trading;
-- CREATE DATABASE precious_metals_trading_logs;

-- ====================================================
-- 一、用户与权限模块
-- ====================================================

-- 角色表
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL, -- SUPER_ADMIN, AGENT_1, AGENT_2, USER
    description TEXT,
    permissions JSONB, -- 权限列表
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 插入默认角色
INSERT INTO roles (name, code, description, permissions) VALUES
('超级管理员', 'SUPER_ADMIN', '系统超级管理员，拥有所有权限', '["all"]'::jsonb),
('一级代理', 'AGENT_1', '一级代理商，可发展二级代理和客户', '["agent:*", "customer:view", "commission:view"]'::jsonb),
('二级代理', 'AGENT_2', '二级代理商，可发展客户', '["agent:view", "customer:view", "commission:view"]'::jsonb),
('普通用户', 'USER', '普通交易用户', '["trading:*", "finance:*"]'::jsonb);

-- 用户表
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    security_code_hash VARCHAR(255), -- 安全码（用于修改密码/提现验证）
    phone VARCHAR(20) UNIQUE,
    email VARCHAR(100) UNIQUE,
    real_name VARCHAR(50),
    id_card VARCHAR(18),
    status SMALLINT DEFAULT 1 CHECK (status IN (0, 1, 2)), -- 0:禁用 1:正常 2:锁定
    kyc_status SMALLINT DEFAULT 0 CHECK (kyc_status IN (0, 1, 2)), -- 0:未认证 1:已认证 2:审核中
    role_id INTEGER REFERENCES roles(id),
    agent_id BIGINT, -- 上级代理ID
    referral_code VARCHAR(20) UNIQUE,
    avatar VARCHAR(255),
    last_login_ip VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP,
    deleted_at TIMESTAMP
);

-- 代理表
CREATE TABLE agents (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT UNIQUE REFERENCES users(id),
    agent_code VARCHAR(20) UNIQUE NOT NULL,
    agent_level SMALLINT NOT NULL CHECK (agent_level IN (1, 2)), -- 1:一级代理 2:二级代理
    parent_agent_id BIGINT REFERENCES agents(id), -- 上级代理ID
    company_name VARCHAR(100),
    business_license VARCHAR(50),
    contact_phone VARCHAR(20),
    contact_email VARCHAR(100),
    commission_rate DECIMAL(5,4) DEFAULT 0,
    status SMALLINT DEFAULT 1 CHECK (status IN (0, 1)), -- 0:禁用 1:正常
    total_users INTEGER DEFAULT 0,
    total_commission DECIMAL(20,8) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

-- ====================================================
-- 二、产品与行情模块
-- ====================================================

-- 产品分类表
CREATE TABLE product_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    code VARCHAR(20) UNIQUE NOT NULL, -- INTERNATIONAL, DOMESTIC
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    status SMALLINT DEFAULT 1 CHECK (status IN (0, 1)),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 插入默认分类
INSERT INTO product_categories (name, code, description, sort_order) VALUES
('国际贵金属', 'INTERNATIONAL', '国际贵金属期货', 1),
('国内贵金属', 'DOMESTIC', '国内贵金属期货', 2);

-- 产品表
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) UNIQUE NOT NULL, -- XAUUSD, AGTD, etc.
    name VARCHAR(100) NOT NULL,
    category_id INTEGER REFERENCES product_categories(id),
    base_currency VARCHAR(10), -- 基础货币
    quote_currency VARCHAR(10), -- 报价货币
    contract_size DECIMAL(20,8), -- 合约大小
    tick_size DECIMAL(20,8), -- 最小跳动点
    tick_value DECIMAL(20,8), -- 点值
    min_leverage INTEGER DEFAULT 10,
    max_leverage INTEGER DEFAULT 100,
    min_lot_size DECIMAL(20,8) DEFAULT 0.01,
    max_lot_size DECIMAL(20,8) DEFAULT 100,
    trading_hours JSONB, -- 交易时段
    margin_requirement DECIMAL(5,4), -- 保证金比例
    commission DECIMAL(10,4), -- 手续费
    swap_long DECIMAL(10,8), -- 多头隔夜利息
    swap_short DECIMAL(10,8), -- 空头隔夜利息
    status SMALLINT DEFAULT 1 CHECK (status IN (0, 1)), -- 1:正常交易 0:暂停交易
    is_deleted BOOLEAN DEFAULT FALSE,
    icon VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 实时行情表
CREATE TABLE market_quotes (
    id BIGSERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id),
    bid DECIMAL(20,8),
    ask DECIMAL(20,8),
    mid DECIMAL(20,8),
    price_change DECIMAL(20,8),
    price_change_percent DECIMAL(10,4),
    high DECIMAL(20,8),
    low DECIMAL(20,8),
    volume BIGINT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_market_quotes_product_timestamp ON market_quotes(product_id, timestamp DESC);

-- K线数据表
CREATE TABLE klines (
    id BIGSERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id),
    timeframe VARCHAR(10) CHECK (timeframe IN ('1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M')),
    open_time TIMESTAMP NOT NULL,
    close_time TIMESTAMP,
    open DECIMAL(20,8),
    high DECIMAL(20,8),
    low DECIMAL(20,8),
    close DECIMAL(20,8),
    volume DECIMAL(20,8),
    UNIQUE(product_id, timeframe, open_time)
);

CREATE INDEX idx_klines_product_timeframe_time ON klines(product_id, timeframe, open_time DESC);

-- ====================================================
-- 三、交易核心模块
-- ====================================================

-- 订单表
CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    order_number VARCHAR(32) UNIQUE NOT NULL,
    product_id INTEGER NOT NULL REFERENCES products(id),
    order_type SMALLINT NOT NULL CHECK (order_type IN (1, 2)), -- 1:市价单 2:限价单
    trade_type SMALLINT NOT NULL CHECK (trade_type IN (1, 2)), -- 1:买入 2:卖出
    order_direction SMALLINT NOT NULL CHECK (order_direction IN (1, 2)), -- 1:多头 2:空头
    lot_size DECIMAL(20,8) NOT NULL,
    leverage INTEGER NOT NULL,
    price DECIMAL(20,8), -- 下单价格（限价单）
    stop_loss DECIMAL(20,8), -- 止损价
    take_profit DECIMAL(20,8), -- 止盈价
    margin DECIMAL(20,8), -- 保证金
    commission DECIMAL(20,8), -- 手续费
    status SMALLINT DEFAULT 0 CHECK (status IN (0, 1, 2, 3, 4)), -- 0:待成交 1:部分成交 2:已成交 3:已取消 4:已拒绝
    filled_size DECIMAL(20,8) DEFAULT 0,
    filled_price DECIMAL(20,8),
    avg_price DECIMAL(20,8),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_orders_user_status ON orders(user_id, status, created_at DESC);
CREATE INDEX idx_orders_product_status ON orders(product_id, status, created_at DESC);

-- 持仓表
CREATE TABLE positions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    position_number VARCHAR(32) UNIQUE NOT NULL,
    order_id BIGINT REFERENCES orders(id),
    trade_type SMALLINT NOT NULL CHECK (trade_type IN (1, 2)), -- 1:买入 2:卖出
    direction SMALLINT NOT NULL CHECK (direction IN (1, 2)), -- 1:多头 2:空头
    lot_size DECIMAL(20,8) NOT NULL,
    entry_price DECIMAL(20,8) NOT NULL,
    current_price DECIMAL(20,8),
    leverage INTEGER NOT NULL,
    margin DECIMAL(20,8) NOT NULL,
    stop_loss DECIMAL(20,8),
    take_profit DECIMAL(20,8),
    floating_pl DECIMAL(20,8) DEFAULT 0, -- 浮动盈亏
    realized_pl DECIMAL(20,8) DEFAULT 0, -- 已实现盈亏
    commission DECIMAL(20,8), -- 手续费
    swap DECIMAL(20,8) DEFAULT 0, -- 隔夜利息
    status SMALLINT DEFAULT 1 CHECK (status IN (1, 2)), -- 1:持仓中 2:已平仓
    open_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    close_time TIMESTAMP,
    close_price DECIMAL(20,8),
    close_order_id BIGINT REFERENCES orders(id)
);

CREATE INDEX idx_positions_user_status ON positions(user_id, status, open_time DESC);
CREATE INDEX idx_positions_product_status ON positions(product_id, status, open_time DESC);

-- 成交记录表
CREATE TABLE trades (
    id BIGSERIAL PRIMARY KEY,
    trade_id VARCHAR(32) UNIQUE NOT NULL,
    user_id BIGINT NOT NULL REFERENCES users(id),
    order_id BIGINT NOT NULL REFERENCES orders(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    trade_type SMALLINT NOT NULL CHECK (trade_type IN (1, 2)), -- 1:买入 2:卖出
    direction SMALLINT NOT NULL CHECK (direction IN (1, 2)), -- 1:多头 2:空头
    lot_size DECIMAL(20,8) NOT NULL,
    price DECIMAL(20,8) NOT NULL,
    margin DECIMAL(20,8),
    commission DECIMAL(20,8),
    status SMALLINT DEFAULT 1 CHECK (status IN (0, 1)), -- 1:成功 0:失败
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_trades_user_time ON trades(user_id, created_at DESC);
CREATE INDEX idx_trades_product_time ON trades(product_id, created_at DESC);

-- ====================================================
-- 四、财务模块
-- ====================================================

-- 资金账户表
CREATE TABLE accounts (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT UNIQUE NOT NULL REFERENCES users(id),
    account_number VARCHAR(32) UNIQUE NOT NULL,
    balance DECIMAL(20,8) DEFAULT 0, -- 总资产
    available_balance DECIMAL(20,8) DEFAULT 0, -- 可用余额
    frozen_margin DECIMAL(20,8) DEFAULT 0, -- 冻结保证金
    floating_pl DECIMAL(20,8) DEFAULT 0, -- 浮动盈亏
    realized_pl DECIMAL(20,8) DEFAULT 0, -- 已实现盈亏
    total_deposit DECIMAL(20,8) DEFAULT 0, -- 总充值
    total_withdraw DECIMAL(20,8) DEFAULT 0, -- 总提现
    total_commission DECIMAL(20,8) DEFAULT 0, -- 总手续费
    status SMALLINT DEFAULT 1 CHECK (status IN (0, 1)), -- 1:正常 0:冻结
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_accounts_user ON accounts(user_id);

-- 资金流水表
CREATE TABLE transactions (
    id BIGSERIAL PRIMARY KEY,
    transaction_number VARCHAR(32) UNIQUE NOT NULL,
    user_id BIGINT NOT NULL REFERENCES users(id),
    type SMALLINT NOT NULL CHECK (type IN (1, 2, 3, 4, 5, 6, 7)), -- 1:充值 2:提现 3:入金 4:出金 5:手续费 6:盈亏 7:隔夜利息
    amount DECIMAL(20,8) NOT NULL,
    balance_before DECIMAL(20,8),
    balance_after DECIMAL(20,8),
    related_id BIGINT, -- 关联ID
    description TEXT,
    status SMALLINT DEFAULT 0 CHECK (status IN (0, 1, 2)), -- 0:待处理 1:成功 2:失败
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transactions_user_time ON transactions(user_id, created_at DESC);
CREATE INDEX idx_transactions_type_status ON transactions(type, status, created_at DESC);

-- 充值订单表
CREATE TABLE deposit_orders (
    id BIGSERIAL PRIMARY KEY,
    order_number VARCHAR(32) UNIQUE NOT NULL,
    user_id BIGINT NOT NULL REFERENCES users(id),
    amount DECIMAL(20,8) NOT NULL,
    payment_method SMALLINT NOT NULL CHECK (payment_method IN (1, 2, 3)), -- 1:USDT 2:银行卡 3:第三方支付
    payment_channel VARCHAR(50), -- 支付渠道
    transaction_hash VARCHAR(255), -- 区块链交易哈希（USDT）
    bank_account VARCHAR(100),
    status SMALLINT DEFAULT 0 CHECK (status IN (0, 1, 2, 3)), -- 0:待审核 1:已审核 2:已拒绝 3:处理中
    approved_by BIGINT REFERENCES users(id),
    approved_at TIMESTAMP,
    remark TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_deposit_orders_user_status ON deposit_orders(user_id, status, created_at DESC);

-- 提现订单表
CREATE TABLE withdraw_orders (
    id BIGSERIAL PRIMARY KEY,
    order_number VARCHAR(32) UNIQUE NOT NULL,
    user_id BIGINT NOT NULL REFERENCES users(id),
    amount DECIMAL(20,8) NOT NULL,
    fee DECIMAL(20,8) DEFAULT 0,
    actual_amount DECIMAL(20,8),
    payment_method SMALLINT NOT NULL CHECK (payment_method IN (1, 2, 3)),
    withdraw_address VARCHAR(255), -- 提现地址（USDT）
    bank_account VARCHAR(100),
    bank_name VARCHAR(100),
    status SMALLINT DEFAULT 0 CHECK (status IN (0, 1, 2, 3, 4)), -- 0:待审核 1:审核通过 2:已拒绝 3:已打款 4:已失败
    approved_by BIGINT REFERENCES users(id),
    approved_at TIMESTAMP,
    transferred_at TIMESTAMP,
    remark TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_withdraw_orders_user_status ON withdraw_orders(user_id, status, created_at DESC);

-- ====================================================
-- 五、代理与分佣模块
-- ====================================================

-- 分佣配置表
CREATE TABLE commission_configs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    agent_1_rate DECIMAL(5,4), -- 一级代理分佣比例
    agent_2_rate DECIMAL(5,4), -- 二级代理分佣比例
    platform_rate DECIMAL(5,4), -- 平台留存比例
    product_id INTEGER REFERENCES products(id), -- 产品（null表示全局）
    status SMALLINT DEFAULT 1 CHECK (status IN (0, 1)),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 插入默认分佣配置
INSERT INTO commission_configs (name, agent_1_rate, agent_2_rate, platform_rate) VALUES
('默认分佣配置', 0.3000, 0.2000, 0.5000);

-- 分佣流水表
CREATE TABLE commission_records (
    id BIGSERIAL PRIMARY KEY,
    record_number VARCHAR(32) UNIQUE NOT NULL,
    user_id BIGINT REFERENCES users(id), -- 交易用户
    agent_id BIGINT NOT NULL REFERENCES agents(id), -- 代理
    order_id BIGINT REFERENCES orders(id), -- 订单ID
    product_id INTEGER REFERENCES products(id),
    trade_amount DECIMAL(20,8), -- 交易金额
    commission DECIMAL(20,8), -- 手续费总额
    agent_commission DECIMAL(20,8), -- 代理分佣金额
    commission_rate DECIMAL(5,4), -- 分佣比例
    agent_level SMALLINT, -- 代理级别
    profit_user_id BIGINT REFERENCES users(id), -- 上级代理用户ID
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_commission_records_agent_time ON commission_records(agent_id, created_at DESC);
CREATE INDEX idx_commission_records_user_time ON commission_records(user_id, created_at DESC);

-- 代理账本表（不可篡改）
CREATE TABLE agent_ledger (
    id BIGSERIAL PRIMARY KEY,
    record_number VARCHAR(32) UNIQUE NOT NULL,
    agent_id BIGINT NOT NULL REFERENCES agents(id),
    user_id BIGINT REFERENCES users(id),
    type SMALLINT NOT NULL CHECK (type IN (1, 2, 3)), -- 1:分佣收入 2:提现 3:结算
    amount DECIMAL(20,8) NOT NULL,
    balance_before DECIMAL(20,8),
    balance_after DECIMAL(20,8),
    related_id BIGINT,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_agent_ledger_agent_time ON agent_ledger(agent_id, created_at DESC);

-- 代理客户汇总表
CREATE TABLE agent_customers (
    id BIGSERIAL PRIMARY KEY,
    agent_id BIGINT REFERENCES agents(id),
    user_id BIGINT REFERENCES users(id),
    agent_level SMALLINT, -- 代理级别
    total_deposit DECIMAL(20,8) DEFAULT 0,
    total_withdraw DECIMAL(20,8) DEFAULT 0,
    total_commission DECIMAL(20,8) DEFAULT 0, -- 产生的手续费
    total_profit DECIMAL(20,8) DEFAULT 0,
    trade_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(agent_id, user_id)
);

-- ====================================================
-- 六、风控模块
-- ====================================================

-- 风控规则表
CREATE TABLE risk_rules (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    rule_type SMALLINT NOT NULL CHECK (rule_type IN (1, 2, 3, 4, 5, 6)), -- 1:单笔仓位 2:总持仓 3:杠杆 4:止损 5:爆仓 6:日亏损
    product_id INTEGER REFERENCES products(id), -- 产品（null表示全局）
    role_id INTEGER REFERENCES roles(id), -- 角色（null表示全局）
    max_single_position DECIMAL(20,8), -- 最大单笔仓位
    max_total_position DECIMAL(20,8), -- 最大总持仓
    max_leverage INTEGER, -- 最大杠杆
    stop_loss_ratio DECIMAL(5,4), -- 止损线（保证金比例）
    liquidation_ratio DECIMAL(5,4), -- 爆仓线（保证金比例）
    max_daily_loss DECIMAL(20,8), -- 单日最大亏损
    status SMALLINT DEFAULT 1 CHECK (status IN (0, 1)),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 插入默认风控规则
INSERT INTO risk_rules (name, rule_type, stop_loss_ratio, liquidation_ratio) VALUES
('默认强平规则', 5, 0.5000, 0.3000); -- 止损线50%，爆仓线30%

-- 风控触发记录表
CREATE TABLE risk_triggers (
    id BIGSERIAL PRIMARY KEY,
    trigger_number VARCHAR(32) UNIQUE NOT NULL,
    user_id BIGINT REFERENCES users(id),
    rule_id INTEGER REFERENCES risk_rules(id),
    trigger_type SMALLINT NOT NULL CHECK (trigger_type IN (1, 2, 3, 4)), -- 1:强平 2:禁止下单 3:警告 4:爆仓
    trigger_value DECIMAL(20,8), -- 触发值
    current_value DECIMAL(20,8), -- 当前值
    product_id INTEGER REFERENCES products(id),
    order_id BIGINT REFERENCES orders(id),
    position_id BIGINT REFERENCES positions(id),
    action SMALLINT, -- 采取的措施
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_risk_triggers_user_time ON risk_triggers(user_id, created_at DESC);

-- 风险预警表
CREATE TABLE risk_alerts (
    id BIGSERIAL PRIMARY KEY,
    alert_number VARCHAR(32) UNIQUE NOT NULL,
    user_id BIGINT REFERENCES users(id),
    agent_id BIGINT REFERENCES agents(id), -- 代理可见
    alert_type SMALLINT NOT NULL CHECK (alert_type IN (1, 2, 3, 4)), -- 1:保证金不足 2:接近强平 3:异常交易 4:大额资金变动
    alert_level SMALLINT CHECK (alert_level IN (1, 2, 3)), -- 1:低 2:中 3:高
    message TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    is_handled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_risk_alerts_user_read ON risk_alerts(user_id, is_read, created_at DESC);
CREATE INDEX idx_risk_alerts_agent_read ON risk_alerts(agent_id, is_read, created_at DESC);

-- ====================================================
-- 七、AI 分析模块
-- ====================================================

-- AI 分析记录表
CREATE TABLE ai_analyses (
    id BIGSERIAL PRIMARY KEY,
    analysis_number VARCHAR(32) UNIQUE NOT NULL,
    user_id BIGINT REFERENCES users(id),
    product_id INTEGER REFERENCES products(id),
    analysis_type SMALLINT CHECK (analysis_type IN (1, 2, 3, 4)), -- 1:技术分析 2:基本面 3:情绪分析 4:综合分析
    timeframe VARCHAR(10),
    result TEXT, -- JSON格式的分析结果
    trend_judgment VARCHAR(20), -- 趋势判断
    risk_level VARCHAR(20), -- 风险等级
    sentiment VARCHAR(20), -- 情绪判断
    key_price_levels JSONB, -- 关键价位
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ai_analyses_product_time ON ai_analyses(product_id, created_at DESC);

-- AI 对话记录表
CREATE TABLE ai_conversations (
    id BIGSERIAL PRIMARY KEY,
    conversation_number VARCHAR(32) UNIQUE NOT NULL,
    user_id BIGINT REFERENCES users(id),
    session_id VARCHAR(50),
    question TEXT,
    answer TEXT,
    audio_url VARCHAR(255), -- 语音文件URL
    model_name VARCHAR(50),
    token_usage JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ai_conversations_user_session ON ai_conversations(user_id, session_id, created_at DESC);

-- AI 配置表
CREATE TABLE ai_configs (
    id SERIAL PRIMARY KEY,
    config_key VARCHAR(50) UNIQUE NOT NULL,
    config_value TEXT,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 插入默认AI配置
INSERT INTO ai_configs (config_key, config_value, description) VALUES
('GEMINI_API_KEY', '', 'Gemini API密钥'),
('GEMINI_MODEL', 'gemini-pro', 'Gemini模型版本'),
('GEMINI_ENDPOINT', 'https://generativelanguage.googleapis.com/v1beta/models', 'Gemini API端点'),
('VOICE_RECOGNITION_API', '', '语音识别API'),
('VOICE_RECOGNITION_ENABLED', 'true', '是否启用语音识别');

-- ====================================================
-- 八、系统日志与配置模块
-- ====================================================

-- 操作日志表
CREATE TABLE operation_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    username VARCHAR(50),
    operation VARCHAR(100),
    module VARCHAR(50), -- 模块名称
    action VARCHAR(50), -- 操作类型
    request_method VARCHAR(10),
    request_url VARCHAR(255),
    request_params JSONB,
    response_status SMALLINT,
    ip_address VARCHAR(50),
    user_agent TEXT,
    execution_time INTEGER, -- 执行时间(ms)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_operation_logs_user_time ON operation_logs(user_id, created_at DESC);
CREATE INDEX idx_operation_logs_module_time ON operation_logs(module, created_at DESC);

-- 系统配置表
CREATE TABLE system_configs (
    id SERIAL PRIMARY KEY,
    config_key VARCHAR(100) UNIQUE NOT NULL,
    config_value TEXT,
    config_type VARCHAR(20) CHECK (config_type IN ('string', 'number', 'boolean', 'json')),
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by BIGINT REFERENCES users(id)
);

-- 插入默认系统配置
INSERT INTO system_configs (config_key, config_value, config_type, description, is_public) VALUES
('SYSTEM_NAME', '贵金属期货交易平台', 'string', '系统名称', true),
('MAINTENANCE_MODE', 'false', 'boolean', '维护模式', false),
('MIN_DEPOSIT', '100', 'number', '最小充值金额', true),
('MIN_WITHDRAW', '100', 'number', '最小提现金额', true),
('WITHDRAW_FEE_RATE', '0.005', 'number', '提现手续费率', true),
('MAX_DAILY_WITHDRAW', '100000', 'number', '每日最大提现金额', false);

-- API 密钥管理表
CREATE TABLE api_keys (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    api_key VARCHAR(100) UNIQUE NOT NULL,
    api_secret VARCHAR(255),
    name VARCHAR(100),
    permissions JSONB,
    ip_whitelist TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 第三方 API 配置表
CREATE TABLE third_party_configs (
    id SERIAL PRIMARY KEY,
    provider VARCHAR(50), -- 提供商名称
    api_name VARCHAR(100), -- API名称
    api_key TEXT, -- 加密存储
    api_secret TEXT, -- 加密存储
    endpoint VARCHAR(255),
    config JSONB, -- 其他配置
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ====================================================
-- 九、创建视图
-- ====================================================

-- 用户账户汇总视图
CREATE VIEW user_account_summary AS
SELECT
    u.id AS user_id,
    u.username,
    u.real_name,
    a.balance AS total_assets,
    a.available_balance,
    a.frozen_margin,
    a.floating_pl,
    a.realized_pl,
    COUNT(p.id) AS open_positions_count,
    SUM(CASE WHEN p.status = 1 THEN p.floating_pl ELSE 0 END) AS total_floating_pl
FROM users u
LEFT JOIN accounts a ON u.id = a.user_id
LEFT JOIN positions p ON u.id = p.user_id AND p.status = 1
GROUP BY u.id, u.username, u.real_name, a.balance, a.available_balance, a.frozen_margin, a.floating_pl, a.realized_pl;

-- 代理统计视图
CREATE VIEW agent_statistics AS
SELECT
    ag.id AS agent_id,
    ag.agent_code,
    ag.agent_level,
    ag.total_users,
    ag.total_commission,
    u.username,
    u.real_name,
    u.phone,
    COUNT(ac.id) AS customer_count,
    SUM(ac.total_deposit) AS total_customer_deposit,
    SUM(ac.total_withdraw) AS total_customer_withdraw,
    SUM(ac.total_commission) AS total_customer_commission
FROM agents ag
LEFT JOIN users u ON ag.user_id = u.id
LEFT JOIN agent_customers ac ON ag.id = ac.agent_id
GROUP BY ag.id, ag.agent_code, ag.agent_level, ag.total_users, ag.total_commission, u.username, u.real_name, u.phone;

-- ====================================================
-- 十、创建函数
-- ====================================================

-- 生成订单号
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'ORD' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS') || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- 生成交易号
CREATE OR REPLACE FUNCTION generate_trade_id()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'TRD' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS') || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- 生成流水号
CREATE OR REPLACE FUNCTION generate_transaction_number()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'TXN' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS') || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- 生成预警号
CREATE OR REPLACE FUNCTION generate_alert_number()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'ALT' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS') || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ====================================================
-- 十一、插入测试数据（可选）
-- ====================================================

-- 插入默认产品（国际贵金属）
INSERT INTO products (symbol, name, category_id, base_currency, quote_currency, contract_size, tick_size, tick_value, min_leverage, max_leverage, min_lot_size, max_lot_size, margin_requirement, commission, status) VALUES
('XAUUSD', '现货黄金', 1, 'XAU', 'USD', 100, 0.01, 1, 10, 100, 0.01, 100, 0.01, 50, 1),
('XAGUSD', '现货白银', 1, 'XAG', 'USD', 5000, 0.001, 5, 10, 100, 0.01, 100, 0.02, 50, 1),
('XPTUSD', '现货铂金', 1, 'XPT', 'USD', 50, 0.01, 0.5, 10, 100, 0.01, 50, 0.03, 50, 1),
('XPDUSD', '现货钯金', 1, 'XPD', 'USD', 100, 0.01, 1, 10, 100, 0.01, 50, 0.04, 50, 1);

-- 插入默认产品（国内贵金属）
INSERT INTO products (symbol, name, category_id, base_currency, quote_currency, contract_size, tick_size, tick_value, min_leverage, max_leverage, min_lot_size, max_lot_size, margin_requirement, commission, status) VALUES
('AGTD', '白银期货', 2, 'AG', 'CNY', 15, 1, 15, 10, 50, 1, 100, 0.10, 10, 1),
('AUTD', '黄金期货', 2, 'AU', 'CNY', 1, 0.02, 20, 10, 50, 1, 100, 0.10, 10, 1);

-- ====================================================
-- 创建完成
-- ====================================================
