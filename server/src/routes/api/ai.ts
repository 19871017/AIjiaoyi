import { Router, Request, Response } from 'express';
import { AIService } from '../../services/ai.service';

const router = Router();
const aiService = new AIService();

/**
 * AI智能问答接口
 * POST /api/v1/ai/chat
 */
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { userId, question, context, stream } = req.body;

    if (!userId || !question) {
      return res.status(400).json({
        code: 1001,
        message: '缺少必要参数: userId, question',
        data: null
      });
    }

    // 流式返回
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      await aiService.streamChatResponse({
        userId,
        question,
        context,
        onChunk: (chunk) => {
          res.write(`data: ${JSON.stringify({
            type: 'delta',
            content: chunk,
            finished: false
          })}

`);
        },
        onEnd: () => {
          res.write(`data: ${JSON.stringify({
            type: 'done',
            content: '',
            finished: true
          })}

`);
          res.end();
        }
      });
    } else {
      // 普通返回
      const data = await aiService.chat({
        userId,
        question,
        context
      });

      res.json({
        code: 0,
        message: 'success',
        data
      });
    }
  } catch (error) {
    console.error('AI问答失败:', error);
    res.status(500).json({
      code: 5000,
      message: '服务器内部错误',
      data: null
    });
  }
});

/**
 * 技术分析接口
 * POST /api/v1/ai/technical
 */
router.post('/technical', async (req: Request, res: Response) => {
  try {
    const { symbols, indicators, timeframe } = req.body;

    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({
        code: 1001,
        message: '缺少必要参数: symbols',
        data: null
      });
    }

    const data = await aiService.technicalAnalysis({
      symbols,
      indicators,
      timeframe: timeframe || '1h'
    });

    // 技术分析结果缓存60秒
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      code: 0,
      message: 'success',
      data
    });
  } catch (error) {
    console.error('技术分析失败:', error);
    res.status(500).json({
      code: 5000,
      message: '服务器内部错误',
      data: null
    });
  }
});

/**
 * 智能投顾接口
 * POST /api/v1/ai/advisor
 */
router.post('/advisor', async (req: Request, res: Response) => {
  try {
    const { userId, riskProfile, investmentGoal, investmentHorizon, initialCapital } = req.body;

    if (!userId) {
      return res.status(400).json({
        code: 1001,
        message: '缺少必要参数: userId',
        data: null
      });
    }

    const data = await aiService.getAdvisorRecommendation({
      userId,
      riskProfile: riskProfile || 'moderate',
      investmentGoal,
      investmentHorizon: investmentHorizon || 'medium',
      initialCapital
    });

    res.json({
      code: 0,
      message: 'success',
      data
    });
  } catch (error) {
    console.error('智能投顾失败:', error);
    res.status(500).json({
      code: 5000,
      message: '服务器内部错误',
      data: null
    });
  }
});

/**
 * 市场趋势预测
 * POST /api/v1/ai/predict
 */
router.post('/predict', async (req: Request, res: Response) => {
  try {
    const { symbols, timeframe, model } = req.body;

    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({
        code: 1001,
        message: '缺少必要参数: symbols',
        data: null
      });
    }

    const data = await aiService.predictMarketTrend({
      symbols,
      timeframe: timeframe || '1d',
      model: model || 'ensemble'
    });

    // 预测结果缓存300秒（5分钟）
    res.set('Cache-Control', 'public, max-age=300');
    res.json({
      code: 0,
      message: 'success',
      data
    });
  } catch (error) {
    console.error('市场预测失败:', error);
    res.status(500).json({
      code: 5000,
      message: '服务器内部错误',
      data: null
    });
  }
});

/**
 * 获取AI分析历史
 * GET /api/v1/ai/history
 */
router.get('/history', async (req: Request, res: Response) => {
  try {
    const { userId, startDate, endDate, page, pageSize } = req.query;

    if (!userId) {
      return res.status(400).json({
        code: 1001,
        message: '缺少必要参数: userId',
        data: null
      });
    }

    const data = await aiService.getAnalysisHistory({
      userId: userId as string,
      startDate: startDate ? parseInt(startDate as string) : undefined,
      endDate: endDate ? parseInt(endDate as string) : undefined,
      page: page ? parseInt(page as string) : 1,
      pageSize: pageSize ? parseInt(pageSize as string) : 20
    });

    res.json({
      code: 0,
      message: 'success',
      data
    });
  } catch (error) {
    console.error('获取AI历史失败:', error);
    res.status(500).json({
      code: 5000,
      message: '服务器内部错误',
      data: null
    });
  }
});

export default router;

