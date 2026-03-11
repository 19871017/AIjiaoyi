import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../config/database';
import { ErrorCode, createErrorResponse, createSuccessResponse } from '../utils/error-codes';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;

const authenticateUser = (req: any, res: any, next: any) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(createErrorResponse(ErrorCode.TOKEN_MISSING));
    }

    const token = authHeader.substring(7);
    if (!JWT_SECRET) {
      return res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_ERROR, '服务器配置错误'));
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.userId = decoded.userId || decoded.id;
    next();
  } catch (error) {
    return res.status(401).json(createErrorResponse(ErrorCode.TOKEN_INVALID));
  }
};

// 获取银行卡列表
router.get('/', authenticateUser, async (req: any, res: any) => {
  try {
    const userId = req.userId;
    const result = await query(
      `SELECT id, bank_name, card_number, holder_name, is_default, created_at
       FROM bank_cards
       WHERE user_id = $1
       ORDER BY is_default DESC, created_at DESC`,
      [userId]
    );

    res.json(createSuccessResponse(result.rows));
  } catch (error) {
    res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_ERROR, '获取银行卡失败'));
  }
});

// 添加银行卡
router.post('/', authenticateUser, async (req: any, res: any) => {
  try {
    const userId = req.userId;
    const { bankName, cardNumber, holderName } = req.body;

    if (!bankName || !cardNumber || !holderName) {
      return res.status(400).json(createErrorResponse(ErrorCode.MISSING_PARAM, '缺少必要参数'));
    }

    // 如果是第一张卡，设为默认
    const count = await query('SELECT COUNT(*)::int as count FROM bank_cards WHERE user_id = $1', [userId]);
    const isDefault = (count.rows[0]?.count || 0) === 0;

    const result = await query(
      `INSERT INTO bank_cards (user_id, bank_name, card_number, holder_name, is_default)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, bank_name, card_number, holder_name, is_default, created_at`,
      [userId, bankName, cardNumber, holderName, isDefault]
    );

    res.json(createSuccessResponse(result.rows[0], '添加成功'));
  } catch (error) {
    res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_ERROR, '添加失败'));
  }
});

// 设置默认银行卡
router.patch('/:id/default', authenticateUser, async (req: any, res: any) => {
  try {
    const userId = req.userId;
    const { id } = req.params;

    await query('UPDATE bank_cards SET is_default = false WHERE user_id = $1', [userId]);
    await query('UPDATE bank_cards SET is_default = true WHERE id = $1 AND user_id = $2', [id, userId]);

    res.json(createSuccessResponse(null, '设置成功'));
  } catch (error) {
    res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_ERROR, '设置失败'));
  }
});

// 删除银行卡
router.delete('/:id', authenticateUser, async (req: any, res: any) => {
  try {
    const userId = req.userId;
    const { id } = req.params;

    await query('DELETE FROM bank_cards WHERE id = $1 AND user_id = $2', [id, userId]);

    res.json(createSuccessResponse(null, '删除成功'));
  } catch (error) {
    res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_ERROR, '删除失败'));
  }
});

export default router;
