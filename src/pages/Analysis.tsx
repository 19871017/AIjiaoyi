import { useState, useEffect, useRef, useMemo } from 'react';
import { Card, Button, Tag, Progress } from 'tdesign-react';
import { TrendingUpIcon, ChartIcon, InfoCircleIcon, TimeIcon, SettingIcon, SendIcon, RefreshIcon, MicIcon } from 'tdesign-icons-react';
import ReactECharts from 'echarts-for-react';
import { chatWithGemini, streamChatWithGemini } from '../services/gemini.service';
import { calculateAllIndicators, generateTechnicalSummary, type KLineData, type TechnicalIndicators } from '../services/technical-indicators.service';
import { getKlineBySymbol } from '../services/shuhai-backend.service';
import logger from '../utils/logger';

// AI分析结果接口
interface AIAnalysis {
  trend: string;
  support: number;
  resistance: number;
  risk: 'low' | 'medium' | 'high';
  confidence: number;
  analysis: string;
  suggestion: string;
}

const defaultAiAnalysis: AIAnalysis = {
  trend: '震荡偏空',
  support: 2320,
  resistance: 2355,
  risk: 'medium',
  confidence: 85,
  analysis: '黄金1小时级别处于震荡调整阶段，MACD指标显示空头力量增强，RSI处于中性区域。关键支撑位2320，阻力位2355。',
  suggestion: '建议区间操作，高空低多，止损设置在支撑位下方10美元。'
};

const defaultTechnicalData = {
  trend: '震荡',
  rsi: 52,
  macd: '死叉',
  volume: '萎缩',
  volatility: '中等'
};

const defaultRiskData = {
  level: '中等',
  leverage: 10,
  marginRatio: 68.4,
  alert: '保证金使用率偏高'
};

const symbolList = [
  { code: 'DAX', name: '德指' },
  { code: 'HSI', name: '恒指' },
  { code: 'NQ', name: '纳指' },
  { code: 'MHSI', name: '小恒指' },
  { code: 'GOLD', name: '美黄金' },
  { code: 'USOIL', name: '美原油' }
];

// 各品种默认策略配置
const symbolStrategyConfig: Record<string, Array<{
  name: string;
  direction: string;
  entry: string;
  stopLoss: string;
  takeProfit: string;
  riskRatio: string;
  winRate: string;
}>> = {
  'DAX': [
    { name: '区间突破策略', direction: '观望', entry: '18500-18650区间', stopLoss: '18400', takeProfit: '18800', riskRatio: '1:2.5', winRate: '76%' },
    { name: '趋势跟踪策略', direction: '做多', entry: '18550', stopLoss: '18450', takeProfit: '18750', riskRatio: '1:2', winRate: '80%' },
    { name: '回调买入策略', direction: '等待', entry: '18450-18500', stopLoss: '18380', takeProfit: '18650', riskRatio: '1:2.8', winRate: '74%' }
  ],
  'HSI': [
    { name: '区间突破策略', direction: '观望', entry: '16800-17200区间', stopLoss: '16600', takeProfit: '17500', riskRatio: '1:2.2', winRate: '77%' },
    { name: '趋势跟踪策略', direction: '做多', entry: '17000', stopLoss: '16800', takeProfit: '17400', riskRatio: '1:2', winRate: '79%' },
    { name: '回调买入策略', direction: '等待', entry: '16900-16950', stopLoss: '16750', takeProfit: '17250', riskRatio: '1:2.5', winRate: '75%' }
  ],
  'NQ': [
    { name: '区间突破策略', direction: '观望', entry: '19800-20200区间', stopLoss: '19600', takeProfit: '20500', riskRatio: '1:2.3', winRate: '78%' },
    { name: '趋势跟踪策略', direction: '做多', entry: '20000', stopLoss: '19800', takeProfit: '20400', riskRatio: '1:2', winRate: '81%' },
    { name: '回调买入策略', direction: '等待', entry: '19900-19950', stopLoss: '19750', takeProfit: '20250', riskRatio: '1:2.3', winRate: '76%' }
  ],
  'MHSI': [
    { name: '区间突破策略', direction: '观望', entry: '16800-17200区间', stopLoss: '16600', takeProfit: '17500', riskRatio: '1:2.2', winRate: '77%' },
    { name: '趋势跟踪策略', direction: '做多', entry: '17000', stopLoss: '16800', takeProfit: '17400', riskRatio: '1:2', winRate: '79%' },
    { name: '回调买入策略', direction: '等待', entry: '16900-16950', stopLoss: '16750', takeProfit: '17250', riskRatio: '1:2.5', winRate: '75%' }
  ],
  'GOLD': [
    { name: '区间突破策略', direction: '观望', entry: '2320-2355区间', stopLoss: '2310', takeProfit: '2365', riskRatio: '1:2.5', winRate: '78%' },
    { name: '趋势跟踪策略', direction: '做多', entry: '2340', stopLoss: '2320', takeProfit: '2380', riskRatio: '1:2', winRate: '82%' },
    { name: '回调买入策略', direction: '等待', entry: '2330-2335', stopLoss: '2315', takeProfit: '2360', riskRatio: '1:2', winRate: '75%' }
  ],
  'USOIL': [
    { name: '区间突破策略', direction: '观望', entry: '72.0-75.0区间', stopLoss: '71.0', takeProfit: '77.0', riskRatio: '1:2.5', winRate: '76%' },
    { name: '趋势跟踪策略', direction: '做多', entry: '74.0', stopLoss: '72.5', takeProfit: '77.0', riskRatio: '1:2', winRate: '80%' },
    { name: '回调买入策略', direction: '等待', entry: '73.0-73.5', stopLoss: '72.0', takeProfit: '75.5', riskRatio: '1:2.5', winRate: '74%' }
  ]
};

const getDefaultStrategyList = (symbol: string) => {
  const symbolMap: Record<string, string> = {
    'DAX': '德指',
    'HSI': '恒指',
    'NQ': '纳指',
    'MHSI': '小恒指',
    'GOLD': '美黄金',
    'USOIL': '美原油'
  };
  const symbolName = symbolMap[symbol] || symbol;
  const configs = symbolStrategyConfig[symbol] || symbolStrategyConfig['GOLD'];
  
  return configs.map((config, index) => ({
    id: index + 1,
    name: `${symbolName}${config.name}`,
    direction: config.direction,
    entry: config.entry,
    stopLoss: config.stopLoss,
    takeProfit: config.takeProfit,
    riskRatio: config.riskRatio,
    winRate: config.winRate
  }));
};

// AI分析数据的响应接口
interface AnalysisResult {
  trend: string;
  support: number;
  resistance: number;
  risk: 'low' | 'medium' | 'high';
  confidence: number;
  analysis: string;
  suggestion: string;
  rsi?: number;
  macd?: string;
  volatility?: string;
}

// 快捷问题列表 - 优化为4个
const quickQuestions = [
  '黄金接下来走势如何？',
  '现在适合买入吗？',
  '风险有多大？',
  '建议持仓多久？'
];

export default function Analysis(): JSX.Element {
  const [activeTab, setActiveTab] = useState('ai');
  const [selectedSymbol, setSelectedSymbol] = useState('GOLD');
  const [selectedStrategy, setSelectedStrategy] = useState<number | null>(null);
  const [showSymbolDropdown, setShowSymbolDropdown] = useState(false);
  const symbolDropdownRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isPressing, setIsPressing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [chatHistory, setChatHistory] = useState<Array<{type: 'user' | 'ai', content: string, time: string}>>([]);
  const [isVoiceSupported, setIsVoiceSupported] = useState(true);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis>(defaultAiAnalysis);
  const [technicalData, setTechnicalData] = useState(defaultTechnicalData);
  const [riskData, setRiskData] = useState(defaultRiskData);
  const [strategyList, setStrategyList] = useState(() => getDefaultStrategyList('GOLD'));
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [technicalIndicators, setTechnicalIndicators] = useState<TechnicalIndicators | null>(null);
  const [kLineData, setKLineData] = useState<KLineData[]>([]);
  const [enableStreaming, setEnableStreaming] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (symbolDropdownRef.current && !symbolDropdownRef.current.contains(event.target as Node)) {
        setShowSymbolDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 品种变化时更新策略列表
  useEffect(() => {
    setStrategyList(getDefaultStrategyList(selectedSymbol));
  }, [selectedSymbol]);

  // 初始化语音识别
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      
      if (!SpeechRecognition) {
        setIsVoiceSupported(false);
        logger.warn('浏览器不支持语音识别API');
      } else {
        const recognition = new SpeechRecognition();
        recognition.lang = 'zh-CN';
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setQuery(transcript);
          setIsRecording(false);
        };

        recognition.onerror = (event: any) => {
          logger.error('语音识别错误:', event.error);
          setIsRecording(false);
          
          // 友好的错误提示
          if (event.error === 'no-speech') {
            alert('未检测到语音，请重试');
          } else if (event.error === 'not-allowed') {
            alert('麦克风权限被拒绝，请在浏览器设置中允许');
          } else {
            alert('语音识别失败：' + event.error);
          }
        };

        recognition.onend = () => {
          setIsRecording(false);
        };

        recognitionRef.current = recognition;
      }
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  // 自动滚动到最新消息
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [chatHistory, isLoading]);

  // 加载K线数据并计算技术指标
  useEffect(() => {
    const loadTechnicalIndicators = async () => {
      try {
        setIsAnalyzing(true);
        const data = await getKlineBySymbol(selectedSymbol, 60, 200);
        
        if (data && Array.isArray(data) && data.length > 0) {
          const formattedData: KLineData[] = data.map((item: any) => ({
            time: item.time || Date.now(),
            open: item.open || 0,
            close: item.close || 0,
            high: item.high || 0,
            low: item.low || 0,
            volume: item.volume || 0
          }));
          
          setKLineData(formattedData);
          
          // 计算技术指标
          const indicators = calculateAllIndicators(formattedData);
          setTechnicalIndicators(indicators);
          
          // 生成技术分析摘要
          const currentPrice = formattedData[formattedData.length - 1]?.close || 0;
          const summary = generateTechnicalSummary(indicators, currentPrice);
          
          // 更新技术数据展示
          setTechnicalData({
            trend: summary.trend,
            rsi: indicators.rsi.value,
            macd: indicators.macd.signal === 'buy' ? '金叉' : indicators.macd.signal === 'sell' ? '死叉' : '中性',
            volume: indicators.volumeRatio > 1.5 ? '放量' : indicators.volumeRatio < 0.5 ? '缩量' : '正常',
            volatility: indicators.atr / currentPrice > 0.02 ? '高' : '低'
          });
          
          // 更新AI分析
          setAiAnalysis({
            trend: summary.trend,
            support: summary.support[0] || 0,
            resistance: summary.resistance[0] || 0,
            risk: summary.signal === 'buy' ? 'low' : summary.signal === 'sell' ? 'high' : 'medium',
            confidence: summary.strength,
            analysis: summary.summary,
            suggestion: summary.signal === 'buy' ? '建议逢低买入，止损设于下方支撑位' : 
                       summary.signal === 'sell' ? '建议逢高卖出，止损设于上方阻力位' : 
                       '建议观望，等待明确信号'
          });
        } else {
          logger.warn('API返回数据为空或格式不正确:', data);
        }
      } catch (error) {
        logger.error('加载技术指标失败:', error);
      } finally {
        setIsAnalyzing(false);
      }
    };

    loadTechnicalIndicators();
  }, [selectedSymbol]);

  // 微信风格按住说话
  const handleVoicePressStart = () => {
    if (!isVoiceSupported) {
      alert('您的浏览器不支持语音识别功能，建议使用Chrome浏览器');
      return;
    }
    
    setIsPressing(true);
    setIsRecording(true);
    
    // 开始语音识别
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
    } catch (error) {
      logger.error('启动语音识别失败:', error);
      setIsRecording(false);
    }
    }
  };

  const handleVoicePressEnd = () => {
    setIsPressing(false);
    // 语音识别会在识别完成后自动停止并设置文本
    // 这里不需要手动停止，让recognition自然结束
  };

  const handleQuerySubmit = async () => {
    if (!query.trim()) return;

    const userMessage = { type: 'user' as const, content: query, time: new Date().toLocaleTimeString() };
    setChatHistory(prev => [...prev, userMessage]);
    
    if (enableStreaming) {
      // 流式响应
      setIsStreaming(true);
      const currentQuery = query;
      setQuery('');
      
      // 先创建一个空的AI消息
      const tempAiMessage = { type: 'ai' as const, content: '', time: new Date().toLocaleTimeString() };
      setChatHistory(prev => [...prev, tempAiMessage]);
      
      try {
        const conversationHistory = chatHistory.map(msg => ({
          role: msg.type === 'user' ? 'user' : 'model',
          content: msg.content
        }));

        let fullResponse = '';
        
        await streamChatWithGemini(currentQuery, conversationHistory, (chunk) => {
          fullResponse += chunk;
          setChatHistory(prev => {
            const newHistory = [...prev];
            newHistory[newHistory.length - 1] = {
              ...newHistory[newHistory.length - 1],
              content: fullResponse
            };
            return newHistory;
          });
        });
      } catch (error) {
        logger.error('AI流式调用失败:', error);
        setChatHistory(prev => {
          const newHistory = [...prev];
          newHistory[newHistory.length - 1] = {
            ...newHistory[newHistory.length - 1],
            content: '抱歉，AI服务暂时不可用，请稍后再试。'
          };
          return newHistory;
        });
      } finally {
        setIsStreaming(false);
      }
    } else {
      // 普通响应
      setIsLoading(true);
      const currentQuery = query;
      setQuery('');

      try {
        const conversationHistory = chatHistory.map(msg => ({
          role: msg.type === 'user' ? 'user' : 'model',
          content: msg.content
        }));

        const response = await chatWithGemini(currentQuery, conversationHistory);

        const aiMessage = { type: 'ai' as const, content: response, time: new Date().toLocaleTimeString() };
        setChatHistory(prev => [...prev, aiMessage]);
      } catch (error) {
        logger.error('AI调用失败:', error);
        const errorMessage = { 
          type: 'ai' as const, 
          content: '抱歉，AI服务暂时不可用，请稍后再试。错误详情：' + (error as Error).message, 
          time: new Date().toLocaleTimeString() 
        };
        setChatHistory(prev => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleQuickQuestion = async (question: string) => {
    setQuery(question);
    
    const userMessage = { type: 'user' as const, content: question, time: new Date().toLocaleTimeString() };
    setChatHistory(prev => [...prev, userMessage]);
    setIsLoading(true);
    setQuery('');

    try {
      // 构建对话历史
      const conversationHistory = chatHistory.map(msg => ({
        role: msg.type === 'user' ? 'user' : 'model',
        content: msg.content
      }));

      // 调用GEMINI AI
      const response = await chatWithGemini(question, conversationHistory);

      const aiMessage = { type: 'ai' as const, content: response, time: new Date().toLocaleTimeString() };
      setChatHistory(prev => [...prev, aiMessage]);
      } catch (error) {
        logger.error('AI调用失败:', error);
      const errorMessage = { 
        type: 'ai' as const, 
        content: '抱歉，AI服务暂时不可用，请稍后再试。错误详情：' + (error as Error).message, 
        time: new Date().toLocaleTimeString() 
      };
      setChatHistory(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // AI分析功能 - 获取完整的市场分析数据
  const analyzeMarket = async (symbol: string = 'XAUUSD', timeframe: string = '1H') => {
    setIsAnalyzing(true);
    try {
      const prompt = `请分析${symbol}在${timeframe}时间框架下的市场状况，返回JSON格式的结构化数据，包含以下字段：
{
  "trend": "上涨/下跌/震荡",
  "support": 支撑位价格数字,
  "resistance": 阻力位价格数字,
  "risk": "low/medium/high",
  "confidence": 置信度0-100数字,
  "analysis": "详细技术分析描述",
  "suggestion": "操作建议",
  "rsi": RSI指标值数字,
  "macd": "金叉/死叉/中性",
  "volatility": "低/中/高"
}

请只返回JSON，不要有其他文字。`;

      const response = await chatWithGemini(prompt, []);
      
      // 尝试解析JSON
      let analysisResult: AnalysisResult;
      try {
        // 清理可能的markdown代码块标记
        const cleanJson = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        analysisResult = JSON.parse(cleanJson);
      } catch (e) {
        // 如果解析失败，创建默认结构
        logger.warn('AI返回的不是有效JSON，使用默认值');
        analysisResult = {
          trend: '震荡',
          support: 2320,
          resistance: 2355,
          risk: 'medium',
          confidence: 75,
          analysis: response,
          suggestion: '请谨慎操作'
        };
      }

      // 更新AI分析数据
      setAiAnalysis(analysisResult);

      // 更新技术分析数据
      if (analysisResult.rsi || analysisResult.macd || analysisResult.volatility) {
        setTechnicalData((prev: typeof defaultTechnicalData) => ({
          ...prev,
          trend: analysisResult.trend,
          rsi: analysisResult.rsi || prev.rsi,
          macd: analysisResult.macd || prev.macd,
          volatility: analysisResult.volatility === '低' ? '低' : analysisResult.volatility === '高' ? '高' : '中等'
        }));
      }

      // 更新风险评估数据
      const riskLevelMap: Record<string, string> = { 'low': '低', 'medium': '中等', 'high': '高' };
      if (analysisResult.risk) {
        setRiskData((prev: typeof defaultRiskData) => ({
          ...prev,
          level: riskLevelMap[analysisResult.risk] || '中等',
          marginRatio: analysisResult.confidence
        }));
      }

      logger.debug('市场分析完成:', analysisResult);
    } catch (error) {
      logger.error('市场分析失败:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // AI策略生成
  const generateStrategy = async (symbol: string = 'XAUUSD', direction: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL') => {
    try {
      const prompt = `请为${symbol}生成${direction}方向的交易策略，返回JSON数组包含2-3个策略，每个策略格式：
{
  "name": "策略名称",
  "direction": "做多/做空/观望",
  "entry": "入场价格",
  "stopLoss": "止损价格",
  "takeProfit": "止盈价格",
  "riskRatio": "盈亏比",
  "winRate": "胜率%"
}

请只返回JSON数组，不要有其他文字。`;

      const response = await chatWithGemini(prompt, []);

      let strategies: any[];
      try {
        const cleanJson = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').replace(/\n/g, '').trim();
        const parsed = JSON.parse(cleanJson);
        strategies = Array.isArray(parsed) ? parsed : [parsed];
      } catch (e) {
        logger.warn('策略生成JSON解析失败，使用默认策略');
        // 使用动态生成的默认策略
        strategies = getDefaultStrategyList(selectedSymbol);
      }

      // 添加ID并更新策略列表
      const strategiesWithId = strategies.map((s, i) => ({
        ...s,
        id: i + 1,
        winRate: s.winRate || '75%',
        riskRatio: s.riskRatio || '1:2'
      }));

      setStrategyList(strategiesWithId);
      logger.debug('策略生成完成:', strategiesWithId);
    } catch (error) {
      logger.error('策略生成失败:', error);
      // AI调用失败时也使用默认策略
      setStrategyList(getDefaultStrategyList(selectedSymbol));
    }
  };

  // 技术分析图表
  const technicalChartOption = {
    backgroundColor: 'transparent',
    grid: { left: '5%', right: '5%', top: '10%', bottom: '15%' },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(23, 23, 23, 0.95)',
      borderColor: '#444',
      textStyle: { color: '#e5e5e5', fontSize: 11 },
      formatter: (params: any) => {
        return `${params[0].name}<br/>价格: ${params[0].value}`;
      }
    },
    xAxis: {
      type: 'category',
      data: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
      axisLine: { lineStyle: { color: '#1a1a1a' } },
      axisLabel: { color: '#404040', fontSize: 10 }
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisLabel: { color: '#404040', fontSize: 10, formatter: '{value}' },
      splitLine: { lineStyle: { color: '#1a1a1a' } }
    },
    series: [
      {
        name: '价格',
        type: 'line',
        data: [2320, 2335, 2328, 2345, 2338, 2350, 2345],
        smooth: false,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: { color: '#d97706', width: 1.5 },
        itemStyle: { color: '#d97706' },
        markLine: {
          silent: true,
          lineStyle: { color: '#78350f', type: 'dashed', width: 1 },
          data: [
            { yAxis: 2355, name: '阻力' },
            { yAxis: 2320, name: '支撑' }
          ],
          label: { color: '#666', fontSize: 10, position: 'insideEndTop' }
        }
      }
    ]
  };

  // 生成近6个月的月份标签
  const generateMonthLabels = () => {
    const labels = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push(`${d.getMonth() + 1}月`);
    }
    return labels;
  };

  // 回测功能暂未接入真实数据
  const backtestStats = useMemo(() => {
    return {
      monthlyData: [],
      totalProfit: 0,
      winRate: 0,
      maxDrawdown: '0.0'
    };
  }, [selectedSymbol, strategyList.map(s => s.winRate).join(',')]);

  // 策略回测图表
  const backtestOption = {
    backgroundColor: 'transparent',
    grid: { left: '5%', right: '5%', top: '10%', bottom: '15%' },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(23, 23, 23, 0.95)',
      borderColor: '#444',
      textStyle: { color: '#e5e5e5', fontSize: 11 }
    },
    xAxis: {
      type: 'category',
      data: generateMonthLabels(),
      axisLine: { lineStyle: { color: '#1a1a1a' } },
      axisLabel: { color: '#404040', fontSize: 10 }
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisLabel: { color: '#404040', fontSize: 10, formatter: '¥{value}' },
      splitLine: { lineStyle: { color: '#1a1a1a' } }
    },
    series: [{
      name: '盈亏',
      type: 'bar',
      data: backtestStats.monthlyData,
      itemStyle: {
        color: (params: any) => params.value >= 0 ? '#dc2626' : '#059669'
      }
    }]
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-neutral-950 pb-32 pt-2">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <header className="flex justify-between items-center mb-4 py-3">
          <div className="relative" ref={symbolDropdownRef}>
            <button
              onClick={() => setShowSymbolDropdown(!showSymbolDropdown)}
              className="flex items-center gap-2 group"
            >
              <h1 className="text-xl font-bold text-white tracking-wide">
                {(() => {
                  const symbolMap: Record<string, string> = {
                    'DAX': '德指 DAX',
                    'HSI': '恒指 HSI',
                    'NQ': '纳指 NQ',
                    'MHSI': '小恒指 MHSI',
                    'GOLD': '美黄金 GOLD',
                    'USOIL': '美原油 USOIL'
                  };
                  return symbolMap[selectedSymbol] || selectedSymbol;
                })()}
              </h1>
              <svg
                className={`w-5 h-5 text-neutral-400 transition-transform duration-200 ${showSymbolDropdown ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <p className="text-xs text-neutral-500 mt-1">专业投研工具</p>

            {/* 品种下拉菜单 */}
            {showSymbolDropdown && (
              <div className="absolute top-full left-0 mt-2 w-48 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl z-50 overflow-hidden">
                {symbolList.map((item) => (
                  <button
                    key={item.code}
                    onClick={() => {
                      setSelectedSymbol(item.code);
                      setShowSymbolDropdown(false);
                    }}
                    className={`w-full px-4 py-3 flex items-center justify-between transition-colors ${
                      selectedSymbol === item.code
                        ? 'bg-amber-600/20 text-amber-400'
                        : 'text-neutral-300 hover:bg-neutral-800'
                    }`}
                  >
                    <span className="font-medium">{item.name}</span>
                    <span className="text-xs text-neutral-500">{item.code}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <SettingIcon size="18px" className="text-neutral-500" />
          </div>
        </header>

        {/* 分析标签 - 自定义实现 */}
        <div className="mb-4">
          <div className="flex border-b border-neutral-800">
            {['ai', 'technical', 'risk', 'strategy'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 relative py-3 text-base font-semibold transition-colors ${
                  activeTab === tab
                    ? 'text-white'
                    : 'text-neutral-500 hover:text-neutral-400'
                }`}
              >
                {tab === 'ai' && 'AI助手'}
                {tab === 'technical' && '技术分析'}
                {tab === 'risk' && '风险评估'}
                {tab === 'strategy' && '策略推荐'}
                {activeTab === tab && (
                  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-12 h-0.5 bg-amber-600 rounded-full" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* AI对话内容 */}
        {activeTab === 'ai' && (
          <div className="flex flex-col min-h-[calc(100vh-200px)]">
            {/* 标题区域 */}
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">AI智能分析助手</h2>
                <p className="text-xs text-neutral-500">基于大数据和机器学习的专业分析</p>
              </div>
              <button
                onClick={() => setEnableStreaming(!enableStreaming)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  enableStreaming
                    ? 'bg-amber-600/20 text-amber-500 border border-amber-600/30'
                    : 'bg-neutral-800 text-neutral-500 border border-neutral-700'
                }`}
              >
                {enableStreaming ? '流式输出 ✓' : '流式输出'}
              </button>
            </div>

            {/* 快捷提问 - 水平滚动 */}
            <div className="mb-6">
              <p className="text-xs text-neutral-500 mb-3 font-medium">快捷提问</p>
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                {quickQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleQuickQuestion(q)}
                    className="flex-shrink-0 px-4 py-2.5 bg-neutral-900/60 border border-neutral-800 rounded-full text-xs text-neutral-400 hover:border-amber-700/50 hover:text-neutral-300 hover:bg-neutral-800/60 transition-all duration-200 font-medium whitespace-nowrap"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* 对话区域 */}
            <div className="flex-1 min-h-[280px] max-h-[400px] overflow-y-auto mb-6">
              {chatHistory.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-neutral-600">
                  <TrendingUpIcon size="56px" className="mb-3 opacity-20" />
                  <p className="text-sm text-neutral-500 font-medium">开始对话，获取专业分析</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {chatHistory.map((msg, index) => (
                    <div key={index} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] ${
                        msg.type === 'user'
                          ? 'bg-amber-900/60 border border-amber-800/40 rounded-2xl rounded-tr-sm'
                          : 'bg-neutral-900 border border-neutral-800 rounded-2xl rounded-tl-sm'
                      } p-4`}>
                        <p className={`text-sm leading-relaxed ${msg.type === 'user' ? 'text-amber-50' : 'text-neutral-300'} whitespace-pre-line font-medium`}>
                          {msg.content}
                        </p>
                        <p className="text-[10px] text-neutral-500 mt-2 font-mono">{msg.time}</p>
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl rounded-tl-sm p-4">
                        <div className="flex items-center gap-3">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-600"></div>
                          <span className="text-xs text-neutral-500 font-medium">AI正在思考...</span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}
            </div>

            {/* 输入区域 */}
            <div className="sticky bottom-0 bg-gradient-to-t from-black via-black to-transparent pt-4 pb-2">
              <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-1.5 flex items-center gap-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="输入您的问题..."
                  className="flex-1 bg-transparent text-neutral-200 text-sm px-4 py-3 focus:outline-none placeholder:text-neutral-600"
                  onKeyDown={(e) => e.key === 'Enter' && handleQuerySubmit()}
                />
                {/* 麦克风按钮 */}
                <button
                  onMouseDown={handleVoicePressStart}
                  onMouseUp={handleVoicePressEnd}
                  onMouseLeave={handleVoicePressEnd}
                  onTouchStart={handleVoicePressStart}
                  onTouchEnd={handleVoicePressEnd}
                  className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 relative ${
                    isPressing
                      ? 'bg-red-600 text-white scale-105'
                      : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-300'
                  }`}
                >
                  {isPressing && (
                    <div className="absolute inset-0 rounded-full border-2 border-red-400 animate-ping opacity-30"></div>
                  )}
                  <svg viewBox="0 0 24 24" fill="none" width="20" height="20" strokeWidth="2" className="relative z-10">
                    <path d="M12 2C10.3431 2 9 3.34315 9 5V11C9 12.6569 10.3431 14 12 14C13.6569 14 15 12.6569 15 11V5C15 3.34315 13.6569 2 12 2Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M12 18V22" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M8 22H16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M19 11C19 14.866 15.866 18 12 18C8.13401 18 5 14.866 5 11" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {/* 发送按钮 */}
                <button
                  onClick={handleQuerySubmit}
                  className="w-11 h-11 rounded-full bg-amber-600 text-white flex items-center justify-center hover:bg-amber-500 transition-all duration-200 shadow-lg shadow-amber-600/20"
                >
                  <SendIcon size="18px" />
                </button>
              </div>
              <p className={`text-[11px] text-center mt-2 transition-colors ${isPressing ? 'text-red-400 font-medium' : 'text-neutral-600'}`}>
                {isPressing ? '正在录音，松开结束...' : isVoiceSupported ? '按住麦克风按钮说话' : '您的浏览器不支持语音识别'}
              </p>
            </div>
          </div>
        )}

        {/* 技术分析 */}
        {activeTab === 'technical' && (
          <div className="space-y-4">
            {/* 品种选择器 */}
            <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-neutral-500 font-medium">选择品种</span>
                <button 
                  onClick={() => {
                    // 重新加载技术指标
                    const loadIndicators = async () => {
                      setIsAnalyzing(true);
                      try {
                        const data = await getKlineBySymbol(selectedSymbol, 60, 200);
                        if (data && Array.isArray(data)) {
                          const formattedData: KLineData[] = data.map((item: any) => ({
                            time: item.time || Date.now(),
                            open: item.open || 0,
                            close: item.close || 0,
                            high: item.high || 0,
                            low: item.low || 0,
                            volume: item.volume || 0
                          }));
                          const indicators = calculateAllIndicators(formattedData);
                          setTechnicalIndicators(indicators);
                          const currentPrice = formattedData[formattedData.length - 1]?.close || 0;
                          const summary = generateTechnicalSummary(indicators, currentPrice);
                          setTechnicalData({
                            trend: summary.trend,
                            rsi: indicators.rsi.value,
                            macd: indicators.macd.signal === 'buy' ? '金叉' : indicators.macd.signal === 'sell' ? '死叉' : '中性',
                            volume: indicators.volumeRatio > 1.5 ? '放量' : indicators.volumeRatio < 0.5 ? '缩量' : '正常',
                            volatility: indicators.atr / currentPrice > 0.02 ? '高' : '低'
                          });
                          setAiAnalysis({
                            trend: summary.trend,
                            support: summary.support[0] || 0,
                            resistance: summary.resistance[0] || 0,
                            risk: summary.signal === 'buy' ? 'low' : summary.signal === 'sell' ? 'high' : 'medium',
                            confidence: summary.strength,
                            analysis: summary.summary,
                            suggestion: summary.signal === 'buy' ? '建议逢低买入，止损设于下方支撑位' : 
                                       summary.signal === 'sell' ? '建议逢高卖出，止损设于上方阻力位' : '建议观望，等待明确信号'
                          });
                        }
                      } catch (error) {
                        logger.error('重新加载技术指标失败:', error);
                      } finally {
                        setIsAnalyzing(false);
                      }
                    };
                    loadIndicators();
                  }}
                  className="text-amber-600 hover:text-amber-500"
                >
                  <RefreshIcon size="16px" />
                </button>
              </div>
              <div className="flex gap-2">
                {symbolList.map((item) => (
                  <button
                    key={item.code}
                    onClick={() => setSelectedSymbol(item.code)}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
                      selectedSymbol === item.code
                        ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/30'
                        : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                    }`}
                  >
                    <div className="flex flex-col items-center">
                      <span className="text-xs opacity-90 font-medium">{item.name}</span>
                      <span className="text-sm">{item.code}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 加载中提示 */}
            {isAnalyzing && (
              <Card className="!bg-neutral-900 !border-neutral-800">
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-600 mb-4"></div>
                  <p className="text-sm text-neutral-500">正在加载技术指标数据...</p>
                </div>
              </Card>
            )}

            {/* 无数据提示 */}
            {!isAnalyzing && !technicalIndicators && (
              <Card className="!bg-neutral-900 !border-neutral-800">
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <ChartIcon size="48px" className="text-neutral-700 mb-4" />
                  <p className="text-sm text-neutral-400 mb-2">暂无技术分析数据</p>
                  <p className="text-xs text-neutral-600 mb-4">请点击刷新按钮或切换品种重新加载</p>
                  <button
                    onClick={() => {
                      const loadIndicators = async () => {
                        setIsAnalyzing(true);
                        try {
                          const data = await getKlineBySymbol(selectedSymbol, 60, 200);
                          if (data && Array.isArray(data) && data.length > 0) {
                            const formattedData: KLineData[] = data.map((item: any) => ({
                              time: item.time || Date.now(),
                              open: item.open || 0,
                              close: item.close || 0,
                              high: item.high || 0,
                              low: item.low || 0,
                              volume: item.volume || 0
                            }));
                            const indicators = calculateAllIndicators(formattedData);
                            setTechnicalIndicators(indicators);
                            const currentPrice = formattedData[formattedData.length - 1]?.close || 0;
                            const summary = generateTechnicalSummary(indicators, currentPrice);
                            setTechnicalData({
                              trend: summary.trend,
                              rsi: indicators.rsi.value,
                              macd: indicators.macd.signal === 'buy' ? '金叉' : indicators.macd.signal === 'sell' ? '死叉' : '中性',
                              volume: indicators.volumeRatio > 1.5 ? '放量' : indicators.volumeRatio < 0.5 ? '缩量' : '正常',
                              volatility: indicators.atr / currentPrice > 0.02 ? '高' : '低'
                            });
                          } else {
                            logger.warn('API返回数据为空');
                          }
                        } catch (error) {
                          logger.error('加载技术指标失败:', error);
                        } finally {
                          setIsAnalyzing(false);
                        }
                      };
                      loadIndicators();
                    }}
                    className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-500 transition-colors"
                  >
                    重新加载
                  </button>
                </div>
              </Card>
            )}

            {/* 技术指标详细卡片 */}
            {!isAnalyzing && technicalIndicators && (
              <Card className="!bg-neutral-900 !border-neutral-800">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <ChartIcon size="18px" className="text-amber-700" />
                    <span className="text-sm text-neutral-300 font-medium">技术指标详情</span>
                  </div>
                  <Tag variant="light" theme={aiAnalysis.risk === 'low' ? 'success' : aiAnalysis.risk === 'high' ? 'danger' : 'warning'}>
                    {aiAnalysis.risk === 'low' ? '低风险' : aiAnalysis.risk === 'high' ? '高风险' : '中等风险'}
                  </Tag>
                </div>
                
                {/* 均线指标 */}
                <div className="mb-4 p-4 bg-neutral-950 rounded-xl border border-neutral-800">
                  <p className="text-xs text-neutral-500 mb-3 font-medium">移动平均线 (MA)</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="text-center">
                      <p className="text-[10px] text-neutral-600 mb-1">MA5</p>
                      <p className="text-sm font-semibold text-neutral-300">{technicalIndicators.ma5.toFixed(2)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-neutral-600 mb-1">MA10</p>
                      <p className="text-sm font-semibold text-neutral-300">{technicalIndicators.ma10.toFixed(2)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-neutral-600 mb-1">MA20</p>
                      <p className="text-sm font-semibold text-neutral-300">{technicalIndicators.ma20.toFixed(2)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-neutral-600 mb-1">MA60</p>
                      <p className="text-sm font-semibold text-neutral-300">{technicalIndicators.ma60.toFixed(2)}</p>
                    </div>
                  </div>
                </div>

                {/* MACD & RSI & KDJ */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                  <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-3">
                    <p className="text-xs text-neutral-500 mb-2 font-medium">MACD</p>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-neutral-600">DIF</span>
                        <span className={`font-mono ${technicalIndicators.macd.dif >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {technicalIndicators.macd.dif.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-neutral-600">DEA</span>
                        <span className={`font-mono ${technicalIndicators.macd.dea >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {technicalIndicators.macd.dea.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-neutral-600">MACD</span>
                        <span className={`font-mono ${technicalIndicators.macd.macd >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {technicalIndicators.macd.macd.toFixed(2)}
                        </span>
                      </div>
                      <Tag size="small" theme={technicalIndicators.macd.signal === 'buy' ? 'success' : technicalIndicators.macd.signal === 'sell' ? 'danger' : 'warning'}>
                        {technicalIndicators.macd.signal === 'buy' ? '金叉' : technicalIndicators.macd.signal === 'sell' ? '死叉' : '中性'}
                      </Tag>
                    </div>
                  </div>
                  
                  <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-3">
                    <p className="text-xs text-neutral-500 mb-2 font-medium">RSI</p>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-neutral-300 mb-1">{technicalIndicators.rsi.value.toFixed(1)}</p>
                      <Progress 
                        percentage={technicalIndicators.rsi.value} 
                        size="small"
                        theme={technicalIndicators.rsi.value < 30 ? 'success' : technicalIndicators.rsi.value > 70 ? 'danger' : 'warning'}
                      />
                      <Tag size="small" theme={technicalIndicators.rsi.signal === 'buy' ? 'success' : technicalIndicators.rsi.signal === 'sell' ? 'danger' : 'warning'}>
                        {technicalIndicators.rsi.value < 30 ? '超卖' : technicalIndicators.rsi.value > 70 ? '超买' : '中性'}
                      </Tag>
                    </div>
                  </div>
                  
                  <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-3">
                    <p className="text-xs text-neutral-500 mb-2 font-medium">KDJ</p>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-neutral-600">K</span>
                        <span className="font-mono text-neutral-300">{technicalIndicators.kdj.k.toFixed(1)}</span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-neutral-600">D</span>
                        <span className="font-mono text-neutral-300">{technicalIndicators.kdj.d.toFixed(1)}</span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-neutral-600">J</span>
                        <span className="font-mono text-neutral-300">{technicalIndicators.kdj.j.toFixed(1)}</span>
                      </div>
                      <Tag size="small" theme={technicalIndicators.kdj.signal === 'buy' ? 'success' : technicalIndicators.kdj.signal === 'sell' ? 'danger' : 'warning'}>
                        {technicalIndicators.kdj.signal === 'buy' ? '金叉' : technicalIndicators.kdj.signal === 'sell' ? '死叉' : '中性'}
                      </Tag>
                    </div>
                  </div>
                </div>

                {/* 布林带 & ATR */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-3">
                    <p className="text-xs text-neutral-500 mb-2 font-medium">布林带 (BOLL)</p>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-neutral-600">上轨</span>
                        <span className="font-mono text-red-400">{technicalIndicators.bollinger.upper.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-neutral-600">中轨</span>
                        <span className="font-mono text-neutral-300">{technicalIndicators.bollinger.middle.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-neutral-600">下轨</span>
                        <span className="font-mono text-green-400">{technicalIndicators.bollinger.lower.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-neutral-600">宽度</span>
                        <span className="font-mono text-neutral-300">{technicalIndicators.bollinger.width.toFixed(2)}%</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-3">
                    <p className="text-xs text-neutral-500 mb-2 font-medium">波动率 & 成交量</p>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-neutral-600">ATR</span>
                        <span className="font-mono text-neutral-300">{technicalIndicators.atr.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-neutral-600">成交量MA</span>
                        <span className="font-mono text-neutral-300">{technicalIndicators.volumeMA.toFixed(0)}</span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-neutral-600">量比</span>
                        <span className={`font-mono ${technicalIndicators.volumeRatio > 1 ? 'text-red-400' : 'text-green-400'}`}>
                          {technicalIndicators.volumeRatio.toFixed(2)}
                        </span>
                      </div>
                      <Tag size="small" theme={technicalIndicators.volumeRatio > 1.5 ? 'danger' : technicalIndicators.volumeRatio < 0.5 ? 'success' : 'warning'}>
                        {technicalIndicators.volumeRatio > 1.5 ? '放量' : technicalIndicators.volumeRatio < 0.5 ? '缩量' : '正常'}
                      </Tag>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* AI分析说明 */}
            <Card className="!bg-neutral-900 !border-neutral-800">
              <div className="flex items-center gap-2 mb-4">
                <InfoCircleIcon size="18px" className="text-amber-700" />
                <span className="text-sm text-neutral-300 font-medium">AI分析摘要</span>
              </div>
              <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-5">
                <div className="flex items-center gap-3 mb-3">
                  <Tag variant="filled" theme={aiAnalysis.confidence > 70 ? 'success' : aiAnalysis.confidence > 40 ? 'warning' : 'danger'}>
                    置信度 {aiAnalysis.confidence}%
                  </Tag>
                  <Tag variant="filled" theme="default">
                    {aiAnalysis.trend}
                  </Tag>
                </div>
                <p className="text-sm text-neutral-400 leading-relaxed font-medium mb-4">
                  {aiAnalysis.analysis}
                </p>
                <div className="grid grid-cols-2 gap-3 pt-4 border-t border-neutral-800">
                  <div>
                    <p className="text-xs text-neutral-500 mb-1 font-medium">支撑位</p>
                    <p className="text-sm text-green-400 font-mono font-semibold">{aiAnalysis.support.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500 mb-1 font-medium">阻力位</p>
                    <p className="text-sm text-red-400 font-mono font-semibold">{aiAnalysis.resistance.toFixed(2)}</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-neutral-800">
                  <p className="text-xs text-neutral-500 mb-1 font-medium">操作建议</p>
                  <p className="text-sm text-amber-500 font-medium">{aiAnalysis.suggestion}</p>
                </div>
              </div>
            </Card>

            {/* 价格走势图 */}
            <Card className="!bg-neutral-900 !border-neutral-800">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUpIcon size="18px" className="text-amber-700" />
                <span className="text-sm text-neutral-300 font-medium">价格走势</span>
              </div>
              <ReactECharts
                option={technicalChartOption}
                style={{ height: '220px' }}
                opts={{ renderer: 'canvas' }}
              />
            </Card>

            {/* 分析说明 */}
            <Card className="!bg-neutral-900 !border-neutral-800">
              <div className="flex items-center gap-2 mb-4">
                <InfoCircleIcon size="18px" className="text-amber-700" />
                <span className="text-sm text-neutral-300 font-medium">分析说明</span>
              </div>
              <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-5">
                <p className="text-sm text-neutral-400 leading-relaxed font-medium">
                  {aiAnalysis.analysis}
                </p>
                <div className="mt-4 pt-4 border-t border-neutral-800">
                  <p className="text-xs text-neutral-500 mb-2 font-medium">操作建议</p>
                  <p className="text-sm text-amber-500 font-medium">{aiAnalysis.suggestion}</p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* 风险评估 */}
        {activeTab === 'risk' && (
          <div className="space-y-4">
            {/* AI风险评估按钮 */}
            <button
              onClick={() => analyzeMarket()}
              disabled={isAnalyzing}
              className={`w-full py-3 rounded-xl font-medium text-sm transition-all ${
                isAnalyzing
                  ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-red-600 to-red-700 text-white hover:from-red-500 hover:to-red-600 shadow-lg shadow-red-900/20'
              }`}
            >
              {isAnalyzing ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>AI正在评估...</span>
                </div>
              ) : '🛡️ AI风险评估'}
            </button>

            <Card className="!bg-neutral-900 !border-neutral-800">
              <div className="bg-red-950/20 border border-red-900/40 rounded-xl p-5 mb-5">
                <div className="flex items-center gap-2 mb-3">
                  <InfoCircleIcon size="20px" className="text-red-500" />
                  <span className="text-sm text-red-400 tracking-wide font-semibold">风险警告</span>
                </div>
                <p className="text-sm text-neutral-400 leading-relaxed">{riskData.alert}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-5">
                <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-5">
                  <p className="text-xs text-neutral-400 mb-2 font-medium">杠杆倍数</p>
                  <p className="text-xl font-semibold text-neutral-200">{riskData.leverage}x</p>
                </div>
                <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-5">
                  <p className="text-xs text-neutral-400 mb-2 font-medium">保证金率</p>
                  <p className="text-xl font-semibold text-neutral-200">{riskData.marginRatio}%</p>
                </div>
              </div>

              <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-5">
                <p className="text-sm text-neutral-300 leading-relaxed font-medium">
                  • 当前持仓集中度较高，建议分散投资<br/>
                  • 保证金使用率接近警戒线，注意仓位控制<br/>
                  • 市场波动率上升，建议降低杠杆
                </p>
              </div>
            </Card>

            {/* 市场分析摘要 - 整合到风险评估中 */}
            <Card className="!bg-neutral-900 !border-neutral-800">
              <div className="flex items-center gap-2 mb-5">
                <ChartIcon size="18px" className="text-amber-500" />
                <span className="text-sm text-neutral-300 font-semibold">当前市场分析摘要</span>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-5">
                <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-4">
                  <p className="text-xs text-neutral-400 mb-2 font-medium">趋势判断</p>
                  <p className="text-base text-neutral-200 font-medium">{aiAnalysis.trend}</p>
                </div>
                <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-4">
                  <p className="text-xs text-neutral-400 mb-2 font-medium">置信度</p>
                  <p className="text-base asset-value font-mono">{aiAnalysis.confidence}%</p>
                </div>
                <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-4">
                  <p className="text-xs text-neutral-400 mb-2 font-medium">支撑位</p>
                  <p className="text-base text-green-500 font-semibold">{aiAnalysis.support}</p>
                </div>
                <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-4">
                  <p className="text-xs text-neutral-400 mb-2 font-medium">阻力位</p>
                  <p className="text-base text-red-500 font-semibold">{aiAnalysis.resistance}</p>
                </div>
              </div>
              <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-5">
                <p className="text-xs text-neutral-400 mb-3 font-medium">AI分析建议</p>
                <p className="text-sm text-neutral-300 leading-relaxed font-medium">{aiAnalysis.analysis}</p>
                <div className="mt-4 pt-4 border-t border-neutral-800">
                  <p className="text-xs text-neutral-400 mb-2 font-medium">操作建议</p>
                  <p className="text-sm text-amber-500 font-semibold">{aiAnalysis.suggestion}</p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* 策略推荐 */}
        {activeTab === 'strategy' && (
          <div className="space-y-4">
            {/* AI策略生成按钮 */}
            <button
              onClick={() => generateStrategy()}
              disabled={isAnalyzing}
              className={`w-full py-3 rounded-xl font-medium text-sm transition-all ${
                isAnalyzing
                  ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-green-600 to-green-700 text-white hover:from-green-500 hover:to-green-600 shadow-lg shadow-green-900/20'
              }`}
            >
              {isAnalyzing ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>AI正在生成策略...</span>
                </div>
              ) : '📊 AI生成策略'}
            </button>

            <Card className="!bg-neutral-900 !border-neutral-800">
              <div className="space-y-4">
                {strategyList.map((strategy: any) => (
                  <div
                    key={strategy.id}
                    onClick={() => setSelectedStrategy(strategy.id)}
                    className={`bg-neutral-950 rounded-xl p-5 border transition-colors cursor-pointer ${
                      selectedStrategy === strategy.id
                        ? 'border-amber-700/50'
                        : 'border-neutral-800 hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-white">{strategy.name}</h3>
                      <span className={`text-xs px-3 py-1.5 rounded-lg font-medium ${
                        strategy.direction === '做多' ? 'bg-green-900/40 text-green-500 border border-green-800/50' :
                        strategy.direction === '做空' ? 'bg-red-900/40 text-red-500 border border-red-800/50' :
                        'bg-neutral-800 text-neutral-500 border border-neutral-700'
                      }`}>
                        {strategy.direction}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                      <div>
                        <p className="text-[11px] text-neutral-500 mb-1.5 font-medium">入场</p>
                        <p className="text-xs text-neutral-300 font-mono font-semibold">{strategy.entry}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-neutral-500 mb-1.5 font-medium">止损</p>
                        <p className="text-xs text-red-500 font-mono font-semibold">{strategy.stopLoss}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-neutral-500 mb-1.5 font-medium">止盈</p>
                        <p className="text-xs text-green-500 font-mono font-semibold">{strategy.takeProfit}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-neutral-500 mb-1.5 font-medium">胜率</p>
                        <p className="text-xs text-neutral-300 font-mono font-semibold">{strategy.winRate}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* 策略回测 */}
            <Card className="!bg-neutral-900 !border-neutral-800">
              <div className="flex items-center gap-2 mb-4">
                <TimeIcon size="18px" className="text-amber-700" />
                <span className="text-sm text-neutral-300 font-medium">策略回测</span>
              </div>
              <ReactECharts
                option={backtestOption}
                style={{ height: '200px' }}
                opts={{ renderer: 'canvas' }}
              />
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-4">
                  <p className="text-xs text-neutral-500 mb-2 font-medium">总收益</p>
                  <p className={`text-base font-semibold ${backtestStats.totalProfit >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                    ¥{backtestStats.totalProfit.toLocaleString()}
                  </p>
                </div>
                <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-4">
                  <p className="text-xs text-neutral-500 mb-2 font-medium">胜率</p>
                  <p className="text-base text-amber-400 font-semibold">{backtestStats.winRate}%</p>
                </div>
                <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-4">
                  <p className="text-xs text-neutral-500 mb-2 font-medium">最大回撤</p>
                  <p className="text-base text-green-400 font-semibold">{backtestStats.maxDrawdown}%</p>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
