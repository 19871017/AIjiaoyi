import { getToken, getUser } from './auth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  const result = await response.json();

  if (result.code !== 0) {
    throw new Error(result.message || '请求失败');
  }

  return result.data as T;
}

export async function getAccountInfo() {
  const user = getUser();
  if (!user) throw new Error('未登录');
  const userId = Number(user.id);
  return request<any>(`/finance/account?userId=${userId}`);
}

export async function getFinanceRecords(params: {
  type?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const user = getUser();
  if (!user) throw new Error('未登录');
  const userId = Number(user.id);
  const query = new URLSearchParams({
    userId: String(userId),
    ...(params.type ? { type: params.type } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.page ? { page: String(params.page) } : {}),
    ...(params.pageSize ? { pageSize: String(params.pageSize) } : {}),
  }).toString();
  return request<any>(`/finance/records?${query}`);
}

export async function createDeposit(params: {
  amount: number;
  method: string;
  bankAccount?: string;
  bankName?: string;
  accountName?: string;
  usdtAddress?: string;
}) {
  const user = getUser();
  if (!user) throw new Error('未登录');
  const userId = Number(user.id);
  return request<any>('/finance/deposit', {
    method: 'POST',
    body: JSON.stringify({ userId, ...params }),
  });
}

export async function createWithdraw(params: {
  amount: number;
  method: string;
  bankAccount?: string;
  bankName?: string;
  accountName?: string;
  usdtAddress?: string;
  securityCode: string;
}) {
  const user = getUser();
  if (!user) throw new Error('未登录');
  const userId = Number(user.id);
  return request<any>('/finance/withdraw', {
    method: 'POST',
    body: JSON.stringify({ userId, ...params }),
  });
}
