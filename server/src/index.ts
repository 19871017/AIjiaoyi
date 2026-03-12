import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

import { PositionManager, OrderManager } from './core/OrderManager';
import { RiskManager } from './core/RiskManager';
import { MarketDataService } from './services/MarketDataService';
import { stopLossTakeProfitService } from './services/StopLossTakeProfitService';
import { createApiRouter } from './routes/api';
import { createShuhaiRouter } from './routes/shuhai';
import authRouter from './routes/auth';
import adminRouter from './routes/admin';
import aiRouter from './routes/ai';
import financeRouter from './routes/finance';
import bankCardRouter from './routes/bank-card';
import announcementRouter from './routes/announcement';
import profileRouter from './routes/profile';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: true,
    credentials: true
  }
});
const PORT = process.env.PORT || 3001;

// ============================================
// 中间件配置
// ============================================

// 安全头
app.use(helmet());

// CORS
app.use(cors({
  origin: true,
  credentials: true
}));

// 限流 - 临时禁用用于测试
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15分钟
//   max: 10000, // 每个IP最多10000个请求
//   message: {
//     code: 429,
//     message: '请求过于频繁，请稍后再试',
//     data: null,
//     timestamp: Date.now()
//   }
// });
// app.use(limiter);

// 解析JSON
app.use(express.json());

// ============================================
// 初始化核心服务
// ============================================

const positionManager = new PositionManager();
const orderManager = new OrderManager(positionManager);
const riskManager = new RiskManager(positionManager);
const marketService = new MarketDataService();

// ============================================
// WebSocket 实时推送配置
// ============================================

io.on('connection', (socket) => {
  console.log(`[WebSocket] Client connected: ${socket.id}`);

  // 订阅行情
  socket.on('subscribe:market', (symbols: string[]) => {
    console.log(`[WebSocket] Client ${socket.id} subscribed to market: ${symbols.join(', ')}`);
    socket.join('market');

    // 立即发送当前行情数据
    const allMarketData = marketService.getAllMarketData();
    socket.emit('market:data', allMarketData);
  });

  // 取消订阅行情
  socket.on('unsubscribe:market', () => {
    console.log(`[WebSocket] Client ${socket.id} unsubscribed from market`);
    socket.leave('market');
  });

  // 订阅持仓更新
  socket.on('subscribe:positions', (userId: string) => {
    console.log(`[WebSocket] Client ${socket.id} subscribed to positions: ${userId}`);
    socket.join(`positions:${userId}`);
  });

  // 断开连接
  socket.on('disconnect', () => {
    console.log(`[WebSocket] Client disconnected: ${socket.id}`);
  });
});

// 将 io 实例挂载到 app，供其他模块使用
app.set('io', io);

// 创建演示账户
const demoUserId = 'demo-user';
riskManager.createAccount(demoUserId, 1000000); // 初始资金100万

// 配置 Socket.IO 到行情服务
marketService.setSocketIO(io);

// ============================================
// 风控监控循环
// ============================================

// 每5秒执行一次风控检查
setInterval(() => {
  const accounts = riskManager.getAllAccounts();
  const marketData = marketService.getAllMarketDataMap();

  for (const account of accounts) {
    // 更新账户权益
    riskManager.updateAccountEquity(account.userId, marketData);

    // 检查强平
    const liquidations = riskManager.checkAndLiquidate(account.userId, marketData);

    if (liquidations.length > 0) {
      console.log(`[${new Date().toISOString()}] 用户 ${account.userId} 触发强平:`,
        liquidations.map(l => `${l.productCode} @ ${l.liquidationPrice}`).join(', ')
      );
    }
  }
}, 5000);

// 启动止盈止损服务
stopLossTakeProfitService.start();

// ============================================
// 路由配置
// ============================================

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    code: 0,
    message: '服务运行正常',
    data: {
      status: 'ok',
      timestamp: Date.now(),
      uptime: process.uptime()
    }
  });
});

// 认证路由
app.use('/auth', authRouter);

// 管理员路由
app.use('/admin', adminRouter);

// AI分析路由
app.use('/ai', aiRouter);

// 资金路由
app.use('/finance', financeRouter);

// 银行卡
app.use('/bank-cards', bankCardRouter);

// 公告
app.use('/announcements', announcementRouter);

// 个人信息
app.use('/', profileRouter);

// API 路由
app.use('/api', createApiRouter(orderManager, positionManager, riskManager, marketService));

// 数海行情代理路由
app.use('/shuhai', createShuhaiRouter());

// 错误处理
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    code: 500,
    message: '服务器内部错误',
    data: null,
    timestamp: Date.now()
  });
});

// ============================================
// 启动服务器
// ============================================

httpServer.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║     贵金属期货交易系统 - 交易撮合引擎 + 风控系统              ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║  服务地址: http://localhost:${PORT}                          ║
║  API文档: http://localhost:${PORT}/api/...                   ║
║                                                              ║
║  演示账户: demo-user                                         ║
║  初始资金: ¥1,000,000                                        ║
║                                                              ║
║  可用产品 (6个):                                             ║
║    • DAX    - 德指      (CEDAXA0)                            ║
║    • HSI    - 恒指      (HIHHI01)                            ║
║    • NQ     - 小纳指    (CENQA0)                             ║
║    • MHSI   - 小恒指    (HIMCH01)                            ║
║    • GOLD   - 黄金      (CMGCA0)                             ║
║    • USOIL  - 原油      (NECLA0)                             ║
║                                                              ║
║  数据来源: 数海API (http://ds.cnshuhai.com)               ║
║  更新频率: 30秒自动更新                                        ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('正在关闭服务...');
  marketService.stop();
  stopLossTakeProfitService.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('正在关闭服务...');
  marketService.stop();
  stopLossTakeProfitService.stop();
  process.exit(0);
});
