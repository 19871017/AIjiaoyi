import { Router, Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/auth.service';
import { query } from '../config/database';
import logger from '../utils/logger';\n
const defaultConfigs: { key: string; value: string; type: string; desc: string; isPublic: boolean }[] = [
  { key: 'MAINTENANCE_MODE', value: 'false', type: 'boolean', desc: '维护模式', isPublic: true },
  { key: 'ALLOW_REGISTER', value: 'true', type: 'boolean', desc: '允许注册', isPublic: true },
  { key: 'MAX_LEVERAGE', value: '100', type: 'number', desc: '最大杠杆', isPublic: false },
  { key: 'MIN_DEPOSIT', value: '100', type: 'number', desc: '最小充值', isPublic: false },
  { key: 'MIN_WITHDRAW', value: '100', type: 'number', desc: '最小提现', isPublic: false },
  { key: 'COMMISSION_RATE', value: '0.0005', type: 'number', desc: '默认手续费率', isPublic: false },
  { key: 'PLATFORM_FEE', value: '0.0002', type: 'number', desc: '平台费率', isPublic: false },
  { key: 'AI_BASE_URL', value: 'https://api.example.com/v1', type: 'string', desc: 'AI Base URL', isPublic: false },
  { key: 'AI_MODEL_ID', value: 'your-provider/model-id', type: 'string', desc: 'AI模型ID', isPublic: false },
  { key: 'AI_API_KEY', value: '', type: 'string', desc: 'AI API Key', isPublic: false },
  { key: 'RISK_FORCE_CLOSE_THRESHOLD', value: '90', type: 'number', desc: '强平阈值', isPublic: false },
  { key: 'RISK_WARNING_THRESHOLD', value: '70', type: 'number', desc: '预警阈值', isPublic: false },
  { key: 'RISK_CHECK_INTERVAL', value: '5', type: 'number', desc: '风控检查频率(秒)', isPublic: false }
];

async function ensureDefaultConfigs() {
  for (const cfg of defaultConfigs) {
    const exists = await query('SELECT 1 FROM system_configs WHERE config_key = $1', [cfg.key]);
    if (exists.rows.length === 0) {
      await query(
        `INSERT INTO system_configs (config_key, config_value, config_type, description, is_public)
         VALUES ($1, $2, $3, $4, $5)`,
        [cfg.key, cfg.value, cfg.type, cfg.desc, cfg.isPublic]
      );
    }
  }
}

const router = Router();

/**
 * 权限验证中间件
 */
function requirePermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return res.status(401).json({
          code: 401,
          message: 'Unauthorized',
          data: null,
          timestamp: Date.now(),
        });
      }

      const payload = verifyToken(token);

      if (!payload) {
        return res.status(401).json({
          code: 401,
          message: 'Invalid token',
          data: null,
          timestamp: Date.now(),
        });
      }

      // 检查用户权限
      const role = await query(
        `SELECT permissions FROM roles WHERE id = $1`,
        [payload.role_id]
      );

      if (!role.rows[0]) {
        return res.status(403).json({
          code: 403,
          message: 'Role not found',
          data: null,
          timestamp: Date.now(),
        });
      }

      const permissions = role.rows[0].permissions;

      if (!permissions.includes('all') && !permissions.includes(permission)) {
        return res.status(403).json({
          code: 403,
          message: 'Permission denied',
          data: null,
          timestamp: Date.now(),
        });
      }

      req.user = payload;
      next();
    } catch (error) {
      logger.error('Permission check failed:', error);
      return res.status(500).json({
        code: 500,
        message: 'Internal server error',
        data: null,
        timestamp: Date.now(),
      });
    }
  };
}

// ====================================================
// 仪表盘
// ====================================================

/**
 * 获取仪表盘统计数据
 */
router.get('/dashboard/stats', requirePermission('all'), async (req: Request, res: Response) => {
  try {
    // 用户统计
    const userStats = await query(
      `SELECT
         COUNT(*) as total_users,
         COUNT(CASE WHEN status = 1 THEN 1 END) as active_users,
         COUNT(CASE WHEN kyc_status = 1 THEN 1 END) as verified_users,
         COUNT(CASE WHEN created_at >= CURRENT_DATE THEN 1 END) as today_new_users
       FROM users`
    );

    // 代理统计
    const agentStats = await query(
      `SELECT
         COUNT(*) as total_agents,
         COUNT(CASE WHEN status = 1 THEN 1 END) as active_agents,
         COUNT(CASE WHEN agent_level = 1 THEN 1 END) as level_1_agents,
         COUNT(CASE WHEN agent_level = 2 THEN 1 END) as level_2_agents,
         COALESCE(SUM(total_commission), 0) as total_commission
       FROM agents`
    );

    // 资金统计
    const financeStats = await query(
      `SELECT
         COALESCE(SUM(balance), 0) as total_balance,
         COALESCE(SUM(available_balance), 0) as total_available,
         COALESCE(SUM(frozen_margin), 0) as total_frozen,
         COALESCE(SUM(total_deposit), 0) as total_deposit,
         COALESCE(SUM(total_withdraw), 0) as total_withdraw
       FROM accounts`
    );

    // 订单统计
    const orderStats = await query(
      `SELECT
         COUNT(*) as total_orders,
         COUNT(CASE WHEN status = 0 THEN 1 END) as pending_orders,
         COUNT(CASE WHEN status = 1 THEN 1 END) as filled_orders,
         COUNT(CASE WHEN status = 2 THEN 1 END) as closed_orders,
         COALESCE(SUM(CASE WHEN status = 2 THEN profit END), 0) as total_profit
       FROM orders
       WHERE created_at >= CURRENT_DATE`
    );

    // 持仓统计
    const positionStats = await query(
      `SELECT
         COUNT(*) as total_positions,
         COALESCE(SUM(lot_size), 0) as total_lot_size,
         COALESCE(SUM(floating_pl), 0) as total_floating_pl,
         COUNT(CASE WHEN floating_pl < 0 THEN 1 END) as losing_positions
       FROM positions
       WHERE status = 1`
    );

    // 今日交易量
    const volumeStats = await query(
      `SELECT
         COALESCE(SUM(volume), 0) as total_volume,
         COALESCE(COUNT(*), 0) as total_trades
       FROM orders
       WHERE created_at >= CURRENT_DATE AND status IN (1, 2)`
    );

    const users = userStats.rows[0];
    const agents = agentStats.rows[0];
    const finance = financeStats.rows[0];
    const orders = orderStats.rows[0];
    const positions = positionStats.rows[0];
    const volume = volumeStats.rows[0];

    res.json({
      code: 0,
      message: 'Success',
      data: {
        total_users: Number(users.total_users || 0),
        active_users: Number(users.active_users || 0),
        verified_users: Number(users.verified_users || 0),
        today_new_users: Number(users.today_new_users || 0),

        total_agents: Number(agents.total_agents || 0),
        active_agents: Number(agents.active_agents || 0),
        level_1_agents: Number(agents.level_1_agents || 0),
        level_2_agents: Number(agents.level_2_agents || 0),
        total_commission: Number(agents.total_commission || 0),

        total_balance: Number(finance.total_balance || 0),
        total_available: Number(finance.total_available || 0),
        total_frozen: Number(finance.total_frozen || 0),
        total_deposit: Number(finance.total_deposit || 0),
        total_withdraw: Number(finance.total_withdraw || 0),

        total_orders: Number(orders.total_orders || 0),
        pending_orders: Number(orders.pending_orders || 0),
        filled_orders: Number(orders.filled_orders || 0),
        closed_orders: Number(orders.closed_orders || 0),
        total_profit: Number(orders.total_profit || 0),

        open_positions: Number(positions.total_positions || 0),
        total_lot_size: Number(positions.total_lot_size || 0),
        total_floating_pl: Number(positions.total_floating_pl || 0),
        losing_positions: Number(positions.losing_positions || 0),

        total_volume: Number(volume.total_volume || 0),
        total_trades: Number(volume.total_trades || 0)
      },
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Get dashboard stats failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now()
    });
  }
});

/**
 * 获取待处理事项
 */
router.get('/dashboard/pending', requirePermission('all'), async (req: Request, res: Response) => {
  try {
    // 待审核充值
    const pendingDeposits = await query(
      `SELECT COUNT(*) as count FROM deposit_orders WHERE status = 0`
    );

    // 待审核提现
    const pendingWithdrawals = await query(
      `SELECT COUNT(*) as count FROM withdraw_orders WHERE status = 0`
    );

    // 待审核KYC
    const pendingKyc = await query(
      `SELECT COUNT(*) as count FROM users
       WHERE kyc_status = 0`
    );

    res.json({
      code: 0,
      message: 'Success',
      data: {
        pending_deposits: parseInt(pendingDeposits.rows[0].count),
        pending_withdrawals: parseInt(pendingWithdrawals.rows[0].count),
        pending_kyc: parseInt(pendingKyc.rows[0].count)
      },
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Get pending items failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now()
    });
  }
});

/**
 * 获取系统状态
 */
router.get('/dashboard/status', requirePermission('all'), async (req: Request, res: Response) => {
  try {
    // 检查数据库连接
    let dbStatus = 'unknown';
    try {
      await query('SELECT 1');
      dbStatus = 'healthy';
    } catch (e) {
      dbStatus = 'unhealthy';
    }

    res.json({
      code: 0,
      message: 'Success',
      data: {
        server: 'healthy',
        database: dbStatus,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: Date.now()
      },
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Get system status failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now()
    });
  }
});

// ====================================================
// 用户管理
// ====================================================

/**
 * 获取用户列表
 */
\n// 获取当前管理员权限\nrouter.get('/users/permissions', authenticateToken, async (req: Request, res: Response) => {\n  try {\n    const userId = req.user?.user_id;\n    const result = await query(\n      SELECT p.permission_code\n       FROM role_permissions rp\n       JOIN permissions p ON rp.permission_id = p.id\n       JOIN users u ON rp.role_id = u.role_id\n       WHERE u.id = ,\n      [userId]\n    );\n    res.json({ code: 0, message: 'Success', data: { permissions: result.rows.map(r => r.permission_code) }, timestamp: Date.now() });\n  } catch (error) {\n    res.status(500).json({ code: 500, message: 'Internal server error', data: null, timestamp: Date.now() });\n  }\n});\n\nrouter.get('/users', requirePermission('user:view'), async (req: Request, res: Response) => {
  try {
    const { page = 1, pageSize = 20, status, kyc_status, keyword } = req.query;
    const pageNum = parseInt(page as string);
    const pageSizeNum = parseInt(pageSize as string);

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      whereClause += ` AND u.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (kyc_status) {
      whereClause += ` AND u.kyc_status = $${paramIndex}`;
      params.push(kyc_status);
      paramIndex++;
    }

    if (keyword) {
      whereClause += ` AND (u.username LIKE $${paramIndex} OR u.real_name LIKE $${paramIndex} OR u.phone LIKE $${paramIndex})`;
      params.push(`%${keyword}%`);
      paramIndex++;
    }

    const offset = (pageNum - 1) * pageSizeNum;

    const countResult = await query(
      `SELECT COUNT(*) as total FROM users u ${whereClause}`,
      params
    );

    const total = parseInt(countResult.rows[0].total);

    const dataResult = await query(
      `SELECT u.*, a.balance, a.available_balance, r.name as role_name, ag.agent_code
       FROM users u
       LEFT JOIN accounts a ON u.id = a.user_id
       LEFT JOIN roles r ON u.role_id = r.id
       LEFT JOIN agents ag ON u.agent_id = ag.id
       ${whereClause}
       ORDER BY u.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, pageSizeNum, offset]
    );

    res.json({
      code: 0,
      message: 'Success',
      data: {
        data: dataResult.rows,
        total,
        page: pageNum,
        pageSize: pageSizeNum,
        totalPages: Math.ceil(total / pageSizeNum),
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Get users failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now(),
    });
  }
});

/**
 * 获取用户详情
 */
router.get('/users/:id', requirePermission('user:view'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = await query(
      `SELECT u.*, a.*, r.name as role_name, ag.agent_code, ag.agent_level
       FROM users u
       LEFT JOIN accounts a ON u.id = a.user_id
       LEFT JOIN roles r ON u.role_id = r.id
       LEFT JOIN agents ag ON u.agent_id = ag.id
       WHERE u.id = $1`,
      [id]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({
        code: 404,
        message: 'User not found',
        data: null,
        timestamp: Date.now(),
      });
    }

    res.json({
      code: 200,
      message: 'Success',
      data: user.rows[0],
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Get user detail failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now(),
    });
  }
});

/**
 * 更新用户
 */
router.put('/users/:id', requirePermission('user:update'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { real_name, phone, email, status, role_id, agent_id } = req.body;

    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (real_name !== undefined) {
      fields.push(`real_name = $${paramIndex}`);
      values.push(real_name);
      paramIndex++;
    }

    if (phone !== undefined) {
      fields.push(`phone = $${paramIndex}`);
      values.push(phone);
      paramIndex++;
    }

    if (email !== undefined) {
      fields.push(`email = $${paramIndex}`);
      values.push(email);
      paramIndex++;
    }

    if (status !== undefined) {
      fields.push(`status = $${paramIndex}`);
      values.push(status);
      paramIndex++;
    }

    if (role_id !== undefined) {
      fields.push(`role_id = $${paramIndex}`);
      values.push(role_id);
      paramIndex++;
    }

    if (agent_id !== undefined) {
      fields.push(`agent_id = $${paramIndex}`);
      values.push(agent_id);
      paramIndex++;
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const result = await query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        code: 404,
        message: 'User not found',
        data: null,
        timestamp: Date.now(),
      });
    }

    logger.info('User updated:', { user_id: id, admin_id: req.user.user_id });

    res.json({
      code: 200,
      message: 'User updated successfully',
      data: result.rows[0],
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Update user failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now(),
    });
  }
});

/**
 * 创建用户
 */
router.post('/users', requirePermission('user:create'), async (req: Request, res: Response) => {
  try {
    const { username, real_name, phone, email, password, role_id, agent_id, status = 1 } = req.body;

    // 检查用户名是否存在
    const existingUser = await query(
      `SELECT id FROM users WHERE username = $1`,
      [username]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        code: 400,
        message: 'Username already exists',
        data: null,
        timestamp: Date.now()
      });
    }

    // 创建用户
    const newUser = await query(
      `INSERT INTO users (username, real_name, phone, email, role_id, agent_id, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
       RETURNING id`,
      [username, real_name, phone, email, role_id, agent_id, status]
    );

    const userId = newUser.rows[0].id;

    // 创建账户
    await query(
      `INSERT INTO accounts (user_id, balance, available_balance, created_at)
       VALUES ($1, 0, 0, CURRENT_TIMESTAMP)`,
      [userId]
    );

    logger.info('User created:', { user_id: userId, admin_id: req.user.user_id });

    res.json({
      code: 0,
      message: 'User created successfully',
      data: { id: userId },
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Create user failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now()
    });
  }
});

/**
 * 删除用户
 */
router.delete('/users/:id', requirePermission('user:delete'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = await query(
      `SELECT * FROM users WHERE id = $1`,
      [id]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({
        code: 404,
        message: 'User not found',
        data: null,
        timestamp: Date.now()
      });
    }

    // 删除用户相关数据
    await query('BEGIN');

    try {
      await query(`DELETE FROM accounts WHERE user_id = $1`, [id]);
      await query(`DELETE FROM agent_customers WHERE user_id = $1`, [id]);
      await query(`DELETE FROM users WHERE id = $1`, [id]);

      await query('COMMIT');

      logger.info('User deleted:', { user_id: id, admin_id: req.user.user_id });

      res.json({
        code: 0,
        message: 'User deleted successfully',
        data: null,
        timestamp: Date.now()
      });
    } catch (e) {
      await query('ROLLBACK');
      throw e;
    }
  } catch (error) {
    logger.error('Delete user failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now()
    });
  }
});

/**
 * KYC 审核
 */
router.post('/users/:id/kyc', requirePermission('user:kyc'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { approved, remark } = req.body;

    const kycStatus = approved ? 1 : 0;

    const result = await query(
      `UPDATE users SET kyc_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      [kycStatus, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        code: 404,
        message: 'User not found',
        data: null,
        timestamp: Date.now(),
      });
    }

    logger.info('KYC reviewed:', { user_id: id, approved, admin_id: req.user.user_id });

    res.json({
      code: 200,
      message: 'KYC reviewed successfully',
      data: result.rows[0],
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('KYC review failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now(),
    });
  }
});

// ====================================================
// 订单管理
// ====================================================

/**
 * 获取订单列表
 */
router.get('/orders', requirePermission('order:view'), async (req: Request, res: Response) => {
  try {
    const { page = 1, pageSize = 20, status, symbol, user_id, start_date, end_date } = req.query;
    const pageNum = parseInt(page as string);
    const pageSizeNum = parseInt(pageSize as string);

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      whereClause += ` AND o.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (symbol) {
      whereClause += ` AND o.symbol = $${paramIndex}`;
      params.push(symbol);
      paramIndex++;
    }

    if (user_id) {
      whereClause += ` AND o.user_id = $${paramIndex}`;
      params.push(user_id);
      paramIndex++;
    }

    if (start_date) {
      whereClause += ` AND o.created_at >= $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      whereClause += ` AND o.created_at <= $${paramIndex}`;
      params.push(end_date);
      paramIndex++;
    }

    const offset = (pageNum - 1) * pageSizeNum;

    const countResult = await query(
      `SELECT COUNT(*) as total FROM orders o ${whereClause}`,
      params
    );

    const total = parseInt(countResult.rows[0].total);

    const dataResult = await query(
      `SELECT o.*, u.username, u.real_name, p.name as product_name,
              CASE o.status WHEN 0 THEN 'pending' WHEN 1 THEN 'open' WHEN 2 THEN 'closed' ELSE 'unknown' END as status_text
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       LEFT JOIN products p ON o.symbol = p.symbol
       ${whereClause}
       ORDER BY o.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, pageSizeNum, offset]
    );

    res.json({
      code: 0,
      message: 'Success',
      data: {
        list: dataResult.rows,
        total,
        page: pageNum,
        pageSize: pageSizeNum,
        totalPages: Math.ceil(total / pageSizeNum),
      },
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Get orders failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now()
    });
  }
});

/**
 * 获取订单详情
 */
router.get('/orders/:id', requirePermission('order:view'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const order = await query(
      `SELECT o.*, u.username, u.real_name, p.name as product_name, p.description
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       LEFT JOIN products p ON o.symbol = p.symbol
       WHERE o.id = $1`,
      [id]
    );

    if (order.rows.length === 0) {
      return res.status(404).json({
        code: 404,
        message: 'Order not found',
        data: null,
        timestamp: Date.now()
      });
    }

    res.json({
      code: 0,
      message: 'Success',
      data: order.rows[0],
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Get order detail failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now()
    });
  }
});

/**
 * 平仓订单
 */
router.post('/orders/:id/close', requirePermission('order:close'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const order = await query(
      `SELECT * FROM orders WHERE id = $1 AND status = 1`,
      [id]
    );

    if (order.rows.length === 0) {
      return res.status(404).json({
        code: 404,
        message: 'Order not found or already closed',
        data: null,
        timestamp: Date.now()
      });
    }

    const orderData = order.rows[0];

    // 获取当前市场价格计算盈亏
    const marketPrice = await query(
      `SELECT last_price FROM market_data WHERE symbol = $1`,
      [orderData.symbol]
    );

    const currentPrice = marketPrice.rows[0]?.last_price || orderData.entry_price;

    // 计算盈亏
    let profit: number;
    if (orderData.direction === 'BUY') {
      profit = (currentPrice - orderData.entry_price) * orderData.quantity;
    } else {
      profit = (orderData.entry_price - currentPrice) * orderData.quantity;
    }

    // 计算需要退还的保证金
    const marginToRelease = orderData.margin;

    // 使用事务确保数据一致性
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 更新订单状态为已平仓
      const result = await client.query(
        `UPDATE orders SET status = 2, closed_at = CURRENT_TIMESTAMP, exit_price = $2, profit = $3 WHERE id = $1 RETURNING *`,
        [id, currentPrice, profit]
      );

      // 释放保证金并更新账户余额
      await client.query(
        `UPDATE accounts SET frozen_margin = frozen_margin - $1, balance = balance + $1 + $2, total_profit = total_profit + $2 WHERE user_id = $3`,
        [marginToRelease, profit, orderData.user_id]
      );

      await client.query('COMMIT');

      logger.info('Order closed by admin:', {
        order_id: id,
        admin_id: req.user.user_id,
        profit,
        margin_released: marginToRelease
      });

      res.json({
        code: 0,
        message: 'Order closed successfully',
        data: {
          ...result.rows[0],
          profit,
          margin_released: marginToRelease
        },
        timestamp: Date.now()
      });
    } catch (transactionError) {
      await client.query('ROLLBACK');
      throw transactionError;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Close order failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now()
    });
  }
});

// ====================================================
// 持仓管理
// ====================================================

/**
 * 获取持仓列表
 */
router.get('/positions', requirePermission('position:view'), async (req: Request, res: Response) => {
  try {
    const { page = 1, pageSize = 20, user_id, symbol } = req.query;
    const pageNum = parseInt(page as string);
    const pageSizeNum = parseInt(pageSize as string);

    let whereClause = 'WHERE p.status = 1';
    const params: any[] = [];
    let paramIndex = 1;

    if (user_id) {
      whereClause += ` AND p.user_id = $${paramIndex}`;
      params.push(user_id);
      paramIndex++;
    }

    if (symbol) {
      whereClause += ` AND p.symbol = $${paramIndex}`;
      params.push(symbol);
      paramIndex++;
    }

    const offset = (pageNum - 1) * pageSizeNum;

    const countResult = await query(
      `SELECT COUNT(*) as total FROM positions p ${whereClause}`,
      params
    );

    const total = parseInt(countResult.rows[0].total);

    const dataResult = await query(
      `SELECT p.*, u.username, u.real_name, pr.name as product_name,
              (SELECT last_price FROM market_data WHERE symbol = p.symbol) as current_price,
              CASE p.status WHEN 1 THEN 'OPEN' WHEN 2 THEN 'CLOSED' ELSE 'UNKNOWN' END as status_text
       FROM positions p
       LEFT JOIN users u ON p.user_id = u.id
       LEFT JOIN products pr ON p.symbol = pr.symbol
       ${whereClause}
       ORDER BY p.opened_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, pageSizeNum, offset]
    );

    res.json({
      code: 0,
      message: 'Success',
      data: {
        list: dataResult.rows,
        total,
        page: pageNum,
        pageSize: pageSizeNum,
        totalPages: Math.ceil(total / pageSizeNum),
      },
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Get positions failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now()
    });
  }
});

/**
 * 获取持仓详情
 */
router.get('/positions/:id', requirePermission('position:view'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const position = await query(
      `SELECT p.*, u.username, u.real_name, pr.name as product_name, pr.description
       FROM positions p
       LEFT JOIN users u ON p.user_id = u.id
       LEFT JOIN products pr ON p.symbol = pr.symbol
       WHERE p.id = $1`,
      [id]
    );

    if (position.rows.length === 0) {
      return res.status(404).json({
        code: 404,
        message: 'Position not found',
        data: null,
        timestamp: Date.now()
      });
    }

    res.json({
      code: 0,
      message: 'Success',
      data: position.rows[0],
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Get position detail failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now()
    });
  }
});

// ====================================================
// 财务管理
// ====================================================

/**
 * 获取财务记录列表
 */
router.get('/finance', requirePermission('finance:view'), async (req: Request, res: Response) => {
  try {
    const { page = 1, pageSize = 20, type, status, user_id, start_date, end_date } = req.query;
    const pageNum = parseInt(page as string);
    const pageSizeNum = parseInt(pageSize as string);
    const offset = (pageNum - 1) * pageSizeNum;

    const depositWhere: string[] = [];
    const depositParams: any[] = [];
    let depositIdx = 1;

    if (type && type !== 'deposit') {
      // 仅查withdraw
    } else {
      if (status !== undefined && status !== '') {
        depositWhere.push(`status = $${depositIdx++}`);
        depositParams.push(Number(status));
      }
      if (user_id) {
        depositWhere.push(`user_id = $${depositIdx++}`);
        depositParams.push(user_id);
      }
      if (start_date) {
        depositWhere.push(`created_at >= $${depositIdx++}`);
        depositParams.push(start_date);
      }
      if (end_date) {
        depositWhere.push(`created_at <= $${depositIdx++}`);
        depositParams.push(end_date);
      }
    }

    const withdrawWhere: string[] = [];
    const withdrawParams: any[] = [];
    let withdrawIdx = 1;

    if (type && type !== 'withdraw') {
      // 仅查deposit
    } else {
      if (status !== undefined && status !== '') {
        withdrawWhere.push(`status = $${withdrawIdx++}`);
        withdrawParams.push(Number(status));
      }
      if (user_id) {
        withdrawWhere.push(`user_id = $${withdrawIdx++}`);
        withdrawParams.push(user_id);
      }
      if (start_date) {
        withdrawWhere.push(`created_at >= $${withdrawIdx++}`);
        withdrawParams.push(start_date);
      }
      if (end_date) {
        withdrawWhere.push(`created_at <= $${withdrawIdx++}`);
        withdrawParams.push(end_date);
      }
    }

    const depositWhereClause = depositWhere.length ? `WHERE ${depositWhere.join(' AND ')}` : '';
    const withdrawWhereClause = withdrawWhere.length ? `WHERE ${withdrawWhere.join(' AND ')}` : '';

    const depositQuery = `SELECT d.id, d.order_number as record_number, d.user_id, d.amount,
                                  d.payment_method,
                                  CASE d.payment_method WHEN 1 THEN 'USDT' WHEN 2 THEN 'BANK' WHEN 3 THEN 'ALIPAY' ELSE 'UNKNOWN' END as payment_method_text,
                                  d.status,
                                  CASE d.status WHEN 0 THEN 'pending' WHEN 1 THEN 'completed' WHEN 2 THEN 'rejected' ELSE 'unknown' END as status_text,
                                  d.created_at,
                                  u.username, u.real_name,
                                  'deposit' as type
                           FROM deposit_orders d
                           LEFT JOIN users u ON d.user_id = u.id
                           ${depositWhereClause}`;
    const withdrawQuery = `SELECT w.id, w.order_number as record_number, w.user_id, w.amount,
                                   w.payment_method,
                                   CASE w.payment_method WHEN 1 THEN 'USDT' WHEN 2 THEN 'BANK' WHEN 3 THEN 'ALIPAY' ELSE 'UNKNOWN' END as payment_method_text,
                                   w.status,
                                   CASE w.status WHEN 0 THEN 'pending' WHEN 2 THEN 'rejected' WHEN 3 THEN 'completed' ELSE 'unknown' END as status_text,
                                   w.created_at,
                                   u.username, u.real_name,
                                   'withdraw' as type
                           FROM withdraw_orders w
                           LEFT JOIN users u ON w.user_id = u.id
                           ${withdrawWhereClause}`;

    const unionQuery = [
      type === 'withdraw' ? null : depositQuery,
      type === 'deposit' ? null : withdrawQuery
    ].filter(Boolean).join(' UNION ALL ');

    const countResult = await query(`SELECT COUNT(*) as total FROM (${unionQuery}) t`, [
      ...(type === 'withdraw' ? [] : depositParams),
      ...(type === 'deposit' ? [] : withdrawParams)
    ]);

    const total = parseInt(countResult.rows[0].total);

    const dataResult = await query(
      `${unionQuery} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [pageSizeNum, offset]
    );

    res.json({
      code: 0,
      message: 'Success',
      data: {
        list: dataResult.rows,
        total,
        page: pageNum,
        pageSize: pageSizeNum,
        totalPages: Math.ceil(total / pageSizeNum),
      },
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Get financial records failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now()
    });
  }
});

/**
 * 审核充值
 */
router.post('/finance/deposit/:id/approve', requirePermission('finance:approve'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const record = await query(
      `SELECT * FROM deposit_orders WHERE id = $1 AND status = 0`,
      [id]
    );

    if (record.rows.length === 0) {
      return res.status(404).json({
        code: 404,
        message: 'Deposit record not found or already processed',
        data: null,
        timestamp: Date.now()
      });
    }

    // 更新充值订单状态
    await query(
      `UPDATE deposit_orders SET status = 1, approved_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );

    // 更新账户余额
    await query(
      `UPDATE accounts SET balance = balance + $1, available_balance = available_balance + $1, total_deposit = total_deposit + $1 WHERE user_id = $2`,
      [record.rows[0].amount, record.rows[0].user_id]
    );

    logger.info('Deposit approved:', { record_id: id, admin_id: req.user.user_id });

    res.json({
      code: 0,
      message: 'Deposit approved successfully',
      data: null,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Approve deposit failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now()
    });
  }
});

/**
 * 拒绝充值
 */
router.post('/finance/deposit/:id/reject', requirePermission('finance:approve'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const record = await query(
      `SELECT * FROM deposit_orders WHERE id = $1 AND status = 0`,
      [id]
    );

    if (record.rows.length === 0) {
      return res.status(404).json({
        code: 404,
        message: 'Deposit record not found or already processed',
        data: null,
        timestamp: Date.now()
      });
    }

    await query(
      `UPDATE deposit_orders SET status = 2, remark = $1, approved_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [reason, id]
    );

    logger.info('Deposit rejected:', { record_id: id, reason, admin_id: req.user.user_id });

    res.json({
      code: 0,
      message: 'Deposit rejected successfully',
      data: null,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Reject deposit failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now()
    });
  }
});

/**
 * 审核提现
 */
router.post('/finance/withdraw/:id/approve', requirePermission('finance:approve'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const record = await query(
      `SELECT * FROM withdraw_orders WHERE id = $1 AND status = 0`,
      [id]
    );

    if (record.rows.length === 0) {
      return res.status(404).json({
        code: 404,
        message: 'Withdraw record not found or already processed',
        data: null,
        timestamp: Date.now()
      });
    }

    const withdrawRecord = record.rows[0];

    // 检查用户账户余额是否足够
    const account = await query(
      `SELECT * FROM accounts WHERE user_id = $1`,
      [withdrawRecord.user_id]
    );

    if (account.rows.length === 0) {
      return res.status(404).json({
        code: 404,
        message: 'User account not found',
        data: null,
        timestamp: Date.now()
      });
    }

    const availableBalance = account.rows[0].balance;

    if (availableBalance < withdrawRecord.amount) {
      return res.status(400).json({
        code: 400,
        message: `余额不足。可用余额: ${availableBalance}, 提现金额: ${withdrawRecord.amount}`,
        data: null,
        timestamp: Date.now()
      });
    }

    // 使用事务确保数据一致性
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 更新提现订单状态
      await client.query(
        `UPDATE withdraw_orders SET status = 3, transferred_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id]
      );

      // 扣除账户余额
      await client.query(
        `UPDATE accounts SET balance = balance - $1, total_withdraw = total_withdraw + $1 WHERE user_id = $2`,
        [withdrawRecord.amount, withdrawRecord.user_id]
      );

      await client.query('COMMIT');

      logger.info('Withdraw approved:', { record_id: id, admin_id: req.user.user_id, amount: withdrawRecord.amount });
    } catch (transactionError) {
      await client.query('ROLLBACK');
      throw transactionError;
    } finally {
      client.release();
    }

    res.json({
      code: 0,
      message: 'Withdraw approved successfully',
      data: null,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Approve withdraw failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now()
    });
  }
});

/**
 * 拒绝提现
 */
router.post('/finance/withdraw/:id/reject', requirePermission('finance:approve'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const record = await query(
      `SELECT * FROM withdraw_orders WHERE id = $1 AND status = 0`,
      [id]
    );

    if (record.rows.length === 0) {
      return res.status(404).json({
        code: 404,
        message: 'Withdraw record not found or already processed',
        data: null,
        timestamp: Date.now()
      });
    }

    // 释放冻结资金
    await query(
      `UPDATE accounts SET balance = balance + $1, available_balance = available_balance + $1, frozen_withdraw = frozen_withdraw - $1 WHERE user_id = $2`,
      [record.rows[0].amount, record.rows[0].user_id]
    );

    await query(
      `UPDATE withdraw_orders SET status = 2, remark = $1, approved_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [reason, id]
    );

    logger.info('Withdraw rejected:', { record_id: id, reason, admin_id: req.user.user_id });

    res.json({
      code: 0,
      message: 'Withdraw rejected successfully',
      data: null,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Reject withdraw failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now()
    });
  }
});

// ====================================================
// 代理管理
// ====================================================

/**
 * 获取代理列表
 */
router.get('/agents', requirePermission('agent:view'), async (req: Request, res: Response) => {
  try {
    const { page = 1, pageSize = 20, status, agent_level } = req.query;
    const pageNum = parseInt(page as string);
    const pageSizeNum = parseInt(pageSize as string);

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      whereClause += ` AND ag.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (agent_level) {
      whereClause += ` AND ag.agent_level = $${paramIndex}`;
      params.push(agent_level);
      paramIndex++;
    }

    const offset = (pageNum - 1) * pageSizeNum;

    const countResult = await query(
      `SELECT COUNT(*) as total FROM agents ag ${whereClause}`,
      params
    );

    const total = parseInt(countResult.rows[0].total);

    const dataResult = await query(
      `SELECT ag.*, u.username, u.real_name, u.phone, u.email,
              (SELECT COUNT(*) FROM agents WHERE parent_agent_id = ag.id) as sub_agent_count,
              (SELECT COUNT(*) FROM agent_customers WHERE agent_id = ag.id) as customer_count
       FROM agents ag
       LEFT JOIN users u ON ag.user_id = u.id
       ${whereClause}
       ORDER BY ag.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, pageSizeNum, offset]
    );

    res.json({
      code: 0,
      message: 'Success',
      data: {
        data: dataResult.rows,
        total,
        page: pageNum,
        pageSize: pageSizeNum,
        totalPages: Math.ceil(total / pageSizeNum),
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Get agents failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now(),
    });
  }
});

/**
 * 创建代理
 */
router.post('/agents', requirePermission('agent:create'), async (req: Request, res: Response) => {
  try {
    const { username, real_name, phone, email, password, agent_level, parent_agent_id, commission_rate } = req.body;

    // 检查用户名是否存在
    const existingUser = await query(
      `SELECT id FROM users WHERE username = $1`,
      [username]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        code: 400,
        message: 'Username already exists',
        data: null,
        timestamp: Date.now()
      });
    }

    // 创建用户
    const newUser = await query(
      `INSERT INTO users (username, real_name, phone, email, role_id, status, created_at)
       VALUES ($1, $2, $3, $4, 3, 1, CURRENT_TIMESTAMP)
       RETURNING id`,
      [username, real_name, phone, email]
    );

    const userId = newUser.rows[0].id;

    // 生成代理代码
    const agentCode = `AG${Date.now().toString().slice(-8)}`;

    // 创建代理
    const newAgent = await query(
      `INSERT INTO agents (user_id, agent_code, agent_level, parent_agent_id, commission_rate, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 1, CURRENT_TIMESTAMP)
       RETURNING *`,
      [userId, agentCode, agent_level, parent_agent_id, commission_rate]
    );

    logger.info('Agent created:', { agent_id: newAgent.rows[0].id, admin_id: req.user.user_id });

    res.json({
      code: 0,
      message: 'Agent created successfully',
      data: newAgent.rows[0],
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Create agent failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now()
    });
  }
});

/**
 * 更新代理
 */
router.put('/agents/:id', requirePermission('agent:update'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { agent_level, commission_rate, status } = req.body;

    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (agent_level !== undefined) {
      fields.push(`agent_level = $${paramIndex}`);
      values.push(agent_level);
      paramIndex++;
    }

    if (commission_rate !== undefined) {
      fields.push(`commission_rate = $${paramIndex}`);
      values.push(commission_rate);
      paramIndex++;
    }

    if (status !== undefined) {
      fields.push(`status = $${paramIndex}`);
      values.push(status);
      paramIndex++;
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const result = await query(
      `UPDATE agents SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        code: 404,
        message: 'Agent not found',
        data: null,
        timestamp: Date.now()
      });
    }

    logger.info('Agent updated:', { agent_id: id, admin_id: req.user.user_id });

    res.json({
      code: 0,
      message: 'Agent updated successfully',
      data: result.rows[0],
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Update agent failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now()
    });
  }
});

/**
 * 获取代理业绩
 */
router.get('/agents/:id/performance', requirePermission('agent:view'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // 代理基本信息
    const agent = await query(
      `SELECT * FROM agents WHERE id = $1`,
      [id]
    );

    if (agent.rows.length === 0) {
      return res.status(404).json({
        code: 404,
        message: 'Agent not found',
        data: null,
        timestamp: Date.now()
      });
    }

    // 直推客户数
    const directCustomers = await query(
      `SELECT COUNT(*) as count FROM users WHERE agent_id = $1`,
      [id]
    );

    // 直推代理数
    const directAgents = await query(
      `SELECT COUNT(*) as count FROM agents WHERE parent_agent_id = $1`,
      [id]
    );

    // 团队总客户数
    const teamCustomers = await query(
      `SELECT COUNT(DISTINCT u.id) as count
       FROM users u
       WHERE u.agent_id IN (
         SELECT id FROM agents
         WHERE parent_agent_id = $1 OR id = $1
       )`,
      [id]
    );

    // 交易统计
    const tradingStats = await query(
      `SELECT
         COUNT(*) as total_orders,
         COALESCE(SUM(volume), 0) as total_volume,
         COALESCE(SUM(CASE WHEN profit > 0 THEN profit ELSE 0 END), 0) as total_profit,
         COALESCE(SUM(CASE WHEN profit < 0 THEN profit ELSE 0 END), 0) as total_loss
       FROM orders
       WHERE user_id IN (
         SELECT id FROM users WHERE agent_id = $1
       )`,
      [id]
    );

    // 本月业绩
    const monthlyStats = await query(
      `SELECT
         COUNT(*) as monthly_orders,
         COALESCE(SUM(profit), 0) as monthly_profit
       FROM orders
       WHERE user_id IN (
         SELECT id FROM users WHERE agent_id = $1
       ) AND created_at >= DATE_TRUNC('month', CURRENT_DATE)`,
      [id]
    );

    res.json({
      code: 0,
      message: 'Success',
      data: {
        agent: agent.rows[0],
        direct_customers: parseInt(directCustomers.rows[0].count),
        direct_agents: parseInt(directAgents.rows[0].count),
        team_customers: parseInt(teamCustomers.rows[0].count),
        trading: tradingStats.rows[0],
        monthly: monthlyStats.rows[0]
      },
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Get agent performance failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now()
    });
  }
});

// ====================================================
// 系统统计
// ====================================================

/**
 * 获取系统统计
 */
router.get('/stats', requirePermission('all'), async (req: Request, res: Response) => {
  try {
    // 用户统计
    const userStats = await query(
      `SELECT
         COUNT(*) as total_users,
         COUNT(CASE WHEN status = 1 THEN 1 END) as active_users,
         COUNT(CASE WHEN kyc_status = 1 THEN 1 END) as verified_users,
         COUNT(CASE WHEN created_at >= CURRENT_DATE THEN 1 END) as today_new_users
       FROM users`
    );

    // 代理统计
    const agentStats = await query(
      `SELECT
         COUNT(*) as total_agents,
         COUNT(CASE WHEN agent_level = 1 THEN 1 END) as level_1_agents,
         COUNT(CASE WHEN agent_level = 2 THEN 1 END) as level_2_agents,
         COALESCE(SUM(total_commission), 0) as total_commission
       FROM agents`
    );

    // 资金统计
    const financeStats = await query(
      `SELECT
         COALESCE(SUM(balance), 0) as total_balance,
         COALESCE(SUM(available_balance), 0) as total_available,
         COALESCE(SUM(frozen_margin), 0) as total_frozen,
         COALESCE(SUM(total_deposit), 0) as total_deposit,
         COALESCE(SUM(total_withdraw), 0) as total_withdraw
       FROM accounts`
    );

    // 交易统计
    const tradingStats = await query(
      `SELECT
         COUNT(*) as total_orders,
         COUNT(CASE WHEN status = 2 THEN 1 END) as filled_orders,
         COALESCE(SUM(commission), 0) as total_commission
       FROM orders`
    );

    // 今日交易统计
    const todayTradingStats = await query(
      `SELECT
         COUNT(*) as today_orders,
         COUNT(CASE WHEN status = 2 THEN 1 END) as today_filled_orders,
         COALESCE(SUM(commission), 0) as today_commission
       FROM orders
       WHERE created_at >= CURRENT_DATE`
    );

    // 持仓统计
    const positionStats = await query(
      `SELECT
         COUNT(*) as total_positions,
         COALESCE(SUM(lot_size), 0) as total_lot_size,
         COALESCE(SUM(floating_pl), 0) as total_floating_pl
       FROM positions
       WHERE status = 1`
    );

    res.json({
      code: 0,
      message: 'Success',
      data: {
        users: userStats.rows[0],
        agents: agentStats.rows[0],
        finance: financeStats.rows[0],
        trading: tradingStats.rows[0],
        todayTrading: todayTradingStats.rows[0],
        positions: positionStats.rows[0],
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Get stats failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now(),
    });
  }
});

/**
 * 获取系统配置
 */
router.get('/configs', requirePermission('all'), async (req: Request, res: Response) => {
  try {
    const configs = await query(
      `SELECT config_key, config_value, config_type, description, is_public FROM system_configs ORDER BY config_key`
    );

    // 过滤公开配置（如果是普通用户）
    const isAdmin = req.user.role_id === 1; // 假设超级管理员 role_id = 1
    const data = isAdmin ? configs.rows : configs.rows.filter((c: any) => c.is_public);

    res.json({
      code: 200,
      message: 'Success',
      data,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Get configs failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now(),
    });
  }
});

/**
 * 更新系统配置
 */
router.put('/configs/:key', requirePermission('config:update'), async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { config_value } = req.body;

    const result = await query(
      `UPDATE system_configs
       SET config_value = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2
       WHERE config_key = $3
       RETURNING *`,
      [config_value, req.user.user_id, key]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        code: 404,
        message: 'Config not found',
        data: null,
        timestamp: Date.now(),
      });
    }

    logger.info('Config updated:', { config_key: key, admin_id: req.user.user_id });

    res.json({
      code: 200,
      message: 'Config updated successfully',
      data: result.rows[0],
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Update config failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now(),
    });
  }
});

// ====================================================
// 手续费设置
// ====================================================

/**
 * 获取手续费设置
 */
router.get('/fees', requirePermission('config:view'), async (req: Request, res: Response) => {
  try {
    const settings = await query(
      `SELECT config_key, config_value, config_type, description FROM system_configs 
       WHERE config_key LIKE 'fee_%' ORDER BY config_key`
    );

    const feesObj: any = {};
    settings.rows.forEach((s: any) => {
      const key = s.config_key.replace('fee_', '');
      feesObj[key] = {
        value: s.config_value,
        type: s.config_type,
        description: s.description
      };
    });

    res.json({
      code: 0,
      message: 'Success',
      data: feesObj,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Get fees failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now()
    });
  }
});

/**
 * 更新手续费设置
 */
router.put('/fees', requirePermission('config:update'), async (req: Request, res: Response) => {
  try {
    const fees = req.body;

    const updatePromises = Object.entries(fees).map(([key, value]) =>
      query(
        `UPDATE system_configs SET config_value = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2 WHERE config_key = $3`,
        [value, req.user.user_id, `fee_${key}`]
      )
    );

    await Promise.all(updatePromises);

    logger.info('Fees updated:', { keys: Object.keys(fees), admin_id: req.user.user_id });

    res.json({
      code: 0,
      message: 'Fees updated successfully',
      data: null,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Update fees failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now()
    });
  }
});

/**
 * 初始化默认手续费配置
 */
router.post('/fees/init', requirePermission('config:update'), async (req: Request, res: Response) => {
  try {
    const defaultFees = [
      { key: 'fee_open_rate', value: '0.002', type: 'decimal', description: '开仓手续费率(小数)' },
      { key: 'fee_close_rate', value: '0.002', type: 'decimal', description: '平仓手续费率(小数)' },
      { key: 'fee_min_amount', value: '5', type: 'numeric', description: '最小手续费金额' },
      { key: 'fee_swap_long', value: '0.5', type: 'decimal', description: '多头持仓隔夜费(美元/手)' },
      { key: 'fee_swap_short', value: '-0.3', type: 'decimal', description: '空头持仓隔夜费(美元/手)' }
    ];

    for (const fee of defaultFees) {
      await query(
        `INSERT INTO system_configs (config_key, config_value, config_type, description, is_public, is_active, created_at, updated_by)
         VALUES ($1, $2, $3, $4, false, true, CURRENT_TIMESTAMP, $1)
         ON CONFLICT (config_key) DO UPDATE SET
           config_value = EXCLUDED.config_value,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = $5`,
        [fee.key, fee.value, fee.type, fee.description, req.user.user_id]
      );
    }

    logger.info('Fees initialized:', { admin_id: req.user.user_id });

    res.json({
      code: 0,
      message: 'Fees initialized successfully',
      data: null,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Init fees failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now()
    });
  }
});

// ====================================================
// 系统设置
// ====================================================

/**
 * 获取系统设置
 */
router.get('/settings', requirePermission('config:view'), async (req: Request, res: Response) => {
  try {
    const settings = await query(
      `SELECT config_key, config_value, config_type, description FROM system_configs WHERE is_active = true ORDER BY config_key`
    );

    const settingsObj: any = {};
    settings.rows.forEach((s: any) => {
      settingsObj[s.config_key] = s.config_value;
    });

    res.json({
      code: 0,
      message: 'Success',
      data: settingsObj,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Get settings failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now()
    });
  }
});

/**
 * 更新系统设置
 */
router.put('/settings', requirePermission('config:update'), async (req: Request, res: Response) => {
  try {
    const settings = req.body;

    const updatePromises = Object.entries(settings).map(([key, value]) =>
      query(
        `UPDATE system_configs SET config_value = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2 WHERE config_key = $3`,
        [value, req.user.user_id, key]
      )
    );

    await Promise.all(updatePromises);

    logger.info('Settings updated:', { keys: Object.keys(settings), admin_id: req.user.user_id });

    res.json({
      code: 0,
      message: 'Settings updated successfully',
      data: null,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Update settings failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now()
    });
  }
});

/**
 * 获取产品配置列表
 */
router.get('/settings/products', requirePermission('config:view'), async (req: Request, res: Response) => {
  try {
    const products = await query(
      `SELECT * FROM products ORDER BY created_at DESC`
    );

    res.json({
      code: 0,
      message: 'Success',
      data: products.rows,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Get product configs failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now()
    });
  }
});

/**
 * 更新产品配置
 */
router.patch('/settings/products/:id', requirePermission('config:update'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, min_lot_size, max_lot_size, leverage_min, leverage_max, spread, swap_long, swap_short, status } = req.body;

    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      fields.push(`name = $${paramIndex}`);
      values.push(name);
      paramIndex++;
    }
    if (description !== undefined) {
      fields.push(`description = $${paramIndex}`);
      values.push(description);
      paramIndex++;
    }
    if (min_lot_size !== undefined) {
      fields.push(`min_lot_size = $${paramIndex}`);
      values.push(min_lot_size);
      paramIndex++;
    }
    if (max_lot_size !== undefined) {
      fields.push(`max_lot_size = $${paramIndex}`);
      values.push(max_lot_size);
      paramIndex++;
    }
    if (leverage_min !== undefined) {
      fields.push(`leverage_min = $${paramIndex}`);
      values.push(leverage_min);
      paramIndex++;
    }
    if (leverage_max !== undefined) {
      fields.push(`leverage_max = $${paramIndex}`);
      values.push(leverage_max);
      paramIndex++;
    }
    if (spread !== undefined) {
      fields.push(`spread = $${paramIndex}`);
      values.push(spread);
      paramIndex++;
    }
    if (swap_long !== undefined) {
      fields.push(`swap_long = $${paramIndex}`);
      values.push(swap_long);
      paramIndex++;
    }
    if (swap_short !== undefined) {
      fields.push(`swap_short = $${paramIndex}`);
      values.push(swap_short);
      paramIndex++;
    }
    if (status !== undefined) {
      fields.push(`status = $${paramIndex}`);
      values.push(status);
      paramIndex++;
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const result = await query(
      `UPDATE products SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        code: 404,
        message: 'Product not found',
        data: null,
        timestamp: Date.now()
      });
    }

    logger.info('Product config updated:', { product_id: id, admin_id: req.user.user_id });

    res.json({
      code: 0,
      message: 'Product config updated successfully',
      data: result.rows[0],
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Update product config failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now()
    });
  }
});

// ====================================================
// 风控管理
// ====================================================

/**
 * 获取风控概览
 */
router.get('/risk/overview', requirePermission('risk:view'), async (req: Request, res: Response) => {
  try {
    const highRiskPositions = await query(
      `SELECT p.*, u.username, u.real_name
       FROM positions p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.status = 1 AND ABS(p.floating_pl) / p.margin > 0.8`
    );

    const warningPositions = await query(
      `SELECT p.*, u.username, u.real_name
       FROM positions p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.status = 1 AND ABS(p.floating_pl) / p.margin > 0.5 AND ABS(p.floating_pl) / p.margin <= 0.8`
    );

    const todayLiquidations = await query(
      `SELECT p.*, u.username, u.real_name
       FROM positions p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.status = 2 AND p.close_reason = 'liquidation' AND DATE(p.closed_at) = CURRENT_DATE`
    );

    res.json({
      code: 0,
      message: 'Success',
      data: {
        high_risk_count: highRiskPositions.rows.length,
        warning_count: warningPositions.rows.length,
        high_risk_positions: highRiskPositions.rows,
        warning_positions: warningPositions.rows,
        today_liquidations: todayLiquidations.rows
      },
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Get risk overview failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now()
    });
  }
});

/**
 * 获取高风险持仓
 */
router.get('/risk/positions', requirePermission('risk:view'), async (req: Request, res: Response) => {
  try {
    const { level = 'high' } = req.query;
    const minRatio = level === 'high' ? 0.8 : 0.5;

    const positions = await query(
      `SELECT p.*, u.username, u.real_name,
              ABS(p.floating_pl) / p.margin as risk_ratio
       FROM positions p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.status = 1 AND ABS(p.floating_pl) / p.margin >= $1
       ORDER BY ABS(p.floating_pl) / p.margin DESC`,
      [minRatio]
    );

    res.json({
      code: 0,
      message: 'Success',
      data: positions.rows,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Get risk positions failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now()
    });
  }
});

/**
 * 获取风控设置
 */
router.get('/risk/settings', requirePermission('risk:config'), async (req: Request, res: Response) => {
  try {
    const settings = await query(
      `SELECT config_key, config_value FROM system_configs WHERE config_key LIKE 'risk_%'`
    );

    const settingsObj: any = {};
    settings.rows.forEach((s: any) => {
      settingsObj[s.config_key] = s.config_value;
    });

    res.json({
      code: 0,
      message: 'Success',
      data: settingsObj,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Get risk settings failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now()
    });
  }
});

/**
 * 更新风控设置
 */
router.put('/risk/settings', requirePermission('risk:config'), async (req: Request, res: Response) => {
  try {
    const settings = req.body;

    const updatePromises = Object.entries(settings).map(([key, value]) =>
      query(
        `UPDATE system_configs SET config_value = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2 WHERE config_key = $3`,
        [value, req.user.user_id, key]
      )
    );

    await Promise.all(updatePromises);

    logger.info('Risk settings updated:', { keys: Object.keys(settings), admin_id: req.user.user_id });

    res.json({
      code: 0,
      message: 'Risk settings updated successfully',
      data: null,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Update risk settings failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now()
    });
  }
});

/**
 * 强平操作
 */
router.post('/risk/force-close', requirePermission('risk:force_close'), async (req: Request, res: Response) => {
  try {
    const { positionId, reason } = req.body;

    const position = await query(
      `SELECT * FROM positions WHERE id = $1 AND status = 1`,
      [positionId]
    );

    if (position.rows.length === 0) {
      return res.status(404).json({
        code: 404,
        message: 'Position not found or already closed',
        data: null,
        timestamp: Date.now()
      });
    }

    const marketData = await query(
      `SELECT last_price FROM market_data WHERE symbol = $1`,
      [position.rows[0].symbol]
    );

    if (marketData.rows.length === 0) {
      return res.status(404).json({
        code: 404,
        message: 'Market data not found',
        data: null,
        timestamp: Date.now()
      });
    }

    const currentPrice = marketData.rows[0].last_price;

    await query(
      `UPDATE positions SET
        status = 2,
        close_price = $1,
        close_reason = 'force_close',
        closed_at = CURRENT_TIMESTAMP,
        floating_pl = CASE
          WHEN direction = 'buy' THEN ($1 - open_price) * lot_size
          ELSE (open_price - $1) * lot_size
        END
       WHERE id = $2`,
      [currentPrice, positionId]
    );

    logger.warn('Position force closed:', { position_id: positionId, reason, admin_id: req.user.user_id });

    res.json({
      code: 0,
      message: 'Position force closed successfully',
      data: { positionId, closePrice: currentPrice },
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Force close position failed:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null,
      timestamp: Date.now()
    });
  }
});

export default router;




