import express from 'express';
import logger from '../utils/logger';
import fetch from 'node-fetch';
import { query } from '../config/database';

const router = express.Router();

async function getAIConfig() {
  const result = await query(
    `SELECT config_key, config_value FROM system_configs WHERE config_key IN ('AI_BASE_URL', 'AI_MODEL_ID', 'AI_API_KEY')`
  );
  const map: Record<string, string> = {};
  result.rows.forEach((r: any) => { map[r.config_key] = r.config_value; });
  return {
    baseUrl: map.AI_BASE_URL || '',
    modelId: map.AI_MODEL_ID || '',
    apiKey: map.AI_API_KEY || ''
  };
}

/**
 * GET /ai/jinshinews - 获取金十新闻（占位，后续可接真实源）
 */
router.get('/jinshinews', (req: any, res: any) => {
  try {
    const news = [
      { title: '国际金价小幅上涨，市场情绪谨慎', time: '2024-02-24 10:30', summary: '国际金价今日小幅上涨，投资者对未来政策保持观望态度。' },
      { title: '美元指数走弱，支撑贵金属价格', time: '2024-02-24 09:15', summary: '美元指数今日走弱，为贵金属价格提供支撑。' },
      { title: '美联储官员讲话市场反应平淡', time: '2024-02-24 08:00', summary: '美联储官员最新讲话未对市场产生显著影响。' }
    ];

    res.json({ code: 0, message: 'success', data: news, timestamp: Date.now() });
  } catch (error) {
    logger.error('[AI] 获取金十新闻失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null, timestamp: Date.now() });
  }
});

/**
 * POST /ai/generate-summary - 生成AI分析摘要（OpenAI兼容代理）
 */
router.post('/generate-summary', async (req: any, res: any) => {
  try {
    const { news, market } = req.body || {};

    const { baseUrl, modelId, apiKey } = await getAIConfig();

    if (!baseUrl || !modelId || !apiKey) {
      return res.status(400).json({ code: 400, message: 'AI配置不完整', data: null, timestamp: Date.now() });
    }

    const prompt = `基于以下新闻与市场数据，输出趋势/支撑/阻力/风险/总结：\n\n新闻：${JSON.stringify(news || [])}\n\n市场：${JSON.stringify(market || [])}`;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'system', content: '你是贵金属交易分析师。输出JSON，包含 trend/support/resistance/risk/summary/newsHighlight 字段。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3
      })
    });

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || '';

    let parsed: any = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = null;
    }

    if (!parsed) {
      parsed = {
        trend: '震荡',
        support: 0,
        resistance: 0,
        risk: 'medium',
        summary: content || '暂无分析结果',
        newsHighlight: ''
      };
    }

    res.json({ code: 0, message: 'success', data: parsed, timestamp: Date.now() });
  } catch (error) {
    logger.error('[AI] 生成分析失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null, timestamp: Date.now() });
  }
});

export default router;
