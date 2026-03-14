import { query } from '../config/database';
import logger from './logger';

export async function logAudit(params: {
  userId?: string | number | null;
  action: string;
  module: string;
  level?: 'info' | 'warn' | 'error';
  detail?: any;
  ip?: string;
  userAgent?: string;
}) {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, action, module, level, detail, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`
    , [
      params.userId || null,
      params.action,
      params.module,
      params.level || 'info',
      params.detail ? JSON.stringify(params.detail) : null,
      params.ip || null,
      params.userAgent || null
    ]);
  } catch (error) {
    logger.warn('Write audit log failed', error as any);
  }
}

export async function logAlert(params: {
  type: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  detail?: any;
}) {
  try {
    await query(
      `INSERT INTO alerts (type, level, message, detail)
       VALUES ($1, $2, $3, $4)`
    , [
      params.type,
      params.level,
      params.message,
      params.detail ? JSON.stringify(params.detail) : null
    ]);
  } catch (error) {
    logger.warn('Write alert failed', error as any);
  }
}
