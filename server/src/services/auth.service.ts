import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { query, findOne, transaction } from '../config/database';
import logger from '../utils/logger';

/**
 * JWT 配置
 */
// JWT密钥强度验证
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not configured. Please set a strong secret key in environment variables.');
}

if (JWT_SECRET.length < 32) {
  logger.warn('JWT_SECRET is too short (less than 32 characters). Please use a stronger secret key for production.');
}
const ACCESS_TOKEN_EXPIRE = process.env.JWT_ACCESS_TOKEN_EXPIRE || '15m';
const REFRESH_TOKEN_EXPIRE = process.env.JWT_REFRESH_TOKEN_EXPIRE || '7d';

/**
 * 用户信息接口
 */
export interface User {
  id: number;
  username: string;
  phone?: string;
  email?: string;
  real_name?: string;
  status: number;
  kyc_status: number;
  role_id: number;
  role?: string;
  agent_id?: number;
  referral_code?: string;
  avatar?: string;
  created_at: Date;
}

/**
 * 注册信息接口
 */
export interface RegisterData {
  username: string;
  password: string;
  security_code: string;
  phone?: string;
  email?: string;
  referral_code?: string;
}

/**
 * 登录信息接口
 */
export interface LoginData {
  username: string;
  password: string;
  ip_address?: string;
  user_agent?: string;
}

/**
 * Token 接口
 */
export interface TokenPayload {
  user_id: number;
  username: string;
  role_id: number;
}

/**
 * Token 响应接口
 */
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: User;
}

/**
 * 生成访问令牌
 */
function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRE });
}

/**
 * 生成刷新令牌
 */
function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRE });
}

/**
 * 验证令牌
 */
export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch (error) {
    logger.error('Token verification failed:', error);
    return null;
  }
}

/**
 * 用户注册
 */
export async function register(data: RegisterData): Promise<User> {
  // 检查用户名是否存在
  const existingUser = await findOne<User>(
    'SELECT id FROM users WHERE username = $1',
    [data.username]
  );

  if (existingUser) {
    throw new Error('Username already exists');
  }

  // 检查手机号是否存在
  if (data.phone) {
    const existingPhone = await findOne<User>(
      'SELECT id FROM users WHERE phone = $1',
      [data.phone]
    );

    if (existingPhone) {
      throw new Error('Phone number already exists');
    }
  }

  // 检查邮箱是否存在
  if (data.email) {
    const existingEmail = await findOne<User>(
      'SELECT id FROM users WHERE email = $1',
      [data.email]
    );

    if (existingEmail) {
      throw new Error('Email already exists');
    }
  }

  // 查找推荐人
  let agent_id: number | undefined;
  if (data.referral_code) {
    const referrer = await findOne<User>(
      'SELECT id, agent_id FROM users WHERE referral_code = $1',
      [data.referral_code]
    );

    if (referrer) {
      agent_id = referrer.agent_id;
    }
  }

  // 加密密码
  const password_hash = await bcrypt.hash(data.password, 10);

  // 加密安全码
  const security_code_hash = await bcrypt.hash(data.security_code, 10);

  // 生成推荐码
  const referral_code = uuidv4().substring(0, 8).toUpperCase();

  // 创建用户
  const result = await query(
    `INSERT INTO users (username, password_hash, security_code_hash, phone, email, referral_code, agent_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, username, phone, email, real_name, status, kyc_status, role_id, agent_id, referral_code, avatar, created_at`,
    [data.username, password_hash, security_code_hash, data.phone, data.email, referral_code, agent_id]
  );

  const user = result.rows[0];

  // 创建账户
  await query(
    `INSERT INTO accounts (user_id, account_number, balance, available_balance)
     VALUES ($1, $2, 0, 0)`,
    [user.id, `ACC${user.id}${Date.now()}`]
  );

  logger.info('User registered successfully:', { user_id: user.id, username: user.username });

  return user;
}

/**
 * 用户登录
 */
export async function login(data: LoginData): Promise<TokenResponse> {
  // 查找用户
  const user = await findOne<User>(
    `SELECT u.id, u.username, u.password_hash, u.phone, u.email, u.real_name, u.status, u.kyc_status,
            u.role_id, r.code as role, u.agent_id, u.referral_code, u.avatar, u.created_at
     FROM users u
     LEFT JOIN roles r ON u.role_id = r.id
     WHERE u.username = $1 OR u.phone = $2 OR u.email = $3`,
    [data.username, data.username, data.username]
  );

  if (!user) {
    throw new Error('User not found');
  }

  // 检查用户状态
  if (user.status !== 1) {
    throw new Error('User account is disabled or locked');
  }

  // 验证密码
  const isPasswordValid = await bcrypt.compare(data.password, user.password_hash!);

  if (!isPasswordValid) {
    throw new Error('Invalid password');
  }

  // 更新最后登录时间
  await query(
    `UPDATE users
     SET last_login_at = CURRENT_TIMESTAMP,
         last_login_ip = $1
     WHERE id = $2`,
    [data.ip_address, user.id]
  );

  // 生成 Token
  const payload: TokenPayload = {
    user_id: user.id,
    username: user.username,
    role_id: user.role_id,
  };

  const access_token = generateAccessToken(payload);
  const refresh_token = generateRefreshToken(payload);

  // 计算访问令牌过期时间（秒）
  const expires_in = 15 * 60; // 15分钟

  logger.info('User logged in successfully:', { user_id: user.id, username: user.username });

  return {
    access_token,
    refresh_token,
    expires_in,
    user,
  };
}

/**
 * 刷新令牌
 */
export async function refreshToken(refresh_token: string): Promise<TokenResponse> {
  const payload = verifyToken(refresh_token);

  if (!payload) {
    throw new Error('Invalid refresh token');
  }

  // 获取用户信息
  const user = await findOne<User>(
    `SELECT u.id, u.username, u.phone, u.email, u.real_name, u.status, u.kyc_status,
            u.role_id, r.code as role, u.agent_id, u.referral_code, u.avatar, u.created_at
     FROM users u
     LEFT JOIN roles r ON u.role_id = r.id
     WHERE u.id = $1`,
    [payload.user_id]
  );

  if (!user || user.status !== 1) {
    throw new Error('User not found or disabled');
  }

  // 生成新的 Token
  const newPayload: TokenPayload = {
    user_id: user.id,
    username: user.username,
    role_id: user.role_id,
  };

  const access_token = generateAccessToken(newPayload);
  const new_refresh_token = generateRefreshToken(newPayload);
  const expires_in = 15 * 60;

  return {
    access_token,
    refresh_token: new_refresh_token,
    expires_in,
    user,
  };
}

/**
 * 获取用户信息
 */
export async function getUserById(user_id: number): Promise<User | null> {
  return await findOne<User>(
    `SELECT u.id, u.username, u.phone, u.email, u.real_name, u.status, u.kyc_status,
            u.role_id, r.code as role, u.agent_id, u.referral_code, u.avatar, u.created_at
     FROM users u
     LEFT JOIN roles r ON u.role_id = r.id
     WHERE u.id = $1`,
    [user_id]
  );
}

/**
 * 修改密码
 */
export async function changePassword(
  user_id: number,
  old_password: string,
  new_password: string,
  security_code: string
): Promise<void> {
  // 获取用户当前密码与安全码
  const user = await findOne<{ password_hash: string; security_code_hash: string }>(
    'SELECT password_hash, security_code_hash FROM users WHERE id = $1',
    [user_id]
  );

  if (!user) {
    throw new Error('User not found');
  }

  // 验证旧密码
  const isPasswordValid = await bcrypt.compare(old_password, user.password_hash!);

  if (!isPasswordValid) {
    throw new Error('Invalid old password');
  }

  // 验证安全码
  const isSecurityCodeValid = await bcrypt.compare(security_code, user.security_code_hash!);
  if (!isSecurityCodeValid) {
    throw new Error('Invalid security code');
  }

  // 加密新密码
  const password_hash = await bcrypt.hash(new_password, 10);

  // 更新密码
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [password_hash, user_id]);

  logger.info('Password changed successfully:', { user_id });
}

/**
 * 重置密码
 */
export async function resetPassword(username: string, new_password: string): Promise<void> {
  // 加密新密码
  const password_hash = await bcrypt.hash(new_password, 10);

  // 更新密码
  const result = await query(
    'UPDATE users SET password_hash = $1 WHERE username = $2',
    [password_hash, username]
  );

  if (result.rowCount === 0) {
    throw new Error('User not found');
  }

  logger.info('Password reset successfully:', { username });
}

/**
 * 生成推荐码
 */
export function generateReferralCode(): string {
  return uuidv4().substring(0, 8).toUpperCase();
}
