import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import logger from '../utils/logger';
import { ErrorCode, createErrorResponse, createSuccessResponse } from '../utils/error-codes';
import { findOne, query, transaction } from '../config/database';
import { getAccount } from '../services/finance.service';

const router = express.Router();

// JWT密钥强度验证（确保与auth.ts一致）
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not configured. Please set a strong secret key in environment variables.');
}

/**
 * JWT认证中间件
 * 验证用户身份并提取用户信息
 */
const authenticateUser = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(createErrorResponse(ErrorCode.TOKEN_MISSING));
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      req.user = decoded;
      next();
    } catch (jwtError) {
      logger.warn(`[Finance] JWT验证失败: ${(jwtError as Error).message}`);
      const isExpired = (jwtError as any).name === 'TokenExpiredError';
      return res.status(401).json(
        createErrorResponse(isExpired ? ErrorCode.TOKEN_EXPIRED : ErrorCode.TOKEN_INVALID)
      );
    }
  } catch (error) {
    logger.error('[Finance] 认证中间件错误:', error);
    return res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_ERROR, '认证失败'));
  }
};

// 扩展Express类型
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

// ====================================================
// 用户充值申请
// ====================================================

/**
 * 创建充值申请
 */
router.post('/deposit', authenticateUser, async (req: express.Request, res: express.Response) => {
  try {
    const { userId, amount, method, bankAccount, bankName, accountName, usdtAddress, securityCode } = req.body;

    if (!userId || !amount || !method) {
      return res.status(400).json(createErrorResponse(ErrorCode.MISSING_PARAM));
    }

    // 验证金额
    if (amount <= 0) {
      return res.status(400).json(createErrorResponse(ErrorCode.OUT_OF_RANGE, '充值金额必须大于0'));
    }

    // 验证最低充值金额（例如10元）
    if (amount < 10) {
      return res.status(400).json(createErrorResponse(ErrorCode.DEPOSIT_TOO_LOW));
    }

    // 创建充值记录到数据库
    const result = await query(
      `INSERT INTO financial_records
       (record_number, user_id, type, amount, payment_method, bank_account, bank_name, account_name, usdt_address, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
       RETURNING id, record_number`,
      [
        uuidv4(),
        userId,
        'deposit',
        parseFloat(amount),
        method,
        bankAccount || null,
        bankName || null,
        accountName || null,
        usdtAddress || null,
        'pending',
      ]
    );

    logger.info(`[Finance] 充值申请创建: ${result.rows[0].id}, 用户: ${userId}, 金额: ${amount}`);

    res.json(createSuccessResponse({
      id: result.rows[0].id,
      record_number: result.rows[0].record_number,
      amount: parseFloat(amount),
      status: 'pending',
      createdAt: new Date().toISOString()
    }, '充值申请已提交，等待审核'));
  } catch (error) {
    logger.error('[Finance] 创建充值申请失败:', error);
    res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_ERROR, '创建充值申请失败'));
  }
});

// ====================================================
// 用户提现申请
// ====================================================

/**
 * 创建提现申请
 */
router.post('/withdraw', authenticateUser, async (req: express.Request, res: express.Response) => {
  try {
    const { userId, amount, method, bankAccount, bankName, accountName, usdtAddress, securityCode } = req.body;

    if (!userId || !amount || !method) {
      return res.status(400).json(createErrorResponse(ErrorCode.MISSING_PARAM));
    }

    // 验证金额
    if (amount <= 0) {
      return res.status(400).json(createErrorResponse(ErrorCode.OUT_OF_RANGE, '提现金额必须大于0'));
    }

    // 验证最低提现金额
    if (amount < 100) {
      return res.status(400).json(createErrorResponse(ErrorCode.WITHDRAW_TOO_HIGH, '提现金额不能低于100'));
    }

    // 校验安全码
    const user = await findOne(
      `SELECT security_code_hash FROM users WHERE id = $1`,
      [userId]
    );

    if (!user?.security_code_hash) {
      return res.status(400).json(createErrorResponse(ErrorCode.INVALID_PARAM, '未设置安全码'));
    }

    const isSecurityCodeValid = await bcrypt.compare(securityCode, user.security_code_hash);

    if (!isSecurityCodeValid) {
      return res.status(400).json(createErrorResponse(ErrorCode.INVALID_PARAM, '安全码错误'));
    }

    // 检查用户余额是否足够
    const account = await getAccount(userId);
    if (!account) {
      return res.status(404).json(createErrorResponse(ErrorCode.RESOURCE_NOT_FOUND, '账户不存在'));
    }

    if (account.available_balance < parseFloat(amount)) {
      logger.warn(`[Finance] 提现余额不足: 用户${userId}, 申请金额${amount}, 可用余额${account.available_balance}`);
      return res.status(400).json(createErrorResponse(ErrorCode.INSUFFICIENT_FUNDS, '可用余额不足'));
    }

    // 检查每日提现限额
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayWithdraws = await query(
      `SELECT COALESCE(SUM(amount), 0) as total_withdraw
       FROM financial_records
       WHERE user_id = $1
         AND type = 'withdraw'
         AND status != 'rejected'
         AND created_at >= $2`,
      [userId, today]
    );

    const totalTodayWithdraw = parseFloat(todayWithdraws.rows[0].total_withdraw) || 0;
    const dailyLimit = 10000; // 每日提现限额10000

    if (totalTodayWithdraw + parseFloat(amount) > dailyLimit) {
      return res.status(400).json(createErrorResponse(ErrorCode.WITHDRAW_LIMIT_EXCEEDED, `超出每日提现限额，今日已提现${totalTodayWithdraw}，限额${dailyLimit}`));
    }

    // 创建提现记录到数据库
    const result = await query(
      `INSERT INTO financial_records
       (record_number, user_id, type, amount, payment_method, bank_account, bank_name, account_name, usdt_address, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
       RETURNING id, record_number`,
      [
        uuidv4(),
        userId,
        'withdraw',
        parseFloat(amount),
        method,
        bankAccount || null,
        bankName || null,
        accountName || null,
        usdtAddress || null,
        'pending',
      ]
    );

    logger.info(`[Finance] 提现申请创建: ${result.rows[0].id}, 用户: ${userId}, 金额: ${amount}`);

    res.json(createSuccessResponse({
      id: result.rows[0].id,
      record_number: result.rows[0].record_number,
      amount: parseFloat(amount),
      status: 'pending',
      createdAt: new Date().toISOString()
    }, '提现申请已提交，等待审核'));
  } catch (error) {
    logger.error('[Finance] 创建提现申请失败:', error);
    res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_ERROR, '创建提现申请失败'));
  }
});

// ====================================================
// 获取用户账户信息
// ====================================================

/**
 * 获取账户余额信息
 */
router.get('/account', authenticateUser, async (req: express.Request, res: express.Response) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json(createErrorResponse(ErrorCode.MISSING_PARAM));
    }

    const account = await getAccount(Number(userId));
    if (!account) {
      return res.status(404).json(createErrorResponse(ErrorCode.RESOURCE_NOT_FOUND, '账户不存在'));
    }

    res.json(createSuccessResponse(account, '获取成功'));
  } catch (error) {
    logger.error('[Finance] 获取账户信息失败:', error);
    res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_ERROR, '获取账户信息失败'));
  }
});

// ====================================================
// 获取用户财务记录
// ====================================================

/**
 * 获取用户财务记录列表
 */
router.get('/records', authenticateUser, async (req: express.Request, res: express.Response) => {
  try {
    const { userId, type, status, page = 1, pageSize = 20 } = req.query;

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (userId) {
      whereClause += ` AND user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    if (type) {
      whereClause += ` AND type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }

    if (status) {
      whereClause += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    const pageNum = parseInt(page as string);
    const pageSizeNum = parseInt(pageSize as string);
    const offset = (pageNum - 1) * pageSizeNum;

    // 获取总数
    const countResult = await query(
      `SELECT COUNT(*) as total FROM financial_records ${whereClause}`,
      params
    );

    const total = parseInt(countResult.rows[0].total);

    // 获取数据
    const dataResult = await query(
      `SELECT * FROM financial_records ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, pageSizeNum, offset]
    );

    res.json(createSuccessResponse({
      list: dataResult.rows,
      total,
      page: pageNum,
      pageSize: pageSizeNum,
      totalPages: Math.ceil(total / pageSizeNum)
    }, '获取成功'));
  } catch (error) {
    logger.error('[Finance] 获取财务记录失败:', error);
    res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_ERROR, '获取财务记录失败'));
  }
});

// ====================================================
// 获取单条财务记录详情
// ====================================================

/**
 * 获取财务记录详情
 */
router.get('/records/:id', authenticateUser, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;

    const record = await findOne(
      `SELECT * FROM financial_records WHERE id = $1`,
      [id]
    );

    if (!record) {
      return res.status(404).json(createErrorResponse(ErrorCode.TRANSACTION_NOT_FOUND));
    }

    res.json(createSuccessResponse(record, '获取成功'));
  } catch (error) {
    logger.error('[Finance] 获取财务记录详情失败:', error);
    res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_ERROR, '获取财务记录详情失败'));
  }
});

export default router;

