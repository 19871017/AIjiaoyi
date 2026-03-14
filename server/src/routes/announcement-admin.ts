import { Router, Request, Response, NextFunction } from 'express';
import { query } from '../config/database';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '../utils/error-codes';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || '';

function requirePermission(_perm: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json(createErrorResponse(ErrorCode.TOKEN_MISSING));
      }
      const token = authHeader.substring(7);
      const decoded: any = jwt.verify(token, JWT_SECRET);
      if (!decoded) {
        return res.status(401).json(createErrorResponse(ErrorCode.TOKEN_INVALID));
      }
      (req as any).user = decoded;
      next();
    } catch {
      return res.status(401).json(createErrorResponse(ErrorCode.TOKEN_INVALID));
    }
  };
}

const router = Router();

// 获取公告列表（后台）
router.get('/admin/announcements', requirePermission('content:view'), async (req, res) => {
  try {
    const { page = 1, pageSize = 20, status, pinned } = req.query as any;
    const pageNum = parseInt(page as string);
    const pageSizeNum = parseInt(pageSize as string);
    const offset = (pageNum - 1) * pageSizeNum;

    const where: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (status !== undefined && status !== '') {
      where.push(`status = $${idx++}`);
      params.push(Number(status));
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await query(
      `SELECT COUNT(*) as total FROM announcements ${whereClause}`,
      params
    );

    const dataResult = await query(
      `SELECT id, title, content, status, is_pinned, created_at
       FROM announcements ${whereClause}
       ORDER BY is_pinned DESC, created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, pageSizeNum, offset]
    );

    res.json(createSuccessResponse({
      list: dataResult.rows,
      total: parseInt(countResult.rows[0].total),
      page: pageNum,
      pageSize: pageSizeNum,
      totalPages: Math.ceil(parseInt(countResult.rows[0].total) / pageSizeNum)
    }));
  } catch (error) {
    res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_ERROR, '获取公告失败'));
  }
});

// 新增公告
router.post('/admin/announcements', requirePermission('content:create'), async (req, res) => {
  try {
    const { title, content, status = 1, is_pinned = false } = req.body;
    if (!title || !content) {
      return res.status(400).json(createErrorResponse(ErrorCode.MISSING_PARAM, '标题与内容不能为空'));
    }

    const result = await query(
      `INSERT INTO announcements (title, content, status, is_pinned)
       VALUES ($1, $2, $3, $4)
       RETURNING id, title, content, status, is_pinned, created_at`,
      [title, content, status, is_pinned]
    );

    res.json(createSuccessResponse(result.rows[0], '创建成功'));
  } catch (error) {
    res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_ERROR, '创建公告失败'));
  }
});

// 更新公告
router.put('/admin/announcements/:id', requirePermission('content:update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, status, is_pinned } = req.body;

    const result = await query(
      `UPDATE announcements
       SET title = COALESCE($1, title),
           content = COALESCE($2, content),
           status = COALESCE($3, status),
           is_pinned = COALESCE($4, is_pinned)
       WHERE id = $5
       RETURNING id, title, content, status, is_pinned, created_at`,
      [title, content, status, is_pinned, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(createErrorResponse(ErrorCode.RESOURCE_NOT_FOUND, '公告不存在'));
    }

    res.json(createSuccessResponse(result.rows[0], '更新成功'));
  } catch (error) {
    res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_ERROR, '更新公告失败'));
  }
});

// 删除公告
router.delete('/admin/announcements/:id', requirePermission('content:delete'), async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM announcements WHERE id = $1', [id]);
    res.json(createSuccessResponse(null, '删除成功'));
  } catch (error) {
    res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_ERROR, '删除公告失败'));
  }
});

export default router;

