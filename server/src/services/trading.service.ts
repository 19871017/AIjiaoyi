import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import { query, findOne, transaction } from '../config/database';
import logger from '../utils/logger';
import redis from '../utils/redis';
import { updateAccountBalance } from './finance.service';

/**
 * 订单类型
 */
export enum OrderType {
  MARKET = 1, // 市价单
  LIMIT = 2,  // 限价单
}

/**
 * 交易类型
 */
export enum TradeType {
  BUY = 1,   // 买入
  SELL = 2,  // 卖出
}

/**
 * 订单方向
 */
export enum OrderDirection {
  LONG = 1,  // 多头
  SHORT = 2, // 空头
}

/**
 * 订单状态
 */
export enum OrderStatus {
  PENDING = 0,      // 待成交
  PARTIALLY_FILLED = 1, // 部分成交
  FILLED = 2,       // 已成交
  CANCELLED = 3,    // 已取消
  REJECTED = 4,     // 已拒绝
}

/**
 * 持仓状态
 */
export enum PositionStatus {
  OPEN = 1,   // 持仓中
  CLOSED = 2, // 已平仓
}

/**
 * 下单信息接口
 */
export interface CreateOrderData {
  user_id: number;
  product_id: number;
  order_type: OrderType;
  trade_type: TradeType;
  direction: OrderDirection;
  lot_size: number;
  leverage: number;
  price?: number;
  stop_loss?: number;
  take_profit?: number;
}

/**
 * 平仓信息接口
 */
export interface ClosePositionData {
  user_id: number;
  position_id: number;
  lot_size?: number; // 可选，不传则全部平仓
}

/**
 * 生成订单号
 */
function generateOrderNumber(): string {
  return `ORD${dayjs().format('YYYYMMDDHHmmss')}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
}

/**
 * 生成交易号
 */
function generateTradeId(): string {
  return `TRD${dayjs().format('YYYYMMDDHHmmss')}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
}

/**
 * 生成持仓号
 */
function generatePositionNumber(): string {
  return `POS${dayjs().format('YYYYMMDDHHmmss')}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
}

/**
 * 创建订单
 */
export async function createOrder(data: CreateOrderData) {
  return await transaction(async (client) => {
    // 1. 获取用户账户
    const account = await client.query(
      `SELECT balance, available_balance, frozen_margin FROM accounts WHERE user_id = $1`,
      [data.user_id]
    );

    if (!account.rows[0]) {
      throw new Error('Account not found');
    }

    // 2. 获取产品信息
    const product = await client.query(
      `SELECT * FROM products WHERE id = $1 AND status = 1 AND is_deleted = false`,
      [data.product_id]
    );

    if (!product.rows[0]) {
      throw new Error('Product not found or not available');
    }

    const prod = product.rows[0];

    // 3. 验证杠杆
    if (data.leverage < prod.min_leverage || data.leverage > prod.max_leverage) {
      throw new Error('Invalid leverage');
    }

    // 4. 验证手数
    if (data.lot_size < prod.min_lot_size || data.lot_size > prod.max_lot_size) {
      throw new Error('Invalid lot size');
    }

    // 5. 计算保证金
    const margin = data.lot_size * prod.contract_size * (prod.margin_requirement || 0.01) / data.leverage;

    // 6. 检查余额是否充足
    if (account.rows[0].available_balance < margin) {
      throw new Error('Insufficient balance');
    }

    // 7. 风控检查
    await riskCheck(client, data.user_id, data.product_id, data.lot_size, margin);

    // 8. 获取当前价格
    const currentPrice = await getCurrentPrice(data.product_id);

    if (!currentPrice) {
      throw new Error('Unable to get current price');
    }

    // 9. 计算手续费
    const commission = data.lot_size * (prod.commission || 0);

    // 10. 创建订单
    const orderNumber = generateOrderNumber();
    const orderResult = await client.query(
      `INSERT INTO orders
       (user_id, order_number, product_id, order_type, trade_type, order_direction,
        lot_size, leverage, price, stop_loss, take_profit, margin, commission, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id`,
      [
        data.user_id,
        orderNumber,
        data.product_id,
        data.order_type,
        data.trade_type,
        data.direction,
        data.lot_size,
        data.leverage,
        data.price || currentPrice,
        data.stop_loss,
        data.take_profit,
        margin,
        commission,
        OrderStatus.PENDING,
      ]
    );

    const orderId = orderResult.rows[0].id;

    // 11. 冻结保证金
    await client.query(
      `UPDATE accounts
       SET frozen_margin = frozen_margin + $1,
           available_balance = available_balance - $1
       WHERE user_id = $2`,
      [margin, data.user_id]
    );

    // 12. 撮合成交
    const filledPrice = data.order_type === OrderType.MARKET ? currentPrice : (data.price || currentPrice);

    await client.query(
      `UPDATE orders
       SET status = $1,
           filled_size = lot_size,
           filled_price = $2,
           avg_price = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [OrderStatus.FILLED, filledPrice, orderId]
    );

    // 13. 创建持仓
    const positionNumber = generatePositionNumber();
    const positionResult = await client.query(
      `INSERT INTO positions
       (user_id, product_id, position_number, order_id, trade_type, direction,
        lot_size, entry_price, current_price, leverage, margin, stop_loss, take_profit, commission, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id`,
      [
        data.user_id,
        data.product_id,
        positionNumber,
        orderId,
        data.trade_type,
        data.direction,
        data.lot_size,
        filledPrice,
        filledPrice,
        data.leverage,
        margin,
        data.stop_loss,
        data.take_profit,
        commission,
        PositionStatus.OPEN,
      ]
    );

    const positionId = positionResult.rows[0].id;

    // 14. 扣除手续费
    await updateAccountBalance(client, data.user_id, -commission, 5, orderId);

    // 15. 创建成交记录
    await client.query(
      `INSERT INTO trades
       (trade_id, user_id, order_id, product_id, trade_type, direction, lot_size, price, margin, commission, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        generateTradeId(),
        data.user_id,
        orderId,
        data.product_id,
        data.trade_type,
        data.direction,
        data.lot_size,
        filledPrice,
        margin,
        commission,
        1, // 成功
      ]
    );

    // 16. 保持保证金冻结至平仓

    // 17. 更新Redis缓存
    await redis.set(`order:${orderId}:info`, JSON.stringify({
      id: orderId,
      order_number: orderNumber,
      user_id: data.user_id,
      product_id: data.product_id,
      status: OrderStatus.FILLED,
    }), 3600);

    logger.info('Order created and filled:', {
      order_id: orderId,
      order_number: orderNumber,
      user_id: data.user_id,
      product_id: data.product_id,
      lot_size: data.lot_size,
      price: filledPrice,
    });

    return {
      order_id: orderId,
      order_number: orderNumber,
      status: OrderStatus.FILLED,
      filled_price: filledPrice,
      position_id: positionId,
    };
  });
}

/**
 * 平仓
 */
export async function closePosition(data: ClosePositionData) {
  return await transaction(async (client) => {
    // 1. 获取持仓信息
    const position = await client.query(
      `SELECT p.*, prod.symbol, prod.tick_value, prod.contract_size
       FROM positions p
       JOIN products prod ON p.product_id = prod.id
       WHERE p.id = $1 AND p.user_id = $2 AND p.status = 1`,
      [data.position_id, data.user_id]
    );

    if (!position.rows[0]) {
      throw new Error('Position not found');
    }

    const pos = position.rows[0];

    // 2. 计算平仓手数
    const closeLotSize = data.lot_size || pos.lot_size;

    if (closeLotSize > pos.lot_size) {
      throw new Error('Close lot size exceeds position size');
    }

    // 3. 获取当前价格
    const currentPrice = await getCurrentPrice(pos.product_id);

    if (!currentPrice) {
      throw new Error('Unable to get current price');
    }

    // 4. 计算盈亏
    let profit: number;
    if (pos.direction === OrderDirection.LONG) {
      profit = (currentPrice - pos.entry_price) * closeLotSize * pos.contract_size;
    } else {
      profit = (pos.entry_price - currentPrice) * closeLotSize * pos.contract_size;
    }

    // 5. 计算手续费
    const commission = closeLotSize * (pos.commission / pos.lot_size);

    // 6. 计算净盈亏
    const netProfit = profit - commission;

    // 7. 创建平仓订单
    const orderNumber = generateOrderNumber();
    const orderResult = await client.query(
      `INSERT INTO orders
       (user_id, order_number, product_id, order_type, trade_type, order_direction,
        lot_size, leverage, price, commission, status, filled_size, filled_price, avg_price)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id`,
      [
        data.user_id,
        orderNumber,
        pos.product_id,
        OrderType.MARKET,
        pos.trade_type === TradeType.BUY ? TradeType.SELL : TradeType.BUY,
        pos.direction === OrderDirection.LONG ? OrderDirection.SHORT : OrderDirection.LONG,
        closeLotSize,
        pos.leverage,
        currentPrice,
        commission,
        OrderStatus.FILLED,
        closeLotSize,
        currentPrice,
        currentPrice,
      ]
    );

    const orderId = orderResult.rows[0].id;

    // 8. 更新持仓
    if (closeLotSize === pos.lot_size) {
      // 全部平仓
      await client.query(
        `UPDATE positions
         SET status = $1,
             close_price = $2,
             close_time = CURRENT_TIMESTAMP,
             realized_pl = realized_pl + $3,
             close_order_id = $4
         WHERE id = $5`,
        [PositionStatus.CLOSED, currentPrice, netProfit, orderId, pos.id]
      );
    } else {
      // 部分平仓
      await client.query(
        `UPDATE positions
         SET lot_size = lot_size - $1,
             realized_pl = realized_pl + $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [closeLotSize, netProfit, pos.id]
      );
    }

    // 9. 更新账户余额（按比例释放保证金）
    const releasedMargin = pos.margin * (closeLotSize / pos.lot_size);
    await updateAccountBalance(client, data.user_id, releasedMargin + netProfit, 6, pos.id);

    // 10. 创建成交记录
    await client.query(
      `INSERT INTO trades
       (trade_id, user_id, order_id, product_id, trade_type, direction, lot_size, price, margin, commission, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        generateTradeId(),
        data.user_id,
        orderId,
        pos.product_id,
        pos.trade_type === TradeType.BUY ? TradeType.SELL : TradeType.BUY,
        pos.direction === OrderDirection.LONG ? OrderDirection.SHORT : OrderDirection.LONG,
        closeLotSize,
        currentPrice,
        pos.margin,
        commission,
        1,
      ]
    );

    logger.info('Position closed:', {
      position_id: pos.id,
      user_id: data.user_id,
      lot_size: closeLotSize,
      close_price: currentPrice,
      profit: netProfit,
    });

    return {
      position_id: pos.id,
      close_price: currentPrice,
      profit: netProfit,
      status: PositionStatus.CLOSED,
    };
  });
}

/**
 * 获取当前价格
 */
async function getCurrentPrice(productId: number): Promise<number | null> {
  // 从 Redis 获取实时价格
  const quoteKey = `market:${productId}:quote`;
  const quote = await redis.get(quoteKey);

  if (quote) {
    const quoteData = JSON.parse(quote);
    return (quoteData.bid + quoteData.ask) / 2;
  }

  // 从数据库获取最新价格
  const result = await query(
    `SELECT bid, ask FROM market_quotes WHERE product_id = $1 ORDER BY timestamp DESC LIMIT 1`,
    [productId]
  );

  if (result.rows.length > 0) {
    return (result.rows[0].bid + result.rows[0].ask) / 2;
  }

  return null;
}

/**
 * 风控检查
 */
async function riskCheck(
  client: any,
  userId: number,
  productId: number,
  lotSize: number,
  margin: number
): Promise<void> {
  // 1. 检查单笔仓位限制
  const maxSinglePositionRule = await client.query(
    `SELECT max_single_position FROM risk_rules
     WHERE rule_type = 1
       AND (product_id = $1 OR product_id IS NULL)
     ORDER BY product_id DESC NULLS LAST LIMIT 1`,
    [productId]
  );

  if (maxSinglePositionRule.rows[0] && maxSinglePositionRule.rows[0].max_single_position) {
    if (lotSize > maxSinglePositionRule.rows[0].max_single_position) {
      throw new Error('Single position size exceeds limit');
    }
  }

  // 2. 检查总持仓限制
  const maxTotalPositionRule = await client.query(
    `SELECT max_total_position FROM risk_rules
     WHERE rule_type = 2
       AND (product_id = $1 OR product_id IS NULL)
     ORDER BY product_id DESC NULLS LAST LIMIT 1`,
    [productId]
  );

  if (maxTotalPositionRule.rows[0] && maxTotalPositionRule.rows[0].max_total_position) {
    const totalPositionResult = await client.query(
      `SELECT SUM(lot_size) as total FROM positions WHERE user_id = $1 AND status = 1`,
      [userId]
    );

    const totalPosition = (totalPositionResult.rows[0]?.total || 0) + lotSize;

    if (totalPosition > maxTotalPositionRule.rows[0].max_total_position) {
      throw new Error('Total position size exceeds limit');
    }
  }

  // 3. 检查日亏损限制
  const maxDailyLossRule = await client.query(
    `SELECT max_daily_loss FROM risk_rules WHERE rule_type = 6 LIMIT 1`
  );

  if (maxDailyLossRule.rows[0] && maxDailyLossRule.rows[0].max_daily_loss) {
    const dailyLossResult = await client.query(
      `SELECT SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END) as daily_loss
       FROM transactions
       WHERE user_id = $1
         AND type = 6
         AND created_at >= CURRENT_DATE`,
      [userId]
    );

    const dailyLoss = Math.abs(dailyLossResult.rows[0]?.daily_loss || 0);

    if (dailyLoss > maxDailyLossRule.rows[0].max_daily_loss) {
      throw new Error('Daily loss limit exceeded');
    }
  }
}

/**
 * 更新持仓价格
 */
export async function updatePositionPrices(): Promise<void> {
  const positions = await query(
    `SELECT p.id, p.user_id, p.product_id, p.direction, p.lot_size, p.entry_price, p.leverage, p.margin, p.stop_loss, p.take_profit,
            prod.contract_size
     FROM positions p
     JOIN products prod ON p.product_id = prod.id
     WHERE p.status = 1`
  );

  for (const pos of positions.rows) {
    const currentPrice = await getCurrentPrice(pos.product_id);

    if (!currentPrice) continue;

    // 计算浮动盈亏（使用产品合约大小）
    let floatingPl: number;
    if (pos.direction === OrderDirection.LONG) {
      floatingPl = (currentPrice - pos.entry_price) * pos.lot_size * pos.contract_size;
    } else {
      floatingPl = (pos.entry_price - currentPrice) * pos.lot_size * pos.contract_size;
    }

    // 更新持仓
    await query(
      `UPDATE positions
       SET current_price = $1,
           floating_pl = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [currentPrice, floatingPl, pos.id]
    );

    // 计算保证金比例
    const marginRatio = (pos.margin + floatingPl) / pos.margin;

    // 获取风控规则
    const riskRules = await query(
      `SELECT stop_loss_ratio, liquidation_ratio FROM risk_rules WHERE rule_type = 5 LIMIT 1`
    );

    if (riskRules.rows.length > 0) {
      const { stop_loss_ratio, liquidation_ratio } = riskRules.rows[0];

      // 检查是否触发爆仓
      if (marginRatio <= liquidation_ratio) {
        logger.warn('Position liquidation triggered', { position_id: pos.id });
        // 触发强制平仓
        await executeLiquidation(pos.id, pos.user_id);
      } else if (marginRatio <= stop_loss_ratio) {
        logger.warn('Position stop loss triggered', { position_id: pos.id });
        // 发送预警通知
        await sendRiskWarning(pos.id, pos.user_id, 'stop_loss');
      }
    }
  }
}

/**
 * 执行强制平仓
 */
export async function executeLiquidation(positionId: number, userId: number): Promise<void> {
  try {
    await transaction(async (client) => {
      // 1. 获取持仓信息
      const positionResult = await client.query(
        `SELECT p.*, prod.symbol, prod.contract_size
         FROM positions p
         JOIN products prod ON p.product_id = prod.id
         WHERE p.id = $1 AND p.status = 1`,
        [positionId]
      );

      if (!positionResult.rows[0]) {
        throw new Error('Position not found or already closed');
      }

      const position = positionResult.rows[0];

      // 2. 获取当前市场价格（使用市价平仓）
      const currentPrice = await getCurrentPrice(position.product_id);

      if (!currentPrice) {
        throw new Error('Unable to get current price for liquidation');
      }

      // 3. 计算盈亏
      let profit: number;
      if (position.direction === OrderDirection.LONG) {
        profit = (currentPrice - position.entry_price) * position.lot_size * position.contract_size;
      } else {
        profit = (position.entry_price - currentPrice) * position.lot_size * position.contract_size;
      }

      // 4. 计算手续费
      const commission = position.commission;

      // 5. 计算净盈亏
      const netProfit = profit - commission;

      // 6. 创建强平订单
      const orderNumber = generateOrderNumber();
      const orderResult = await client.query(
        `INSERT INTO orders
         (user_id, order_number, product_id, order_type, trade_type, order_direction,
          lot_size, leverage, price, commission, status, filled_size, filled_price, avg_price, remark)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING id`,
        [
          userId,
          orderNumber,
          position.product_id,
          OrderType.MARKET,
          position.trade_type === TradeType.BUY ? TradeType.SELL : TradeType.BUY,
          position.direction === OrderDirection.LONG ? OrderDirection.SHORT : OrderDirection.LONG,
          position.lot_size,
          position.leverage,
          currentPrice,
          commission,
          OrderStatus.FILLED,
          position.lot_size,
          currentPrice,
          currentPrice,
          '强制平仓',
        ]
      );

      const orderId = orderResult.rows[0].id;

      // 7. 更新持仓状态
      await client.query(
        `UPDATE positions
         SET status = $1,
             close_price = $2,
             close_time = CURRENT_TIMESTAMP,
             realized_pl = realized_pl + $3,
             close_order_id = $4,
             remark = '强制平仓',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [PositionStatus.CLOSED, currentPrice, netProfit, orderId, positionId]
      );

      // 8. 更新账户余额（可能亏损）
      await updateAccountBalance(client, userId, position.margin + netProfit, TransactionType.PROFIT_LOSS, positionId, '强制平仓');

      // 9. 创建成交记录
      await client.query(
        `INSERT INTO trades
         (trade_id, user_id, order_id, product_id, trade_type, direction, lot_size, price, margin, commission, status, remark)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          generateTradeId(),
          userId,
          orderId,
          position.product_id,
          position.trade_type === TradeType.BUY ? TradeType.SELL : TradeType.BUY,
          position.direction === OrderDirection.LONG ? OrderDirection.SHORT : OrderDirection.LONG,
          position.lot_size,
          currentPrice,
          position.margin,
          commission,
          1,
          '强制平仓',
        ]
      );

      // 10. 记录强平日志
      await client.query(
        `INSERT INTO liquidation_logs
         (position_id, user_id, product_id, entry_price, close_price, lot_size, profit_loss, reason, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
        [
          positionId,
          userId,
          position.product_id,
          position.entry_price,
          currentPrice,
          position.lot_size,
          netProfit,
          '保证金比例低于强平线',
        ]
      );

      // 11. 发送强平通知
      await sendRiskWarning(positionId, userId, 'liquidation');

      logger.warn('Position liquidated successfully:', {
        position_id: positionId,
        user_id: userId,
        product_id: position.product_id,
        lot_size: position.lot_size,
        close_price: currentPrice,
        profit_loss: netProfit,
      });
    });
  } catch (error) {
    logger.error('Failed to execute liquidation:', { position_id: positionId, user_id: userId, error });
    throw error;
  }
}

/**
 * 发送风险预警通知
 */
async function sendRiskWarning(positionId: number, userId: number, warningType: 'stop_loss' | 'liquidation'): Promise<void> {
  try {
    // 获取持仓信息
    const position = await findOne(
      `SELECT p.*, u.username, u.email, u.phone, prod.symbol
       FROM positions p
       JOIN users u ON p.user_id = u.id
       JOIN products prod ON p.product_id = prod.id
       WHERE p.id = $1`,
      [positionId]
    );

    if (!position) {
      logger.warn('Position not found for warning:', { positionId, userId });
      return;
    }

    // 获取当前价格
    const currentPrice = await getCurrentPrice(position.product_id);

    // 计算浮动盈亏
    let floatingPl: number;
    if (position.direction === OrderDirection.LONG) {
      floatingPl = (currentPrice - position.entry_price) * position.lot_size * position.contract_size;
    } else {
      floatingPl = (position.entry_price - currentPrice) * position.lot_size * position.contract_size;
    }

    // 计算保证金比例
    const marginRatio = (position.margin + floatingPl) / position.margin;

    // 创建预警记录
    await query(
      `INSERT INTO risk_warnings
       (user_id, position_id, product_id, warning_type, current_price, floating_pl, margin_ratio, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
      [
        userId,
        positionId,
        position.product_id,
        warningType,
        currentPrice,
        floatingPl,
        marginRatio,
      ]
    );

    // TODO: 发送短信/邮件通知（需要集成短信/邮件服务）
    // const message = warningType === 'liquidation'
    //   ? `您的持仓${position.symbol}已触发强制平仓，当前保证金比例: ${marginRatio.toFixed(2)}%`
    //   : `您的持仓${position.symbol}已触发止损预警，当前保证金比例: ${marginRatio.toFixed(2)}%`;

    logger.info(`Risk warning sent: ${warningType}`, {
      user_id: userId,
      position_id: positionId,
      product_id: position.product_id,
      margin_ratio: marginRatio,
    });
  } catch (error) {
    logger.error('Failed to send risk warning:', { positionId, userId, warningType, error });
  }
}
