import { Router } from 'express';
import crypto from 'crypto';
import axios from 'axios';
import http from 'http';
import https from 'https';
import { query, findOne, findMany, update } from '../config/database';

// ============================================
// 数海行情 API 代理路由（数据库缓存）
// ============================================

const SHUHAI_API_BASE = process.env.MARKET_API_BASE || 'http://ds.cnshuhai.com/stock.php';
const SHUHAI_USERNAME = process.env.SHUHAI_USERNAME || 'wu123';
const SHUHAI_PASSWORD = process.env.SHUHAI_PASSWORD || 'wu123';

// 创建axios实例，禁用代理以避免407错误
const shuhaiAxios = axios.create({
  timeout: 15000,
  httpAgent: new http.Agent({ keepAlive: true, rejectUnauthorized: false }),
  httpsAgent: new https.Agent({ keepAlive: true, rejectUnauthorized: false }),
  proxy: false, // 禁用代理
  decompress: true, // 启用自动解压（gzip/deflate）
});

// ============================================
// 内存缓存配置
// ============================================

interface CacheItem {
  data: any;
  timestamp: number;
}

// 缓存存储
const quoteCache = new Map<string, CacheItem>();
const batchCache = new Map<string, CacheItem>();

// 缓存过期时间（毫秒）
const CACHE_TTL = 5000; // 5秒缓存
const KLINE_CACHE_TTL = 60000; // K线数据缓存60秒

// 品种代码映射 (数海格式: 市场代码+品种代码)
// 可用市场: CE(欧洲期货), HI(恒指期货), CM(商品期货), NE(美期货)
const SYMBOL_MAPPING: Record<string, string> = {
  // CE 市场 (欧洲期货)
  'DAX': 'CEDAXA0',     // 德指 ✅
  'NQ': 'CENQA0',       // 小纳指 ✅

  // HI 市场 (恒指期货)
  'HSI': 'HIHHI01',     // 恒指 ✅
  'MHSI': 'HIMCH01',    // 小恒指 ✅

  // CM 市场 (商品期货)
  'GOLD': 'CMGCA0',     // 美黄金 ✅

  // NE 市场 (美期货)
  'USOIL': 'NECLA0',    // 美原油 ✅
};

// 市场品种列表
export const MARKET_SYMBOLS = [
  // CE 市场 - 欧洲期货
  { symbol: 'DAX', name: '德指', shuhaiCode: 'CEDAXA0', market: 'CE' },
  { symbol: 'NQ', name: '小纳指', shuhaiCode: 'CENQA0', market: 'CE' },

  // HI 市场 - 恒指期货
  { symbol: 'HSI', name: '恒指', shuhaiCode: 'HIHHI01', market: 'HI' },
  { symbol: 'MHSI', name: '小恒指', shuhaiCode: 'HIMCH01', market: 'HI' },

  // CM 市场 - 商品期货
  { symbol: 'GOLD', name: '黄金', shuhaiCode: 'CMGCA0', market: 'CM' },

  // NE 市场 - 美期货
  { symbol: 'USOIL', name: '原油', shuhaiCode: 'NECLA0', market: 'NE' },
];

/**
 * 从数据库获取实时行情缓存
 */
async function getQuoteFromDB(symbol: string): Promise<any | null> {
  try {
    const cached = await findOne(`
      SELECT * FROM shuhai_quote_cache
      WHERE symbol = $1 AND cached_at > NOW() - INTERVAL '5 seconds'
    `, [symbol]);
    return cached;
  } catch (error) {
    console.error('[数据库] 获取行情缓存失败:', error);
    return null;
  }
}

/**
 * 保存实时行情到数据库
 */
async function saveQuoteToDB(symbol: string, shuhaiCode: string, data: any): Promise<void> {
  try {
    await update(`
      INSERT INTO shuhai_quote_cache (
        symbol, shuhai_code, price, open, high, low, close, volume, amount,
        last_close, change, change_percent, bid_price, ask_price, quote_time
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (symbol) DO UPDATE SET
        shuhai_code = EXCLUDED.shuhai_code,
        price = EXCLUDED.price,
        open = EXCLUDED.open,
        high = EXCLUDED.high,
        low = EXCLUDED.low,
        close = EXCLUDED.close,
        volume = EXCLUDED.volume,
        amount = EXCLUDED.amount,
        last_close = EXCLUDED.last_close,
        change = EXCLUDED.change,
        change_percent = EXCLUDED.change_percent,
        bid_price = EXCLUDED.bid_price,
        ask_price = EXCLUDED.ask_price,
        quote_time = EXCLUDED.quote_time,
        cached_at = CURRENT_TIMESTAMP
    `, [
      symbol, shuhaiCode, data.price, data.open, data.high, data.low, data.close,
      data.volume, data.amount, data.lastClose, data.change, data.changePercent,
      data.bidPrice, data.askPrice, new Date(data.timestamp * 1000)
    ]);
    console.log(`[数据库] 行情缓存已保存: ${symbol}`);
  } catch (error) {
    console.error('[数据库] 保存行情缓存失败:', error);
  }
}

/**
 * 从数据库获取K线缓存
 */
async function getKlineFromDB(symbol: string, period: number, limit: number = 100): Promise<any[] | null> {
  try {
    const cached = await findMany(`
      SELECT kline_time, open, close, high, low, volume, amount
      FROM shuhai_kline_cache
      WHERE symbol = $1 AND period = $2
      ORDER BY kline_time DESC
      LIMIT $3
    `, [symbol, period, limit]);
    
    if (cached.length > 0) {
      // 转换为前端需要的格式 [time, open, close, low, high]
      return cached.map(k => [
        new Date(k.kline_time).getTime(),
        parseFloat(k.open),
        parseFloat(k.close),
        parseFloat(k.low),
        parseFloat(k.high)
      ]).reverse(); // 按时间升序排序
    }
    return null;
  } catch (error) {
    console.error('[数据库] 获取K线缓存失败:', error);
    return null;
  }
}

/**
 * 保存K线数据到数据库
 */
async function saveKlineToDB(symbol: string, shuhaiCode: string, period: number, klineData: any[]): Promise<void> {
  try {
    for (const k of klineData) {
      const klineTime = k.time || k.date || k.datetime;
      if (!klineTime) continue;

      await update(`
        INSERT INTO shuhai_kline_cache (
          symbol, shuhai_code, period, kline_time, open, close, high, low, volume, amount
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (symbol, period, kline_time) DO UPDATE SET
          open = EXCLUDED.open,
          close = EXCLUDED.close,
          high = EXCLUDED.high,
          low = EXCLUDED.low,
          volume = EXCLUDED.volume,
          amount = EXCLUDED.amount,
          cached_at = CURRENT_TIMESTAMP
      `, [
        symbol, shuhaiCode, period, new Date(klineTime),
        k.open || 0, k.close || 0, k.high || 0, k.low || 0,
        k.volume || 0, k.amount || 0
      ]);
    }
    console.log(`[数据库] K线数据已保存: ${symbol}, 周期: ${period}, 数量: ${klineData.length}`);
  } catch (error) {
    console.error('[数据库] 保存K线缓存失败:', error);
  }
}

/**
 * 从内存缓存获取数据
 */
function getFromCache(cache: Map<string, CacheItem>, key: string): any | null {
  const item = cache.get(key);
  if (!item) return null;

  const now = Date.now();
  if (now - item.timestamp > CACHE_TTL) {
    // 缓存过期，删除
    cache.delete(key);
    return null;
  }

  return item.data;
}

/**
 * 存入内存缓存
 */
function setCache(cache: Map<string, CacheItem>, key: string, data: any): void {
  cache.set(key, {
    data,
    timestamp: Date.now()
  });
}

/**
 * 清理过期缓存
 */
function cleanExpiredCache(cache: Map<string, CacheItem>): void {
  const now = Date.now();
  for (const [key, item] of cache.entries()) {
    if (now - item.timestamp > CACHE_TTL) {
      cache.delete(key);
    }
  }
}

/**
 * 生成 MD5 签名
 */
function generateSignature(timestamp: number): string {
  const stringA = `u=${SHUHAI_USERNAME}&p=${SHUHAI_PASSWORD}&stamp=${timestamp}`;
  return crypto.createHash('md5').update(stringA).digest('hex');
}

/**
 * 构建请求 URL
 */
function buildShuhaiUrl(params: Record<string, string | number>): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = generateSignature(timestamp);

  const queryParams = new URLSearchParams();
  queryParams.append('u', SHUHAI_USERNAME);
  queryParams.append('stamp', timestamp.toString());
  queryParams.append('sign', sign);

  Object.entries(params).forEach(([key, value]) => {
    queryParams.append(key, value.toString());
  });

  return `${SHUHAI_API_BASE}?${queryParams.toString()}`;
}

/**
 * 统一响应格式
 */
const success = <T>(data: T, message: string = 'success') => ({
  code: 0,
  message,
  data,
  timestamp: Date.now()
});

const error = (code: number, message: string) => ({
  code,
  message,
  data: null,
  timestamp: Date.now()
});

/**
 * 创建数海代理路由
 */
export function createShuhaiRouter(): Router {
  const router = Router();

  // 定期清理过期缓存（每30秒清理一次）
  setInterval(() => {
    const beforeQuote = quoteCache.size;
    const beforeBatch = batchCache.size;

    cleanExpiredCache(quoteCache);
    cleanExpiredCache(batchCache);

    const afterQuote = quoteCache.size;
    const afterBatch = batchCache.size;

    if (beforeQuote !== afterQuote || beforeBatch !== afterBatch) {
      console.log(`[数海代理] 清理过期缓存: quote(${beforeQuote}->${afterQuote}), batch(${beforeBatch}->${afterBatch})`);
    }
  }, 30000);

  // ============================================
  // 健康检查
  // ============================================

  router.get('/health', (req, res) => {
    res.json(success({
      status: 'ok',
      service: 'shuhai-proxy',
      username: SHUHAI_USERNAME,
      cache: {
        quoteCache: quoteCache.size,
        batchCache: batchCache.size,
        ttl: `${CACHE_TTL / 1000}秒`
      }
    }));
  });

  // ============================================
  // 缓存管理
  // ============================================

  router.get('/cache/stats', (req, res) => {
    // 清理过期缓存
    cleanExpiredCache(quoteCache);
    cleanExpiredCache(batchCache);

    res.json(success({
      quoteCacheSize: quoteCache.size,
      batchCacheSize: batchCache.size,
      ttlSeconds: CACHE_TTL / 1000,
      quoteCacheKeys: Array.from(quoteCache.keys()),
      batchCacheKeys: Array.from(batchCache.keys())
    }));
  });

  router.delete('/cache', (req, res) => {
    quoteCache.clear();
    batchCache.clear();
    console.log('[数海代理] 缓存已清空');
    res.json(success({ message: '缓存已清空' }));
  });

  // ============================================
  // 品种列表
  // ============================================

  router.get('/symbols', (req, res) => {
    res.json(success(MARKET_SYMBOLS));
  });

  // ============================================
  // 实时行情（数据库缓存）
  // ============================================

  router.get('/quote', async (req, res) => {
    let code: string = '';
    try {
      const codeParam = req.query.code;

      if (!codeParam || typeof codeParam !== 'string') {
        return res.status(400).json(error(400, '缺少必要参数: code'));
      }

      code = codeParam;

      // 使用数海代码
      const shuhaiCode = SYMBOL_MAPPING[code] || code;

      // 先检查数据库缓存（如果数据库可用）
      try {
        const cachedData = await getQuoteFromDB(code);
        if (cachedData) {
          console.log(`[数据库] 从数据库获取行情缓存: ${code}`);
          return res.json(success({
            code: cachedData.symbol,
            price: parseFloat(cachedData.price),
            open: parseFloat(cachedData.open),
            high: parseFloat(cachedData.high),
            low: parseFloat(cachedData.low),
            close: parseFloat(cachedData.close),
            volume: parseInt(cachedData.volume),
            amount: parseInt(cachedData.amount),
            lastClose: parseFloat(cachedData.last_close),
            change: parseFloat(cachedData.change),
            changePercent: parseFloat(cachedData.change_percent),
            timestamp: cachedData.quote_time ? new Date(cachedData.quote_time).getTime() / 1000 : Date.now(),
            datetime: cachedData.quote_time || new Date().toISOString(),
            name: code,
            bidPrice: parseFloat(cachedData.bid_price),
            askPrice: parseFloat(cachedData.ask_price),
          }));
        }
      } catch (dbError) {
        console.log(`[数据库] 数据库查询失败，跳过数据库缓存: ${dbError.message}`);
      }

      // 检查内存缓存（备用）
      const cacheKey = `quote:${code}`;
      const memCachedData = getFromCache(quoteCache, cacheKey);
      if (memCachedData) {
        console.log(`[内存] 从内存缓存获取行情: ${code}`);
        return res.json(success(memCachedData));
      }

      // 使用单个请求（批量请求可能返回407）
      const queryParams = new URLSearchParams();
      queryParams.append('type', 'stock');
      queryParams.append('u', SHUHAI_USERNAME);
      queryParams.append('p', SHUHAI_PASSWORD);
      queryParams.append('symbol', shuhaiCode);

      const url = `${SHUHAI_API_BASE}?${queryParams.toString()}`;

      console.log(`[数海代理] 从API获取实时行情: ${code} -> ${shuhaiCode} (单个请求)`);

      const response = await shuhaiAxios.get(url);

      const data = response.data;

      // 检查是否是错误响应
      if (data.info && typeof data.info === 'string') {
        console.error(`[数海代理] API返回错误 (${code}): ${data.info}`);
        // 返回错误但不返回500状态码，返回400状态码表示客户端问题（品种代码无效等）
        return res.status(400).json(error(400, `API错误 (${code}): ${data.info}`));
      }

      // 检查是否返回了空数据
      if (!data || (Array.isArray(data) && data.length === 0)) {
        console.error(`[数海代理] API返回空数据 (${code})`);
        return res.status(404).json(error(404, `品种 ${code} 暂无数据`));
      }

      // 转换数据格式 - 单个品种返回
      const quoteData = Array.isArray(data) ? data[0] : data;

      // 验证数据是否有效
      if (!quoteData || typeof quoteData !== 'object') {
        console.error(`[数海代理] API返回无效数据格式 (${code})`);
        return res.status(500).json(error(500, `API返回无效数据格式 (${code})`));
      }

      const formatted = {
        code: code,
        price: quoteData.NewPrice || quoteData.Price || 0,
        open: quoteData.Open || 0,
        high: quoteData.High || 0,
        low: quoteData.Low || 0,
        close: quoteData.NewPrice || quoteData.Price || 0,
        volume: quoteData.Volume || 0,
        amount: quoteData.Amount || 0,
        lastClose: quoteData.LastClose || 0,
        change: quoteData.NewPrice ? (quoteData.NewPrice - (quoteData.LastClose || 0)) : 0,
        changePercent: quoteData.PriceChangeRatio || 0,
        timestamp: quoteData.Date || Math.floor(Date.now() / 1000),
        datetime: new Date((quoteData.Date || Date.now()) * 1000).toISOString(),
        name: quoteData.Name || code,
        bidPrice: quoteData.BP1 || 0,
        askPrice: quoteData.SP1 || 0,
      };

      // 存入内存缓存
      setCache(quoteCache, cacheKey, formatted);

      // 存入数据库缓存（异步，不阻塞响应）
      saveQuoteToDB(code, shuhaiCode, formatted).catch(err => {
        console.log(`[数据库] 保存行情缓存失败: ${err.message}`);
      });

      res.json(success(formatted));

    } catch (err: any) {
      console.error('[数海代理] 获取实时行情错误:', err.message);
      if (err.response) {
        console.error('[数海代理] API响应状态:', err.response.status);
        console.error('[数海代理] API响应数据:', err.response.data);

        // 处理数海API的407错误（频率过高）
        if (err.response.status === 407) {
          const errorMsg = err.response.data?.info || '请求频率过高';
          console.warn(`[数海代理] API限流 (${code}): ${errorMsg}`);
          return res.status(429).json(error(429, `API限流 (${code}): ${errorMsg}，请稍后重试`));
        }

        // 处理其他HTTP错误状态码
        if (err.response.status >= 400 && err.response.status < 500) {
          const errorMsg = err.response.data?.info || err.response.data?.message || '请求失败';
          return res.status(err.response.status).json(error(err.response.status, `API错误 (${code}): ${errorMsg}`));
        }
      }

      if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
        res.status(504).json(error(504, `API请求超时 (${code}): 请稍后重试`));
      } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        res.status(503).json(error(503, `API服务不可用 (${code}): ${err.message}`));
      } else {
        res.status(500).json(error(500, `服务器错误 (${code}): ${err.message}`));
      }
    }
  });

  // ============================================
  // K线数据（数据库缓存）
  // ============================================

  router.get('/kline', async (req, res) => {
    let code: string = '';
    try {
      const codeParam = req.query.code;
      const period = req.query.period || '60';
      const count = req.query.count || '100';

      if (!codeParam || typeof codeParam !== 'string') {
        return res.status(400).json(error(400, '缺少必要参数: code'));
      }

      code = codeParam;

      const periodNum = parseInt(period as string);
      const countNum = parseInt(count as string);
      const shuhaiCode = SYMBOL_MAPPING[code] || code;

      // 先检查数据库缓存（如果数据库可用）
      try {
        const cachedData = await getKlineFromDB(code, periodNum, countNum);
        if (cachedData && cachedData.length > 0) {
          console.log(`[数据库] 从数据库获取K线缓存: ${code}, 周期: ${period}, 数量: ${cachedData.length}`);
          return res.json(success({
            code: shuhaiCode,
            originalCode: code,
            period: period,
            data: cachedData
          }));
        }
      } catch (dbError) {
        console.log(`[数据库] 数据库查询失败，跳过数据库缓存: ${dbError.message}`);
      }

      // 检查内存缓存（备用）
      const memCacheKey = `kline:${code}:${period}`;
      const memCachedData = getFromCache(quoteCache, memCacheKey);
      if (memCachedData) {
        console.log(`[内存] 从内存缓存获取K线: ${code}, 周期: ${period}`);
        return res.json(success({
          code: shuhaiCode,
          originalCode: code,
          period: period,
          data: memCachedData
        }));
      }

      // 从数海API获取
      // 数海K线接口使用 type=kline + line 参数
      // 注意：K线接口需要使用完整代码（CEDAXA0），不是移除前缀后的代码

      // 构建K线类型参数: line=min,period (如 line=min,60 表示60分钟线)
      const lineType = `min,${period}`;

      // 计算时间范围：从当前时间往前推
      const now = Math.floor(Date.now() / 1000); // 当前秒级时间戳
      const et = now; // 结束时间（当前时间）
      const st = now - (count * period * 60); // 起始时间

      const queryParams = new URLSearchParams();
      queryParams.append('type', 'kline');
      queryParams.append('u', SHUHAI_USERNAME);
      queryParams.append('p', SHUHAI_PASSWORD);
      queryParams.append('symbol', shuhaiCode); // 使用完整代码
      queryParams.append('line', lineType);
      queryParams.append('num', count.toString());
      queryParams.append('st', st.toString()); // 起始时间
      queryParams.append('et', et.toString()); // 结束时间
      queryParams.append('sort', 'Date asc'); // 按时间升序

      const url = `${SHUHAI_API_BASE}?${queryParams.toString()}`;

      console.log(`[数海代理] 从API获取K线数据: ${shuhaiCode}, 类型: ${lineType}, 数量: ${count}, 时间范围: ${st} - ${et}`);

      let klineData: any[] = [];

      try {
        const response = await shuhaiAxios.get(url);

        // 检查是否有错误信息
        if (response.data && response.data.info && typeof response.data.info === 'string') {
          console.error(`[数海代理] K线API返回错误: ${response.data.info}`);
          klineData = [];
        } else {
          const apiData = response.data;
          console.log(`[数海代理] K线数据获取成功, 数据量: ${Array.isArray(apiData) ? apiData.length : 'N/A'}`);

          // 转换数据格式
          if (Array.isArray(apiData)) {
            klineData = apiData.map((item: any) => {
              const time = item.Date || item.date || item.time || item.datetime || Date.now();
              const timestamp = typeof time === 'number' ? time * 1000 : new Date(time).getTime();
              return [
                timestamp,
                item.Open || item.open || 0,
                item.Close || item.close || 0,
                item.Low || item.low || 0,
                item.High || item.high || 0
              ];
            });
          }
        }
      } catch (apiError: any) {
        console.error(`[数海代理] 数海K线API失败: ${apiError.message}`);
        if (apiError.response) {
          console.error(`[数海代理] 响应状态: ${apiError.response.status}`);
          console.error(`[数海代理] 响应数据:`, apiError.response.data);
        }
        // API失败时返回空数据，让前端使用模拟数据
        klineData = [];
      }

      // 保存到内存缓存（仅当有数据时）
      if (klineData.length > 0) {
        setCache(quoteCache, memCacheKey, klineData);

        // 保存到数据库缓存（异步，不阻塞响应）
        const dbData = klineData.map((k: any) => ({
          time: k[0],
          open: k[1],
          close: k[2],
          low: k[3],
          high: k[4]
        }));
        saveKlineToDB(code, shuhaiCode, periodNum, dbData).catch(err => {
          console.log(`[数据库] 保存K线缓存失败: ${err.message}`);
        });
      }

      res.json(success({
        code: shuhaiCode,
        originalCode: code,
        period: period,
        data: klineData
      }));

    } catch (err: any) {
      console.error('[数海代理] 获取K线数据错误:', err);
      res.status(500).json(error(500, `服务器错误: ${err.message}`));
    }
  });

  // ============================================
  // 批量获取行情
  // ============================================

  router.get('/batch-quotes', async (req, res) => {
    try {
      const { codes } = req.query;

      if (!codes || typeof codes !== 'string') {
        return res.status(400).json(error(400, '缺少必要参数: codes (逗号分隔)'));
      }

      const codeList = codes.split(',').map(c => c.trim());
      const cacheKey = `batch:${codes}`;
      const results: any = {};

      // 检查缓存
      const cachedData = getFromCache(batchCache, cacheKey);
      if (cachedData) {
        console.log(`[数海代理] 从缓存获取批量行情: ${codeList.join(', ')}`);
        return res.json(success(cachedData));
      }

      console.log(`[数海代理] 从API批量获取行情: ${codeList.join(', ')}`);

      // 添加并发限制，防止API限流或DoS
      const BATCH_SIZE = 10;

      async function batchProcess<T>(
        items: T[],
        processor: (item: T) => Promise<void>,
        batchSize: number
      ): Promise<void> {
        for (let i = 0; i < items.length; i += batchSize) {
          const batch = items.slice(i, i + batchSize);
          await Promise.all(batch.map(processor));
          // 批次间添加延迟，避免API限流
          if (i + batchSize < items.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      }

      // 使用批次处理限制并发
      await batchProcess(codeList, async (code) => {
        const shuhaiCode = SYMBOL_MAPPING[code] || code;

        // 先检查单个品种的缓存
        const quoteCacheKey = `quote:${code}`;
        const cachedQuote = getFromCache(quoteCache, quoteCacheKey);
        if (cachedQuote) {
          results[code] = { success: true, data: cachedQuote };
          return;
        }

        const queryParams = new URLSearchParams();
        queryParams.append('type', 'stock');
        queryParams.append('u', SHUHAI_USERNAME);
        queryParams.append('p', SHUHAI_PASSWORD);
        queryParams.append('symbol', shuhaiCode);
        const url = `${SHUHAI_API_BASE}?${queryParams.toString()}`;

        try {
          const response = await shuhaiAxios.get(url);
          const data = response.data;

          if (data.info && typeof data.info === 'string') {
            results[code] = { success: false, error: data.info };
            return;
          }

          const quoteData = Array.isArray(data) && data[0] ? data[0] : data;
          const formatted = {
            code: code,
            price: quoteData.NewPrice || quoteData.Price || 0,
            open: quoteData.Open || 0,
            high: quoteData.High || 0,
            low: quoteData.Low || 0,
            close: quoteData.NewPrice || quoteData.Price || 0,
            volume: quoteData.Volume || 0,
            lastClose: quoteData.LastClose || 0,
            change: quoteData.NewPrice ? (quoteData.NewPrice - (quoteData.LastClose || 0)) : 0,
            changePercent: quoteData.PriceChangeRatio || 0,
            name: quoteData.Name || code,
          };

          results[code] = { success: true, data: formatted };

          // 存入单个品种缓存
          setCache(quoteCache, quoteCacheKey, formatted);

        } catch (err: any) {
          results[code] = { success: false, error: err.message };
        }
      }, BATCH_SIZE);

      // 存入批量缓存
      setCache(batchCache, cacheKey, results);

      res.json(success(results));

    } catch (err: any) {
      console.error('[数海代理] 批量获取行情错误:', err);
      res.status(500).json(error(500, `服务器错误: ${err.message}`));
    }
  });

  return router;
}
