// 前端认证服务

// 从环境变量读取API地址，默认localhost
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export interface UserInfo {
  id: string;
  username: string;
  role: string;
  realName: string;
  phone: string;
  email: string;
}

export interface LoginResponse {
  token: string;
  user: UserInfo;
}

export interface RegisterResponse {
  id: string;
  username: string;
}

// 登录API
export async function login(username: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, password })
  });

  const result = await response.json();

  if (result.code !== 0) {
    throw new Error(result.message || '登录失败');
  }

  // 保存token到localStorage
  localStorage.setItem('token', result.data.token);
  localStorage.setItem('user', JSON.stringify(result.data.user));

  return result.data;
}

// 注册API
export async function register(params: {
  username: string;
  password: string;
  securityCode: string;
  phone?: string;
  email?: string;
  agentCode?: string;
}): Promise<RegisterResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  });

  const result = await response.json();

  if (result.code !== 0) {
    throw new Error(result.message || '注册失败');
  }

  return result.data;
}

// 修改密码（旧密码 + 安全码）
export async function changePassword(params: {
  username: string;
  oldPassword: string;
  newPassword: string;
  securityCode: string;
}): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  });

  const result = await response.json();

  if (result.code !== 0) {
    throw new Error(result.message || '修改密码失败');
  }
}

// 获取当前用户
export async function getCurrentUser(): Promise<UserInfo> {
  const token = localStorage.getItem('token');

  if (!token) {
    throw new Error('未登录');
  }

  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const result = await response.json();

  if (result.code !== 0) {
    throw new Error(result.message || '获取用户信息失败');
  }

  return result.data;
}

// 登出
export function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

// 获取token
export function getToken(): string | null {
  return localStorage.getItem('token');
}

// 检查是否登录
export function isLoggedIn(): boolean {
  return !!localStorage.getItem('token');
}

// 获取用户信息
export function getUser(): UserInfo | null {
  const userStr = localStorage.getItem('user');
  return userStr ? JSON.parse(userStr) : null;
}

// 检查是否是管理员
export function isAdmin(): boolean {
  const user = getUser();
  return user?.role === 'ADMIN';
}

// 验证Token
export async function verifyToken(token: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/auth/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ token })
  });

  const result = await response.json();

  if (result.code !== 0) {
    throw new Error(result.message || 'Token验证失败');
  }

  return result.data;
}

// 发送邮箱验证码
export async function sendVerificationCode(email: string): Promise<{ email: string; expiresIn: number }> {
  const response = await fetch(`${API_BASE_URL}/auth/send-code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email })
  });

  const result = await response.json();

  if (result.code !== 0) {
    throw new Error(result.message || '发送验证码失败');
  }

  return result.data;
}

// 重置密码
export async function resetPassword(params: {
  email: string;
  code: string;
  newPassword: string;
}): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  });

  const result = await response.json();

  if (result.code !== 0) {
    throw new Error(result.message || '重置密码失败');
  }
}

export default {
  login,
  register,
  getCurrentUser,
  logout,
  getToken,
  isLoggedIn,
  getUser,
  isAdmin,
  verifyToken,
  sendVerificationCode,
  resetPassword
};
