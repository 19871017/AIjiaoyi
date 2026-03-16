import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../config/database';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '../utils/error-codes';

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
    req.userId = decoded.user_id || decoded.userId || decoded.id;
    next();
  } catch (error) {
    return res.status(401).json(createErrorResponse(ErrorCode.TOKEN_INVALID));
  }
};

// 更新个人信息
router.patch('/users/:id', authenticateUser, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    if (Number(id) !== Number(userId)) {
      return res.status(403).json(createErrorResponse(ErrorCode.FORBIDDEN, '无权限'));
    }

    const { name, phone, email, avatar } = req.body;

    await query(
      `UPDATE users
       SET real_name = $1, phone = $2, email = $3, avatar = $4
       WHERE id = $5`,
      [name, phone, email || null, avatar || null, userId]
    );

    res.json(createSuccessResponse(null, '更新成功'));
  } catch (error) {
    res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_ERROR, '更新失败'));
  }
});

export default router;
