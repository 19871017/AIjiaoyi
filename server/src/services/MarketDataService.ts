import { MarketData } from '../types';
import { pool, query } from '../config/database';
import axios from 'axios';
import http from 'http';
import https from 'https';

// ============================================
// 行情数据服务 - 数海API + PostgreSQL数据库
// ============================================

// 数海API配置（使用官方地址，直接访问无需代理）
const SHUHAI_API_BASE = process.env.MARKET_API_BASE || 'http://ds.cnshuhai.com/stock.php';
const SHUHAI_USERNAME = process.env.SHUHAI_USERNAME || 'wu123';
const SHUHAI_PASSWORD = process.env.SHUHAI_PASSWORD || 'wu123';

// 创建axios实例，禁用代理以避免407错误
const shuhaiAxios = axios.create({
  timeout: 15000,
  httpAgent: new http.Agent({ keepAlive: true, rejectUnauthorized: false }),
  httpsAgent: new https.Agent({ keepAlive: true, rejectUnauthorized: false }),
  proxy: false, // 禁用代理
});

// 品种代码映射（数海格式：市场代码+品种代码）
// 当前账号wu123可访问的品种（经过测试验证）
const SYMBOL_MAPPING: Record<string, string> = {
  // CE 市场 (欧洲期货) - 可用
  'DAX': 'CEDAXA0',     // 德指 ✅
  'NQ': 'CENQA0',       // 小纳指 ✅

  // HI 市场 (恒指期货) - 可用
  'HSI': 'HIHHI01',     // 恒指 ✅
  'MHSI': 'HIMCH01',    // 小恒指 ✅

  // CM 市场 (商品期货) - 可用
  'GOLD': 'CMGCA0',     // 美黄金 ✅

  // NE 市场 (美期货) - 可用
  'USOIL': 'NECLA0',    // 美原油 ✅
};

// 所有支持的品种（仅包含数海API可访问的品种）
// 前端显示的品种列表
// 注意: 需要批量请求（至少2个品种）才能避免407错误
const ALL_PRODUCTS = [
  { code: 'DAX', name: '德指', shuhaiCode: SYMBOL_MAPPING['DAX'] },  // CE市场 ✅
  { code: 'HSI', name: '恒指', shuhaiCode: SYMBOL_MAPPING['HSI'] },  // HI市场 ✅
  { code: 'NQ', name: '小纳指', shuhaiCode: SYMBOL_MAPPING['NQ'] },  // CE市场 ✅
  { code: 'MHSI', name: '小恒指', shuhaiCode: SYMBOL_MAPPING['MHSI'] }, // HI市场 ✅
  { code: 'USOIL', name: '原油', shuhaiCode: SYMBOL_MAPPING['USOIL'] }, // NE市场 ✅
  { code: 'GOLD', name: '黄金', shuhaiCode: SYMBOL_MAPPING['GOLD'] },   // CM市场 ✅
];

// 前端品种列表导出（用于前端显示）
export const FRONTEND_SYMBOLS = ALL_PRODUCTS;

export class MarketDataService {
  private marketData: Map<string, MarketData> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;
  private shuhaiAvailable: boolean = false;
  private lastShuhaiError: string = '';
  private databaseConnected: boolean = false;
  private io: any = null; // Socket.IO 实例

  /**
   * 设置 Socket.IO 实例（用于实时推送）
   */
  setSocketIO(io: any): void {
    this.io = io;
    console.log('[MarketData] Socket.IO instance configured');
  }

  constructor() {
    this.initializeDatabase();
    this.checkShuhaiAvailability();
    this.startPriceUpdate();
  }

  /**
   * 初始化数据库
   */
  private async initializeDatabase(): Promise<void> {
    try {
      // 测试数据库连接
      await pool.query('SELECT NOW()');
      this.databaseConnected = true;
      console.log('[MarketData] Database connected successfully');

      // 从数据库加载现有数据
      await this.loadFromDatabase();
    } catch (err: any) {
      this.databaseConnected = false;
      console.log('[MarketData] Database not available, using memory-only mode');
      // 初始化内存数据
      this.initializeEmptyMarketData();
    }
  }

  /**
   * 初始化空的行情数据
   */
  private initializeEmptyMarketData(): void {
    for (const product of ALL_PRODUCTS) {
      this.marketData.set(product.code, {
        productCode: product.code,
        productName: product.name,
        bid: 0,
        ask: 0,
        lastPrice: 0,
        openPrice: 0,
        high24h: 0,
        low24h: 0,
        volume24h: 0,
        change: 0,
        changePercent: 0,
        timestamp: new Date()
      });
    }
  }

  /**
   * 从数据库加载行情数据
   */
  private async loadFromDatabase(): Promise<void> {
    try {
      const result = await query(
        'SELECT * FROM market_data ORDER BY product_code'
      );

      for (const row of result.rows) {
        this.marketData.set(row.product_code, {
          productCode: row.product_code,
          productName: row.product_name,
          bid: parseFloat(row.bid) || 0,
          ask: parseFloat(row.ask) || 0,
          lastPrice: parseFloat(row.price) || 0,
          openPrice: parseFloat(row.open_price) || 0,
          high24h: parseFloat(row.high_24h) || 0,
          low24h: parseFloat(row.low_24h) || 0,
          volume24h: parseInt(row.volume_24h) || 0,
          change: parseFloat(row.change_amount) || 0,
          changePercent: parseFloat(row.change_percent) || 0,
          timestamp: row.updated_at || new Date()
        });
      }

      console.log(`[MarketData] Loaded ${this.marketData.size} symbols from database`);
    } catch (err: any) {
      console.error('[MarketData] Failed to load from database:', err.message);
      this.initializeEmptyMarketData();
    }
  }

  /**
   * 保存行情数据到数据库
   */
  private async saveToDatabase(productCode: string, data: MarketData): Promise<void> {
    if (!this.databaseConnected) return;

    try {
      await query(
        `INSERT INTO market_data (
          product_code, product_name, price, bid, ask, open_price,
          high_24h, low_24h, last_close, volume_24h, change_amount, change_percent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (product_code) DO UPDATE SET
          price = EXCLUDED.price,
          bid = EXCLUDED.bid,
          ask = EXCLUDED.ask,
          open_price = EXCLUDED.open_price,
          high_24h = EXCLUDED.high_24h,
          low_24h = EXCLUDED.low_24h,
          last_close = EXCLUDED.last_close,
          volume_24h = EXCLUDED.volume_24h,
          change_amount = EXCLUDED.change_amount,
          change_percent = EXCLUDED.change_percent,
          updated_at = NOW()`,
        [
          data.productCode,
          data.productName,
          data.lastPrice,
          data.bid,
          data.ask,
          data.openPrice,
          data.high24h,
          data.low24h,
          data.lastPrice - data.change, // 计算lastClose
          data.volume24h,
          data.change,
          data.changePercent
        ]
      );
    } catch (err: any) {
      console.error(`[MarketData] Failed to save ${productCode} to database:`, err.message);
    }
  }

  /**
   * 检查数海API是否可用
   */
  private async checkShuhaiAvailability(): Promise<void> {
    try {
      // 使用批量接口测试
      const symbols = ALL_PRODUCTS.map(p => p.shuhaiCode).join(',');
      const url = `${SHUHAI_API_BASE}?type=stock&u=${SHUHAI_USERNAME}&p=${SHUHAI_PASSWORD}&symbol=${symbols}`;

      const response = await shuhaiAxios.get(url);

      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        this.shuhaiAvailable = true;
        console.log('[MarketData] Shuhai API connected successfully');
      } else {
        this.shuhaiAvailable = false;
        this.lastShuhaiError = 'No data returned';
        console.log('[MarketData] Shuhai API connection failed:', this.lastShuhaiError);
      }
    } catch (err: any) {
      this.shuhaiAvailable = false;
      this.lastShuhaiError = err.message;
      console.log('[MarketData] Shuhai API connection failed:', err.message);
    }
  }

  /**
   * 从数海API批量获取行情
   */
  private async fetchShuhaiBatchQuotes(): Promise<MarketData[]> {
    try {
      // 过滤掉没有shuhaiCode的品种
      const validProducts = ALL_PRODUCTS.filter(p => p.shuhaiCode);
      if (validProducts.length === 0) {
        console.warn('[MarketData] No valid shuhai products to fetch');
        return [];
      }

      const symbols = validProducts.map(p => p.shuhaiCode).join(',');
      const url = `${SHUHAI_API_BASE}?type=stock&u=${SHUHAI_USERNAME}&p=${SHUHAI_PASSWORD}&symbol=${symbols}`;

      console.log(`[MarketData] Fetching batch quotes from Shuhai API: ${url}`);
      const response = await shuhaiAxios.get(url);

      if (!response.data || !Array.isArray(response.data)) {
        console.error('[MarketData] Invalid response from Shuhai API');
        return [];
      }

      // 构建品种代码映射
      const shuhaiCodeToProduct: Record<string, string> = {};
      ALL_PRODUCTS.forEach(p => {
        if (p.shuhaiCode) {
          shuhaiCodeToProduct[p.shuhaiCode] = p.code;
        }
      });

      const results: MarketData[] = [];
      const updatedSymbols: string[] = [];

      for (const quoteData of response.data) {
        const shuhaiCode = quoteData.Symbol;
        const productCode = shuhaiCodeToProduct[shuhaiCode];

        if (!productCode) {
          console.log(`[MarketData] Unknown shuhai code: ${shuhaiCode}`);
          continue;
        }

        const product = ALL_PRODUCTS.find(p => p.code === productCode);
        const lastClose = quoteData.LastClose || 0;
        const lastPrice = quoteData.NewPrice || 0;
        const openPrice = quoteData.Open || lastClose;

        // 如果新数据的价格为0或无效，跳过更新，保持旧的价格
        if (lastPrice === 0) {
          console.warn(`[MarketData] No valid price data for ${productCode}, keeping previous price`);
          continue;
        }

        const marketData: MarketData = {
          productCode: productCode,
          productName: product?.name || quoteData.Name || productCode,
          bid: quoteData.BP1 || lastPrice - 0.1,
          ask: quoteData.SP1 || lastPrice + 0.1,
          lastPrice: lastPrice,
          openPrice: openPrice,
          high24h: quoteData.High || lastPrice * 1.005,
          low24h: quoteData.Low || lastPrice * 0.995,
          volume24h: quoteData.Volume || 0,
          change: lastPrice - lastClose,
          changePercent: quoteData.PriceChangeRatio || ((lastPrice - lastClose) / lastClose * 100),
          timestamp: new Date()
        };

        results.push(marketData);
        this.marketData.set(productCode, marketData);
        updatedSymbols.push(productCode);
        console.log(`[MarketData] Updated ${productCode}: ${lastPrice} (${marketData.changePercent > 0 ? '+' : ''}${marketData.changePercent.toFixed(2)}%)`);
      }

      // 通过 WebSocket 推送更新的行情数据
      if (this.io && updatedSymbols.length > 0) {
        this.io.to('market').emit('market:update', {
          type: 'quote',
          symbols: updatedSymbols,
          data: results,
          timestamp: Date.now()
        });
        console.log(`[MarketData] Pushed ${updatedSymbols.length} symbols via WebSocket`);
      }

      return results;
    } catch (err: any) {
      console.error('[MarketData] Failed to fetch batch quotes:', err.message);
      // 返回空数组，让系统使用缓存的数据
      return [];
    }
  }

  /**
   * 更新行情数据
   */
  private async updateMarketData(): Promise<void> {
    // 从数海API批量获取数据
    if (this.shuhaiAvailable) {
      const marketDataList = await this.fetchShuhaiBatchQuotes();

      // 保存到数据库
      for (const data of marketDataList) {
        await this.saveToDatabase(data.productCode, data);
      }

      console.log(`[MarketData] Updated ${marketDataList.length}/${ALL_PRODUCTS.length} symbols from Shuhai API`);
    } else {
      // 数海API不可用，尝试重新连接
      console.log('[MarketData] Shuhai API not available, retrying...');
      await this.checkShuhaiAvailability();
    }

    // 如果数据库有数据但内存没有，从数据库加载
    if (this.databaseConnected) {
      try {
        const result = await query('SELECT * FROM market_data WHERE price > 0 ORDER BY product_code');
        for (const row of result.rows) {
          if (!this.marketData.has(row.product_code) || this.marketData.get(row.product_code)?.lastPrice === 0) {
            this.marketData.set(row.product_code, {
              productCode: row.product_code,
              productName: row.product_name,
              bid: parseFloat(row.bid) || 0,
              ask: parseFloat(row.ask) || 0,
              lastPrice: parseFloat(row.price) || 0,
              openPrice: parseFloat(row.open_price) || 0,
              high24h: parseFloat(row.high_24h) || 0,
              low24h: parseFloat(row.low_24h) || 0,
              volume24h: parseInt(row.volume_24h) || 0,
              change: parseFloat(row.change_amount) || 0,
              changePercent: parseFloat(row.change_percent) || 0,
              timestamp: row.updated_at || new Date()
            });
            console.log(`[MarketData] Loaded ${row.product_code} from database: ${row.price}`);
          }
        }
      } catch (err: any) {
        console.error('[MarketData] Failed to load from database:', err.message);
      }
    }
  }

  /**
   * 启动价格更新
   */
  private startPriceUpdate(): void {
    console.log('[MarketData] Starting price update interval (500ms)');
    // 固定500ms更新一次
    this.updateInterval = setInterval(async () => {
      await this.updateMarketData();
    }, 500);
  }

  /**
   * 获取单个产品行情（从内存缓存）
   */
  getMarketData(productCode: string): MarketData | undefined {
    return this.marketData.get(productCode);
  }

  /**
   * 获取所有行情（从内存缓存）
   */
  getAllMarketData(): MarketData[] {
    return Array.from(this.marketData.values());
  }

  /**
   * 获取所有行情（Map格式）
   */
  getAllMarketDataMap(): Map<string, MarketData> {
    return new Map(this.marketData);
  }

  /**
   * 获取服务状态
   */
  getServiceStatus() {
    const availableData = Array.from(this.marketData.values()).filter(d => d.lastPrice > 0);
    return {
      mode: this.databaseConnected ? 'Shuhai API + Database' : 'Shuhai API + Memory',
      shuhaiAvailable: this.shuhaiAvailable,
      lastShuhaiError: this.lastShuhaiError,
      databaseConnected: this.databaseConnected,
      totalSymbols: this.marketData.size,
      availableSymbols: availableData.length,
      symbolsWithData: availableData.map(d => d.productCode),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 停止更新
   */
  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }
}
