import express from 'express';
import bcrypt from 'bcryptjs';
import logger from '../utils/logger';
import { register as registerService, login as loginService, verifyToken, getUserById, changePassword as changePasswordService } from '../services/auth.service';
import { query, findOne } from '../config/database';

const router = express.Router();

// 登录失败次数记录（生产环境应使用Redis）
const loginAttempts = new Map<string, { count: number; lastAttempt: number; lockedUntil?: number }>();

// 验证码存储（生产环境应使用Redis）
const verificationCodes = new Map<string, { code: string; createdAt: number }>();

// 检查IP是否被锁定
function isIpLocked(ip: string): boolean {
  const attempt = loginAttempts.get(ip);
  if (!attempt) return false;

  if (attempt.lockedUntil && Date.now() < attempt.lockedUntil) {
    return true;
  }

  if (Date.now() - attempt.lastAttempt > 15 * 60 * 1000) {
    loginAttempts.delete(ip);
    return false;
  }

  return false;
}

function recordFailedAttempt(ip: string) {
  const attempt = loginAttempts.get(ip) || { count: 0, lastAttempt: 0 };
  attempt.count++;
  attempt.lastAttempt = Date.now();

  if (attempt.count >= 3) {
    attempt.lockedUntil = Date.now() + 15 * 60 * 1000;
    console.log(`[Auth] IP ${ip} 已被锁定15分钟`);
  }

  loginAttempts.set(ip, attempt);

  return {
    remainingAttempts: Math.max(0, 3 - attempt.count),
    lockedUntil: attempt.lockedUntil
  };
}

function clearLoginAttempts(ip: string) {
  loginAttempts.delete(ip);
}

// 用户登录
router.post('/login', async (req: express.Request, res: express.Response) => {
  try {
    const { username, password } = req.body;
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';

    if (!username || !password) {
      return res.json({
        code: 400,
        message: '用户名和密码不能为空',
        data: null,
        timestamp: Date.now()
      });
    }

    if (isIpLocked(clientIp)) {
      const attempt = loginAttempts.get(clientIp);
      const remainingTime = Math.ceil((attempt!.lockedUntil! - Date.now()) / 60000);
      return res.status(429).json({
        code: 429,
        message: `登录失败次数过多，请${remainingTime}分钟后再试`,
        data: { locked: true, remainingTime },
        timestamp: Date.now()
      });
    }

    try {
      const result = await loginService({
        username,
        password,
        ip_address: clientIp,
        user_agent: req.headers['user-agent'] || ''
      });

      clearLoginAttempts(clientIp);

      res.json({
        code: 0,
        message: '登录成功',
        data: {
          token: result.access_token,
          refresh_token: result.refresh_token,
          expires_in: result.expires_in,
          user: result.user
        },
        timestamp: Date.now()
      });
    } catch (error: any) {
      const attempt = recordFailedAttempt(clientIp);
      return res.status(401).json({
        code: 401,
        message: error.message || '用户名或密码错误',
        data: { remainingAttempts: attempt.remainingAttempts },
        timestamp: Date.now()
      });
    }
  } catch (error: any) {
    console.error('[Auth] 登录错误:', error);
    res.json({
      code: 500,
      message: '服务器内部错误',
      data: null,
      timestamp: Date.now()
    });
  }
});

// 用户注册
router.post('/register', async (req: express.Request, res: express.Response) => {
  try {
    const { username, password, securityCode, phone, email, agentCode } = req.body;

    if (!username || !password || !securityCode) {
      return res.json({
        code: 400,
        message: '用户名、密码和安全码不能为空',
        data: null,
        timestamp: Date.now()
      });
    }

    if (username.length < 3) {
      return res.json({
        code: 400,
        message: '用户名至少3个字符',
        data: null,
        timestamp: Date.now()
      });
    }

    if (password.length < 6) {
      return res.json({
        code: 400,
        message: '密码至少6个字符',
        data: null,
        timestamp: Date.now()
      });
    }

    if (securityCode.length < 4) {
      return res.json({
        code: 400,
        message: '安全码至少4位',
        data: null,
        timestamp: Date.now()
      });
    }

    const user = await registerService({
      username,
      password,
      security_code: securityCode,
      phone,
      email,
      referral_code: agentCode
    });

    res.json({
      code: 0,
      message: '注册成功',
      data: {
        id: user.id,
        username: user.username
      },
      timestamp: Date.now()
    });
  } catch (error: any) {
    console.error('[Auth] 注册错误:', error);
    res.json({
      code: 500,
      message: error.message || '服务器内部错误',
      data: null,
      timestamp: Date.now()
    });
  }
});

// 修改密码（需旧密码+安全码）
router.post('/change-password', async (req: express.Request, res: express.Response) => {
  try {
    const { username, oldPassword, newPassword, securityCode } = req.body;

    if (!username || !oldPassword || !newPassword || !securityCode) {
      return res.json({
        code: 400,
        message: '参数不能为空',
        data: null,
        timestamp: Date.now()
      });
    }

    const user = await findOne<{ id: number }>(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );

    if (!user) {
      return res.json({
        code: 404,
        message: '用户不存在',
        data: null,
        timestamp: Date.now()
      });
    }

    await changePasswordService(user.id, oldPassword, newPassword, securityCode);

    res.json({
      code: 0,
      message: '密码修改成功',
      data: null,
      timestamp: Date.now()
    });
  } catch (error: any) {
    console.error('[Auth] 修改密码错误:', error);
    res.json({
      code: 500,
      message: error.message || '服务器内部错误',
      data: null,
      timestamp: Date.now()
    });
  }
});

// 获取当前用户信息
router.get('/me', async (req: express.Request, res: express.Response) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.json({
        code: 401,
        message: '未授权',
        data: null,
        timestamp: Date.now()
      });
    }

    const payload = verifyToken(token);

    if (!payload) {
      return res.json({
        code: 401,
        message: 'Token无效或已过期',
        data: null,
        timestamp: Date.now()
      });
    }

    const user = await getUserById(payload.user_id);

    if (!user) {
      return res.json({
        code: 404,
        message: '用户不存在',
        data: null,
        timestamp: Date.now()
      });
    }

    res.json({
      code: 0,
      message: '获取成功',
      data: user,
      timestamp: Date.now()
    });
  } catch (error: any) {
    console.error('[Auth] 获取用户信息错误:', error);
    res.json({
      code: 500,
      message: '服务器内部错误',
      data: null,
      timestamp: Date.now()
    });
  }
});

// 登出
router.post('/logout', (req: express.Request, res: express.Response) => {
  res.json({
    code: 0,
    message: '退出成功',
    data: null,
    timestamp: Date.now()
  });
});

// 验证Token
router.post('/verify', (req: express.Request, res: express.Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.json({
        code: 400,
        message: 'Token不能为空',
        data: null,
        timestamp: Date.now()
      });
    }

    const decoded = verifyToken(token);

    if (!decoded) {
      return res.json({
        code: 401,
        message: 'Token无效或已过期',
        data: null,
        timestamp: Date.now()
      });
    }

    res.json({
      code: 0,
      message: 'Token有效',
      data: decoded,
      timestamp: Date.now()
    });
  } catch (error: any) {
    res.json({
      code: 401,
      message: 'Token无效或已过期',
      data: null,
      timestamp: Date.now()
    });
  }
});

// 发送邮箱验证码
router.post('/send-code', (req: express.Request, res: express.Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.json({
        code: 400,
        message: '邮箱不能为空',
        data: null,
        timestamp: Date.now()
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.json({
        code: 400,
        message: '邮箱格式不正确',
        data: null,
        timestamp: Date.now()
      });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    verificationCodes.set(email, {
      code,
      createdAt: Date.now()
    });

    console.log(`[Auth] 验证码已发送到 ${email}: ${code}`);

    res.json({
      code: 0,
      message: '验证码已发送',
      data: { email, expiresIn: 300 },
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('[Auth] 发送验证码失败:', error);
    res.json({
      code: 500,
      message: '发送验证码失败',
      data: null,
      timestamp: Date.now()
    });
  }
});

// 重置密码（邮箱验证码）
router.post('/reset-password', async (req: express.Request, res: express.Response) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.json({
        code: 400,
        message: '邮箱、验证码和新密码不能为空',
        data: null,
        timestamp: Date.now()
      });
    }

    const storedCode = verificationCodes.get(email);

    if (!storedCode) {
      return res.json({
        code: 400,
        message: '验证码已过期或不存在',
        data: null,
        timestamp: Date.now()
      });
    }

    const codeAge = Date.now() - storedCode.createdAt;
    if (codeAge > 5 * 60 * 1000) {
      verificationCodes.delete(email);
      return res.json({
        code: 400,
        message: '验证码已过期',
        data: null,
        timestamp: Date.now()
      });
    }

    if (storedCode.code !== code) {
      return res.json({
        code: 400,
        message: '验证码不正确',
        data: null,
        timestamp: Date.now()
      });
    }

    const user = await findOne<{ id: number }>(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (!user) {
      return res.json({
        code: 404,
        message: '用户不存在',
        data: null,
        timestamp: Date.now()
      });
    }

    const password_hash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [password_hash, user.id]);

    verificationCodes.delete(email);

    res.json({
      code: 0,
      message: '密码重置成功',
      data: null,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('[Auth] 重置密码失败:', error);
    res.json({
      code: 500,
      message: '重置密码失败',
      data: null,
      timestamp: Date.now()
    });
  }
});

export default router;
