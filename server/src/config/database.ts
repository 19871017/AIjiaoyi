import { Pool, PoolClient, QueryResult } from 'pg';
import logger from '../utils/logger';

/**
 * 数据库配置
 */
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'precious_metals_trading',
  user: process.env.DB_USER || 'postgres',
  password: String(process.env.DB_PASSWORD || ''),
  max: 20, // 连接池最大连接数
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

/**
 * 数据库连接池
 */
export const pool = new Pool(dbConfig);

/**
 * 数据库连接状态
 */
export let dbAvailable = false;

/**
 * 日志库连接池（用于存储日志）
 */
const logsDbConfig = {
  ...dbConfig,
  database: process.env.DB_LOGS_NAME || 'precious_metals_trading_logs',
};

export const logsPool = new Pool(logsDbConfig);

/**
 * 测试数据库连接
 */
export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    dbAvailable = true;
    logger.info('Database connected successfully:', result.rows[0]);
    return true;
  } catch (error) {
    dbAvailable = false;
    logger.error('Database connection failed:', error);
    return false;
  }
}

/**
 * 执行查询
 */
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed query', { text, duration, rows: result.rowCount });
    return result;
  } catch (error) {
    logger.error('Query failed:', { text, params, error });
    throw error;
  }
}

/**
 * 执行事务
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Transaction failed, rolled back:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 获取单条记录
 */
export async function findOne<T = any>(
  text: string,
  params?: any[]
): Promise<T | null> {
  const result = await query<T>(text, params);
  return result.rows[0] || null;
}

/**
 * 获取多条记录
 */
export async function findMany<T = any>(
  text: string,
  params?: any[]
): Promise<T[]> {
  const result = await query<T>(text, params);
  return result.rows;
}

/**
 * 插入记录并返回ID
 */
export async function insertAndGetId(
  text: string,
  params?: any[]
): Promise<number> {
  const result = await query(text + ' RETURNING id', params);
  return result.rows[0].id;
}

/**
 * 更新记录
 */
export async function update(
  text: string,
  params?: any[]
): Promise<QueryResult> {
  return await query(text, params);
}

/**
 * 删除记录
 */
export async function remove(
  text: string,
  params?: any[]
): Promise<QueryResult> {
  return await query(text, params);
}

/**
 * 分页查询
 */
export async function paginate<T = any>(
  text: string,
  params: any[],
  page: number = 1,
  pageSize: number = 20
): Promise<{
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const offset = (page - 1) * pageSize;

  // 获取总数
  const countText = text.replace(/SELECT[\s\S]*?FROM/i, 'SELECT COUNT(*) AS total FROM');
  const countResult = await query(countText, params);
  const total = parseInt(countResult.rows[0].total);

  // 获取数据
  const limitText = `${text} LIMIT ${pageSize} OFFSET ${offset}`;
  const dataResult = await query<T>(limitText, params);

  return {
    data: dataResult.rows,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * 关闭数据库连接
 */
export async function closeConnection(): Promise<void> {
  await pool.end();
  await logsPool.end();
  logger.info('Database connections closed');
}

// 优雅退出
process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing database connections...');
  await closeConnection();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing database connections...');
  await closeConnection();
  process.exit(0);
});
