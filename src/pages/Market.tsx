import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, Badge, Input, Dialog, MessagePlugin } from 'tdesign-react';
import { SettingIcon, ArrowUpIcon, ArrowDownIcon, ChevronDownIcon, CalendarIcon, ChartIcon, WalletIcon, TrendingUpIcon, CloseIcon, InfoCircleIcon } from 'tdesign-icons-react';
import TechRefreshIcon from '../components/TechRefreshIcon';
import ReactECharts from 'echarts-for-react';
import { getQuoteBySymbol, getKlineBySymbol } from '../services/shuhai-backend.service';
import { socketService } from '../services/socket.service';
import logger from '../utils/logger';
import { formatPrice, formatCurrency } from '../utils/format';
import { Position as PositionType, Order } from '../types';
import { generateSymbolStrategy, SymbolStrategy } from '../services/ai-analysis.service';
import api from '../services/api';

// 格式化函数
const formatPercent = (value: number): string => {
  if (value === undefined || value === null) return '--';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
};

// 数海API支持的品种列表（只有这6个品种有数据）
const MARKET_SYMBOLS = [
  { symbol: 'DAX', name: '德指', shuhaiCode: 'CEDAXA0' },
  { symbol: 'NQ', name: '纳指', shuhaiCode: 'CENQA0' },
  { symbol: 'HSI', name: '恒指', shuhaiCode: 'HIHHI01' },
  { symbol: 'MHSI', name: '小恒指', shuhaiCode: 'HIMCH01' },
  { symbol: 'GOLD', name: '美黄金', shuhaiCode: 'CMGCA0' },
  { symbol: 'USOIL', name: '美原油', shuhaiCode: 'NECLA0' },
];

export default function Market() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selectedSymbol, setSelectedSymbol] = useState(searchParams.get('symbol') || 'DAX');
  const [timePeriod, setTimePeriod] = useState('1h');
  const [chartType, setChartType] = useState<'candlestick' | 'line'>('candlestick');

  // 初始行情数据 - 使用默认值避免显示0.00
  const initialMarketData = MARKET_SYMBOLS.map(s => {
    const defaultPrice = {
      'DAX': 25000,
      'NQ': 18000,
      'HSI': 16000,
      'MHSI': 8000,
      'GOLD': 5200,
      'USOIL': 75,
    }[s.symbol] || 10000;

    return {
      ...s,
      price: defaultPrice,
      change: 0,
      changePercent: 0
    };
  });

  const [marketData, setMarketData] = useState(initialMarketData);
  const [refreshing, setRefreshing] = useState(false);
  const [showSymbolSelector, setShowSymbolSelector] = useState(false);
  const [kLineData, setKLineData] = useState<any[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [isConnected, setIsConnected] = useState(false); // 连接状态
  const wsInitialized = useRef(false);
  const chartRef = useRef<any>(null);

  // 交易下单相关状态
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [volume, setVolume] = useState<number>(1);
  const [showCustomVolume, setShowCustomVolume] = useState(false);
  const [customVolume, setCustomVolume] = useState<string>('');
  const [limitPrice, setLimitPrice] = useState<string>('');
  const [leverage, setLeverage] = useState<number | null>(10);
  const [takeProfit, setTakeProfit] = useState<string>('');
  const [stopLoss, setStopLoss] = useState<string>('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [orderData, setOrderData] = useState<any>(null);

  // 模拟账户数据
  const [account, setAccount] = useState({
    totalAssets: 0,
    availableFunds: 0,
    frozenMargin: 0,
    dailyPL: 0,
    cumulativePL: 0
  });

  // 我的订单数据 - 从 localStorage 加载
  const [orders, setOrders] = useState<Order[]>([]);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [aiStrategy, setAiStrategy] = useState<SymbolStrategy | null>(null);

  // 我的持仓数据 - 从 localStorage 加载
  const [positions, setPositions] = useState<PositionType[]>([]);

  // 订单/持仓标签页
  const [activeTab, setActiveTab] = useState<'orders' | 'positions'>('orders');

  // 加载真实账户/订单/持仓
  useEffect(() => {
    const loadData = async () => {
      try {
        const [accountInfo, orderList, positionList] = await Promise.all([
          api.account.getInfo(),
          api.order.getList(),
          api.position.getList()
        ]);

        setAccount({
          totalAssets: accountInfo.totalBalance ?? 0,
          availableFunds: accountInfo.availableBalance ?? 0,
          frozenMargin: accountInfo.frozenMargin ?? 0,
          dailyPL: accountInfo.unrealizedPnl ?? 0,
          cumulativePL: accountInfo.realizedPnl ?? 0
        });
        setOrders(orderList || []);
        setPositions((positionList || []).map((p: any) => ({
          id: p.positionId,
          symbol: p.productCode,
          name: p.productName || p.productCode,
          direction: (p.direction || '').toLowerCase(),
          openTime: p.openedAt || p.createdAt || '',
          openPrice: p.entryPrice,
          currentPrice: p.currentPrice || p.entryPrice,
          quantity: p.quantity,
          leverage: p.leverage,
          margin: p.marginUsed || p.margin,
          profitLoss: p.unrealizedPnl || 0,
          stopLoss: p.stopLoss,
          takeProfit: p.takeProfit
        })));
      } catch (error) {
        logger.error('加载账户/订单/持仓失败:', error);
      }
    };

    loadData();
  }, []);

  // 实时更新持仓盈亏
  useEffect(() => {
    const timer = setInterval(() => {
      if (positions.length > 0) {
        setPositions(prev => prev.map(pos => {
          const currentData = marketData.find(m => m.symbol === pos.symbol);
          if (!currentData) return pos;

          const newPrice = currentData.price;
          const priceChange = newPrice - pos.currentPrice;

          // 计算盈亏：多头 = (当前价 - 开仓价) * 数量 * 100，空头 = (开仓价 - 当前价) * 数量 * 100
          const profitChange = priceChange * pos.quantity * (pos.direction === 'long' ? 1 : -1);
          const newProfitLoss = pos.profitLoss + profitChange;

          return {
            ...pos,
            currentPrice: newPrice,
            profitLoss: newProfitLoss
          };
        }));
      }
    }, 1000); // 每秒更新一次

    return () => clearInterval(timer);
  }, [marketData, positions.length]);

  // WebSocket 实时行情订阅
  useEffect(() => {
    // 只初始化一次
    if (wsInitialized.current) return;
    wsInitialized.current = true;

    // 连接 WebSocket
    socketService.connect();

    // 等待连接建立后订阅行情
    const checkConnection = setInterval(() => {
      if (socketService.isConnected()) {
        clearInterval(checkConnection);
        setWsConnected(true);

        // 订阅所有品种的行情
        const symbols = MARKET_SYMBOLS.map(s => s.symbol);
        socketService.subscribeMarket(symbols, (data) => {
          // 处理实时行情更新
          if (data.type === 'update') {
            // 增量更新
            handleMarketUpdate(data.data, data.symbols);
          } else {
            // 全量数据
            handleMarketData(data);
          }
        });

        // 立即获取一次初始数据
        handleRefresh();
      }
    }, 500);

    // 清理函数
    return () => {
      clearInterval(checkConnection);
      socketService.unsubscribeMarket();
      wsInitialized.current = false;
    };
  }, []);

  /**
   * 处理 WebSocket 推送的全量行情数据
   */
  const handleMarketData = (data: any) => {
    // 收到数据，说明已连接
    setIsConnected(true);

    if (Array.isArray(data)) {
      const updatedData = data.map((item: any) => {
        const symbol = item.productCode || item.symbol;
        const baseSymbol = MARKET_SYMBOLS.find(s => s.symbol === symbol);
        return {
          ...baseSymbol,
          ...item,
          price: item.lastPrice || item.price,
          change: item.change,
          changePercent: item.changePercent
        };
      });
      setMarketData(updatedData);
    }
  };

  /**
   * 处理 WebSocket 推送的增量行情更新
   */
  const handleMarketUpdate = (updates: any[], symbols: string[]) => {
    // 收到更新，说明已连接
    setIsConnected(true);

    setMarketData(prevData => prevData.map(item => {
      if (symbols.includes(item.symbol)) {
        const update = updates.find((u: any) => u.productCode === item.symbol);
        if (update) {
          return {
            ...item,
            price: update.lastPrice,
            change: update.change,
            changePercent: update.changePercent
          };
        }
      }
      return item;
    }));
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // 批量获取所有品种的实时行情
      const quotes = await Promise.allSettled(
        MARKET_SYMBOLS.map(s => getQuoteBySymbol(s.symbol))
      );

      const updatedData = marketData.map((item, index) => {
        const result = quotes[index];
        if (result.status === 'fulfilled' && result.value) {
          const quote = result.value;

          // 打印原始数据以便调试
          console.log(`${item.symbol} 原始行情数据:`, quote);

          // 根据实际返回的数据格式解析,支持多种字段名
          const newPrice = quote.price || quote.last || quote.lastPrice || quote.close || quote.currentPrice || item.price;

          // 如果价格仍然是0或undefined,保留原值
          if (!newPrice || newPrice === 0) {
            console.warn(`${item.symbol} 价格获取失败,使用默认值:`, item.price);
            return item;
          }

          const newChange = quote.change || quote.diff || (quote.changePercent ? (quote.changePercent / 100 * newPrice) : 0);
          const newChangePercent = quote.changePercent || quote.change_percent || (item.price ? ((newChange / item.price) * 100) : 0);

          return {
            ...item,
            price: newPrice,
            change: newChange,
            changePercent: newChangePercent
          };
        } else {
          console.warn(`${item.symbol} 行情获取失败:`, result.reason);
        }
        return item;
      });

      // 检查是否有有效数据，判断连接状态
      const hasValidData = updatedData.some(item => item.price > 0);
      setIsConnected(hasValidData);

      setMarketData(updatedData);
    } catch (error) {
      logger.error('刷新行情失败:', error);
      setIsConnected(false);
    } finally {
      setRefreshing(false);
    }
  };

  // 获取 K 线数据
  const fetchKLineData = async () => {
    try {
      const periodMap: Record<string, number> = {
        '1m': 1, '5m': 5, '15m': 15, '30m': 30,
        '1h': 60, '4h': 240, '1d': 1440, '1w': 10080,
        '1M': 43200, // 月线 (30天)
        '1Y': 525600 // 年线 (365天)
      };
      const period = periodMap[timePeriod] || 60;

      const data = await getKlineBySymbol(selectedSymbol, period, 100);

      logger.debug('K线原始数据:', data);

      if (data && Array.isArray(data) && data.length > 0) {
        // 后端已经返回格式化的数据: [[time, open, close, low, high], ...]
        // 检查第一条数据是否已经是正确格式
        const firstItem = data[0];
        if (Array.isArray(firstItem) && firstItem.length >= 5) {
          // 数据已经是正确格式，直接使用
          logger.debug('K线数据已格式化:', data.length, '条');
          setKLineData(data);
        } else {
          // 需要转换格式
          const formattedData = data.map((item: any) => [
            item.time || Date.now(),
            item.open || 0,
            item.close || 0,
            item.low || 0,
            item.high || 0
          ]).sort((a, b) => a[0] - b[0]);
          logger.debug('K线数据格式化完成:', formattedData.length, '条');
          setKLineData(formattedData);
        }
      } else {
        logger.warn('K线数据为空');
        setKLineData([]);
      }
    } catch (error) {
      logger.error('获取 K 线数据失败:', error);
      setKLineData([]);
    }
  };

  // 计算保证金（保证金 = 价格 × 手数 ÷ 杠杆）
  const calculateMargin = () => {
    const price = orderType === 'market' ? selectedData.price : parseFloat(limitPrice || '0');
    if (!price || !volume || leverage === null) return 0;
    return (price * volume) / leverage;
  };

  // 提交订单
  const handleSubmitOrder = async () => {
    // 验证杠杆是否已选择
    if (leverage === null) {
      MessagePlugin.error('请选择杠杆倍数');
      return;
    }

    // 验证手数
    if (!volume || volume <= 0) {
      MessagePlugin.error('请输入有效的交易手数');
      return;
    }

    // 验证限价单价格
    if (orderType === 'limit' && (!limitPrice || parseFloat(limitPrice) <= 0)) {
      MessagePlugin.error('请输入有效的委托价格');
      return;
    }

    setOrderSubmitting(true);
    setTimeout(() => {
      const margin = calculateMargin();
      const price = orderType === 'market' ? selectedData.price : parseFloat(limitPrice);

      // 检查可用资金是否充足
      if (margin > account.availableFunds) {
        MessagePlugin.error('可用资金不足，无法提交订单');
        setOrderSubmitting(false);
        return;
      }

      // 构建订单数据
      const data = {
        orderId: `ORD${Date.now()}`,
        symbol: selectedData.name,
        symbolCode: selectedData.symbol,
        type: tradeType === 'buy' ? '买入' : '卖出',
        orderType: orderType === 'market' ? '市价单' : '限价单',
        volume: volume,
        price: price,
        leverage: leverage,
        margin: margin,
        takeProfit: takeProfit ? parseFloat(takeProfit) : null,
        stopLoss: stopLoss ? parseFloat(stopLoss) : null,
        time: new Date().toLocaleString('zh-CN'),
        direction: tradeType // 'buy' or 'sell'
      };

      // 添加到订单列表
      const newOrder = {
        id: data.orderId,
        symbol: data.symbolCode,
        type: data.direction,
        price: data.price,
        quantity: data.volume,
        status: orderType === 'market' ? 'filled' : 'pending',
        createTime: new Date().toLocaleString('zh-CN'),
        orderType: orderType === 'market' ? '市价单' : '限价单',
        margin: data.margin
      };
      setOrders(prev => [newOrder, ...prev]);

      // 如果是市价单，立即创建持仓
      if (orderType === 'market') {
        const newPosition: Position = {
          id: `POS${String(Date.now()).slice(-6)}`,
          symbol: data.symbolCode,
          name: data.symbol,
          direction: tradeType === 'buy' ? 'long' : 'short',
          openPrice: price,
          currentPrice: price,
          quantity: volume,
          margin: margin,
          profitLoss: 0,
          leverage: leverage || 1,
          stopLoss: data.stopLoss || undefined,
          takeProfit: data.takeProfit || undefined
        };

        setPositions(prev => [...prev, newPosition]);

        // 更新账户资金
        setAccount(prev => ({
          ...prev,
          availableFunds: prev.availableFunds - margin,
          frozenMargin: prev.frozenMargin + margin
        }));
      } else {
        // 限价单，冻结保证金
        setAccount(prev => ({
          ...prev,
          availableFunds: prev.availableFunds - margin,
          frozenMargin: prev.frozenMargin + margin
        }));
      }

      setOrderData(data);
      setShowSuccessModal(true);
      setOrderSubmitting(false);
    }, 800);
  };

  // 取消订单
  const handleCancelOrder = (order: any) => {
    setSelectedOrder(order);
    setShowCancelDialog(true);
  };

  // 确认取消订单
  const confirmCancelOrder = () => {
    if (!selectedOrder) return;

    // 更新订单状态为已取消
    setOrders(prev => prev.map(order =>
      order.id === selectedOrder.id
        ? { ...order, status: 'cancelled' }
        : order
    ));

    // 返还保证金
    setAccount(prev => ({
      ...prev,
      availableFunds: prev.availableFunds + selectedOrder.margin,
      frozenMargin: prev.frozenMargin - selectedOrder.margin
    }));

    MessagePlugin.success(`已取消订单 ${selectedOrder.id}，保证金已返还`);
    setShowCancelDialog(false);
    setSelectedOrder(null);
  };

  // 快速设置手数
  const quickVolumeSet = (v: number) => {
    setVolume(v);
    setShowCustomVolume(false);
    setCustomVolume('');
  };

  const applyCustomVolume = () => {
    const val = parseFloat(customVolume);
    if (!Number.isFinite(val)) return;
    const clamped = Math.min(100, Math.max(0.01, val));
    setVolume(parseFloat(clamped.toFixed(2)));
  };
  
  // 快速设置杠杆（1表示无杠杆，即1倍杠杆）
  const leverageOptions = [1, 10, 20, 50, 100];

  // 获取当前选择的市场数据
  const selectedData = marketData.find(item => item.symbol === selectedSymbol) || marketData[0];

  // AI策略分析 - 根据选中品种生成策略
  useEffect(() => {
    if (selectedData) {
      const strategy = generateSymbolStrategy(
        selectedData.symbol,
        selectedData.name,
        selectedData.price,
        selectedData.change,
        selectedData.changePercent
      );
      setAiStrategy(strategy);
    }
  }, [selectedData?.symbol, selectedData?.price, selectedData?.change, selectedData?.changePercent]);

  // 计算K线数据的价格范围，确保价格线可见
  const getPriceRange = () => {
    if (kLineData.length === 0) return { min: 0, max: selectedData.price * 1.1 };
    const allPrices = kLineData.flatMap(item => [item[2], item[3]]); // open, close, low, high
    const min = Math.min(...allPrices);
    const max = Math.max(...allPrices);
    return { min, max };
  };

  const priceRange = getPriceRange();

  // 计算价格标签的最佳显示位置（始终在右侧）
  const calculatePriceLabelPosition = () => {
    return { position: 'end', offset: [10, 0] };
  };

  // 动态更新价格显示
  useEffect(() => {
    if (chartRef.current && selectedData) {
      const chartInstance = chartRef.current.getEchartsInstance();
      const price = selectedData.price || 0;
      console.log('更新价格显示:', price, '图表类型:', chartType); // 调试日志

      const labelConfig = {
        show: true,
        position: 'insideTopRight',
        formatter: () => formatPrice(price),
        color: '#ffffff',
        fontSize: 13,
        fontFamily: 'monospace',
        fontWeight: 'bold',
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        borderColor: 'rgba(255, 255, 255, 0.6)',
        borderWidth: 1,
        borderRadius: 4,
        padding: [3, 8],
        shadowColor: 'rgba(0, 0, 0, 0.5)',
        shadowBlur: 8,
        shadowOffsetY: 2,
        distance: 5,
        offset: [-5, -5]
      };

      const markPointConfig = {
        series: chartType === 'candlestick'
          ? [
              {},
              {
                markPoint: {
                  data: [
                    {
                      name: '当前价格',
                      value: formatPrice(price),
                      xAxis: 'max',
                      yAxis: 'max',
                      label: labelConfig
                    }
                  ]
                }
              },
              {}
            ]
          : [
              {
                markPoint: {
                  data: [
                    {
                      name: '当前价格',
                      value: formatPrice(price),
                      xAxis: 'max',
                      yAxis: 'max',
                      label: labelConfig
                    }
                  ]
                }
              }
            ]
      };

      chartInstance.setOption(markPointConfig);
    }
  }, [selectedData, chartType, kLineData]);

  // 当选择品种或时间周期改变时，获取 K 线数据
  useEffect(() => {
    fetchKLineData();
  }, [selectedSymbol, timePeriod]);

  const chartOption = useMemo(() => ({
    backgroundColor: 'transparent',
    animation: false,
    grid: [
      { left: '0%', right: '12%', top: '8%', height: '67%' },
      { left: '0%', right: '12%', top: '78%', height: '14%' },
    ],
    legend: {
      show: false
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      backgroundColor: 'rgba(23, 23, 23, 0.95)',
      borderColor: '#444',
      borderWidth: 1,
      textStyle: { color: '#e5e5e5', fontSize: 11 },
      position: (point: any) => [point[0] + 10, point[1] - 50]
    },
    xAxis: [
      {
        type: 'time',
        scale: true,
        axisLine: { lineStyle: { color: '#2a2a2a', width: 1 } },
        axisTick: { lineStyle: { color: '#2a2a2a' } },
        axisLabel: { color: '#888', fontSize: 10 },
        splitLine: { show: false },
        min: 'dataMin',
        max: 'dataMax'
      },
      {
        type: 'time',
        gridIndex: 1,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        min: 'dataMin',
        max: 'dataMax'
      }
    ],
    yAxis: [
      {
        scale: true,
        splitNumber: 6,
        axisLine: { lineStyle: { color: '#2a2a2a', width: 1 } },
        axisLabel: {
          color: '#888',
          fontSize: 10,
          fontFamily: 'monospace',
          margin: 8,
          formatter: (value: number) => {
            // 根据数值大小动态调整显示精度
            if (value >= 10000) {
              return value.toFixed(0);
            } else if (value >= 1000) {
              return value.toFixed(1);
            } else if (value >= 100) {
              return value.toFixed(2);
            } else {
              return value.toFixed(2);
            }
          }
        },
        splitLine: {
          show: true,
          lineStyle: { color: '#1a1a1a', width: 1, type: 'solid' }
        },
        position: 'right',
        min: (value: any) => {
          // 确保当前价格在可视范围内
          const margin = (value.max - value.min) * 0.05;
          return Math.min(value.min, selectedData.price - margin);
        },
        max: (value: any) => {
          const margin = (value.max - value.min) * 0.05;
          return Math.max(value.max, selectedData.price + margin);
        }
      },
      {
        scale: true,
        gridIndex: 1,
        splitNumber: 2,
        axisLabel: { show: false },
        axisLine: { show: false },
        splitLine: { show: false }
      }
    ],
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: [0, 1],
        start: 70,
        end: 100,
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        moveOnMouseWheel: false,
        preventDefaultMouseMove: true
      },
      {
        show: true,
        xAxisIndex: [0, 1],
        type: 'slider',
        bottom: '2%',
        height: 18,
        start: 70,
        end: 100,
        borderColor: '#2a2a2a',
        backgroundColor: '#111',
        fillerColor: 'rgba(120, 113, 108, 0.25)',
        handleSize: '80%',
        handleStyle: {
          color: '#666',
          borderColor: '#888'
        },
        textStyle: { color: '#888', fontSize: 9 }
      }
    ],
    graphic: [
      {
        type: 'line',
        shape: {
          x1: 0,
          y1: '20%',
          x2: '100%',
          y2: '20%',
        },
        style: {
          stroke: selectedData.change >= 0 ? '#ef4444' : '#22c55e',
          lineWidth: 1,
          lineDash: [4, 4],
          opacity: 0.8
        },
        silent: true,
        invisible: false,
        zlevel: 10
      }
    ],
    series: [
      {
        name: 'K线',
        type: 'candlestick',
        data: kLineData,
        itemStyle: {
          color: '#ef4444',
          color0: '#22c55e',
          borderColor: '#ef4444',
          borderColor0: '#22c55e',
          borderWidth: 1.5
        },
        barMaxWidth: '70%',
        barWidth: '65%'
      },
      // 实时价格标记线
      {
        name: '价格线',
        type: 'line',
        data: [],
        markPoint: {
          symbol: 'none',
          silent: true,
          label: {
            show: true,
            position: 'insideTopRight',
            formatter: () => formatPrice(selectedData?.price || 0),
            color: '#ffffff',
            fontSize: 13,
            fontFamily: 'monospace',
            fontWeight: 'bold',
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            borderColor: 'rgba(255, 255, 255, 0.6)',
            borderWidth: 1,
            borderRadius: 4,
            padding: [3, 8],
            shadowColor: 'rgba(0, 0, 0, 0.5)',
            shadowBlur: 8,
            shadowOffsetY: 2,
            distance: 5
          },
          data: [
            {
              name: '当前价格',
              value: formatPrice(selectedData?.price || 0),
              xAxis: 'max',
              yAxis: 'max',
              label: {
                show: true,
                position: 'insideTopRight',
                formatter: () => formatPrice(selectedData?.price || 0),
                color: '#ffffff',
                fontSize: 13,
                fontFamily: 'monospace',
                fontWeight: 'bold',
                backgroundColor: 'rgba(0, 0, 0, 0.9)',
                borderColor: 'rgba(255, 255, 255, 0.6)',
                borderWidth: 1,
                borderRadius: 4,
                padding: [3, 8],
                shadowColor: 'rgba(0, 0, 0, 0.5)',
                shadowBlur: 8,
                shadowOffsetY: 2,
                distance: 5,
                offset: [-5, -5]
              }
            }
          ],
          z: 999,
          animation: true,
          animationDuration: 200
        }
      },
      {
        name: '成交量',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: kLineData.map((item: any) => ({
          value: Math.random() * 2000 + 800,
          itemStyle: { color: item[1] > item[2] ? '#ef4444' : '#22c55e' }
        })),
        barMaxWidth: '70%',
        barWidth: '65%'
      }
    ]
  }), [kLineData, selectedData?.price, selectedData?.change]);

  // 走势线图表配置
  const lineChartOption = useMemo(() => ({
    backgroundColor: 'transparent',
    animation: false,
    grid: {
      left: '0%',
      right: '12%',
      top: '5%',
      bottom: '12%'
    },
    legend: {
      show: false
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      backgroundColor: 'rgba(23, 23, 23, 0.95)',
      borderColor: '#444',
      borderWidth: 1,
      textStyle: { color: '#e5e5e5', fontSize: 11 },
      formatter: (params: any) => {
        const data = params[0];
        const time = new Date(data.axisValue).toLocaleString('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });
        const price = data.data;
        const firstPrice = kLineData[0]?.[4] || price;
        const change = price - firstPrice;
        const changePercent = ((change / firstPrice) * 100).toFixed(2);
        return `
          <div style="padding: 4px 8px;">
            <div style="font-size: 10px; color: #888; margin-bottom: 4px;">${time}</div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 12px; color: #e5e5e5;">价格:</span>
              <span style="font-size: 14px; font-weight: bold; color: ${change >= 0 ? '#ef4444' : '#22c55e'}; font-family: monospace;">
                ${formatPrice(price)}
              </span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
              <span style="font-size: 10px; color: #888;">涨跌:</span>
              <span style="font-size: 11px; font-weight: bold; color: ${change >= 0 ? '#ef4444' : '#22c55e'}; font-family: monospace;">
                ${change >= 0 ? '+' : ''}${formatPrice(change)} (${changePercent}%)
              </span>
            </div>
          </div>
        `;
      }
    },
    xAxis: {
      type: 'time',
      scale: true,
      axisLine: { lineStyle: { color: '#2a2a2a', width: 1 } },
      axisTick: { lineStyle: { color: '#2a2a2a' } },
      axisLabel: { color: '#888', fontSize: 10 },
      splitLine: { show: false },
      min: 'dataMin',
      max: 'dataMax'
    },
    yAxis: {
      scale: true,
      splitNumber: 6,
      axisLine: { lineStyle: { color: '#2a2a2a', width: 1 } },
      axisLabel: {
        color: '#888',
        fontSize: 10,
        fontFamily: 'monospace',
        margin: 8,
        formatter: (value: number) => {
          if (value >= 10000) {
            return value.toFixed(0);
          } else if (value >= 1000) {
            return value.toFixed(1);
          } else {
            return value.toFixed(2);
          }
        }
      },
      splitLine: {
        show: true,
        lineStyle: { color: '#1a1a1a', width: 1, type: 'solid' }
      },
      position: 'right'
    },
    dataZoom: [
      {
        type: 'inside',
        start: 70,
        end: 100,
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        moveOnMouseWheel: false,
        preventDefaultMouseMove: true
      },
      {
        show: true,
        type: 'slider',
        bottom: '2%',
        height: 18,
        start: 70,
        end: 100,
        borderColor: '#2a2a2a',
        backgroundColor: '#111',
        fillerColor: 'rgba(120, 113, 108, 0.25)',
        handleSize: '80%',
        handleStyle: {
          color: '#666',
          borderColor: '#888'
        },
        textStyle: { color: '#888', fontSize: 9 }
      }
    ],
    series: [
      {
        name: '价格走势',
        type: 'line',
        data: kLineData.map((item: any) => [item[0], item[4]]), // 使用收盘价
        smooth: true,
        symbol: 'none',
        lineStyle: {
          width: 1.5,
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 1,
            y2: 0,
            colorStops: [
              { offset: 0, color: '#22c55e' },
              { offset: 0.5, color: '#fbbf24' },
              { offset: 1, color: '#ef4444' }
            ]
          }
        },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(239, 68, 68, 0.15)' },
                { offset: 1, color: 'rgba(239, 68, 68, 0)' }
              ]
            }
          },
          markPoint: {
            symbol: 'none',
            silent: true,
            label: {
              show: true,
              position: 'insideTopRight',
              formatter: () => formatPrice(selectedData?.price || 0),
              color: '#ffffff',
              fontSize: 13,
              fontFamily: 'monospace',
              fontWeight: 'bold',
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              borderColor: 'rgba(255, 255, 255, 0.6)',
              borderWidth: 1,
              borderRadius: 4,
              padding: [3, 8],
              shadowColor: 'rgba(0, 0, 0, 0.5)',
              shadowBlur: 8,
              shadowOffsetY: 2,
              distance: 5
            },
            data: [
              {
                name: '当前价格',
                value: formatPrice(selectedData?.price || 0),
                xAxis: 'max',
                yAxis: 'max',
                label: {
                  show: true,
                  position: 'insideTopRight',
                  formatter: () => formatPrice(selectedData?.price || 0),
                  color: '#ffffff',
                  fontSize: 13,
                  fontFamily: 'monospace',
                  fontWeight: 'bold',
                  backgroundColor: 'rgba(0, 0, 0, 0.9)',
                  borderColor: 'rgba(255, 255, 255, 0.6)',
                  borderWidth: 1,
                  borderRadius: 4,
                  padding: [3, 8],
                  shadowColor: 'rgba(0, 0, 0, 0.5)',
                  shadowBlur: 8,
                  shadowOffsetY: 2,
                  distance: 5,
                  offset: [-5, -5]
                }
              }
            ],
            z: 999,
            animation: true,
            animationDuration: 200
          }
      }
    ]
  }), [kLineData, selectedData?.price, selectedData?.change]);

  const timePeriods = [
    { label: '1分', value: '1m' },
    { label: '5分', value: '5m' },
    { label: '15分', value: '15m' },
    { label: '30分', value: '30m' },
    { label: '1小时', value: '1h' },
    { label: '4小时', value: '4h' },
    { label: '日线', value: '1d' },
    { label: '周线', value: '1w' },
    { label: '月线', value: '1M' },
    { label: '年线', value: '1Y' },
  ];

  useEffect(() => {
    // 初始加载
    handleRefresh();

    // 每1秒自动刷新行情
    const timer = setInterval(handleRefresh, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="finance-app min-h-screen bg-gradient-to-b from-black to-neutral-950 pb-20 pt-2">
      <div className="max-w-7xl mx-auto px-2">
        {/* Header */}
        <header className="flex justify-between items-center mb-2 py-1">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-neutral-100 tracking-wide">交易下单</h1>
            <Badge
              count="专业版"
              color="#444"
              shape="round"
              size="small"
              className="text-[10px]"
            />
          </div>
          <div className="flex items-center gap-1">
            {/* 连接状态指示器 */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${
                isConnected ? 'bg-green-900/30' : 'bg-red-900/30'
              }`}
            >
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  isConnected
                    ? 'bg-green-500 animate-pulse'
                    : 'bg-red-500 animate-pulse'
                }`}
              />
              <span className={`text-xs ${isConnected ? 'text-green-500' : 'text-red-500'}`}>
                {isConnected ? '已联网' : '未联网'}
              </span>
            </div>
            <button
              onClick={handleRefresh}
              className="p-1.5 rounded bg-neutral-900 text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              <TechRefreshIcon size="14px" refreshing={refreshing} />
            </button>
          </div>
        </header>

        {/* 品种选择器 - 自适应网格布局 */}
        <div className="mb-2">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5">
            {marketData.map((item) => (
              <button
                key={item.symbol}
                onClick={() => setSelectedSymbol(item.symbol)}
                className={`p-2 rounded-lg border transition-all ${
                  selectedSymbol === item.symbol
                    ? 'bg-neutral-800 border-amber-500/50'
                    : 'bg-neutral-900 border-neutral-800 hover:border-neutral-700'
                }`}
              >
                <div className="text-left">
                  <div className="text-sm font-medium text-neutral-200">{item.name}</div>
                  <div className={`text-xs font-mono font-medium ${
                    item.change >= 0 ? 'asset-profit' : 'asset-loss'
                  }`}>
                    {formatPrice(item.price)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 品种信息 + 价格 */}
        <div className="mb-2 bg-neutral-900 rounded border border-neutral-800 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div>
                <h2 className="text-base font-semibold text-neutral-200">{selectedData.name}</h2>
                <p className="text-xs text-neutral-500">{selectedData.symbol}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-medium asset-value font-mono">
                {formatPrice(selectedData.price)}
              </p>
              <div className={`flex items-center justify-end gap-1 text-xs font-medium ${
                selectedData.change >= 0 ? 'asset-profit' : 'asset-loss'
              }`}>
                <span className="font-mono">
                  {selectedData.change >= 0 ? '+' : ''}{formatPrice(selectedData.change)}
                </span>
                <span className="font-mono">
                  ({formatPercent(selectedData.changePercent)})
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* K线图表 - TradingView风格 */}
        <div className="mb-2">
          <Card className="!bg-neutral-900 !border-neutral-800 !p-0">
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-neutral-800">
              {/* 左侧：时间周期选择 */}
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
                {timePeriods.map((period) => (
                  <button
                    key={period.value}
                    onClick={() => setTimePeriod(period.value)}
                    className={`px-2 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                      timePeriod === period.value
                        ? 'bg-neutral-800 text-neutral-300'
                        : 'text-neutral-600 hover:text-neutral-400'
                    }`}
                  >
                    {period.label}
                  </button>
                ))}
              </div>

              {/* 右侧：图表类型切换 + 设置 */}
              <div className="flex items-center gap-1">
                {/* 图表类型切换 */}
                <div className="flex items-center bg-neutral-950 rounded border border-neutral-800 overflow-hidden">
                  <button
                    onClick={() => setChartType('candlestick')}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      chartType === 'candlestick'
                        ? 'bg-amber-600 text-white'
                        : 'text-neutral-500 hover:text-neutral-300'
                    }`}
                  >
                    K线
                  </button>
                  <button
                    onClick={() => setChartType('line')}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      chartType === 'line'
                        ? 'bg-amber-600 text-white'
                        : 'text-neutral-500 hover:text-neutral-300'
                    }`}
                  >
                    走势
                  </button>
                </div>
                <SettingIcon size="12px" className="text-neutral-600" />
              </div>
            </div>
            <ReactECharts
              ref={chartRef}
              option={chartType === 'candlestick' ? chartOption : lineChartOption}
              style={{ height: '180px' }}
              opts={{ renderer: 'canvas' }}
              onChartReady={(echarts) => {
                console.log('图表加载完成，当前价格:', selectedData?.price);
                // 图表加载完成后，手动设置价格显示
                if (selectedData && selectedData.price) {
                  const labelConfig = {
                    show: true,
                    position: 'insideTopRight',
                    formatter: () => formatPrice(selectedData.price),
                    color: '#ffffff',
                    fontSize: 13,
                    fontFamily: 'monospace',
                    fontWeight: 'bold',
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    borderColor: 'rgba(255, 255, 255, 0.6)',
                    borderWidth: 1,
                    borderRadius: 4,
                    padding: [3, 8],
                    shadowColor: 'rgba(0, 0, 0, 0.5)',
                    shadowBlur: 8,
                    shadowOffsetY: 2,
                    distance: 5,
                    offset: [-5, -5]
                  };

                  const markPointConfig = {
                    series: chartType === 'candlestick'
                      ? [
                          {},
                          {
                            markPoint: {
                              data: [
                                {
                                  name: '当前价格',
                                  value: formatPrice(selectedData.price),
                                  xAxis: 'max',
                                  yAxis: 'max',
                                  label: labelConfig
                                }
                              ]
                            }
                          },
                          {}
                        ]
                      : [
                          {
                            markPoint: {
                              data: [
                                {
                                  name: '当前价格',
                                  value: formatPrice(selectedData.price),
                                  xAxis: 'max',
                                  yAxis: 'max',
                                  label: labelConfig
                                }
                              ]
                            }
                          }
                        ]
                  };
                  echarts.setOption(markPointConfig);
                }
              }}
            />
          </Card>
        </div>

        {/* 交易面板 - 移动端垂直堆叠布局 */}
        <div className="mb-2 space-y-2">
          {/* AI策略分析 */}
          {aiStrategy && (
            <div className="bg-neutral-900 rounded border border-neutral-800 overflow-hidden">
              {/* AI策略头部 */}
              <div className={`px-3 py-2 border-b border-neutral-800 ${
                aiStrategy.direction === 'long' ? 'bg-red-950/20' :
                aiStrategy.direction === 'short' ? 'bg-green-950/20' :
                'bg-neutral-950/50'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                      aiStrategy.direction === 'long' ? 'bg-red-500 animate-pulse' :
                      aiStrategy.direction === 'short' ? 'bg-green-500 animate-pulse' :
                      'bg-neutral-500'
                    }`} />
                    <span className="text-sm font-medium text-neutral-200">AI策略分析</span>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                    aiStrategy.direction === 'long' ? 'bg-red-500/20 text-red-400' :
                    aiStrategy.direction === 'short' ? 'bg-green-500/20 text-green-400' :
                    'bg-neutral-700 text-neutral-400'
                  }`}>
                    {aiStrategy.direction === 'long' ? '建议做多' :
                     aiStrategy.direction === 'short' ? '建议做空' : '建议观望'}
                  </span>
                </div>
              </div>

              {/* AI策略内容 */}
              <div className="p-3 space-y-3">
                {/* 策略理由 */}
                <p className="text-xs text-neutral-400 leading-relaxed">
                  {aiStrategy.reason}
                </p>

                {/* 策略数据 */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-neutral-950/50 rounded p-2 text-center">
                    <p className="text-[10px] text-neutral-500 mb-1">趋势</p>
                    <p className={`text-xs font-medium ${
                      aiStrategy.trend.includes('上涨') ? 'text-red-400' :
                      aiStrategy.trend.includes('下跌') ? 'text-green-400' :
                      'text-neutral-400'
                    }`}>{aiStrategy.trend}</p>
                  </div>
                  <div className="bg-neutral-950/50 rounded p-2 text-center">
                    <p className="text-[10px] text-neutral-500 mb-1">置信度</p>
                    <p className="text-xs font-medium text-amber-400">{aiStrategy.confidence}%</p>
                  </div>
                  <div className="bg-neutral-950/50 rounded p-2 text-center">
                    <p className="text-[10px] text-neutral-500 mb-1">盈亏比</p>
                    <p className="text-xs font-medium text-blue-400">{aiStrategy.riskReward.toFixed(1)}:1</p>
                  </div>
                </div>

                {/* 目标价和止损 */}
                {aiStrategy.direction !== 'neutral' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-neutral-950/50 rounded p-2">
                      <p className="text-[10px] text-neutral-500 mb-1">目标价</p>
                      <p className={`text-sm font-mono font-medium ${
                        aiStrategy.direction === 'long' ? 'text-red-400' : 'text-green-400'
                      }`}>
                        {formatPrice(aiStrategy.targetPrice)}
                      </p>
                    </div>
                    <div className="bg-neutral-950/50 rounded p-2">
                      <p className="text-[10px] text-neutral-500 mb-1">止损价</p>
                      <p className={`text-sm font-mono font-medium ${
                        aiStrategy.direction === 'long' ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatPrice(aiStrategy.stopLossPrice)}
                      </p>
                    </div>
                  </div>
                )}

                {/* 快速应用按钮 */}
                {aiStrategy.direction !== 'neutral' && (
                  <button
                    onClick={() => {
                      setTradeType(aiStrategy.direction === 'long' ? 'buy' : 'sell');
                      if (aiStrategy.direction === 'long') {
                        setTakeProfit(aiStrategy.targetPrice.toFixed(2));
                        setStopLoss(aiStrategy.stopLossPrice.toFixed(2));
                      } else {
                        setTakeProfit(aiStrategy.targetPrice.toFixed(2));
                        setStopLoss(aiStrategy.stopLossPrice.toFixed(2));
                      }
                      setShowAdvanced(true);
                      MessagePlugin.success('已应用AI策略建议，请确认后提交订单');
                    }}
                    className={`w-full py-2 rounded text-xs font-medium transition-colors ${
                      aiStrategy.direction === 'long'
                        ? 'bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/40'
                        : 'bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-600/40'
                    }`}
                  >
                    应用AI策略（设置止盈止损）
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 买卖盘 */}
          <div className="bg-neutral-900 rounded border border-neutral-800 p-3">
            {/* 买卖盘 - 紧凑布局 */}
            <div className="grid grid-cols-2 gap-2">
              {/* 买盘 Bid */}
              <div className="bg-neutral-950/50 rounded p-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-neutral-500">买盘</span>
                  <ArrowUpIcon size="12px" className="text-green-600" />
                </div>
                <div className="space-y-1.5">
                  {[1, 2, 3].map(i => {
                    const price = selectedData.price - i * 0.5;
                    const vol = Math.floor(Math.random() * 100 + 50);
                    const width = Math.min(100, vol / 2);
                    return (
                      <div key={i} className="flex justify-between items-center text-xs relative">
                        <div
                          className="absolute left-0 top-0 bottom-0 bg-green-600/15 rounded"
                          style={{ width: `${width}%` }}
                        />
                        <span className="text-green-500 font-mono relative z-10">{formatPrice(price)}</span>
                        <span className="text-neutral-600 font-mono relative z-10">{vol}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* 卖盘 Ask */}
              <div className="bg-neutral-950/50 rounded p-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-neutral-500">卖盘</span>
                  <ArrowDownIcon size="12px" className="text-red-600" />
                </div>
                <div className="space-y-1.5">
                  {[1, 2, 3].map(i => {
                    const price = selectedData.price + i * 0.5;
                    const vol = Math.floor(Math.random() * 100 + 50);
                    const width = Math.min(100, vol / 2);
                    return (
                      <div key={i} className="flex justify-between items-center text-xs relative">
                        <div
                          className="absolute left-0 top-0 bottom-0 bg-red-600/15 rounded"
                          style={{ width: `${width}%` }}
                        />
                        <span className="text-red-500 font-mono relative z-10">{formatPrice(price)}</span>
                        <span className="text-neutral-600 font-mono relative z-10">{vol}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 快捷入口 */}
            <div className="flex gap-2 mt-3 pt-3 border-t border-neutral-800">
              <button
                onClick={() => setShowOrderModal(true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-amber-900/20 hover:bg-amber-900/30 border border-amber-700/40 text-amber-400/90 transition-colors relative"
              >
                <WalletIcon size="14px" />
                <span className="text-sm">我的订单</span>
                {orders.filter(o => o.status === 'pending').length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
                    {orders.filter(o => o.status === 'pending').length}
                  </span>
                )}
              </button>
              <button
                onClick={() => navigate('/analysis')}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-neutral-950 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-300 transition-colors"
              >
                <ChartIcon size="14px" />
                <span className="text-sm">AI分析</span>
              </button>
            </div>
          </div>

          {/* 交易下单面板 */}
          <div className="bg-neutral-900 rounded border border-neutral-800 overflow-hidden">
            {/* 买卖按钮 */}
            <div className="grid grid-cols-2 border-b border-neutral-800">
              <button
                onClick={() => setTradeType('buy')}
                className={`py-3 text-sm font-semibold transition-colors ${
                  tradeType === 'buy'
                    ? 'bg-red-600 text-white'
                    : 'bg-neutral-950 text-neutral-500 hover:bg-neutral-800'
                }`}
              >
                买入
              </button>
              <button
                onClick={() => setTradeType('sell')}
                className={`py-3 text-sm font-semibold transition-colors ${
                  tradeType === 'sell'
                    ? 'bg-green-600 text-white'
                    : 'bg-neutral-950 text-neutral-500 hover:bg-neutral-800'
                }`}
              >
                卖出
              </button>
            </div>

            <div className="p-3">
              {/* 订单类型 + 价格 */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-xs text-neutral-500 mb-2 block">订单类型</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setOrderType('market')}
                      className={`flex-1 py-2 rounded text-xs font-medium transition-colors ${
                        orderType === 'market'
                          ? 'bg-amber-600 text-white'
                          : 'bg-neutral-950 text-neutral-500 hover:bg-neutral-800'
                      }`}
                    >
                      市价
                    </button>
                    <button
                      onClick={() => setOrderType('limit')}
                      className={`flex-1 py-2 rounded text-xs font-medium transition-colors ${
                        orderType === 'limit'
                          ? 'bg-amber-600 text-white'
                          : 'bg-neutral-950 text-neutral-500 hover:bg-neutral-800'
                      }`}
                    >
                      限价
                    </button>
                  </div>
                </div>
                {orderType === 'limit' && (
                  <div>
                    <label className="text-xs text-neutral-500 mb-2 block">委托价格</label>
                    <Input
                      value={limitPrice}
                      onChange={(val) => setLimitPrice(val as string)}
                      placeholder={selectedData.price.toFixed(2)}
                      className="!bg-neutral-950"
                    />
                  </div>
                )}
              </div>

              {/* 手数 + 杠杆 */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-xs text-neutral-500 mb-2 block">手数</label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setVolume(Math.max(0.01, volume - 0.01))}
                      className="w-8 h-8 rounded bg-neutral-950 text-neutral-400 hover:bg-neutral-800 flex items-center justify-center text-sm font-bold"
                    >
                      -
                    </button>
                    <Input
                      value={volume.toFixed(2)}
                      onChange={(val) => setVolume(parseFloat(val as string) || 0)}
                      className="flex-1 !bg-neutral-950 text-center"
                    />
                    <button
                      onClick={() => setVolume(volume + 0.01)}
                      className="w-8 h-8 rounded bg-neutral-950 text-neutral-400 hover:bg-neutral-800 flex items-center justify-center text-sm font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-neutral-500 mb-2 block">杠杆</label>
                  <div className="flex gap-1">
                    {leverageOptions.map((l) => (
                      <button
                        key={l}
                        onClick={() => setLeverage(l)}
                        className={`flex-1 py-2 rounded text-xs font-medium transition-colors ${
                          leverage === l
                            ? 'bg-neutral-800 text-white border border-amber-600/50'
                            : 'bg-neutral-950 text-neutral-500 hover:bg-neutral-800'
                        }`}
                      >
                        {l === 1 ? '无' : `${l}x`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 快速手数选择 */}
              <div className="mb-4">
                <label className="text-xs text-neutral-500 mb-2 block">快速选择</label>
                <div className="flex gap-2">
                  {[0.01, 0.1, 0.5, 1, 2, 5].map((v) => (
                    <button
                      key={v}
                      onClick={() => quickVolumeSet(v)}
                      className={`flex-1 py-2 rounded text-xs font-medium transition-colors ${
                        volume === v && !showCustomVolume
                          ? 'bg-amber-600 text-white'
                          : 'bg-neutral-950 text-neutral-500 hover:bg-neutral-800'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                  <button
                    onClick={() => setShowCustomVolume(true)}
                    className={`flex-1 py-2 rounded text-xs font-medium transition-colors ${
                      showCustomVolume
                        ? 'bg-amber-600 text-white'
                        : 'bg-neutral-950 text-neutral-500 hover:bg-neutral-800'
                    }`}
                  >
                    自定义
                  </button>
                </div>
                {showCustomVolume && (
                  <div className="mt-3 flex items-center gap-2">
                    <Input
                      value={customVolume}
                      onChange={(val) => setCustomVolume(val as string)}
                      placeholder="0.01 - 100"
                      className="!bg-neutral-950"
                    />
                    <Button size="small" theme="primary" onClick={applyCustomVolume}>
                      应用
                    </Button>
                  </div>
                )}
              </div>

              {/* 止盈止损 */}
              <div className="mb-4">
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className={`w-full py-2 rounded text-xs font-medium transition-colors mb-2 ${
                    showAdvanced
                      ? 'bg-neutral-800 text-amber-500 border border-amber-600/50'
                      : 'bg-neutral-950 text-neutral-500 hover:bg-neutral-800 border border-neutral-800'
                  }`}
                >
                  {showAdvanced ? '✓ 已设置止盈止损' : '+ 设置止盈止损'}
                </button>
                {showAdvanced && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-neutral-500 mb-2 block">止盈价格</label>
                      <Input
                        value={takeProfit}
                        onChange={(val) => setTakeProfit(val as string)}
                        placeholder="可选"
                        className="!bg-neutral-950"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-neutral-500 mb-2 block">止损价格</label>
                      <Input
                        value={stopLoss}
                        onChange={(val) => setStopLoss(val as string)}
                        placeholder="可选"
                        className="!bg-neutral-950"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 资金信息 */}
              <div className="bg-neutral-950 rounded-lg p-3 mb-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-neutral-500 mb-1">保证金</p>
                    <p className="text-sm font-semibold text-white font-mono">¥{calculateMargin().toFixed(2)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-neutral-500 mb-1">可用资金</p>
                    <p className="text-sm font-semibold text-amber-500 font-mono">{formatCurrency(account.availableFunds)}</p>
                  </div>
                </div>
                {/* 未成交订单提示 */}
                {orders.filter(o => o.status === 'pending').length > 0 && (
                  <div className="mt-2 pt-2 border-t border-neutral-800/50">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-500">待成交订单</span>
                      <span className="text-yellow-500 font-medium">{orders.filter(o => o.status === 'pending').length} 个</span>
                    </div>
                  </div>
                )}
                {/* 持仓提示 */}
                {positions.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-neutral-800/50">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-500">当前持仓</span>
                      <span className="text-amber-500 font-medium">{positions.length} 个</span>
                    </div>
                  </div>
                )}
              </div>

              {/* 提交按钮 */}
              <button
                onClick={handleSubmitOrder}
                disabled={orderSubmitting || volume <= 0 || leverage === null}
                className={`w-full py-3 rounded-lg font-semibold text-sm transition-all ${
                  tradeType === 'buy'
                    ? 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-lg shadow-red-900/20'
                    : 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white shadow-lg shadow-green-900/20'
                } ${(orderSubmitting || volume <= 0 || leverage === null) ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {orderSubmitting ? '提交中...' : (
                  <span className="flex items-center justify-center gap-1.5">
                    {tradeType === 'buy' ? '📈 买入' : '📉 卖出'}
                    <span className="text-xs opacity-75">{selectedData.name}</span>
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 订单成功弹窗 */}
      {showSuccessModal && orderData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* 遮罩层 */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowSuccessModal(false)}
          />

          {/* 成功弹窗内容 */}
          <div className="relative bg-neutral-900 rounded-2xl border border-amber-600/30 shadow-2xl max-w-md w-full overflow-hidden animate-scaleIn">
            {/* 顶部装饰 - 金色渐变 */}
            <div className="h-2 bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600" />

            {/* 成功图标区域 */}
            <div className="relative pt-6 pb-4 px-6 text-center">
              {/* 成功图标 - 带发光效果 */}
              <div className="relative inline-flex items-center justify-center mb-4">
                {/* 光晕效果 */}
                <div className="absolute inset-0 bg-green-500/20 rounded-full animate-pulse blur-xl" />
                <div className="absolute inset-2 bg-green-500/30 rounded-full animate-ping opacity-30" />

                {/* 主图标 */}
                <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-lg shadow-green-500/30">
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>

              {/* 成功标题 */}
              <h3 className="text-2xl font-bold text-white mb-2">订单提交成功</h3>
              <p className="text-neutral-400 text-sm">
                {orderData.type} {orderData.symbol} {orderData.volume}手
              </p>
            </div>

            {/* 订单详情卡片 */}
            <div className="px-4 pb-4">
              <div className="bg-neutral-950/50 rounded-lg border border-neutral-800 p-4 space-y-3">
                {/* 订单号 */}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-neutral-500">订单号</span>
                  <span className="text-xs font-mono text-amber-500 bg-amber-950/30 px-2 py-0.5 rounded">
                    {orderData.orderId}
                  </span>
                </div>

                {/* 品种代码 */}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-neutral-500">品种代码</span>
                  <span className="text-xs text-neutral-300 font-mono">{orderData.symbolCode}</span>
                </div>

                {/* 订单类型 */}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-neutral-500">订单类型</span>
                  <span className="text-xs text-neutral-300">{orderData.orderType}</span>
                </div>

                {/* 价格 */}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-neutral-500">成交价格</span>
                  <span className={`text-sm font-bold font-mono ${orderData.direction === 'buy' ? 'text-red-500' : 'text-green-500'}`}>
                    ¥{orderData.price.toFixed(2)}
                  </span>
                </div>

                {/* 手数 */}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-neutral-500">交易手数</span>
                  <span className="text-sm font-bold text-white font-mono">{orderData.volume}</span>
                </div>

                {/* 杠杆 */}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-neutral-500">杠杆倍数</span>
                  <span className="text-xs text-amber-500 font-mono bg-amber-950/30 px-1.5 py-0.5 rounded">
                    {orderData.leverage === 1 ? '无杠杆' : `${orderData.leverage}x`}
                  </span>
                </div>

                {/* 保证金 */}
                <div className="flex justify-between items-center pt-2 border-t border-neutral-800">
                  <span className="text-xs text-neutral-500">占用保证金</span>
                  <span className="text-sm font-bold text-white font-mono">
                    ¥{orderData.margin.toFixed(2)}
                  </span>
                </div>

                {/* 止盈止损 */}
                {(orderData.takeProfit || orderData.stopLoss) && (
                  <div className="pt-2 border-t border-neutral-800 space-y-2">
                    {orderData.takeProfit && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-neutral-500">止盈价</span>
                        <span className="text-xs font-mono text-green-500">¥{orderData.takeProfit.toFixed(2)}</span>
                      </div>
                    )}
                    {orderData.stopLoss && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-neutral-500">止损价</span>
                        <span className="text-xs font-mono text-red-500">¥{orderData.stopLoss.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* 提交时间 */}
                <div className="flex justify-between items-center pt-2 border-t border-neutral-800">
                  <span className="text-xs text-neutral-500">提交时间</span>
                  <span className="text-xs text-neutral-400 font-mono">{orderData.time}</span>
                </div>
              </div>
            </div>

            {/* 风险提示 */}
            <div className="px-4 pb-3">
              <div className="flex items-start gap-2 bg-red-950/20 rounded border border-red-900/30 p-2">
                <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <p className="text-[11px] text-neutral-400 leading-tight">
                  交易存在风险，请合理控制仓位。建议设置止盈止损，保护您的资金安全。
                </p>
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="px-4 pb-5 flex gap-3">
              <button
                onClick={() => {
                  setShowSuccessModal(false);
                  navigate('/position');
                }}
                className="flex-1 py-2.5 rounded-lg bg-neutral-800 text-neutral-300 text-sm font-medium hover:bg-neutral-700 transition-colors"
              >
                查看持仓
              </button>
              <button
                onClick={() => setShowSuccessModal(false)}
                className="flex-1 py-2.5 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-colors shadow-lg shadow-amber-600/30"
              >
                继续交易
              </button>
            </div>

            {/* 底部装饰 - 金色光效 */}
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber-500 to-transparent" />
          </div>
        </div>
      )}

      {/* 我的订单弹窗 */}
      <Dialog
        header={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <WalletIcon size="18px" className="text-amber-500" />
              <span className="text-base font-semibold text-neutral-200">我的订单</span>
            </div>
            <button
              onClick={() => setShowOrderModal(false)}
              className="p-1 rounded hover:bg-neutral-800 text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              <CloseIcon size="16px" />
            </button>
          </div>
        }
        visible={showOrderModal}
        onClose={() => setShowOrderModal(false)}
        className="!bg-neutral-900 !border-neutral-800"
        style={{ background: '#171717', borderColor: '#262626' }}
        width="95vw"
        footer={null}
      >
        <div className="py-2">
          {/* 标签页切换 */}
          <div className="flex mb-3 bg-neutral-950 rounded border border-neutral-800 overflow-hidden">
            <button
              onClick={() => setActiveTab('orders')}
              className={`flex-1 py-2 text-xs font-medium transition-all ${
                activeTab === 'orders'
                  ? 'bg-neutral-800 text-white border-b-2 border-amber-600'
                  : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/50'
              }`}
            >
              订单 ({orders.length})
            </button>
            <button
              onClick={() => setActiveTab('positions')}
              className={`flex-1 py-2 text-xs font-medium transition-all ${
                activeTab === 'positions'
                  ? 'bg-neutral-800 text-white border-b-2 border-amber-600'
                  : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/50'
              }`}
            >
              持仓 ({positions.length})
            </button>
          </div>

          {/* 订单列表 */}
          {activeTab === 'orders' && (
            <div>
              {/* 订单统计 */}
              <div className="flex gap-2 mb-3">
                <div className="flex-1 bg-neutral-950 rounded p-2 border border-neutral-800">
                  <p className="text-[10px] text-neutral-500 mb-0.5">待成交</p>
                  <p className="text-sm font-bold text-yellow-500 font-mono">
                    {orders.filter(o => o.status === 'pending').length}
                  </p>
                </div>
                <div className="flex-1 bg-neutral-950 rounded p-2 border border-neutral-800">
                  <p className="text-[10px] text-neutral-500 mb-0.5">已成交</p>
                  <p className="text-sm font-bold text-green-500 font-mono">
                    {orders.filter(o => o.status === 'filled').length}
                  </p>
                </div>
                <div className="flex-1 bg-neutral-950 rounded p-2 border border-neutral-800">
                  <p className="text-[10px] text-neutral-500 mb-0.5">已取消</p>
                  <p className="text-sm font-bold text-neutral-500 font-mono">
                    {orders.filter(o => o.status === 'cancelled').length}
                  </p>
                </div>
              </div>

              {/* 订单列表 */}
              <div className="bg-neutral-950 rounded border border-neutral-800 overflow-hidden max-h-[350px] overflow-y-auto">
                {orders.length === 0 ? (
                  <div className="text-center py-6">
                    <WalletIcon size="24px" className="text-neutral-700 mb-1.5" />
                    <p className="text-xs text-neutral-500">暂无订单</p>
                  </div>
                ) : (
                  <div className="divide-y divide-neutral-800/50">
                    {orders.slice(0, 20).map((order, index) => {
                      const statusMap: Record<string, { text: string; class: string }> = {
                        pending: { text: '待成交', class: 'text-yellow-500 bg-yellow-500/10' },
                        filled: { text: '已成交', class: 'text-green-500 bg-green-500/10' },
                        cancelled: { text: '已取消', class: 'text-neutral-500 bg-neutral-500/10' }
                      };
                      const status = statusMap[order.status] || { text: '未知', class: 'text-neutral-500 bg-neutral-500/10' };
                      const canCancel = order.status === 'pending';

                      return (
                        <div
                          key={order.id}
                          className={`p-2 ${index % 2 === 0 ? 'bg-neutral-900' : 'bg-neutral-900/50'}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            {/* 订单信息 */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${order.type === 'buy' ? 'text-red-500 bg-red-500/10' : 'text-green-500 bg-green-500/10'}`}>
                                  {order.type === 'buy' ? '买' : '卖'}
                                </span>
                                <span className="text-xs font-medium text-neutral-200 truncate">{order.symbol}</span>
                                <span className={`inline-block text-[9px] px-1.5 py-0.5 rounded ${status.class}`}>
                                  {status.text}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-[10px]">
                                <span className="text-neutral-500">价:{formatPrice(order.price)}</span>
                                <span className="text-neutral-500">量:{order.quantity}手</span>
                              </div>
                              <div className="text-[9px] text-neutral-600 font-mono truncate mt-0.5">{order.createTime || order.id}</div>
                            </div>

                            {/* 取消按钮 */}
                            {canCancel && (
                              <button
                                onClick={() => handleCancelOrder(order)}
                                className="
                                  flex-shrink-0 px-2 py-1 rounded
                                  bg-red-900/20 hover:bg-red-900/30
                                  border border-red-800/30 hover:border-red-700/40
                                  text-red-400 hover:text-red-300
                                  transition-all duration-200
                                  text-[10px] font-medium
                                  flex items-center gap-0.5
                                "
                              >
                                <CloseIcon size="10px" />
                                取消
                              </button>
                            )}
                          </div>

                          {/* 保证金信息（仅待成交订单显示） */}
                          {canCancel && order.margin && (
                            <div className="mt-1.5 pt-1.5 border-t border-neutral-800/50">
                              <div className="flex justify-between items-center text-[10px]">
                                <span className="text-neutral-500">保证金</span>
                                <span className="text-amber-400 font-mono font-medium">{formatCurrency(order.margin)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 底部提示 */}
              {orders.filter(o => o.status === 'pending').length > 0 && (
                <div className="mt-2 bg-amber-950/10 border border-amber-800/20 rounded p-2">
                  <div className="flex items-start gap-1.5">
                    <InfoCircleIcon size="12px" className="text-amber-500 mt-0.5 flex-shrink-0" />
                    <p className="text-[10px] text-neutral-400 leading-tight">
                      待成交订单可随时取消，取消后保证金将立即返还到可用资金。
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 持仓列表 */}
          {activeTab === 'positions' && (
            <div>
              {/* 持仓统计 */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-neutral-950 rounded p-2 border border-neutral-800">
                  <p className="text-[10px] text-neutral-500 mb-0.5">持仓数</p>
                  <p className="text-sm font-bold text-amber-500 font-mono">{positions.length}</p>
                </div>
                <div className="bg-neutral-950 rounded p-2 border border-neutral-800">
                  <p className="text-[10px] text-neutral-500 mb-0.5">总盈亏</p>
                  <p className={`text-sm font-bold font-mono ${
                    positions.reduce((sum, p) => sum + p.profitLoss, 0) >= 0 ? 'text-red-500' : 'text-green-500'
                  }`}>
                    {positions.reduce((sum, p) => sum + p.profitLoss, 0) >= 0 ? '+' : ''}
                    {formatCurrency(positions.reduce((sum, p) => sum + p.profitLoss, 0))}
                  </p>
                </div>
              </div>

              {/* 持仓列表 */}
              <div className="bg-neutral-950 rounded border border-neutral-800 overflow-hidden max-h-[350px] overflow-y-auto">
                {positions.length === 0 ? (
                  <div className="text-center py-6">
                    <TrendingUpIcon size="24px" className="text-neutral-700 mb-1.5" />
                    <p className="text-xs text-neutral-500">暂无持仓</p>
                    <p className="text-[10px] text-neutral-600 mt-0.5">下单后持仓将显示在这里</p>
                  </div>
                ) : (
                  <div className="divide-y divide-neutral-800/50">
                    {positions.map((pos, index) => (
                      <div
                        key={pos.id}
                        className={`p-2 ${index % 2 === 0 ? 'bg-neutral-900' : 'bg-neutral-900/50'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          {/* 持仓信息 */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold ${pos.direction === 'long' ? 'bg-red-500/15 text-red-500' : 'bg-green-500/15 text-green-500'}`}>
                                {pos.direction === 'long' ? '多' : '空'}
                              </span>
                              <span className="text-xs font-medium text-neutral-200 truncate">{pos.name}</span>
                              <span className="text-[10px] text-neutral-500">{pos.quantity}手</span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px]">
                              <span className="text-neutral-500">开:{formatPrice(pos.openPrice)}</span>
                              <span className="text-neutral-500">现:{formatPrice(pos.currentPrice)}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] mt-0.5">
                              <span className="text-neutral-500">保:{formatCurrency(pos.margin)}</span>
                            </div>
                          </div>

                          {/* 盈亏显示 */}
                          <div className="text-right">
                            <p className={`text-sm font-bold font-mono ${pos.profitLoss >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                              {pos.profitLoss >= 0 ? '+' : ''}{formatCurrency(pos.profitLoss)}
                            </p>
                            <p className={`text-[9px] ${pos.profitLoss >= 0 ? 'text-red-500/60' : 'text-green-500/60'}`}>
                              {pos.profitLoss >= 0 ? '盈利' : '亏损'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 底部提示 */}
              {positions.length > 0 && (
                <div className="mt-2 bg-green-950/10 border border-green-800/20 rounded p-2">
                  <div className="flex items-start gap-1.5">
                    <InfoCircleIcon size="12px" className="text-green-500 mt-0.5 flex-shrink-0" />
                    <p className="text-[10px] text-neutral-400 leading-tight">
                      持仓盈亏将根据实时行情每秒更新，当前价格变动会影响您的盈亏情况。
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Dialog>

      {/* 取消订单确认对话框 */}
      <Dialog
        header={
          <div className="flex items-center gap-2">
            <CloseIcon size="20px" className="text-red-500" />
            <span className="text-sm font-semibold text-neutral-200">取消订单</span>
          </div>
        }
        visible={showCancelDialog}
        onClose={() => {
          setShowCancelDialog(false);
          setSelectedOrder(null);
        }}
        className="!bg-neutral-900 !border-neutral-800"
        style={{ background: '#171717', borderColor: '#262626' }}
        footer={
          <div className="flex gap-2">
            <button
              onClick={() => {
                setShowCancelDialog(false);
                setSelectedOrder(null);
              }}
              className="
                flex-1 py-2.5 rounded-lg
                bg-neutral-800 hover:bg-neutral-700
                border border-neutral-700
                text-neutral-300
                transition-all duration-200
                text-xs font-medium tracking-wide
              "
            >
              再想想
            </button>
            <button
              onClick={confirmCancelOrder}
              className="
                flex-1 py-2.5 rounded-lg
                bg-red-900/30 hover:bg-red-900/40
                border border-red-800/50 hover:border-red-700/60
                text-red-400 hover:text-red-300
                transition-all duration-200
                text-xs font-medium tracking-wide
              "
            >
              确认取消
            </button>
          </div>
        }
      >
        {selectedOrder && (
          <div className="py-2 space-y-3">
            {/* 订单信息 */}
            <div className="bg-neutral-800/50 rounded-lg p-3 border border-neutral-700/30">
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-neutral-500">品种</span>
                  <span className="text-xs font-medium text-neutral-200">{selectedOrder.symbol}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-neutral-500">类型</span>
                  <span className={`text-xs font-semibold ${selectedOrder.type === 'buy' ? 'text-red-500' : 'text-green-500'}`}>
                    {selectedOrder.type === 'buy' ? '买入' : '卖出'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-neutral-500">价格</span>
                  <span className="text-xs font-mono font-medium text-amber-400/80">{formatPrice(selectedOrder.price)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-neutral-500">数量</span>
                  <span className="text-xs font-medium text-neutral-200">{selectedOrder.quantity}手</span>
                </div>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-neutral-700/30">
                <span className="text-xs text-neutral-500">订单号</span>
                <span className="text-[10px] text-neutral-400 font-mono">{selectedOrder.id}</span>
              </div>
              {selectedOrder.margin && (
                <div className="flex justify-between items-center pt-2 border-t border-neutral-700/30">
                  <span className="text-xs text-neutral-500">返还保证金</span>
                  <span className="text-xs font-mono font-medium text-amber-400">{formatCurrency(selectedOrder.margin)}</span>
                </div>
              )}
            </div>

            {/* 警告信息 */}
            <div className="bg-yellow-950/20 border border-yellow-900/40 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <InfoCircleIcon size="16px" className="text-yellow-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-yellow-400 font-medium mb-1">订单取消后无法恢复</p>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    确认要取消此订单吗？取消后订单将立即失效，保证金将返还到可用资金。
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
