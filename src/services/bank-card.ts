import { getToken } from './auth';

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

export function listBankCards() {
  return request<any[]>('/bank-cards');
}

export function addBankCard(params: { bankName: string; cardNumber: string; holderName: string }) {
  return request<any>('/bank-cards', {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

export function setDefaultBankCard(id: number) {
  return request<void>(`/bank-cards/${id}/default`, { method: 'PATCH' });
}

export function deleteBankCard(id: number) {
  return request<void>(`/bank-cards/${id}`, { method: 'DELETE' });
}
