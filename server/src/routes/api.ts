import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { // core managers (simulation only), // core managers (simulation only) } from '../core/// core managers (simulation only)';
import { // core managers (simulation only) } from '../core/// core managers (simulation only)';
import { MarketDataService } from '../services/MarketDataService';
import { OrderType, OrderDirection, OrderStatus, ApiResponse, CreateOrderRequest, UpdateSlTpRequest } from '../types';
import { Calculator } from '../utils/calculator';
import { orderLock, marginLock } from '../utils/lock';
import logger from '../utils/logger';
import { ErrorCode, createErrorResponse, createSuccessResponse } from '../utils/error-codes';

// JWT密钥
const JWT_SECRET = process.env.JWT_SECRET;

// ============================================
// API 路由
// ============================================

export function createApiRouter(
  // core managers (simulation only): // core managers (simulation only),
  // core managers (simulation only): // core managers (simulation only),
  // core managers (simulation only): // core managers (simulation only),
  marketService: MarketDataService
): Router {
  const router = Router();

  // 辅助函数：统一响应格式
  const success = <T>(data: T, message: string = 'success'): ApiResponse<T> => ({
    code: 0,
    message,
    data,
    timestamp: Date.now()
  });

  /**
   * JWT认证中间件
   * 验证用户身份
   */
  const authenticateUser = (req: any, res: any, next: any) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json(createErrorResponse(ErrorCode.TOKEN_MISSING));
      }

      const token = authHeader.substring(7);

      if (!JWT_SECRET) {
        logger.error('[API] JWT_SECRET未配置');
        return res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_ERROR, '服务器配置错误'));
      }

      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        req.userId = decoded.userId || decoded.id;
        req.user = decoded;
        next();
      } catch (jwtError) {
        const errorMessage = jwtError instanceof Error ? jwtError.message : '验证失败';
        logger.warn(`[API] JWT验证失败: ${errorMessage}`);
        const isExpired = (jwtError as any).name === 'TokenExpiredError';
        return res.status(401).json(
          createErrorResponse(isExpired ? ErrorCode.TOKEN_EXPIRED : ErrorCode.TOKEN_INVALID)
        );
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '认证失败';
      logger.error('[API] 认证中间件错误:', errorMessage);
      return res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_ERROR, errorMessage));
    }
  };

  // ============================================
  // 账户类 API
  // ============================================

  // GET /api/account/info - 获取账户信息
  router.get('/account/info', authenticateUser, (req: any, res: any) => {
    const userId = req.userId;
    const account = // core managers (simulation only).getAccount(userId);

    if (!account) {
      return res.status(404).json(createErrorResponse(ErrorCode.RESOURCE_NOT_FOUND, '账户不存在'));
    }

    res.json(success({
      userId: account.userId,
      totalBalance: account.totalBalance,
      availableBalance: account.availableBalance,
      frozenMargin: account.frozenMargin,
      unrealizedPnl: account.unrealizedPnl,
      realizedPnl: account.realizedPnl,
      riskLevel: account.riskLevel
    }));
  });

  // GET /api/account/balance - 获取账户余额
  router.get('/account/balance', (req, res) => {
    const userId = req.headers['user-id'] as string || 'demo-user';
    const account = // core managers (simulation only).getAccount(userId);

    if (!account) {
      return res.status(404).json(createErrorResponse(ErrorCode.RESOURCE_NOT_FOUND, '账户不存在'));
    }

    res.json(success({
      totalBalance: account.totalBalance,
      availableBalance: account.availableBalance,
      frozenMargin: account.frozenMargin
    }));
  });

  // GET /api/account/risk-level - 获取账户风险等级
  router.get('/api/account/risk-level', (req, res) => {
    const userId = req.headers['user-id'] as string || 'demo-user';
    const preview = // core managers (simulation only).getRiskPreview(userId);

    if (!preview) {
      return res.status(404).json(createErrorResponse(ErrorCode.RESOURCE_NOT_FOUND, '账户不存在'));
    }

    res.json(success({
      riskLevel: preview.riskLevel,
      marginUsage: preview.marginUsage,
      equity: preview.equity,
      unrealizedPnl: preview.unrealizedPnl
    }));
  });

  // ============================================
  // 行情类 API
  // ============================================

  // GET /api/market/ticker - 获取行情
  router.get('/market/ticker', (req, res) => {
    const { product } = req.query;

    if (product) {
      const data = marketService.getMarketData(product as string);
      if (!data) {
        return res.status(404).json(createErrorResponse(ErrorCode.RESOURCE_NOT_FOUND, '产品不存在'));
      }
      return res.json(success(data));
    }

    // 返回所有行情
    const allData = marketService.getAllMarketData();
    res.json(success(allData));
  });

  // GET /api/market/kline - 获取K线数据
  router.get('/market/kline', (req, res) => {
    const { product, period = '1h', limit = '100' } = req.query;
    const productCode = product as string || 'XAUUSD';
    const count = Math.min(parseInt(limit as string) || 100, 500); // 最多返回500条

    // 获取产品基础价格
    const marketData = marketService.getMarketData(productCode);
    const basePrice = marketData?.lastPrice || 2345;

    // 根据周期计算时间间隔
    const periodMs = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
      '1w': 7 * 24 * 60 * 60 * 1000
    }[period as string] || 60 * 60 * 1000;

    // 生成K线数据
    const klineData = {
      productCode,
      period: period as string,
      data: Array.from({ length: count }, (_, i) => {
        const time = Date.now() - (count - 1 - i) * periodMs;
        const timeIso = new Date(time).toISOString();

        // 模拟价格波动（基于布朗运动）
        const volatility = basePrice * 0.002; // 0.2%波动率
        const trend = Math.sin(i / 20) * volatility * 2; // 添加趋势

        const open = basePrice + (Math.random() - 0.5) * volatility + trend;
        const change = (Math.random() - 0.5) * volatility;
        const close = open + change;
        const high = Math.max(open, close) + Math.random() * volatility * 0.5;
        const low = Math.min(open, close) - Math.random() * volatility * 0.5;

        // 成交量随机生成
        const baseVolume = 1000;
        const volume = Math.floor(baseVolume + Math.random() * 5000);

        return {
          time: timeIso,
          timestamp: time,
          open: Number(open.toFixed(2)),
          high: Number(high.toFixed(2)),
          low: Number(low.toFixed(2)),
          close: Number(close.toFixed(2)),
          volume
        };
      })
    };

    res.json(success(klineData));
  });

  // ============================================
  // 交易类 API
  // ============================================

  // POST /api/order/create - 创建订单
  router.post('/order/create', authenticateUser, async (req: any, res: any) => {
    const userId = req.userId;
    const {
      productCode,
      type,
      direction,
      quantity,
      price,
      leverage = 10,
      stopLoss,
      takeProfit
    }: CreateOrderRequest = req.body;

    // 完整参数校验
    if (!productCode || !type || !direction || !quantity) {
      return res.status(400).json(createErrorResponse(ErrorCode.MISSING_PARAM));
    }

    // 验证产品代码格式
    if (typeof productCode !== 'string' || productCode.length === 0) {
      return res.status(400).json(createErrorResponse(ErrorCode.INVALID_FORMAT, '产品代码格式错误'));
    }

    // 验证订单类型
    if (!Object.values(OrderType).includes(type)) {
      return res.status(400).json(createErrorResponse(ErrorCode.INVALID_PARAM, '无效的订单类型'));
    }

    // 验证订单方向
    if (!Object.values(OrderDirection).includes(direction)) {
      return res.status(400).json(createErrorResponse(ErrorCode.INVALID_PARAM, '无效的订单方向'));
    }

    // 验证数量（数量必须为正数，且在合理范围内）
    const quantityNum = Number(quantity);
    if (isNaN(quantityNum) || quantityNum <= 0) {
      return res.status(400).json(createErrorResponse(ErrorCode.INVALID_PARAM, '数量必须为正数'));
    }
    if (quantityNum < 0.01 || quantityNum > 10000) {
      return res.status(400).json(createErrorResponse(ErrorCode.OUT_OF_RANGE, '数量超出允许范围 (0.01 - 10000)'));
    }

    // 验证杠杆倍数
    const leverageNum = Number(leverage);
    if (isNaN(leverageNum) || leverageNum <= 0) {
      return res.status(400).json(createErrorResponse(ErrorCode.INVALID_PARAM, '杠杆倍数必须为正数'));
    }
    if (leverageNum < 1 || leverageNum > 200) {
      return res.status(400).json(createErrorResponse(ErrorCode.OUT_OF_RANGE, '杠杆倍数超出允许范围 (1 - 200)'));
    }

    // 限价单必须有价格
    if (type === OrderType.LIMIT && (!price || Number(price) <= 0)) {
      return res.status(400).json(createErrorResponse(ErrorCode.INVALID_PARAM, '限价单必须指定有效价格'));
    }

    // 验证止盈止损价格
    if (stopLoss !== undefined && Number(stopLoss) <= 0) {
      return res.status(400).json(createErrorResponse(ErrorCode.INVALID_PARAM, '止损价格必须大于0'));
    }
    if (takeProfit !== undefined && Number(takeProfit) <= 0) {
      return res.status(400).json(createErrorResponse(ErrorCode.INVALID_PARAM, '止盈价格必须大于0'));
    }

    // 获取行情价格
    const marketData = marketService.getMarketData(productCode);
    if (!marketData) {
      return res.status(404).json(createErrorResponse(ErrorCode.RESOURCE_NOT_FOUND, '产品不存在'));
    }

    const currentPrice = marketData.lastPrice;

    // 计算所需保证金
    const orderPrice = type === OrderType.LIMIT && price ? price : currentPrice;
    const margin = Calculator.calculateMargin(orderPrice, quantity, leverage);

    // 风险检查
    const riskCheck = // core managers (simulation only).checkOrderRisk(userId, margin, leverage);
    if (!riskCheck.canTrade) {
      return res.status(403).json(createErrorResponse(ErrorCode.INSUFFICIENT_MARGIN, riskCheck.message));
    }

    // 冻结保证金
    if (!// core managers (simulation only).freezeMargin(userId, margin)) {
      return res.status(403).json(createErrorResponse(ErrorCode.MARGIN_LOCK_FAILED, '保证金冻结失败'));
    }

    // 创建订单
    const order = // core 逻辑已禁用\n

    // 立即撮合市价单（使用锁防止竞态条件）
    if (type === OrderType.MARKET) {
      try {
        const trade = await orderLock.runWithLock(`match_${order.id}`, async () => {
          return // core managers (simulation only).matchOrder(order.id, marketData);
        });

        if (!trade) {
          // 撮合失败，释放保证金（使用锁防止并发释放）
          await marginLock.runWithLock(`margin_${userId}`, async () => {
            // core managers (simulation only).releaseMargin(userId, margin);
          });
          // core managers (simulation only).rejectOrder(order.id, '撮合失败');
          return res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_ERROR, '订单撮合失败'));
        }

        return res.json(success({
          orderId: order.id,
          status: order.status,
          filledPrice: trade.price,
          filledQuantity: trade.quantity,
          marginUsed: trade.margin,
          fee: trade.fee,
          tradeId: trade.id
        }, '订单已成交'));
      } catch (err) {
        // 撮合失败，释放保证金
        // core managers (simulation only).releaseMargin(userId, margin);
        // core managers (simulation only).rejectOrder(order.id, '撮合失败');
        return res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_ERROR, '订单撮合失败'));
      }
    }

    // 限价单返回待成交状态
    res.json(success({
      orderId: order.id,
      status: order.status,
      marginUsed: margin
    }, '限价单已创建，等待成交'));
  });

  // POST /api/order/cancel - 取消订单（使用锁防止并发超额释放保证金）
  router.post('/order/cancel', authenticateUser, async (req: any, res: any) => {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json(createErrorResponse(ErrorCode.MISSING_PARAM, '缺少订单ID'));
    }

    const order = // core managers (simulation only).getOrder(orderId);
    if (!order) {
      return res.status(404).json(createErrorResponse(ErrorCode.ORDER_NOT_FOUND, '订单不存在'));
    }

    // 使用锁确保保证金释放和订单取消的原子性
    try {
      await orderLock.runWithLock(`cancel_${orderId}`, async () => {
        // 再次检查订单是否仍然有效
        const currentOrder = // core managers (simulation only).getOrder(orderId);
        if (!currentOrder || currentOrder.status !== OrderStatus.PENDING) {
          throw new Error('订单已取消或不存在');
        }

        // 释放保证金（使用锁防止并发超额释放）
        if (currentOrder.margin > 0) {
          await marginLock.runWithLock(`margin_${currentOrder.userId}`, async () => {
            // core managers (simulation only).releaseMargin(currentOrder.userId, currentOrder.margin);
          });
        }

        // 取消订单
        const success_cancel = // core managers (simulation only).cancelOrder(orderId);
        if (!success_cancel) {
          throw new Error('订单无法取消');
        }
      });

      res.json(success({ orderId }, '订单已取消'));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '取消订单失败';
      logger.error('取消订单失败:', errorMessage);
      res.status(400).json(createErrorResponse(ErrorCode.OPERATION_FAILED, errorMessage));
    }
  });

  // GET /api/order/list - 获取订单列表
  router.get('/order/list', (req, res) => {
    const userId = req.headers['user-id'] as string || 'demo-user';
    const { status } = req.query;

    let orders = // core managers (simulation only).getUserOrders(userId);

    if (status) {
      orders = orders.filter(o => o.status === status);
    }

    res.json(success(orders.map(o => ({
      orderId: o.id,
      productCode: o.productCode,
      type: o.type,
      direction: o.direction,
      quantity: o.quantity,
      price: o.price,
      leverage: o.leverage,
      margin: o.margin,
      status: o.status,
      filledPrice: o.filledPrice,
      filledQuantity: o.filledQuantity,
      stopLoss: o.stopLoss,
      takeProfit: o.takeProfit,
      createdAt: o.createdAt
    }))));
  });

  // GET /api/order/detail - 获取订单详情
  router.get('/order/detail', (req, res) => {
    const { orderId } = req.query;

    if (!orderId) {
      return res.status(400).json(createErrorResponse(ErrorCode.MISSING_PARAM, '缺少订单ID'));
    }

    const order = // core managers (simulation only).getOrder(orderId as string);
    if (!order) {
      return res.status(404).json(createErrorResponse(ErrorCode.ORDER_NOT_FOUND, '订单不存在'));
    }

    res.json(success({
      orderId: order.id,
      productCode: order.productCode,
      type: order.type,
      direction: order.direction,
      quantity: order.quantity,
      price: order.price,
      leverage: order.leverage,
      margin: order.margin,
      status: order.status,
      filledPrice: order.filledPrice,
      filledQuantity: order.filledQuantity,
      stopLoss: order.stopLoss,
      takeProfit: order.takeProfit,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt
    }));
  });

  // ============================================
  // 持仓类 API
  // ============================================

  // GET /api/position/list - 获取持仓列表
  router.get('/position/list', (req, res) => {
    const userId = req.headers['user-id'] as string || 'demo-user';
    const positions = // core managers (simulation only).getUserPositions(userId);

    // 更新未实现盈亏
    const marketData = marketService.getAllMarketDataMap();
    // core managers (simulation only).updateAccountEquity(userId, marketData);

    res.json(success(positions.map(p => ({
      positionId: p.id,
      productCode: p.productCode,
      direction: p.direction,
      openPrice: p.openPrice,
      quantity: p.quantity,
      leverage: p.leverage,
      marginUsed: p.marginUsed,
      liquidationPrice: p.liquidationPrice,
      stopLoss: p.stopLoss,
      takeProfit: p.takeProfit,
      unrealizedPnl: p.unrealizedPnl,
      realizedPnl: p.realizedPnl,
      status: p.status,
      openedAt: p.openedAt
    }))));
  });

  // POST /api/position/close - 平仓
  router.post('/position/close', (req, res) => {
    const userId = req.headers['user-id'] as string || 'demo-user';
    const { positionId } = req.body;

    if (!positionId) {
      return res.status(400).json(createErrorResponse(ErrorCode.MISSING_PARAM, '缺少持仓ID'));
    }

    const position = // core managers (simulation only).getPosition(positionId);
    if (!position) {
      return res.status(404).json(createErrorResponse(ErrorCode.POSITION_NOT_FOUND, '持仓不存在'));
    }

    if (position.userId !== userId) {
      return res.status(403).json(createErrorResponse(ErrorCode.PERMISSION_DENIED, '无权操作此持仓'));
    }

    // 获取当前价格
    const marketData = marketService.getMarketData(position.productCode);
    if (!marketData) {
      return res.status(404).json(createErrorResponse(ErrorCode.RESOURCE_NOT_FOUND, '产品不存在'));
    }

    // 执行平仓
    const closedPosition = // core managers (simulation only).closePosition(positionId, marketData.lastPrice);
    if (!closedPosition) {
      return res.status(400).json(createErrorResponse(ErrorCode.OPERATION_FAILED, '平仓失败'));
    }

    // 结算资金
    // core managers (simulation only).settlePosition(userId, closedPosition.realizedPnl, closedPosition.marginUsed);

    res.json(success({
      positionId: closedPosition.id,
      closePrice: marketData.lastPrice,
      realizedPnl: closedPosition.realizedPnl,
      marginReleased: closedPosition.marginUsed
    }, '平仓成功'));
  });

  // POST /api/position/update-sl-tp - 修改止盈止损
  router.post('/position/update-sl-tp', (req, res) => {
    const userId = req.headers['user-id'] as string || 'demo-user';
    const { positionId, stopLoss, takeProfit }: UpdateSlTpRequest = req.body;

    if (!positionId) {
      return res.status(400).json(createErrorResponse(ErrorCode.MISSING_PARAM, '缺少持仓ID'));
    }

    const position = // core managers (simulation only).getPosition(positionId);
    if (!position) {
      return res.status(404).json(createErrorResponse(ErrorCode.POSITION_NOT_FOUND, '持仓不存在'));
    }

    if (position.userId !== userId) {
      return res.status(403).json(createErrorResponse(ErrorCode.PERMISSION_DENIED, '无权操作此持仓'));
    }

    const updated = // core managers (simulation only).updateSlTp(positionId, stopLoss, takeProfit);
    if (!updated) {
      return res.status(400).json(createErrorResponse(ErrorCode.OPERATION_FAILED, '更新失败'));
    }

    res.json(success({
      positionId: updated.id,
      stopLoss: updated.stopLoss,
      takeProfit: updated.takeProfit
    }, '止盈止损已更新'));
  });

  // ============================================
  // 风控类 API
  // ============================================

  // GET /api/risk/preview - 风险预览
  router.get('/risk/preview', (req, res) => {
    const userId = req.headers['user-id'] as string || 'demo-user';
    const { productCode, price, quantity, leverage, direction } = req.query;

    if (!productCode || !price || !quantity || !leverage || !direction) {
      return res.status(400).json(createErrorResponse(ErrorCode.MISSING_PARAM, '缺少必要参数'));
    }

    const preview = Calculator.calculateRiskPreview(
      parseFloat(price as string),
      parseFloat(quantity as string),
      parseInt(leverage as string),
      direction as any
    );

    res.json(success(preview));
  });

  // GET /api/risk/liquidation-price - 计算强平价
  router.get('/risk/liquidation-price', (req, res) => {
    const { price, leverage, direction } = req.query;

    if (!price || !leverage || !direction) {
      return res.status(400).json(createErrorResponse(ErrorCode.MISSING_PARAM, '缺少必要参数'));
    }

    const liquidationPrice = Calculator.calculateLiquidationPrice(
      parseFloat(price as string),
      parseInt(leverage as string),
      direction as any
    );

    res.json(success({ liquidationPrice }));
  });

  // GET /api/risk/liquidation-records - 强平记录
  router.get('/risk/liquidation-records', (req, res) => {
    const userId = req.headers['user-id'] as string || 'demo-user';
    const records = // core managers (simulation only).getLiquidationRecords(userId);

    res.json(success(records));
  });

  return router;
}



