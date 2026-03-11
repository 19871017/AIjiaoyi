import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, Dialog, MessagePlugin } from 'tdesign-react';
import { InfoCircleIcon, TrendingUpIcon, WalletIcon, SettingIcon, CloseIcon } from 'tdesign-icons-react';
import ReactECharts from 'echarts-for-react';
import { formatPrice, formatCurrency } from '../utils/format';
import { Position as PositionType, ClosedPosition } from '../types';
import api from '../services/api';

// 统一的消息提示函数
const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
  MessagePlugin[type](message);
};

export default function Position() {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'position');
  const [currentPage, setCurrentPage] = useState(1);
  const [closedCurrentPage, setClosedCurrentPage] = useState(1);

  const [positions, setPositions] = useState<PositionType[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [closedPositions, setClosedPositions] = useState<ClosedPosition[]>([]);
  const [account, setAccount] = useState<any>({
    totalAssets: 0,
    availableFunds: 0,
    frozenMargin: 0,
    dailyPL: 0,
    cumulativePL: 0
  });
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showHedgeDialog, setShowHedgeDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<PositionType | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [showActionPanel, setShowActionPanel] = useState(false);

  // 盈亏历史记录（用于绘制趋势图）
  const [profitHistory, setProfitHistory] = useState<{ time: string; profit: number }[]>([]);

  // 加载真实数据
  useEffect(() => {
    const loadData = async () => {
      try {
        const [accountInfo, positionList, orderList] = await Promise.all([
          api.account.getInfo(),
          api.position.getList(),
          api.order.getList()
        ]);

        setAccount({
          totalAssets: accountInfo.totalBalance ?? 0,
          availableFunds: accountInfo.availableBalance ?? 0,
          frozenMargin: accountInfo.frozenMargin ?? 0,
          dailyPL: accountInfo.unrealizedPnl ?? 0,
          cumulativePL: accountInfo.realizedPnl ?? 0
        });

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

        setOrders(orderList || []);
        setClosedPositions([]);
      } catch (error) {
        logger.error('加载持仓/订单失败:', error);
        showToast('加载持仓/订单失败', 'error');
      }
    };

    loadData();
  }, []);

  // 计算保证金占用率和风险等级
  const marginUsageRate = ((account.frozenMargin || 0) / account.totalAssets * 100).toFixed(1);
  const getRiskLevel = (rate: number) => {
    if (rate < 50) return { level: '安全', color: 'text-green-500', bgClass: 'bg-green-500/10 border-green-500/30' };
    if (rate < 70) return { level: '关注', color: 'text-yellow-500', bgClass: 'bg-yellow-500/10 border-yellow-500/30' };
    return { level: '风险', color: 'text-red-500', bgClass: 'bg-red-500/10 border-red-500/30' };
  };
  const riskLevel = getRiskLevel(parseFloat(marginUsageRate));
  const isHighRisk = parseFloat(marginUsageRate) > 70;
  const riskMessage = isHighRisk ? '已进入风险警戒区间，建议立即调整仓位' : '建议控制仓位，避免风险升级';

  // 历史订单分页
  const orderPageSize = 8;
  const totalPages = Math.ceil((orders.length || 0) / orderPageSize);
  const currentOrders = (orders || []).slice((currentPage - 1) * orderPageSize, currentPage * orderPageSize);

  // 平仓记录分页 - 每页10条
  const closedPageSize = 10;
  const closedTotalPages = Math.ceil(closedPositions.length / closedPageSize);
  const currentClosedPositions = closedPositions.slice((closedCurrentPage - 1) * closedPageSize, closedCurrentPage * closedPageSize);

  // 状态映射
  const statusMap: Record<string, { text: string; class: string }> = {
    pending: { text: '待成交', class: 'text-yellow-500 bg-yellow-500/10' },
    filled: { text: '已成交', class: 'text-green-500 bg-green-500/10' },
    cancelled: { text: '已取消', class: 'text-neutral-500 bg-neutral-500/10' },
    partial: { text: '部分成交', class: 'text-blue-500 bg-blue-500/10' }
  };

  // 平仓类型映射
  const closeTypeMap: Record<string, { text: string; class: string }> = {
    manual: { text: '手动平仓', class: 'text-blue-500 bg-blue-500/10' },
    forced: { text: '强制平仓', class: 'text-red-500 bg-red-500/10' }
  };

  // 单个平仓
  const handleClosePosition = (position: PositionType) => {
    setSelectedPosition(position);
    setShowCloseDialog(true);
    setShowActionPanel(false);
  };

  // 确认平仓
  const confirmClosePosition = () => {
    if (!selectedPosition) return;

    // 创建平仓记录
    const now = new Date();
    const closeTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const closedPosition: ClosedPosition = {
      id: `CLS${String(Date.now()).slice(-6)}`,
      symbol: selectedPosition.symbol,
      name: selectedPosition.name,
      direction: selectedPosition.direction,
      openTime: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} 09:30:00`,
      openPrice: selectedPosition.openPrice,
      closePrice: selectedPosition.currentPrice,
      closeTime: closeTime,
      quantity: selectedPosition.quantity,
      profitLoss: selectedPosition.profitLoss,
      closeType: 'manual'
    };

    // 从持仓列表中移除
    setPositions(prev => prev.filter(p => p.id !== selectedPosition.id));

    // 添加到平仓记录
    setClosedPositions(prev => [closedPosition, ...prev]);

    // 更新账户资金
    setAccount(prev => ({
      ...prev,
      availableFunds: prev.availableFunds + selectedPosition.margin + selectedPosition.profitLoss,
      frozenMargin: prev.frozenMargin - selectedPosition.margin
    }));

    setShowCloseDialog(false);
    setSelectedPosition(null);

    showToast(`已平仓 ${selectedPosition.name} ${selectedPosition.quantity}手`);
  };

  // 取消订单
  const handleCancelOrder = (order: any) => {
    setSelectedOrder(order);
    setShowCancelDialog(true);
  };

  // 确认取消订单
  const confirmCancelOrder = async () => {
    if (!selectedOrder) return;

    try {
      const result = await api.order.cancel(selectedOrder.id);
      setOrders(prev => prev.map(order =>
        order.id === selectedOrder.id
          ? { ...order, status: 'cancelled' }
          : order
      ));
      showToast(`已取消订单 ${result.orderId}`, 'success');
    } catch (err: any) {
      logger.error('取消订单失败:', err);
      showToast(err.message || '取消订单失败，请稍后重试', 'error');
    }

    setShowCancelDialog(false);
    setSelectedOrder(null);
  };

  // 点击持仓行
  const handlePositionClick = (position: PositionType) => {
    setSelectedPosition(position);
    setShowActionPanel(true);
  };

  // 关闭操作面板
  const handleCloseActionPanel = () => {
    setShowActionPanel(false);
  };

  // 一键全平
  const handleCloseAll = () => {
    if (positions.length === 0) {
      showToast('当前没有持仓');
      return;
    }
    setShowActionPanel(false);

    const now = new Date();
    const closeTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const newClosedPositions: ClosedPosition[] = positions.map(pos => ({
      id: `CLS${String(Date.now() + Math.random()).slice(-6)}`,
      symbol: pos.symbol,
      name: pos.name,
      direction: pos.direction,
      openTime: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} 09:30:00`,
      openPrice: pos.openPrice,
      closePrice: pos.currentPrice,
      closeTime: closeTime,
      quantity: pos.quantity,
      profitLoss: pos.profitLoss,
      closeType: 'manual'
    }));

    const totalMargin = positions.reduce((sum, p) => sum + p.margin, 0);
    const totalProfit = positions.reduce((sum, p) => sum + p.profitLoss, 0);

    // 清空持仓
    setPositions([]);

    // 添加到平仓记录
    setClosedPositions(prev => [...newClosedPositions, ...prev]);

    // 更新账户资金
    setAccount(prev => ({
      ...prev,
      availableFunds: prev.availableFunds + totalMargin + totalProfit,
      frozenMargin: prev.frozenMargin - totalMargin
    }));

    showToast(`已全部平仓 ${positions.length}个仓位`);
  };

  // 反手锁仓
  const handleHedgePosition = (position: PositionType) => {
    setSelectedPosition(position);
    setShowHedgeDialog(true);
    setShowActionPanel(false);
  };

  // 确认反手锁仓
  const confirmHedgePosition = () => {
    if (!selectedPosition) return;

    const hedgePosition: PositionType = {
      id: `POS${String(Date.now()).slice(-6)}`,
      symbol: selectedPosition.symbol,
      name: selectedPosition.name,
      direction: selectedPosition.direction === 'long' ? 'short' : 'long',
      openPrice: selectedPosition.currentPrice,
      currentPrice: selectedPosition.currentPrice,
      quantity: selectedPosition.quantity,
      margin: selectedPosition.margin,
      profitLoss: 0,
      stopLoss: selectedPosition.stopLoss,
      takeProfit: selectedPosition.takeProfit
    };

    // 添加反向持仓
    setPositions(prev => [...prev, hedgePosition]);

    // 更新账户资金
    setAccount(prev => ({
      ...prev,
      availableFunds: prev.availableFunds - hedgePosition.margin,
      frozenMargin: prev.frozenMargin + hedgePosition.margin
    }));

    setShowHedgeDialog(false);
    setSelectedPosition(null);

    showToast(`已锁仓 ${selectedPosition.name} ${hedgePosition.quantity}手`);
  };

  // 盈亏趋势 - 使用实际盈亏历史数据
  const profitTrendOption = useMemo(() => {
    // 获取时间和盈亏数据
    const times = profitHistory.map(item => item.time);
    const profits = profitHistory.map(item => item.profit);
    const totalProfit = positions.reduce((sum, p) => sum + p.profitLoss, 0);

    // 如果没有历史数据，使用当前盈亏
    const displayTimes = times.length > 0 ? times : ['当前'];
    const displayProfits = profits.length > 0 ? profits : [totalProfit];

    // 计算Y轴范围
    const minProfit = Math.min(...displayProfits, 0);
    const maxProfit = Math.max(...displayProfits, 0);
    const margin = (maxProfit - minProfit) * 0.1 || 100;
    const yAxisMin = minProfit - margin;
    const yAxisMax = maxProfit + margin;

    return {
      backgroundColor: 'transparent',
      grid: { left: '15%', right: '5%', top: '5%', bottom: '15%' },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(23, 23, 23, 0.95)',
        borderColor: '#444',
        textStyle: { color: '#e5e5e5', fontSize: 11 },
        formatter: (params: any) => {
          const value = params[0].value;
          const isProfit = value >= 0;
          return `${params[0].name}<br/>盈亏: <span style="color:${isProfit ? '#ef4444' : '#22c55e'}">${isProfit ? '+' : ''}¥${value.toFixed(2)}</span>`;
        }
      },
      xAxis: {
        type: 'category',
        data: displayTimes,
        axisLine: { lineStyle: { color: '#333' } },
        axisLabel: { color: '#666', fontSize: 9 }
      },
      yAxis: {
        type: 'value',
        min: yAxisMin,
        max: yAxisMax,
        axisLine: { show: false },
        axisLabel: {
          color: '#666',
          fontSize: 9,
          margin: 8,
          formatter: (value: number) => {
            // 格式化大额数字
            if (Math.abs(value) >= 1000000) {
              return `${(value / 1000000).toFixed(1)}M`;
            } else if (Math.abs(value) >= 1000) {
              return `${(value / 1000).toFixed(1)}k`;
            }
            return value.toFixed(0);
          }
        },
        splitLine: {
          lineStyle: { color: '#222' }
        }
      },
      series: [{
        type: 'line',
        data: displayProfits,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: totalProfit >= 0 ? '#ef4444' : '#22c55e', width: 2 },
        itemStyle: { color: totalProfit >= 0 ? '#ef4444' : '#22c55e' },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: totalProfit >= 0 ? 'rgba(239, 68, 68, 0.25)' : 'rgba(34, 197, 94, 0.25)' },
              { offset: 1, color: totalProfit >= 0 ? 'rgba(239, 68, 68, 0)' : 'rgba(34, 197, 94, 0)' }
            ]
          }
        },
        markLine: {
          silent: true,
          data: [{
            yAxis: 0,
            label: {
              show: false
            },
            lineStyle: {
              color: '#4b5563',
              width: 1,
              type: 'solid'
            }
          }]
        }
      }]
    };
  }, [profitHistory, positions]);

  // 持仓盈亏数据统计
  const profitCount = positions.filter(p => p.profitLoss > 0).length;
  const lossCount = positions.filter(p => p.profitLoss < 0).length;
  const totalProfit = positions.filter(p => p.profitLoss > 0).reduce((sum, p) => sum + p.profitLoss, 0);
  const totalLoss = positions.filter(p => p.profitLoss < 0).reduce((sum, p) => sum + p.profitLoss, 0);
  const netProfit = totalProfit + totalLoss;
  const totalProfitLossValue = Math.abs(totalProfit) + Math.abs(totalLoss);
  const profitPercentage = totalProfitLossValue > 0 ? ((totalProfit / totalProfitLossValue) * 100).toFixed(1) : '0.0';

  // 持仓盈亏图表数据
  const profitDistributionData = [
    {
      name: '盈利',
      value: Math.abs(totalProfit),
      profit: totalProfit,
      count: profitCount,
      itemStyle: { color: '#ef4444' }
    },
    {
      name: '亏损',
      value: Math.abs(totalLoss),
      profit: totalLoss,
      count: lossCount,
      itemStyle: { color: '#22c55e' }
    }
  ].filter(item => item.value > 0);

  const positionDistributionOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(23, 23, 23, 0.95)',
      borderColor: '#444',
      textStyle: { color: '#e5e5e5', fontSize: 11 },
      formatter: (params: any) => {
        const item = params.data;
        const sign = item.profit >= 0 ? '+' : '-';
        return `${item.name} ${item.count}个<br/>${sign}¥${Math.abs(item.profit).toLocaleString()}<br/>占比: ${params.percent}%`;
      }
    },
    graphic: {
      type: 'text',
      left: 'center',
      top: 'center',
      style: {
        text: netProfit >= 0 ? `+¥${(Math.abs(netProfit) / 1000).toFixed(1)}k` : `-¥${(Math.abs(netProfit) / 1000).toFixed(1)}k`,
        fill: netProfit >= 0 ? '#ef4444' : '#22c55e',
        fontSize: 14,
        fontWeight: 'bold',
        textAlign: 'center',
        textBaseline: 'middle'
      }
    },
    series: [{
      type: 'pie',
      radius: ['72%', '88%'],
      center: ['50%', '50%'],
      data: profitDistributionData,
      label: { show: false },
      emphasis: {
        label: { show: false },
        scale: true,
        scaleSize: 5
      },
      animationType: 'scale',
      animationEasing: 'elasticOut',
      itemStyle: {
        borderColor: '#1a1a1a',
        borderWidth: 1
      }
    }]
  };

  return (
    <div className="finance-app min-h-screen bg-gradient-to-b from-black to-neutral-950 pb-20 pt-2">
      <div className="max-w-7xl mx-auto px-3">
        {/* Header */}
        <header className="flex justify-between items-center mb-4 py-2">
          <div>
            <h1 className="text-lg font-bold text-neutral-200 tracking-wide">持仓管理</h1>
            <p className="text-xs text-neutral-600">资金安全与风险控制中枢</p>
          </div>
          <SettingIcon size="18px" className="text-neutral-600" />
        </header>

        {/* 资金总览卡片 */}
        <div className="mb-4 bg-neutral-900 rounded-lg border border-neutral-800 p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <WalletIcon size="18px" className="text-amber-500" />
              <span className="text-xs text-neutral-300 tracking-wide font-medium">资金总览</span>
            </div>
            <div className={`text-xs px-3 py-1.5 rounded border ${riskLevel.bgClass}`}>
              <span className={`font-medium ${riskLevel.color}`}>风险等级：{riskLevel.level}</span>
            </div>
          </div>

          {/* 可用资金 - 主显示 */}
          <div className="text-center mb-5">
            <p className="text-[11px] text-neutral-400 mb-2 tracking-wide font-medium">可用资金</p>
            <p className="text-3xl font-medium asset-value-large font-mono">{formatCurrency(account.availableFunds)}</p>
          </div>

          {/* 关键指标 */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="text-center bg-neutral-950 rounded-lg py-3">
              <p className="text-[11px] text-neutral-400 mb-1 font-medium">保证金占用率</p>
              <p className="text-lg font-medium asset-value font-mono">{marginUsageRate}%</p>
            </div>
            <div className="text-center bg-neutral-950 rounded-lg py-3">
              <p className="text-[11px] text-neutral-400 mb-1 font-medium">持仓品种</p>
              <p className="text-lg font-medium text-neutral-200">{positions.length}</p>
            </div>
          </div>

          {/* 次级信息 */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-neutral-800">
            <div className="flex justify-between items-center">
              <span className="text-xs text-neutral-400 font-medium">总资产</span>
              <span className="text-sm font-medium asset-value font-mono">{formatCurrency(account.totalAssets)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-neutral-400 font-medium">今日盈亏</span>
              <span className={`text-sm font-medium font-mono ${account.dailyPL >= 0 ? 'asset-profit' : 'asset-loss'}`}>
                {account.dailyPL >= 0 ? '+' : ''}{formatCurrency(account.dailyPL)}
              </span>
            </div>
          </div>
        </div>

        {/* 风险警告 */}
        <div className="mb-4 bg-red-950/20 border border-red-900/40 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <InfoCircleIcon size="16px" className="text-red-500" />
              <span className="text-xs text-red-400 font-medium tracking-wide">风险警告</span>
            </div>
            <span className={`text-xs font-medium ${riskLevel.color}`}>{riskLevel.level}</span>
          </div>
          <p className="text-sm text-neutral-300 leading-relaxed">
            当前保证金占用率 <span className="font-mono font-semibold">{marginUsageRate}%</span>，{riskMessage}
          </p>
        </div>

        {/* 标签页切换 */}
        <div className="flex mb-3 bg-neutral-900 rounded-lg border border-neutral-800 overflow-hidden">
          <button
            onClick={() => { setActiveTab('position'); setCurrentPage(1); }}
            className={`flex-1 py-3 text-sm font-medium transition-all ${
              activeTab === 'position'
                ? 'bg-neutral-800 text-white border-b-2 border-amber-600'
                : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/50'
            }`}
          >
            当前持仓 ({positions.length})
          </button>
          <button
            onClick={() => setActiveTab('closed')}
            className={`flex-1 py-3 text-sm font-medium transition-all ${
              activeTab === 'closed'
                ? 'bg-neutral-800 text-white border-b-2 border-amber-600'
                : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/50'
            }`}
          >
            平仓记录 ({closedPositions.length})
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex-1 py-3 text-sm font-medium transition-all ${
              activeTab === 'orders'
                ? 'bg-neutral-800 text-white border-b-2 border-amber-600'
                : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/50'
            }`}
          >
            历史订单 ({orders.length})
          </button>
        </div>

        {/* 当前持仓表格 */}
        {activeTab === 'position' && (
          <div className="mb-4">
            {/* 一键全平功能区 - 暗金色系商务风格 */}
            <div className="flex justify-center mb-6">
              <button
                onClick={handleCloseAll}
                disabled={positions.length === 0}
                className={`
                  relative overflow-hidden group
                  flex items-center justify-center gap-3
                  px-8 py-3.5 rounded-xl min-w-[160px]
                  transition-all duration-300 active:scale-95
                  ${positions.length === 0
                    ? 'bg-neutral-800/50 text-neutral-600 cursor-not-allowed border border-neutral-700/50'
                    : 'bg-amber-900/20 hover:bg-amber-900/30 text-amber-400/90 border border-amber-700/40 hover:border-amber-600/50 shadow-lg shadow-amber-950/20 hover:shadow-amber-950/30 backdrop-blur-sm'
                  }
                `}
              >
                {/* 暗金光泽效果 */}
                {positions.length > 0 && (
                  <>
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-400/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
                  </>
                )}

                <span className="text-sm font-semibold tracking-wider">一键全平</span>
                {positions.length > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-800/30 text-[11px] font-mono border border-amber-700/40 text-amber-400/80">
                    {positions.length}
                  </span>
                )}
              </button>
            </div>

            {/* 持仓卡片列表 */}
            <div className="space-y-3">
              {positions.map((pos) => (
                <div
                  key={pos.id}
                  onClick={() => handlePositionClick(pos)}
                  className={`
                    relative p-4 rounded-xl border transition-all duration-200 cursor-pointer
                    ${selectedPosition?.id === pos.id && showActionPanel
                      ? 'bg-neutral-800/80 border-amber-600/50 shadow-lg shadow-amber-900/10'
                      : 'bg-neutral-900 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800/50'
                    }
                  `}
                >
                  {/* 选中指示器 */}
                  {selectedPosition?.id === pos.id && showActionPanel && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-12 bg-amber-600 rounded-r-full" />
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    {/* 左侧：核心资产信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        {/* 方向标签 */}
                        <span className={`
                          inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold
                          ${pos.direction === 'long'
                            ? 'bg-red-500/15 text-red-500 border border-red-500/30'
                            : 'bg-green-500/15 text-green-500 border border-green-500/30'
                          }
                        `}>
                          {pos.direction === 'long' ? '多' : '空'}
                        </span>

                        {/* 资产名称 */}
                        <div className="flex-1 min-w-0">
                          <h3 className="product-name truncate">{pos.name}</h3>
                          <p className="product-code">{pos.symbol}</p>
                        </div>

                        {/* 手数徽章 */}
                        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-semibold">
                          <span className="text-xs text-amber-500/70">×</span>
                          {pos.quantity}
                          <span className="text-xs text-amber-500/70">手</span>
                        </span>
                      </div>

                      {/* 价格信息行 */}
                      <div className="flex items-center gap-4 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="text-neutral-400 font-medium">开仓</span>
                          <span className="font-mono text-neutral-200">{formatPrice(pos.openPrice)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-neutral-400 font-medium">当前</span>
                          <span className="font-mono text-neutral-100">{formatPrice(pos.currentPrice)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-neutral-400 font-medium">保证金</span>
                          <span className="font-mono asset-value">{formatCurrency(pos.margin)}</span>
                        </div>
                      </div>
                    </div>

                    {/* 右侧：盈亏与操作 */}
                    <div className="flex items-center justify-between sm:justify-end gap-4">
                      {/* 盈亏显示 */}
                      <div className="text-right">
                        <p className={`text-lg font-medium font-mono ${pos.profitLoss >= 0 ? 'asset-profit' : 'asset-loss'}`}>
                          {pos.profitLoss >= 0 ? '+' : ''}{formatCurrency(pos.profitLoss)}
                        </p>
                        <p className="text-[11px] text-neutral-400 font-medium">
                          {pos.profitLoss >= 0 ? '盈利' : '亏损'}
                        </p>
                      </div>

                      {/* 操作按钮组 - 暗金色系商务风格 */}
                      {selectedPosition?.id === pos.id && showActionPanel && (
                        <div className="flex items-center gap-2">
                          {/* 锁仓按钮 - 暗金色次要按钮 */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleHedgePosition(pos);
                            }}
                            className="
                              flex items-center justify-center
                              px-5 py-2.5 rounded-lg
                              bg-neutral-800/80 hover:bg-neutral-700/80
                              border border-amber-800/40 hover:border-amber-700/50
                              text-amber-500/80 hover:text-amber-400
                              transition-all duration-200 active:scale-95
                              text-xs font-medium tracking-wide
                              backdrop-blur-sm
                            "
                            title="锁仓"
                          >
                            锁仓
                          </button>

                          {/* 平仓按钮 - 暗金色主按钮 */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleClosePosition(pos);
                            }}
                            className="
                              flex items-center justify-center
                              px-5 py-2.5 rounded-lg
                              bg-amber-900/25 hover:bg-amber-900/35
                              border border-amber-700/40 hover:border-amber-600/50
                              text-amber-400/90 hover:text-amber-300
                              transition-all duration-200 active:scale-95
                              text-xs font-medium tracking-wide
                              backdrop-blur-sm
                              shadow-lg shadow-amber-950/10
                            "
                            title="平仓"
                          >
                            平仓
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {positions.length === 0 && (
                <div className="text-center py-12 bg-neutral-900/50 rounded-xl border border-neutral-800 border-dashed">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-neutral-800 flex items-center justify-center">
                    <TrendingUpIcon size="24px" className="text-neutral-600" />
                  </div>
                  <p className="text-sm text-neutral-500 mb-1">暂无持仓</p>
                  <p className="text-xs text-neutral-600">当前没有进行中的交易订单</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 平仓记录表格 */}
        {activeTab === 'closed' && (
          <div className="mb-4">
            <div className="bg-neutral-900 rounded-lg border border-neutral-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-neutral-950 border-b border-neutral-800">
                      <th className="px-3 py-3 text-left text-xs font-semibold text-neutral-400">品种</th>
                      <th className="px-2 py-3 text-center text-xs font-semibold text-neutral-400">方向</th>
                      <th className="px-2 py-3 text-right text-xs font-semibold text-neutral-400">开仓价</th>
                      <th className="px-2 py-3 text-right text-xs font-semibold text-neutral-400">平仓价</th>
                      <th className="px-2 py-3 text-center text-xs font-semibold text-neutral-400">手数</th>
                      <th className="px-2 py-3 text-right text-xs font-semibold text-neutral-400">盈亏</th>
                      <th className="px-3 py-3 text-center text-xs font-semibold text-neutral-400">类型</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold text-neutral-400">平仓时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentClosedPositions.map((pos, index) => {
                      const closeType = closeTypeMap[pos.closeType] || { text: '未知', class: 'text-neutral-500 bg-neutral-500/10' };
                      return (
                        <tr key={pos.id} className={`border-b border-neutral-800/50 hover:bg-neutral-800/30 transition-colors ${index % 2 === 0 ? 'bg-neutral-900' : 'bg-neutral-900/50'}`}>
                          <td className="px-3 py-3">
                            <div>
                              <p className="text-sm font-semibold text-neutral-200">{pos.name}</p>
                              <p className="text-[11px] text-neutral-500 font-mono font-medium">{pos.symbol}</p>
                            </div>
                          </td>
                          <td className="px-2 py-3 text-center">
                            <span className={`text-xs font-semibold px-2 py-1 rounded ${pos.direction === 'long' ? 'text-red-500 bg-red-500/10' : 'text-green-500 bg-green-500/10'}`}>
                              {pos.direction === 'long' ? '多' : '空'}
                            </span>
                          </td>
                          <td className="px-2 py-3 text-right">
                            <span className="text-xs text-neutral-400 font-mono">{formatPrice(pos.openPrice)}</span>
                          </td>
                          <td className="px-2 py-3 text-right">
                            <span className="text-xs text-neutral-300 font-mono">{formatPrice(pos.closePrice)}</span>
                          </td>
                          <td className="px-2 py-3 text-center">
                            <span className="text-xs text-neutral-300 font-medium">{pos.quantity}</span>
                          </td>
                          <td className="px-2 py-3 text-right">
                            <span className={`text-xs font-semibold font-mono ${pos.profitLoss >= 0 ? 'asset-profit' : 'asset-loss'}`}>
                              {pos.profitLoss >= 0 ? '+' : ''}{formatCurrency(pos.profitLoss)}
                            </span>
                          </td>
                          <td className="px-2 py-3 text-center">
                            <span className={`inline-block text-[11px] px-2 py-0.5 rounded ${closeType.class}`}>{closeType.text}</span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span className="text-xs text-neutral-500 font-mono font-medium">{pos.closeTime}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 分页 */}
            <div className="flex items-center justify-between mt-3 px-1">
              <span className="text-xs text-neutral-500 font-medium">共 {closedPositions.length} 条记录</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setClosedCurrentPage(p => Math.max(1, p - 1))}
                  disabled={closedCurrentPage === 1 || closedTotalPages === 0}
                  className="px-3 py-1.5 text-xs rounded bg-neutral-900 text-neutral-400 disabled:opacity-30 hover:bg-neutral-800 transition-colors font-medium"
                >
                  上一页
                </button>

                {/* 页码显示 - 简洁版 */}
                <div className="flex items-center gap-1">
                  <span className="px-2 py-1.5 text-xs bg-neutral-800 rounded text-neutral-200 font-medium">
                    {closedTotalPages === 0 ? 0 : closedCurrentPage}
                  </span>
                  <span className="text-xs text-neutral-500">/</span>
                  <span className="px-2 py-1.5 text-xs text-neutral-400">
                    {closedTotalPages}
                  </span>
                </div>

                <button
                  onClick={() => setClosedCurrentPage(p => Math.min(closedTotalPages, p + 1))}
                  disabled={closedCurrentPage === closedTotalPages || closedTotalPages === 0}
                  className="px-3 py-1.5 text-xs rounded bg-neutral-900 text-neutral-400 disabled:opacity-30 hover:bg-neutral-800 transition-colors font-medium"
                >
                  下一页
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 历史订单表格 */}
        {activeTab === 'orders' && (
          <div className="mb-4">
            <div className="bg-neutral-900 rounded-lg border border-neutral-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-neutral-950 border-b border-neutral-800">
                      <th className="px-3 py-3 text-left text-xs font-semibold text-neutral-400">订单号</th>
                      <th className="px-2 py-3 text-left text-xs font-semibold text-neutral-400">品种</th>
                      <th className="px-2 py-3 text-center text-xs font-semibold text-neutral-400">类型</th>
                      <th className="px-2 py-3 text-right text-xs font-semibold text-neutral-400">价格</th>
                      <th className="px-2 py-3 text-center text-xs font-semibold text-neutral-400">数量</th>
                      <th className="px-2 py-3 text-center text-xs font-semibold text-neutral-400">状态</th>
                      <th className="px-3 py-3 text-center text-xs font-semibold text-neutral-400">操作</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold text-neutral-400">时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentOrders.map((order, index) => {
                      const status = statusMap[order.status] || { text: '未知', class: 'text-neutral-500 bg-neutral-500/10' };
                      const canCancel = order.status === 'pending';
                      return (
                        <tr key={order.id} className={`border-b border-neutral-800/50 hover:bg-neutral-800/30 transition-colors ${index % 2 === 0 ? 'bg-neutral-900' : 'bg-neutral-900/50'}`}>
                          <td className="px-3 py-3">
                            <span className="text-xs text-neutral-500 font-mono font-medium">{order.id}</span>
                          </td>
                          <td className="px-2 py-3">
                            <span className="text-xs text-neutral-300 font-medium">{order.symbol}</span>
                          </td>
                          <td className="px-2 py-3 text-center">
                            <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded ${order.type === 'buy' ? 'text-red-500 bg-red-500/10' : 'text-green-500 bg-green-500/10'}`}>
                              {order.type === 'buy' ? '买入' : '卖出'}
                            </span>
                          </td>
                          <td className="px-2 py-3 text-right">
                            <span className="text-xs text-neutral-300 font-mono">{formatPrice(order.price)}</span>
                          </td>
                          <td className="px-2 py-3 text-center">
                            <span className="text-xs text-neutral-300 font-medium">{order.quantity}</span>
                          </td>
                          <td className="px-2 py-3 text-center">
                            <span className={`inline-block text-[11px] px-2 py-0.5 rounded ${status.class}`}>{status.text}</span>
                          </td>
                          <td className="px-2 py-3 text-center">
                            {canCancel && (
                              <button
                                onClick={() => handleCancelOrder(order)}
                                className="
                                  px-3 py-1.5 rounded
                                  bg-red-900/20 hover:bg-red-900/30
                                  border border-red-800/30 hover:border-red-700/40
                                  text-red-400 hover:text-red-300
                                  transition-all duration-200
                                  text-xs font-medium
                                  flex items-center gap-1
                                "
                              >
                                <CloseIcon size="12px" />
                                取消
                              </button>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span className="text-xs text-neutral-500 font-mono font-medium">{order.createTime}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 分页 */}
            <div className="flex items-center justify-between mt-3 px-1">
              <span className="text-xs text-neutral-500 font-medium">共 {orders.length} 条记录</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-xs rounded bg-neutral-900 text-neutral-400 disabled:opacity-30 hover:bg-neutral-800 transition-colors font-medium"
                >
                  上一页
                </button>
                <span className="px-3 py-1.5 text-xs text-neutral-400 font-medium">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-xs rounded bg-neutral-900 text-neutral-400 disabled:opacity-30 hover:bg-neutral-800 transition-colors font-medium"
                >
                  下一页
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 图表区域 */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="!bg-neutral-900 !border-neutral-800 !rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUpIcon size="16px" className="text-amber-500" />
              <span className="text-xs text-neutral-300 tracking-wide font-medium">盈亏趋势</span>
            </div>
            <ReactECharts
              option={profitTrendOption}
              style={{ height: '140px' }}
              opts={{ renderer: 'canvas' }}
            />
          </Card>
          <Card className="!bg-neutral-900 !border-neutral-800 !rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUpIcon size="16px" className="text-amber-500" />
              <span className="text-xs text-neutral-300 tracking-wide font-medium">持仓盈亏</span>
            </div>
            <ReactECharts
              option={positionDistributionOption}
              style={{ height: '140px' }}
              opts={{ renderer: 'canvas' }}
            />
          </Card>
        </div>
      </div>

      {/* 平仓确认对话框 - 暗金色系商务风格 - 响应式 */}
      <Dialog
        header={null}
        visible={showCloseDialog}
        onClose={() => setShowCloseDialog(false)}
        onConfirm={confirmClosePosition}
        confirmBtn="确认平仓"
        cancelBtn="取消"
        theme="default"
        width="90vw"
        style={{ maxWidth: '360px' }}
      >
        {selectedPosition && (
          <div className="py-2">
            {/* 顶部：实时价格 */}
            <div className="text-center mb-4">
              <p className="text-xs text-neutral-400 mb-1.5 font-medium">{selectedPosition.name}</p>
              <p className="text-2xl font-bold asset-value font-mono">
                {formatPrice(selectedPosition.currentPrice)}
              </p>
            </div>

            {/* 中间：两列布局 */}
            <div className="flex gap-3 mb-4">
              {/* 左侧：操作按钮 */}
              <div className="flex-1">
                <button className="w-full py-3 rounded-lg bg-amber-900/20 border border-amber-700/40 text-amber-400/90 text-sm font-semibold">
                  平仓
                </button>
              </div>

              {/* 右侧：参数信息 */}
              <div className="flex-1 space-y-2">
                <div className="flex justify-between items-center py-1.5 px-2 bg-neutral-800/50 rounded border border-neutral-700/30">
                  <span className="text-xs text-neutral-400 font-medium">手数</span>
                  <span className="text-sm font-semibold asset-value">{selectedPosition.quantity}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 px-2 bg-neutral-800/50 rounded border border-neutral-700/30">
                  <span className="text-xs text-neutral-400 font-medium">方向</span>
                  <span className={`text-xs font-semibold ${selectedPosition.direction === 'long' ? 'text-red-400' : 'text-green-400'}`}>
                    {selectedPosition.direction === 'long' ? '多' : '空'}
                  </span>
                </div>
              </div>
            </div>

            {/* 盈亏信息 */}
            <div className="flex justify-between items-center py-2 px-3 bg-amber-950/10 rounded-lg mb-4 border border-amber-800/20">
              <span className="text-xs text-neutral-400 font-medium">预计盈亏</span>
              <span className={`text-sm font-bold font-mono ${selectedPosition.profitLoss >= 0 ? 'asset-profit' : 'asset-loss'}`}>
                {selectedPosition.profitLoss >= 0 ? '+' : ''}{formatCurrency(selectedPosition.profitLoss)}
              </span>
            </div>
          </div>
        )}
      </Dialog>

      {/* 反手锁仓确认对话框 - 暗金色系商务风格 - 响应式 */}
      <Dialog
        header={null}
        visible={showHedgeDialog}
        onClose={() => setShowHedgeDialog(false)}
        onConfirm={confirmHedgePosition}
        confirmBtn="确认锁仓"
        cancelBtn="取消"
        theme="default"
        width="90vw"
        style={{ maxWidth: '360px' }}
      >
        {selectedPosition && (
          <div className="py-2">
            {/* 顶部：实时价格 */}
            <div className="text-center mb-4">
              <p className="text-xs text-neutral-500 mb-1">{selectedPosition.name}</p>
              <p className="text-2xl font-bold text-amber-400/90 font-mono">
                {formatPrice(selectedPosition.currentPrice)}
              </p>
            </div>

            {/* 中间：两列布局 */}
            <div className="flex gap-3 mb-4">
              {/* 左侧：操作按钮 */}
              <div className="flex-1">
                <button className="w-full py-3 rounded-lg bg-neutral-800/80 border border-amber-800/40 text-amber-500/80 text-sm font-medium">
                  锁仓
                </button>
              </div>

              {/* 右侧：参数信息 */}
              <div className="flex-1 space-y-2">
                <div className="flex justify-between items-center py-1.5 px-2 bg-neutral-800/50 rounded border border-neutral-700/30">
                  <span className="text-xs text-neutral-500">手数</span>
                  <span className="text-sm font-medium text-amber-400/80">{selectedPosition.quantity}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 px-2 bg-neutral-800/50 rounded border border-neutral-700/30">
                  <span className="text-xs text-neutral-500">反向</span>
                  <span className={`text-xs font-medium ${selectedPosition.direction === 'long' ? 'text-green-400/80' : 'text-red-400/80'}`}>
                    {selectedPosition.direction === 'long' ? '空' : '多'}
                  </span>
                </div>
              </div>
            </div>

            {/* 提示信息 */}
            <div className="py-2 px-3 bg-neutral-800/30 rounded-lg mb-4">
              <p className="text-xs text-neutral-500 text-center">
                将开立反向相同手数的仓位进行对冲
              </p>
            </div>
          </div>
        )}
      </Dialog>

      {/* 取消订单确认弹窗 */}
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
            </div>

            {/* 警告信息 */}
            <div className="bg-yellow-950/20 border border-yellow-900/40 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <InfoCircleIcon size="16px" className="text-yellow-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-yellow-400 font-medium mb-1">订单取消后无法恢复</p>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    确认要取消此订单吗？取消后订单将立即失效，您需要重新下单。
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
