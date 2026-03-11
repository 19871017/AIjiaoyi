// ============================================
// 前端 API 服务
// ============================================

// 从环境变量读取API地址，默认localhost
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

// 统一请求封装
import { getToken } from './auth';

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

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(data.message || '请求失败');
  }

  return data.data;
}

// ============================================
// 账户 API
// ============================================

export const accountApi = {
  // 获取账户信息
  getInfo: () => request<{
    userId: string;
    totalBalance: number;
    availableBalance: number;
    frozenMargin: number;
    unrealizedPnl: number;
    realizedPnl: number;
    riskLevel: 'SAFE' | 'WARNING' | 'DANGER';
  }>('/account/info'),

  // 获取账户余额
  getBalance: () => request<{
    totalBalance: number;
    availableBalance: number;
    frozenMargin: number;
  }>('/account/balance'),

  // 获取风险等级
  getRiskLevel: () => request<{
    riskLevel: string;
    marginUsage: number;
    equity: number;
    unrealizedPnl: number;
  }>('/account/risk-level')
};

// ============================================
// 行情 API
// ============================================

export const marketApi = {
  // 获取行情
  getTicker: (product?: string) => request<any>(
    product ? `/market/ticker?product=${product}` : '/market/ticker'
  ),

  // 获取K线
  getKline: (product: string, period = '1h', limit = 100) => request<any>(
    `/market/kline?product=${product}&period=${period}&limit=${limit}`
  )
};

// ============================================
// 交易 API
// ============================================

export interface CreateOrderParams {
  productCode: string;
  type: 'MARKET' | 'LIMIT';
  direction: 'BUY' | 'SELL';
  quantity: number;
  price?: number;
  leverage: number;
  stopLoss?: number;
  takeProfit?: number;
}

export const orderApi = {
  // 创建订单
  create: (params: CreateOrderParams) => request<{
    orderId: string;
    status: string;
    filledPrice?: number;
    filledQuantity?: number;
    marginUsed: number;
    fee?: number;
    tradeId?: string;
  }>('/order/create', {
    method: 'POST',
    body: JSON.stringify(params)
  }),

  // 取消订单
  cancel: (orderId: string) => request<{ orderId: string }>('/order/cancel', {
    method: 'POST',
    body: JSON.stringify({ orderId })
  }),

  // 获取订单列表
  getList: (status?: string) => request<any[]>(
    status ? `/order/list?status=${status}` : '/order/list'
  ),

  // 获取订单详情
  getDetail: (orderId: string) => request<any>(`/order/detail?orderId=${orderId}`)
};

// ============================================
// 持仓 API
// ============================================

export const positionApi = {
  // 获取持仓列表
  getList: () => request<any[]>('/position/list'),

  // 平仓
  close: (positionId: string) => request<{
    positionId: string;
    closePrice: number;
    realizedPnl: number;
    marginReleased: number;
  }>('/position/close', {
    method: 'POST',
    body: JSON.stringify({ positionId })
  }),

  // 修改止盈止损
  updateSlTp: (positionId: string, stopLoss?: number, takeProfit?: number) => request<{
    positionId: string;
    stopLoss?: number;
    takeProfit?: number;
  }>('/position/update-sl-tp', {
    method: 'POST',
    body: JSON.stringify({ positionId, stopLoss, takeProfit })
  })
};

// ============================================
// 财务 API
// ============================================

export const financeApi = {
  // 创建充值申请
  createDeposit: (params: {
    amount: number;
    method: 'bank' | 'usdt' | 'alipay' | 'wechat';
    bankAccount?: string;
    bankName?: string;
    accountName?: string;
    usdtAddress?: string;
  }) => request<{
    id: string;
    amount: number;
    status: string;
    createdAt: string;
  }>('/finance/deposit', {
    method: 'POST',
    body: JSON.stringify(params)
  }),

  // 创建提现申请
  createWithdraw: (params: {
    amount: number;
    method: 'bank' | 'usdt' | 'alipay' | 'wechat';
    bankAccount?: string;
    bankName?: string;
    accountName?: string;
    usdtAddress?: string;
  }) => request<{
    id: string;
    amount: number;
    status: string;
    createdAt: string;
  }>('/finance/withdraw', {
    method: 'POST',
    body: JSON.stringify(params)
  }),

  // 获取财务记录列表
  getRecords: (params?: {
    type?: 'deposit' | 'withdraw';
    status?: 'pending' | 'completed' | 'rejected';
    page?: number;
    pageSize?: number;
  }) => request<{
    list: any[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>(`/finance/records${params ? '?' + new URLSearchParams(params as any).toString() : ''}`),

  // 获取财务记录详情
  getRecordDetail: (id: string) => request<any>(`/finance/records/${id}`)
};

// ============================================
// 风控 API
// ============================================

export const riskApi = {
  // 风险预览
  getPreview: (params: {
    productCode: string;
    price: number;
    quantity: number;
    leverage: number;
    direction: 'LONG' | 'SHORT';
  }) => request<{
    marginRequired: number;
    liquidationPrice: number;
    maxLoss: number;
  }>(`/risk/preview?productCode=${params.productCode}&price=${params.price}&quantity=${params.quantity}&leverage=${params.leverage}&direction=${params.direction}`),

  // 计算强平价
  getLiquidationPrice: (price: number, leverage: number, direction: 'LONG' | 'SHORT') => request<{
    liquidationPrice: number;
  }>(`/risk/liquidation-price?price=${price}&leverage=${leverage}&direction=${direction}`),

  // 强平记录
  getLiquidationRecords: () => request<any[]>('/risk/liquidation-records')
};

// 导出所有 API
export const api = {
  account: accountApi,
  market: marketApi,
  order: orderApi,
  position: positionApi,
  risk: riskApi,
  finance: financeApi
};

export default api;
