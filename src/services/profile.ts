import { getToken, getUser } from './auth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers
    }
  });

  const result = await response.json();
  if (result.code !== 0) {
    throw new Error(result.message || '请求失败');
  }
  return result.data as T;
}

export async function updateProfile(params: { name: string; phone: string; email?: string; avatar?: string }) {
  const user = getUser();
  if (!user) throw new Error('未登录');
  return request(`/users/${user.id}`, {
    method: 'PATCH',
    body: JSON.stringify(params)
  });
}
