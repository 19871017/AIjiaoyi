import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from 'tdesign-react';
import { SoundIcon, CalendarIcon, WalletIcon, ChartIcon } from 'tdesign-icons-react';
import TechNoticeBar from '../components/TechNoticeBar';
import { formatPrice, formatPercent, formatVolume } from '../utils/format';
import { getQuoteBySymbol } from '../services/shuhai-backend.service';
import { getAISummary, AISummary } from '../services/ai-analysis.service';
import wsService, { WebSocketMessage } from '../services/websocket.service';
import logger from '../utils/logger';
import { getAnnouncements } from '../services/announcement';

// 数海API支持的品种列表（只有这6个品种有数据）
const MARKET_SYMBOLS = [
  { symbol: 'DAX', name: '德指', shuhaiCode: 'CEDAXA0' },
  { symbol: 'NQ', name: '纳指', shuhaiCode: 'CENQA0' },
  { symbol: 'HSI', name: '恒指', shuhaiCode: 'HIHHI01' },
  { symbol: 'MHSI', name: '小恒指', shuhaiCode: 'HIMCH01' },
  { symbol: 'GOLD', name: '美黄金', shuhaiCode: 'CMGCA0' },
  { symbol: 'USOIL', name: '美原油', shuhaiCode: 'NECLA0' },
];

// 专业级行情类型定义
interface MarketItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
  isDomestic: boolean;
}

export default function Home() {
  const navigate = useNavigate();
  const [marketData, setMarketData] = useState<MarketItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [, setAISummary] = useState<AISummary | null>(null);
  const [, setLoadingAISummary] = useState(false);
  const [isConnected, setIsConnected] = useState(false); // 连接状态

  // 从API加载市场数据
  const loadMarketData = async () => {
    try {
      // 使用单个请求获取每个品种的数据（批量请求返回407错误）
      const quotes = await Promise.allSettled(
        MARKET_SYMBOLS.map(s => getQuoteBySymbol(s.symbol))
      );

      const data = MARKET_SYMBOLS.map((symbol, index) => {
        const result = quotes[index];
        if (result.status === 'fulfilled' && result.value) {
          const quote = result.value;
          // 检查是否有错误标记
          if (quote._error) {
            if (quote._fromCache) {
              console.log(`品种 ${symbol.symbol} 使用缓存数据:`, quote.price);
            } else {
              console.warn(`品种 ${symbol.symbol} 获取数据失败:`, quote._errorMessage);
            }
          }
          return {
            symbol: symbol.symbol,
            name: symbol.name,
            price: quote?.price || 0,
            change: quote?.change || quote?.diff || 0,
            changePercent: quote?.changePercent || quote?.change_percent || 0,
            high: quote?.high || quote?.highest || 0,
            low: quote?.low || quote?.lowest || 0,
            volume: quote?.volume || 0,
            isDomestic: false,
            _error: quote?._error || false,
            _errorMessage: quote?._errorMessage || ''
          };
        } else {
          // 如果请求失败，记录错误并返回默认数据
          console.error(`品种 ${symbol.symbol} 请求失败:`, result.reason);
          return {
            symbol: symbol.symbol,
            name: symbol.name,
            price: 0,
            change: 0,
            changePercent: 0,
            high: 0,
            low: 0,
            volume: 0,
            isDomestic: false,
            _error: true,
            _errorMessage: result.reason?.message || '请求失败'
          };
        }
      });

      // 检查是否有有效数据，判断连接状态
      const hasValidData = data.some(item => !item._error && item.price > 0);
      setIsConnected(hasValidData);

      setMarketData(data);
    } catch (error) {
      logger.error('加载市场数据失败:', error);
      setIsConnected(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadMarketData();
    setRefreshing(false);
  };

  // 刷新AI分析
  const _handleRefreshAISummary = async () => {
    setLoadingAISummary(true);
    try {
      const summary = await getAISummary(marketData);
      setAISummary(summary);
    } catch (error) {
      logger.error('刷新AI分析失败:', error);
    } finally {
      setLoadingAISummary(false);
    }
  };

  useEffect(() => {
    // WebSocket会自动推送实时数据，不需要手动加载

    // 使用WebSocket接收实时数据
    const handleMessage = (message: WebSocketMessage) => {
      if (message.type === 'quote' && message.symbols && message.symbols.length > 0) {
        // 收到WebSocket消息，说明已连接
        setIsConnected(true);

        // 更新对应品种的数据
        if (message.data && message.data.length > 0) {
          setMarketData(prevData => {
            // 如果之前没有数据，直接用WebSocket数据初始化
            if (prevData.length === 0) {
              return message.data.map((d: any) => ({
                symbol: d.productCode,
                name: d.productName || d.productCode,
                price: d.lastPrice || 0,
                change: d.change || 0,
                changePercent: d.changePercent || 0,
                high: d.high24h || 0,
                low: d.low24h || 0,
                volume: d.volume24h || 0,
                isDomestic: false,
              }));
            }

            // 如果有数据，更新对应品种
            return prevData.map(item => {
              const updatedItem = message.data.find((d: any) => d.productCode === item.symbol);
              if (updatedItem) {
                return {
                  ...item,
                  price: updatedItem.lastPrice || item.price,
                  change: updatedItem.change || item.change,
                  changePercent: updatedItem.changePercent || item.changePercent,
                  high: updatedItem.high24h || item.high,
                  low: updatedItem.low24h || item.low,
                  volume: updatedItem.volume24h || item.volume,
                };
              }
              return item;
            });
          });
        }
      }
    };

    wsService.onMessage(handleMessage);

    return () => {
      wsService.offMessage(handleMessage);
    };
  }, []);

  // 加载AI分析
  useEffect(() => {
    const loadAISummary = async () => {
      try {
        const summary = await getAISummary(marketData);
        setAISummary(summary);
      } catch (error) {
        logger.error('加载AI分析失败:', error);
      }
    };
    loadAISummary();
  }, []);

  // 加载公告
  useEffect(() => {
    const loadAnnouncements = async () => {
      try {
        const list = await getAnnouncements();
        setAnnouncements(list || []);
      } catch (error) {
        logger.error('加载公告失败:', error);
      }
    };
    loadAnnouncements();
  }, []);

  return (
    <div className="finance-app min-h-screen bg-[#0b0f14] pb-20 pt-3">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header - 券商风格 */}
        <header className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#1a2330] rounded flex items-center justify-center border border-[#273241]">
              <span className="text-xs font-bold text-[#c9d4e5]">PM</span>
            </div>
            <div>
              <h1 className="text-base font-semibold text-[#e6edf7] tracking-wide">专业交易终端</h1>
              <p className="text-xs text-[#7a889c]">Precious Metals Desk</p>
            </div>
          </div>
          {/* 连接状态指示器 */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${
              isConnected ? 'bg-[#0f1b14] border-[#1f3a2a]' : 'bg-[#1b1212] border-[#3a1f1f]'
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span className={`text-xs ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
              {isConnected ? '已联网' : '未联网'}
            </span>
          </div>
        </header>

        {/* 公告栏 */}
        <TechNoticeBar
          announcements={announcements}
          icon={<SoundIcon size="14px" className="text-[#9fb0c5]" />}
        />

        {/* 账户概览 - 券商风格 */}
        <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-[#0f141b] rounded border border-[#1e2633] p-3">
            <p className="text-[11px] text-[#7a889c] mb-1">总资产</p>
            <p className="text-sm font-semibold text-[#e6edf7] font-mono">¥1,250,000</p>
          </div>
          <div className="bg-[#0f141b] rounded border border-[#1e2633] p-3">
            <p className="text-[11px] text-[#7a889c] mb-1">可用资金</p>
            <p className="text-sm font-semibold text-[#e6edf7] font-mono">¥850,000</p>
          </div>
          <div className="bg-[#0f141b] rounded border border-[#1e2633] p-3">
            <p className="text-[11px] text-[#7a889c] mb-1">占用保证金</p>
            <p className="text-sm font-semibold text-[#e6edf7] font-mono">¥400,000</p>
          </div>
          <div className="bg-[#0f141b] rounded border border-[#1e2633] p-3">
            <p className="text-[11px] text-[#7a889c] mb-1">今日盈亏</p>
            <p className="text-sm font-semibold text-[#3bd187] font-mono">+¥12,500</p>
          </div>
        </div>

        {/* 实时行情列表 - 专业行情条样式 */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs text-[#9fb0c5] tracking-wide font-semibold">实时行情</span>
            <button
              onClick={() => navigate('/market')}
              className="text-xs text-[#7a889c] hover:text-[#c9d4e5] transition-colors font-medium"
            >
              全部
            </button>
          </div>
          <Card className="!bg-[#0f141b] !border-[#1e2633] !p-0">
            <div className="divide-y divide-[#1e2633]">
              {marketData.map((item) => (
                <div
                  key={item.symbol}
                  onClick={() => navigate(`/market?symbol=${item.symbol}`)}
                  className="group px-4 py-3 hover:bg-[#141b24] transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-[#e6edf7]">
                          {item.name}
                        </h3>
                        <span className="text-[11px] text-[#7a889c]">{item.symbol}</span>
                      </div>
                      <div className="flex gap-4 text-[11px] text-[#7a889c]">
                        <span className="font-medium">高 <span className="text-[#b5c2d6] font-mono">{item.high > 0 ? formatPrice(item.high) : '--'}</span></span>
                        <span className="font-medium">低 <span className="text-[#b5c2d6] font-mono">{item.low > 0 ? formatPrice(item.low) : '--'}</span></span>
                        <span className="font-medium">{item.volume > 0 ? formatVolume(item.volume) : '--'}</span>
                      </div>
                    </div>
                    <div className="text-right min-w-fit">
                      <p className="text-lg font-semibold text-[#e6edf7] font-mono">
                        {formatPrice(item.price)}
                      </p>
                      <div className={`flex items-center justify-end gap-1 text-xs font-semibold mt-1 ${
                        item.change >= 0 ? 'text-[#3bd187]' : 'text-[#ff6b6b]'
                      }`}>
                        <span>
                          {formatPercent(item.changePercent)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* 快捷操作 - 极简4个 */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: '持仓', icon: <CalendarIcon size="18px" />, action: () => navigate('/position') },
            { label: '行情', icon: <ChartIcon size="18px" />, action: () => navigate('/market') },
            { label: '分析', icon: <ChartIcon size="18px" />, action: () => navigate('/analysis') },
            { label: '充值', icon: <WalletIcon size="18px" />, action: () => navigate('/deposit') },
          ].map((item) => (
            <button
              key={item.label}
              onClick={item.action}
              className="bg-[#0f141b] rounded border border-[#1e2633] p-3 hover:border-[#2b394b] transition-colors group"
            >
              <div className="flex flex-col items-center gap-1">
                <div className="text-[#7a889c] group-hover:text-[#c9d4e5] transition-colors">
                  {item.icon}
                </div>
                <span className="text-xs text-[#9fb0c5] group-hover:text-[#e6edf7] transition-colors font-medium">
                  {item.label}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

