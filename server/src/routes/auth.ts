import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';

const router = express.Router();

// JWT密钥强度验证
const JWT_SECRET = process.env.JWT_SECRET || 'precious-metals-trading-secret-key-2024-secure-32chars';

if (JWT_SECRET.length < 32) {
  logger.warn('JWT_SECRET is too short (less than 32 characters). Please use a stronger secret key for production.');
}

// 登录失败次数记录（生产环境应使用Redis）
const loginAttempts = new Map<string, { count: number; lastAttempt: number; lockedUntil?: number }>();

// 模拟用户数据库（生产环境应使用PostgreSQL）
const users = new Map<string, any>();

// 验证码存储（生产环境应使用Redis）
const verificationCodes = new Map<string, { code: string; createdAt: number }>();

// 创建测试管理员账号
const initUsers = () => {
  if (users.size === 0) {
    const adminPassword = bcrypt.hashSync('admin123', 10);
    const adminSecurityCode = bcrypt.hashSync('1234', 10);
    users.set('admin', {
      id: 'admin-001',
      username: 'admin',
      password: adminPassword,
      securityCode: adminSecurityCode,
      role: 'ADMIN',
      realName: '系统管理员',
      phone: '13800000000',
      email: 'admin@example.com',
      createdAt: new Date().toISOString()
    });

    const userPassword = bcrypt.hashSync('user123', 10);
    const userSecurityCode = bcrypt.hashSync('1234', 10);
    users.set('user', {
      id: 'user-001',
      username: 'user',
      password: userPassword,
      securityCode: userSecurityCode,
      role: 'USER',
      realName: '测试用户',
      phone: '13900000000',
      email: 'user@example.com',
      createdAt: new Date().toISOString()
    });

    // 测试账号已静默初始化，生产环境应使用真实数据库
  }
};

// 初始化用户
initUsers();

// 检查IP是否被锁定
function isIpLocked(ip: string): boolean {
  const attempt = loginAttempts.get(ip);
  if (!attempt) return false;

  // 检查是否在锁定时间内
  if (attempt.lockedUntil && Date.now() < attempt.lockedUntil) {
    return true;
  }

  // 超过15分钟，重置计数
  if (Date.now() - attempt.lastAttempt > 15 * 60 * 1000) {
    loginAttempts.delete(ip);
    return false;
  }

  return false;
}

// 记录登录失败
function recordFailedAttempt(ip: string) {
  const attempt = loginAttempts.get(ip) || { count: 0, lastAttempt: 0 };

  attempt.count++;
  attempt.lastAttempt = Date.now();

  // 失败3次锁定15分钟
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

// 清除登录失败记录
function clearLoginAttempts(ip: string) {
  loginAttempts.delete(ip);
}

// 用户登录
router.post('/login', async (req: express.Request, res: express.Response) => {
  try {
    const { username, password } = req.body;

    // 获取客户端IP
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';

    if (!username || !password) {
      return res.json({
        code: 400,
        message: '用户名、密码和安全码不能为空',
        data: null,
        timestamp: Date.now()
      });
    }

    // 检查IP是否被锁定
    if (isIpLocked(clientIp)) {
      const attempt = loginAttempts.get(clientIp);
      const remainingTime = Math.ceil((attempt!.lockedUntil! - Date.now()) / 60000);
      return res.status(429).json({
        code: 429,
        message: `登录失败次数过多，请${remainingTime}分钟后再试`,
        data: {
          locked: true,
          remainingTime
        },
        timestamp: Date.now()
      });
    }

    const user = users.get(username);

    if (!user) {
      const attempt = recordFailedAttempt(clientIp);
      return res.status(401).json({
        code: 401,
        message: '用户名或密码错误',
        data: {
          remainingAttempts: attempt.remainingAttempts
        },
        timestamp: Date.now()
      });
    }

    // 验证密码
    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      const attempt = recordFailedAttempt(clientIp);
      return res.status(401).json({
        code: 401,
        message: '用户名或密码错误',
        data: {
          remainingAttempts: attempt.remainingAttempts
        },
        timestamp: Date.now()
      });
    }

    // 清除登录失败记录
    clearLoginAttempts(clientIp);

    // 生成JWT Token
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // 更新最后登录时间和IP
    user.lastLoginAt = new Date().toISOString();
    user.lastLoginIp = clientIp;
    users.set(username, user);

    console.log(`[Auth] 用户登录成功: ${username} from ${clientIp}`);

    res.json({
      code: 0,
      message: '登录成功',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          realName: user.realName,
          phone: user.phone,
          email: user.email
        }
      },
      timestamp: Date.now()
    });
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

    // 检查用户名是否已存在
    if (users.has(username)) {
      return res.json({
        code: 400,
        message: '用户名已存在',
        data: null,
        timestamp: Date.now()
      });
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);
    const hashedSecurityCode = await bcrypt.hash(securityCode, 10);

    // 创建用户
    const newUser = {
      id: uuidv4(),
      username,
      password: hashedPassword,
      securityCode: hashedSecurityCode,
      phone: phone || '',
      email: email || '',
      agentCode: agentCode || '',
      role: 'USER',
      realName: '',
      createdAt: new Date().toISOString()
    };

    users.set(username, newUser);

    console.log(`[Auth] 新用户注册: ${username}`);

    res.json({
      code: 0,
      message: '注册成功',
      data: {
        id: newUser.id,
        username: newUser.username
      },
      timestamp: Date.now()
    });
  } catch (error: any) {
    console.error('[Auth] 注册错误:', error);
    res.json({
      code: 500,
      message: '服务器内部错误',
      data: null,
      timestamp: Date.now()
    });
  }
});

// 获取当前用户信息
router.get('/me', (req: express.Request, res: express.Response) => {
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

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const user = users.get(decoded.username);

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
      data: {
        id: user.id,
        username: user.username,
        role: user.role,
        realName: user.realName,
        phone: user.phone,
        email: user.email,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt
      },
      timestamp: Date.now()
    });
  } catch (error: any) {
    console.error('[Auth] 获取用户信息错误:', error);
    res.json({
      code: 401,
      message: 'Token无效或已过期',
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

    const decoded = jwt.verify(token, JWT_SECRET) as any;

    res.json({
      code: 0,
      message: 'Token有效',
      data: {
        userId: decoded.userId,
        username: decoded.username,
        role: decoded.role,
        exp: decoded.exp
      },
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

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.json({
        code: 400,
        message: '邮箱格式不正确',
        data: null,
        timestamp: Date.now()
      });
    }

    // 生成6位验证码
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // 存储验证码（5分钟有效期）
    verificationCodes.set(email, {
      code,
      createdAt: Date.now()
    });

    // 生产环境应该发送实际邮件
    console.log(`[Auth] 验证码已发送到 ${email}: ${code}`);

    res.json({
      code: 0,
      message: '验证码已发送',
      data: {
        email,
        expiresIn: 300 // 5分钟，单位：秒
      },
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

    const user = users.get(username);

    if (!user) {
      return res.json({
        code: 404,
        message: '用户不存在',
        data: null,
        timestamp: Date.now()
      });
    }

    const isOldValid = await bcrypt.compare(oldPassword, user.password);
    if (!isOldValid) {
      return res.json({
        code: 400,
        message: '旧密码错误',
        data: null,
        timestamp: Date.now()
      });
    }

    const isSecurityValid = await bcrypt.compare(securityCode, user.securityCode || '');
    if (!isSecurityValid) {
      return res.json({
        code: 400,
        message: '安全码错误',
        data: null,
        timestamp: Date.now()
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    users.set(username, user);

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
      message: '服务器内部错误',
      data: null,
      timestamp: Date.now()
    });
  }
});

// 重置密码
router.post('/reset-password', (req: express.Request, res: express.Response) => {
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

    // 验证验证码
    const storedCode = verificationCodes.get(email);

    if (!storedCode) {
      return res.json({
        code: 400,
        message: '验证码已过期或不存在',
        data: null,
        timestamp: Date.now()
      });
    }

    // 检查验证码是否过期（5分钟）
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

    // 验证验证码是否正确
    if (storedCode.code !== code) {
      return res.json({
        code: 400,
        message: '验证码不正确',
        data: null,
        timestamp: Date.now()
      });
    }

    // 查找用户
    const user = Array.from(users.values()).find((u: any) => u.email === email);

    if (!user) {
      return res.json({
        code: 404,
        message: '用户不存在',
        data: null,
        timestamp: Date.now()
      });
    }

    // 更新密码
    user.password = bcrypt.hashSync(newPassword, 10);
    users.set(user.username, user);

    // 删除验证码
    verificationCodes.delete(email);

    console.log(`[Auth] 用户 ${email} 密码重置成功`);

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

// 获取所有用户（已删除 - 安全风险：需要管理员权限认证）
// router.get('/users', (req: express.Request, res: express.Response) => {
//   const userList = Array.from(users.values()).map((user: any) => ({
//     id: user.id,
//     username: user.username,
//     role: user.role,
//     realName: user.realName,
//     phone: user.phone,
//     email: user.email,
//     createdAt: user.createdAt,
//     lastLoginAt: user.lastLoginAt
//   }));
//
//   res.json({
//     code: 0,
//     message: '获取成功',
//     data: userList,
//     timestamp: Date.now()
//   });
// });

export default router;

