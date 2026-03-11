import { Router } from 'express';
import { query } from '../config/database';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '../utils/error-codes';

const router = Router();

// 获取公告列表
router.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, title, content, created_at
       FROM announcements
       WHERE status = 1
       ORDER BY created_at DESC
       LIMIT 20`
    );

    res.json(createSuccessResponse(result.rows));
  } catch (error) {
    res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_ERROR, '获取公告失败'));
  }
});

export default router;
