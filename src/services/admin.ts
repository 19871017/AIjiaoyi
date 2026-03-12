// 后台管理API服务

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

// 获取token
const getToken = (): string | null => {
  return localStorage.getItem('token');
};

// 统一请求封装
async function adminRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getToken();

  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options?.headers
    }
  });

  const result = await response.json();

  if (result.code !== 0) {
    throw new Error(result.message || '请求失败');
  }

  return result.data;
}

// 仪表盘API
export const dashboardApi = {
  // 获取统计数据
  getStats: () => adminRequest<any>('/admin/dashboard/stats'),

  // 获取待处理事项
  getPending: () => adminRequest<any>('/admin/dashboard/pending'),

  // 获取系统状态
  getSystemStatus: () => adminRequest<any>('/admin/dashboard/status')
};

// 用户管理API
export const userApi = {
  // 获取用户列表
  getList: (params?: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    status?: string;
    level?: number;
  }) => adminRequest<{
    list: any[];
    total: number;
    page: number;
    pageSize: number;
  }>(`/admin/users?page=${params?.page || 1}&pageSize=${params?.pageSize || 20}${params?.status ? `&status=${params.status}` : ''}${params?.keyword ? `&keyword=${params.keyword}` : ''}`),

  // 获取用户详情
  getDetail: (userId: string) => adminRequest<any>(`/admin/users/${userId}`),

  // 创建用户
  create: (data: any) => adminRequest<any>('/admin/users', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  // 更新用户
  update: (userId: string, data: any) => adminRequest<any>(`/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  }),

  // KYC审核
  reviewKyc: (userId: number, approved: boolean) => adminRequest<any>(`/admin/users/${userId}/kyc`, {
    method: 'POST',
    body: JSON.stringify({ approved })
  }),

  // 删除用户
  delete: (userId: string) => adminRequest<void>(`/admin/users/${userId}`, {
    method: 'DELETE'
  }),

  // 禁用/启用用户
  updateStatus: (userId: string, status: number) => adminRequest<void>(`/admin/users/${userId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  })
};

// 订单管理API
export const orderApi = {
  // 获取订单列表
  getList: (params?: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    status?: string;
    symbol?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    const query = new URLSearchParams(params as any).toString();
    return adminRequest<{
      list: any[];
      total: number;
      page: number;
      pageSize: number;
    }>(`/admin/orders${query ? '?' + query : ''}`);
  },

  // 获取订单详情
  getDetail: (orderId: string) => adminRequest<any>(`/admin/orders/${orderId}`),

  // 平仓订单
  close: (orderId: string) => adminRequest<void>(`/admin/orders/${orderId}/close`, {
    method: 'POST'
  })
};

// 持仓管理API
export const positionApi = {
  // 获取持仓列表
  getList: (params?: {
    page?: number;
    pageSize?: number;
    userId?: string;
    symbol?: string;
  }) => {
    const query = new URLSearchParams(params as any).toString();
    return adminRequest<{
      list: any[];
      total: number;
      page: number;
      pageSize: number;
    }>(`/admin/positions${query ? '?' + query : ''}`);
  },

  // 获取持仓详情
  getDetail: (positionId: string) => adminRequest<any>(`/admin/positions/${positionId}`)
};

// 财务管理API
export const financeApi = {
  // 获取财务记录列表
  getList: (params?: {
    page?: number;
    pageSize?: number;
    type?: string;
    status?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    const query = new URLSearchParams(params as any).toString();
    return adminRequest<{
      list: any[];
      total: number;
      page: number;
      pageSize: number;
    }>(`/admin/finance${query ? '?' + query : ''}`);
  },

  // 审核充值
  approveDeposit: (transactionId: string) => adminRequest<void>(`/admin/finance/deposit/${transactionId}/approve`, {
    method: 'POST'
  }),

  // 拒绝充值
  rejectDeposit: (transactionId: string, reason?: string) => adminRequest<void>(`/admin/finance/deposit/${transactionId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason })
  }),

  // 审核提现
  approveWithdraw: (transactionId: string) => adminRequest<void>(`/admin/finance/withdraw/${transactionId}/approve`, {
    method: 'POST'
  }),

  // 拒绝提现
  rejectWithdraw: (transactionId: string, reason?: string) => adminRequest<void>(`/admin/finance/withdraw/${transactionId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason })
  })
};

// 代理管理API
export const agentApi = {
  // 获取代理列表
  getList: (params?: {
    page?: number;
    pageSize?: number;
    level?: number;
    status?: string;
  }) => {
    const query = new URLSearchParams(params as any).toString();
    return adminRequest<{
      list: any[];
      total: number;
      page: number;
      pageSize: number;
    }>(`/admin/agents${query ? '?' + query : ''}`);
  },

  // 创建代理
  create: (data: any) => adminRequest<any>('/admin/agents', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  // 更新代理
  update: (agentId: string, data: any) => adminRequest<any>(`/admin/agents/${agentId}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),

  // 获取代理业绩
  getPerformance: (agentId: string) => adminRequest<any>(`/admin/agents/${agentId}/performance`)
};

// 产品管理API
export const productApi = {
  // 获取产品列表
  getList: (params?: {
    status?: string;
    category?: string;
  }) => adminRequest<any[]>('/products'),

  // 获取产品详情
  getDetail: (productId: number) => adminRequest<any>(`/products/${productId}`),

  // 创建产品
  create: (data: any) => adminRequest<any>('/products', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  // 更新产品
  update: (productId: number, data: any) => adminRequest<any>(`/products/${productId}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),

  // 删除产品
  delete: (productId: number) => adminRequest<void>(`/products/${productId}`, {
    method: 'DELETE'
  })
};

// 分佣管理API
export const commissionApi = {
  // 获取分佣记录列表
  getRecords: (params?: {
    agentId?: number;
    userId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    pageSize?: number;
  }) => adminRequest<{
    records: any[];
    pagination: {
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    };
  }>('/commission/records', {
    method: 'GET'
  }),

  // 获取分佣统计
  getStats: (params?: {
    agentId?: number;
    period?: 'today' | 'week' | 'month';
  }) => adminRequest<any>('/commission/stats'),

  // 生成分佣记录
  generate: (data: {
    startDate: string;
    endDate: string;
    agentId?: number;
  }) => adminRequest<any>('/commission/generate', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  // 获取代理分佣配置
  getConfig: (agentId: number) => adminRequest<any>(`/commission/config/${agentId}`),

  // 更新代理分佣配置
  updateConfig: (agentId: number, data: {
    commissionRate: number;
    settlementPeriod: string;
    minWithdraw: number;
  }) => adminRequest<void>(`/commission/config/${agentId}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),

  // 处理代理提现申请
  withdraw: (data: {
    agentId: number;
    amount: number;
    bankAccount: string;
    bankName: string;
  }) => adminRequest<any>('/commission/withdraw', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  // 审核提现申请
  approveWithdraw: (withdrawId: number) => adminRequest<void>(`/commission/withdraw/${withdrawId}/approve`, {
    method: 'PUT'
  })
};

// 系统设置API
export const settingsApi = {
  // 获取系统设置
  get: () => adminRequest<any>('/admin/settings'),

  // 更新系统设置
  update: (settings: any) => adminRequest<void>('/admin/settings', {
    method: 'PUT',
    body: JSON.stringify(settings)
  }),

  // 获取产品列表
  getProducts: () => adminRequest<any[]>('/admin/settings/products'),

  // 更新产品配置
  updateProduct: (productId: string, config: any) => adminRequest<void>(`/admin/settings/products/${productId}`, {
    method: 'PATCH',
    body: JSON.stringify(config)
  })
};

// 手续费设置API
export const feesApi = {
  // 获取手续费设置
  get: () => adminRequest<any>('/admin/fees'),

  // 更新手续费设置
  update: (fees: any) => adminRequest<void>('/admin/fees', {
    method: 'PUT',
    body: JSON.stringify(fees)
  }),

  // 初始化手续费配置
  init: () => adminRequest<void>('/admin/fees/init', {
    method: 'POST'
  })
};

// 导出所有API
export const riskApi = {
  getOverview: () => adminRequest<any>('/admin/risk/overview'),
  getPositions: (params?: { page?: number; pageSize?: number }) => {
    const query = new URLSearchParams(params as any).toString();
    return adminRequest<any[]>(`/admin/risk/positions${query ? '?' + query : ''}`);
  },
  forceClose: (data: { positionId: number; reason?: string }) => adminRequest<void>('/admin/risk/force-close', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getSettings: () => adminRequest<any>('/admin/risk/settings'),
  updateSettings: (settings: any) => adminRequest<void>('/admin/risk/settings', {
    method: 'PUT',
    body: JSON.stringify(settings)
  })
};

export const adminApi = {
  dashboard: dashboardApi,
  user: userApi,
  order: orderApi,
  position: positionApi,
  finance: financeApi,
  agent: agentApi,
  settings: settingsApi,
  product: productApi,
  commission: commissionApi,
  fees: feesApi,
  risk: riskApi
};

export default adminApi;
