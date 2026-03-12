import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Card,
  Table,
  Input,
  Button,
  Select,
  Switch,
  Dialog,
  Badge,
  Tooltip,
  Tag,
  DatePicker,
  Form,
  InputNumber,
  Space,
  Divider,
  Message
} from 'tdesign-react';
import {
  DashboardIcon,
  UserIcon,
  ShopIcon,
  ChartIcon,
  WalletIcon,
  SettingIcon,
  LogoutIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  CloseCircleIcon,
  TimeIcon,
  RefreshIcon,
  AddIcon,
  EditIcon,
  DeleteIcon,
  DownloadIcon,
  UploadIcon
} from 'tdesign-icons-react';
import { formatCurrency } from '../utils/format';
import { adminApi } from '../services/admin';

// 菜单项配置
const menuItems = [
  { key: 'dashboard', icon: <DashboardIcon size="20px" />, label: '仪表盘' },
  { key: 'users', icon: <UserIcon size="20px" />, label: '用户管理' },
  { key: 'agents', icon: <UserIcon size="20px" />, label: '代理管理' },
  { key: 'products', icon: <ShopIcon size="20px" />, label: '产品管理' },
  { key: 'orders', icon: <ChartIcon size="20px" />, label: '订单管理' },
  { key: 'positions', icon: <ChartIcon size="20px" />, label: '持仓管理' },
  { key: 'finance', icon: <WalletIcon size="20px" />, label: '财务管理' },
  { key: 'commission', icon: <WalletIcon size="20px" />, label: '分佣管理' },
  { key: 'risk', icon: <SettingIcon size="20px" />, label: '风控管理' },
  { key: 'settings', icon: <SettingIcon size="20px" />, label: '系统设置' }
];

export default function AdminPC() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [activeMenu, setActiveMenu] = useState('dashboard');
  const [userData, setUserData] = useState({
    name: '管理员',
    avatar: '',
    role: 'Super Admin'
  });

  // 各模块状态
  const [products, setProducts] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [commissionRecords, setCommissionRecords] = useState<any[]>([]);
  const [commissionStats, setCommissionStats] = useState<any>({});
  const [loading, setLoading] = useState(false);

  const [riskOverview, setRiskOverview] = useState<any>({});
  const [riskPositions, setRiskPositions] = useState<any[]>([]);

  const [dashboardStats, setDashboardStats] = useState<any[]>([]);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [pendingDeposits, setPendingDeposits] = useState(0);
  const [pendingWithdrawals, setPendingWithdrawals] = useState(0);
  const [users, setUsers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [finance, setFinance] = useState<any[]>([]);

  // 手续费设置状态
  const [feeSettings, setFeeSettings] = useState({
    open_rate: 0.002,
    close_rate: 0.002,
    min_amount: 5,
    swap_long: 0.5,
    swap_short: -0.3
  });

  // 根据路由设置激活菜单
  useEffect(() => {
    const path = location.pathname.replace('/admin', '').slice(1);
    if (path) {
      setActiveMenu(path);
    }
  }, [location]);

  // 数据加载函数
  const loadProductsData = async () => {
    try {
      setLoading(true);
      const data = await adminApi.product.getList();
      setProducts(data || []);
    } catch (error) {
      Message.error('加载产品列表失败');
    } finally {
      setLoading(false);
    }
  };

  const loadAgentsData = async () => {
    try {
      setLoading(true);
      const data = await adminApi.agent.getList();
      setAgents(data?.list || []);
    } catch (error) {
      Message.error('加载代理列表失败');
    } finally {
      setLoading(false);
    }
  };

  const loadPositionsData = async () => {
    try {
      setLoading(true);
      const data = await adminApi.position.getList();
      setPositions(data?.list || []);
    } catch (error) {
      Message.error('加载持仓列表失败');
    } finally {
      setLoading(false);
    }
  };

  const loadCommissionData = async () => {
    try {
      setLoading(true);
      const [recordsData, statsData] = await Promise.all([
        adminApi.commission.getRecords(),
        adminApi.commission.getStats()
      ]);
      setCommissionRecords(recordsData?.records || []);
      setCommissionStats(statsData || {});
    } catch (error) {
      Message.error('加载分佣数据失败');
    } finally {
      setLoading(false);
    }
  };

  const loadRiskData = async () => {
    try {
      setLoading(true);
      const [overview, positions] = await Promise.all([
        adminApi.risk.getOverview(),
        adminApi.risk.getPositions({ page: 1, pageSize: 50 })
      ]);
      setRiskOverview(overview || {});
      setRiskPositions(positions || []);
    } catch (error) {
      Message.error('加载风控数据失败');
    } finally {
      setLoading(false);
    }
  };

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const stats = await adminApi.dashboard.getStats();
      setDashboardStats([
        { title: '总用户数', value: `${stats.total_users ?? 0}`, change: stats.users_growth || '+0%', icon: UserIcon, color: '#667eea' },
        { title: '活跃用户', value: `${stats.active_users ?? 0}`, change: stats.active_growth || '+0%', icon: UserIcon, color: '#764ba2' },
        { title: '今日订单', value: `${stats.today_orders ?? 0}`, change: stats.today_orders_growth || '+0%', icon: ShopIcon, color: '#f093fb' },
        { title: '持仓订单', value: `${stats.open_positions ?? 0}`, change: stats.positions_growth || '+0%', icon: ChartIcon, color: '#f5576c' },
        { title: '总交易量', value: `¥${(stats.total_volume ?? 0).toLocaleString()}`, change: stats.volume_growth || '+0%', icon: WalletIcon, color: '#4facfe' },
        { title: '平台资金', value: `¥${(stats.total_balance ?? 0).toLocaleString()}`, change: stats.balance_growth || '+0%', icon: WalletIcon, color: '#00f2fe' }
      ]);

      const pending = await adminApi.dashboard.getPending();
      setPendingDeposits(pending.pending_deposits ?? 0);
      setPendingWithdrawals(pending.pending_withdrawals ?? 0);

      const recent = await adminApi.order.getList({ page: 1, pageSize: 8 });
      setRecentOrders(recent.list || []);
    } catch (error) {
      Message.error('加载仪表盘失败');
    } finally {
      setLoading(false);
    }
  };

  const loadUsersData = async () => {
    try {
      setLoading(true);
      const data = await adminApi.user.getList({ page: 1, pageSize: 20 });
      setUsers(data?.list || []);
    } catch (error) {
      Message.error('加载用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  const loadOrdersData = async () => {
    try {
      setLoading(true);
      const data = await adminApi.order.getList({ page: 1, pageSize: 20 });
      setOrders(data?.list || []);
    } catch (error) {
      Message.error('加载订单列表失败');
    } finally {
      setLoading(false);
    }
  };

  const loadFinanceData = async () => {
    try {
      setLoading(true);
      const data = await adminApi.finance.getList({ page: 1, pageSize: 20 });
      setFinance(data?.list || []);
    } catch (error) {
      Message.error('加载财务列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载各模块数据
  useEffect(() => {
    if (activeMenu === 'dashboard') {
      loadDashboardData();
    } else if (activeMenu === 'users') {
      loadUsersData();
    } else if (activeMenu === 'orders') {
      loadOrdersData();
    } else if (activeMenu === 'finance') {
      loadFinanceData();
    } else if (activeMenu === 'products') {
      loadProductsData();
    } else if (activeMenu === 'agents') {
      loadAgentsData();
    } else if (activeMenu === 'positions') {
      loadPositionsData();
    } else if (activeMenu === 'commission') {
      loadCommissionData();
    } else if (activeMenu === 'risk') {
      loadRiskData();
    } else if (activeMenu === 'settings') {
      loadFeeSettings();
    }
  }, [activeMenu]);

  // 加载手续费设置
  const loadFeeSettings = async () => {
    try {
      const fees = await adminApi.fees.get();
      setFeeSettings({
        open_rate: parseFloat(fees.open_rate?.value) || 0.002,
        close_rate: parseFloat(fees.close_rate?.value) || 0.002,
        min_amount: parseFloat(fees.min_amount?.value) || 5,
        swap_long: parseFloat(fees.swap_long?.value) || 0.5,
        swap_short: parseFloat(fees.swap_short?.value) || -0.3
      });
    } catch (error) {
      logger.error('加载手续费设置失败:', error);
    }
  };

  // 保存手续费设置
  const saveFeeSettings = async () => {
    try {
      await adminApi.fees.update(feeSettings);
      Message.success('手续费设置已保存');
    } catch (error) {
      Message.error('保存失败，请重试');
    }
  };

  const handleLogout = () => {
    Dialog.confirm({
      header: '确认退出',
      body: '您确定要退出登录吗？',
      onConfirm: () => navigate('/')
    });
  };

  // 渲染仪表盘
  const renderDashboard = () => (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4">
        {dashboardStats.map((stat, index) => (
          <Card key={index} className="!border-0 !shadow-sm hover:!shadow-md transition-shadow">
            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${stat.color}15` }}>
                  <stat.icon size="24px" style={{ color: stat.color }} />
                </div>
                <Tag theme={stat.change.includes('+') ? 'success' : 'danger'} shape="round" size="small">
                  {stat.change}
                </Tag>
              </div>
              <div className="text-2xl font-bold text-gray-900 mb-1">{stat.value}</div>
              <div className="text-sm text-gray-500">{stat.title}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* 快捷操作 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 待处理事项 */}
        <Card className="!border-0 !shadow-sm" title="待处理事项">
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
              <div className="flex items-center gap-3">
                <WalletIcon size="20px" className="text-blue-600" />
                <span className="text-gray-700">待审核充值</span>
              </div>
              <Badge count={pendingDeposits} theme="primary" />
            </div>
            <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
              <div className="flex items-center gap-3">
                <WalletIcon size="20px" className="text-orange-600" />
                <span className="text-gray-700">待审核提现</span>
              </div>
              <Badge count={pendingWithdrawals} theme="warning" />
            </div>
          </div>
        </Card>

        {/* 系统状态 */}
        <Card className="!border-0 !shadow-sm" title="系统状态">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-green-50 rounded-lg text-center">
              <div className="text-sm text-gray-500 mb-1">服务器</div>
              <div className="flex items-center justify-center gap-1 text-green-600">
                <CheckCircleIcon size="16px" />
                <span className="text-sm font-medium">正常</span>
              </div>
            </div>
            <div className="p-3 bg-green-50 rounded-lg text-center">
              <div className="text-sm text-gray-500 mb-1">数据库</div>
              <div className="flex items-center justify-center gap-1 text-green-600">
                <CheckCircleIcon size="16px" />
                <span className="text-sm font-medium">正常</span>
              </div>
            </div>
            <div className="p-3 bg-green-50 rounded-lg text-center">
              <div className="text-sm text-gray-500 mb-1">Redis</div>
              <div className="flex items-center justify-center gap-1 text-green-600">
                <CheckCircleIcon size="16px" />
                <span className="text-sm font-medium">正常</span>
              </div>
            </div>
            <div className="p-3 bg-green-50 rounded-lg text-center">
              <div className="text-sm text-gray-500 mb-1">API</div>
              <div className="flex items-center justify-center gap-1 text-green-600">
                <CheckCircleIcon size="16px" />
                <span className="text-sm font-medium">正常</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* 最近订单 */}
      <Card className="!border-0 !shadow-sm" title="最近订单">
        <Table
          columns={[
            { colKey: 'id', title: '订单号', width: 150 },
            { colKey: 'user', title: '用户', width: 100 },
            { colKey: 'symbol', title: '品种', width: 100 },
            {
              colKey: 'type',
              title: '方向',
              cell: (row: any) => (
                <Tag theme={row.type === 'buy' ? 'danger' : 'success'}>
                  {row.type === 'buy' ? '买入' : '卖出'}
                </Tag>
              ),
              width: 80
            },
            { colKey: 'volume', title: '手数', width: 80 },
            {
              colKey: 'profit',
              title: '盈亏',
              cell: (row: any) => (
                <span className={row.profit >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                  {formatCurrency(row.profit)}
                </span>
              ),
              width: 100
            },
            { colKey: 'time', title: '时间', width: 120 }
          ]}
          data={recentOrders}
          stripe
          hover
          size="small"
          pagination={false}
        />
      </Card>
    </div>
  );

  // 渲染用户管理
  const renderUsers = () => (
    <Card className="!border-0 !shadow-sm" title="用户列表">
      <div className="mb-4 flex gap-4">
        <Input placeholder="搜索用户名/手机号" style={{ width: 250 }} clearable />
        <Select placeholder="用户状态" clearable style={{ width: 150 }}>
          <Select.Option value="active">正常</Select.Option>
          <Select.Option value="disabled">禁用</Select.Option>
        </Select>
        <Button theme="primary" icon={<UserIcon size="16px" />}>
          新增用户
        </Button>
      </div>
      <Table
        columns={[
          { colKey: 'id', title: 'ID', width: 80 },
          { colKey: 'username', title: '用户名', width: 120 },
          { colKey: 'realName', title: '姓名', width: 100 },
          { colKey: 'phone', title: '手机号', width: 120 },
          {
            colKey: 'balance',
            title: '余额',
            cell: (row: any) => formatCurrency(row.balance),
            width: 120
          },
          {
            colKey: 'profit',
            title: '累计盈亏',
            cell: (row: any) => (
              <span className={row.profit >= 0 ? 'text-green-600' : 'text-red-600'}>
                {formatCurrency(row.profit)}
              </span>
            ),
            width: 120
          },
          {
            colKey: 'level',
            title: '等级',
            cell: (row: any) => ['普通用户', '一级代理', '二级代理'][row.level],
            width: 100
          },
          {
            colKey: 'status',
            title: '状态',
            cell: (row: any) => (
              row.status === 'active' ? <Tag theme="success">正常</Tag> : <Tag theme="danger">禁用</Tag>
            ),
            width: 80
          },
          { colKey: 'registerTime', title: '注册时间', width: 120 },
          {
            colKey: 'action',
            title: '操作',
            width: 150,
            cell: () => (
              <div className="space-x-2">
                <Button size="small" variant="text">查看</Button>
                <Button size="small" variant="text">编辑</Button>
              </div>
            )
          }
        ]}
        data={users}
        stripe
        hover
        size="small"
        pagination={{ defaultPageSize: 10, total: 100 }}
      />
    </Card>
  );

  // 渲染订单管理
  const renderOrders = () => (
    <Card className="!border-0 !shadow-sm" title="订单管理">
      <div className="mb-4 flex gap-4 items-center">
        <Input placeholder="搜索订单号/用户" style={{ width: 250 }} clearable />
        <Select placeholder="订单状态" clearable style={{ width: 150 }}>
          <Select.Option value="open">持仓中</Select.Option>
          <Select.Option value="closed">已平仓</Select.Option>
        </Select>
        <DatePicker placeholder="选择日期范围" style={{ width: 250 }} />
        <Button theme="primary" icon={<RefreshIcon size="16px" />}>
          刷新
        </Button>
      </div>
      <Table
        columns={[
          { colKey: 'id', title: '订单号', width: 150 },
          { colKey: 'user', title: '用户', width: 100 },
          { colKey: 'symbolName', title: '品种', width: 100 },
          {
            colKey: 'type',
            title: '方向',
            cell: (row: any) => (
              <Tag theme={row.type === 'buy' ? 'danger' : 'success'}>
                {row.type === 'buy' ? '买入' : '卖出'}
              </Tag>
            ),
            width: 80
          },
          { colKey: 'volume', title: '手数', width: 80 },
          { colKey: 'price', title: '价格', width: 100 },
          {
            colKey: 'leverage',
            title: '杠杆',
            cell: (row: any) => `${row.leverage}x`,
            width: 80
          },
          {
            colKey: 'margin',
            title: '保证金',
            cell: (row: any) => formatCurrency(row.margin),
            width: 120
          },
          {
            colKey: 'profit',
            title: '盈亏',
            cell: (row: any) => (
              <span className={row.profit >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                {formatCurrency(row.profit)}
              </span>
            ),
            width: 100
          },
          {
            colKey: 'status',
            title: '状态',
            cell: (row: any) => (
              row.status === 'open' ? <Tag theme="primary">持仓中</Tag> : <Tag>已平仓</Tag>
            ),
            width: 100
          },
          { colKey: 'time', title: '时间', width: 160 },
          {
            colKey: 'action',
            title: '操作',
            width: 150,
            cell: () => (
              <div className="space-x-2">
                <Button size="small" variant="text">查看</Button>
                <Button size="small" variant="text">平仓</Button>
              </div>
            )
          }
        ]}
        data={orders.map((o: any) => ({
          ...o,
          status: o.status_text || o.status,
          payment_method: o.payment_method_text || o.payment_method
        }))}
        stripe
        hover
        size="small"
        pagination={{ defaultPageSize: 10, total: 156 }}
      />
    </Card>
  );

  // 渲染财务管理
  const renderFinance = () => (
    <Card className="!border-0 !shadow-sm" title="财务管理">
      <div className="mb-4 flex gap-4 items-center">
        <Input placeholder="搜索流水号/用户" style={{ width: 250 }} clearable />
        <Select placeholder="交易类型" clearable style={{ width: 150 }}>
          <Select.Option value="deposit">充值</Select.Option>
          <Select.Option value="withdraw">提现</Select.Option>
        </Select>
        <Select placeholder="状态筛选" clearable style={{ width: 150 }}>
          <Select.Option value="pending">待审核</Select.Option>
          <Select.Option value="completed">已完成</Select.Option>
          <Select.Option value="rejected">已拒绝</Select.Option>
        </Select>
      </div>
      <Table
        columns={[
          { colKey: 'id', title: '流水号', width: 150 },
          { colKey: 'user', title: '用户', width: 100 },
          {
            colKey: 'type',
            title: '类型',
            cell: (row: any) => (
              <Tag theme={row.type === 'deposit' ? 'success' : 'warning'}>
                {row.type === 'deposit' ? '充值' : '提现'}
              </Tag>
            ),
            width: 80
          },
          {
            colKey: 'amount',
            title: '金额',
            cell: (row: any) => formatCurrency(row.amount),
            width: 120
          },
          {
            colKey: 'method',
            title: '方式',
            cell: (row: any) => {
              const methods: any = { bank: '银行卡', usdt: 'USDT', alipay: '支付宝' };
              return methods[row.method] || row.method;
            },
            width: 100
          },
          {
            colKey: 'status',
            title: '状态',
            cell: (row: any) => {
              const statusMap: any = {
                pending: { label: '待审核', theme: 'warning' },
                completed: { label: '已完成', theme: 'success' },
                rejected: { label: '已拒绝', theme: 'danger' }
              };
              const statusKey = row.status_text || row.status;
              const status = statusMap[statusKey] || { label: statusKey || '未知', theme: 'default' };
              return <Tag theme={status.theme}>{status.label}</Tag>;
            },
            width: 100
          },
          { colKey: 'time', title: '时间', width: 160 },
          {
            colKey: 'action',
            title: '操作',
            width: 180,
            cell: (row: any) => (
              row.status === 'pending' ? (
                <div className="space-x-2">
                  <Button size="small" theme="success" variant="outline">通过</Button>
                  <Button size="small" theme="danger" variant="outline">拒绝</Button>
                </div>
              ) : (
                <Button size="small" variant="text" disabled>已处理</Button>
              )
            )
          }
        ]}
        data={finance.map((t: any) => ({
          ...t,
          status: t.status_text || t.status,
          payment_method: t.payment_method_text || t.payment_method
        }))}
        stripe
        hover
        size="small"
        pagination={{ defaultPageSize: 10, total: 50 }}
      />
    </Card>
  );

  // 渲染系统设置
  const renderSettings = () => (
    <div className="space-y-6">
      <Card className="!border-0 !shadow-sm" title="基本设置">
        <div className="space-y-4 max-w-2xl">
          <div className="flex items-center justify-between py-3 border-b">
            <div>
              <div className="text-sm font-medium text-gray-900">维护模式</div>
              <div className="text-xs text-gray-500 mt-1">开启后普通用户无法访问系统</div>
            </div>
            <Switch defaultValue={false} size="large" />
          </div>
          <div className="flex items-center justify-between py-3 border-b">
            <div>
              <div className="text-sm font-medium text-gray-900">允许注册</div>
              <div className="text-xs text-gray-500 mt-1">是否开放用户注册功能</div>
            </div>
            <Switch defaultValue={true} size="large" />
          </div>
          <div className="flex items-center justify-between py-3">
            <div>
              <div className="text-sm font-medium text-gray-900">允许交易</div>
              <div className="text-xs text-gray-500 mt-1">是否允许用户进行交易操作</div>
            </div>
            <Switch defaultValue={true} size="large" />
          </div>
        </div>
      </Card>

      <Card className="!border-0 !shadow-sm" title="交易设置">
        <div className="space-y-4 max-w-2xl">
          <div className="flex items-center justify-between py-3 border-b">
            <div>
              <div className="text-sm font-medium text-gray-900">最大杠杆</div>
              <div className="text-xs text-gray-500 mt-1">用户可使用的最大杠杆倍数</div>
            </div>
            <div className="text-lg font-bold text-blue-600 font-mono">100x</div>
          </div>
          <div className="flex items-center justify-between py-3 border-b">
            <div>
              <div className="text-sm font-medium text-gray-900">最小充值金额</div>
              <div className="text-xs text-gray-500 mt-1">单次充值最低金额</div>
            </div>
            <div className="text-lg font-bold text-gray-900 font-mono">$100</div>
          </div>
          <div className="flex items-center justify-between py-3">
            <div>
              <div className="text-sm font-medium text-gray-900">最小提现金额</div>
              <div className="text-xs text-gray-500 mt-1">单次提现最低金额</div>
            </div>
            <div className="text-lg font-bold text-gray-900 font-mono">$100</div>
          </div>
        </div>
      </Card>

      <Card className="!border-0 !shadow-sm" title="手续费设置" subtitle="设置平台交易手续费，这是平台的主要收入来源">
        <Form layout="vertical" className="max-w-2xl">
          <Form.Item label="开仓手续费率" help="开仓时收取的手续费比例（小数形式，例如0.002表示0.2%）">
            <div className="flex items-center gap-4">
              <InputNumber
                placeholder="0.002"
                min={0}
                max={0.1}
                step={0.001}
                decimalPlaces={4}
                value={feeSettings.open_rate}
                onChange={(value) => setFeeSettings({ ...feeSettings, open_rate: value })}
                style={{ width: 200 }}
              />
              <span className="text-sm text-gray-500">
                当前值: <span className="font-bold text-blue-600">{(feeSettings.open_rate * 100).toFixed(2)}%</span>
              </span>
            </div>
          </Form.Item>

          <Form.Item label="平仓手续费率" help="平仓时收取的手续费比例（小数形式，例如0.002表示0.2%）">
            <div className="flex items-center gap-4">
              <InputNumber
                placeholder="0.002"
                min={0}
                max={0.1}
                step={0.001}
                decimalPlaces={4}
                value={feeSettings.close_rate}
                onChange={(value) => setFeeSettings({ ...feeSettings, close_rate: value })}
                style={{ width: 200 }}
              />
              <span className="text-sm text-gray-500">
                当前值: <span className="font-bold text-blue-600">{(feeSettings.close_rate * 100).toFixed(2)}%</span>
              </span>
            </div>
          </Form.Item>

          <Form.Item label="最小手续费金额" help="每笔交易的最低手续费，单位：美元">
            <div className="flex items-center gap-4">
              <InputNumber
                placeholder="5"
                min={0}
                max={100}
                step={1}
                value={feeSettings.min_amount}
                onChange={(value) => setFeeSettings({ ...feeSettings, min_amount: value })}
                style={{ width: 200 }}
              />
              <span className="text-sm text-gray-500">
                当前值: <span className="font-bold text-gray-900">${feeSettings.min_amount}</span>
              </span>
            </div>
          </Form.Item>

          <Form.Item label="多头隔夜费" help="持有做多头寸过夜时收取的费用（美元/手/天），可以为负数表示返费">
            <div className="flex items-center gap-4">
              <InputNumber
                placeholder="0.5"
                min={-10}
                max={10}
                step={0.1}
                decimalPlaces={2}
                value={feeSettings.swap_long}
                onChange={(value) => setFeeSettings({ ...feeSettings, swap_long: value })}
                style={{ width: 200 }}
              />
              <span className="text-sm text-gray-500">
                当前值: <span className={`font-bold ${feeSettings.swap_long >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {feeSettings.swap_long >= 0 ? '+' : ''}${feeSettings.swap_long}
                </span>
              </span>
            </div>
          </Form.Item>

          <Form.Item label="空头隔夜费" help="持有做空头寸过夜时收取的费用（美元/手/天），可以为负数表示返费">
            <div className="flex items-center gap-4">
              <InputNumber
                placeholder="-0.3"
                min={-10}
                max={10}
                step={0.1}
                decimalPlaces={2}
                value={feeSettings.swap_short}
                onChange={(value) => setFeeSettings({ ...feeSettings, swap_short: value })}
                style={{ width: 200 }}
              />
              <span className="text-sm text-gray-500">
                当前值: <span className={`font-bold ${feeSettings.swap_short >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {feeSettings.swap_short >= 0 ? '+' : ''}${feeSettings.swap_short}
                </span>
              </span>
            </div>
          </Form.Item>

          <Divider />

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="text-sm text-blue-800">
              <div className="font-medium mb-2">手续费计算说明：</div>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>开仓手续费 = 交易金额 × 开仓手续费率</li>
                <li>平仓手续费 = 交易金额 × 平仓手续费率</li>
                <li>实际手续费 = 计算手续费和最小手续费中的较大值</li>
                <li>隔夜费每天结算一次，过夜持仓会产生</li>
              </ul>
            </div>
          </div>
        </Form>
      </Card>

      <div className="flex justify-end gap-3">
        <Button size="large" variant="outline" onClick={loadFeeSettings}>
          重置
        </Button>
        <Button theme="primary" size="large" onClick={saveFeeSettings}>
          保存手续费设置
        </Button>
      </div>
    </div>
  );

  // 渲染产品管理
  const renderProducts = () => (
      <Card className="!border-0 !shadow-sm" title="产品管理">
        <div className="mb-4 flex gap-4">
          <Input placeholder="搜索产品代码/名称" style={{ width: 250 }} clearable />
          <Select placeholder="产品分类" clearable style={{ width: 150 }}>
            <Select.Option value="贵金属">贵金属</Select.Option>
            <Select.Option value="贵金属期货">贵金属期货</Select.Option>
          </Select>
          <Select placeholder="状态" clearable style={{ width: 120 }}>
            <Select.Option value="active">启用</Select.Option>
            <Select.Option value="inactive">停用</Select.Option>
          </Select>
          <Button theme="primary" icon={<AddIcon size="16px" />} onClick={() => Message.info('添加产品功能开发中')}>
            新增产品
          </Button>
        </div>
        <Table
          columns={[
            { colKey: 'id', title: 'ID', width: 60 },
            { colKey: 'code', title: '产品代码', width: 100 },
            { colKey: 'name', title: '产品名称', width: 120 },
            {
              colKey: 'type',
              title: '类型',
              cell: (row: any) => (
                <Tag theme={row.type === 'FOREX' ? 'primary' : 'warning'}>
                  {row.type === 'FOREX' ? '现货' : '期货'}
                </Tag>
              ),
              width: 80
            },
            { colKey: 'category', title: '分类', width: 120 },
            {
              colKey: 'pricePrecision',
              title: '价格精度',
              cell: (row: any) => row.pricePrecision + '位',
              width: 100
            },
            {
              colKey: 'volumePrecision',
              title: '数量精度',
              cell: (row: any) => row.volumePrecision + '位',
              width: 100
            },
            {
              colKey: 'minVolume',
              title: '最小手数',
              cell: (row: any) => row.minVolume,
              width: 100
            },
            {
              colKey: 'maxLeverage',
              title: '最大杠杆',
              cell: (row: any) => row.maxLeverage + 'x',
              width: 100
            },
            {
              colKey: 'commissionRate',
              title: '手续费率',
              cell: (row: any) => (row.commissionRate * 100).toFixed(3) + '%',
              width: 100
            },
            {
              colKey: 'status',
              title: '状态',
              cell: (row: any) => (
                row.status === 'active' ? <Tag theme="success">启用</Tag> : <Tag theme="danger">停用</Tag>
              ),
              width: 80
            },
            {
              colKey: 'action',
              title: '操作',
              width: 150,
              cell: (row: any) => (
                <div className="space-x-2">
                  <Button size="small" variant="text" icon={<EditIcon size="14px" />}>编辑</Button>
                  <Button size="small" variant="text" theme="danger" icon={<DeleteIcon size="14px" />}>删除</Button>
                </div>
              )
            }
          ]}
          data={products}
          stripe
          hover
          size="small"
          loading={loading}
          pagination={{ defaultPageSize: 10 }}
        />
      </Card>
  );

  // 渲染代理管理
  const renderAgents = () => (
      <Card className="!border-0 !shadow-sm" title="代理管理">
        <div className="mb-4 flex gap-4">
          <Input placeholder="搜索代理姓名/手机号" style={{ width: 250 }} clearable />
          <Select placeholder="代理等级" clearable style={{ width: 150 }}>
            <Select.Option value="1">一级代理</Select.Option>
            <Select.Option value="2">二级代理</Select.Option>
            <Select.Option value="3">三级代理</Select.Option>
          </Select>
          <Select placeholder="状态" clearable style={{ width: 120 }}>
            <Select.Option value="active">正常</Select.Option>
            <Select.Option value="inactive">停用</Select.Option>
          </Select>
          <Button theme="primary" icon={<AddIcon size="16px" />} onClick={() => Message.info('添加代理功能开发中')}>
            新增代理
          </Button>
        </div>
        <Table
          columns={[
            { colKey: 'id', title: 'ID', width: 60 },
            { colKey: 'agentCode', title: '代理代码', width: 120 },
            { colKey: 'name', title: '代理姓名', width: 100 },
            { colKey: 'phone', title: '手机号', width: 130 },
            {
              colKey: 'level',
              title: '等级',
              cell: (row: any) => (
                <Tag theme={row.level === 1 ? 'primary' : row.level === 2 ? 'warning' : 'default'}>
                  {row.level}级代理
                </Tag>
              ),
              width: 100
            },
            { colKey: 'referralCount', title: '下级用户', width: 100 },
            {
              colKey: 'totalCommission',
              title: '累计分佣',
              cell: (row: any) => formatCurrency(row.totalCommission || 0),
              width: 120
            },
            {
              colKey: 'balance',
              title: '可提现',
              cell: (row: any) => formatCurrency(row.balance || 0),
              width: 120
            },
            {
              colKey: 'status',
              title: '状态',
              cell: (row: any) => (
                row.status === 'active' ? <Tag theme="success">正常</Tag> : <Tag theme="danger">停用</Tag>
              ),
              width: 80
            },
            { colKey: 'createdAt', title: '注册时间', width: 160 },
            {
              colKey: 'action',
              title: '操作',
              width: 180,
              cell: (row: any) => (
                <div className="space-x-2">
                  <Button size="small" variant="text" icon={<EditIcon size="14px" />}>编辑</Button>
                  <Button size="small" variant="text" icon={<WalletIcon size="14px" />}>佣金</Button>
                  <Button size="small" variant="text" theme="danger" icon={<DeleteIcon size="14px" />}>删除</Button>
                </div>
              )
            }
          ]}
          data={agents}
          stripe
          hover
          size="small"
          loading={loading}
          pagination={{ defaultPageSize: 10 }}
        />
      </Card>
  );

  // 渲染持仓管理
  const renderPositions = () => (
      <Card className="!border-0 !shadow-sm" title="持仓管理">
        <div className="mb-4 flex gap-4">
          <Input placeholder="搜索用户ID/订单号" style={{ width: 250 }} clearable />
          <Select placeholder="品种" clearable style={{ width: 150 }}>
            <Select.Option value="XAUUSD">国际黄金</Select.Option>
            <Select.Option value="XAGUSD">国际白银</Select.Option>
            <Select.Option value="AU2406">沪金主力</Select.Option>
          </Select>
          <Select placeholder="方向" clearable style={{ width: 120 }}>
            <Select.Option value="LONG">做多</Select.Option>
            <Select.Option value="SHORT">做空</Select.Option>
          </Select>
          <Button theme="default" icon={<RefreshIcon size="16px" />} onClick={loadPositionsData}>
            刷新
          </Button>
          <Button theme="warning" icon={<DownloadIcon size="16px" />}>
            导出数据
          </Button>
        </div>
        <Table
          columns={[
            { colKey: 'id', title: '持仓ID', width: 120 },
            { colKey: 'userId', title: '用户ID', width: 100 },
            { colKey: 'orderId', title: '订单号', width: 150 },
            { colKey: 'symbol', title: '品种', width: 100 },
            {
              colKey: 'direction',
              title: '方向',
              cell: (row: any) => (
                <Tag theme={row.direction === 'LONG' ? 'danger' : 'success'}>
                  {row.direction === 'LONG' ? '做多' : '做空'}
                </Tag>
              ),
              width: 80
            },
            {
              colKey: 'openPrice',
              title: '开仓价',
              cell: (row: any) => row.openPrice?.toFixed(2),
              width: 100
            },
            {
              colKey: 'currentPrice',
              title: '当前价',
              cell: (row: any) => row.currentPrice?.toFixed(2),
              width: 100
            },
            { colKey: 'quantity', title: '手数', width: 80 },
            {
              colKey: 'leverage',
              title: '杠杆',
              cell: (row: any) => row.leverage + 'x',
              width: 80
            },
            {
              colKey: 'marginUsed',
              title: '占用保证金',
              cell: (row: any) => formatCurrency(row.marginUsed || 0),
              width: 120
            },
            {
              colKey: 'unrealizedPnl',
              title: '浮动盈亏',
              cell: (row: any) => (
                <span className={row.unrealizedPnl >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                  {formatCurrency(row.unrealizedPnl || 0)}
                </span>
              ),
              width: 120
            },
            {
              colKey: 'liquidationPrice',
              title: '强平价',
              cell: (row: any) => row.liquidationPrice?.toFixed(2),
              width: 100
            },
            {
              colKey: 'status',
              title: '状态',
              cell: (row: any) => {
                const statusMap: any = {
                  OPEN: { label: '持仓', theme: 'primary' },
                  CLOSED: { label: '已平仓', theme: 'success' },
                  LIQUIDATED: { label: '已强平', theme: 'danger' }
                };
                const statusKey = row.status_text || row.status;
                const status = statusMap[statusKey] || { label: statusKey || '未知', theme: 'default' };
                return <Tag theme={status.theme}>{status.label}</Tag>;
              },
              width: 100
            },
            {
              colKey: 'action',
              title: '操作',
              width: 120,
              cell: (row: any) => (
                <div className="space-x-2">
                  <Button size="small" variant="text">详情</Button>
                  <Button size="small" variant="text" theme="danger">强平</Button>
                </div>
              )
            }
          ]}
          data={positions}
          stripe
          hover
          size="small"
          loading={loading}
          pagination={{ defaultPageSize: 10 }}
        />
      </Card>
  );

  // 渲染分佣管理
  const renderCommission = () => (
      <div className="space-y-6">
        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="!border-0 !shadow-sm">
            <div className="p-4">
              <div className="text-sm text-gray-500 mb-2">总分佣金额</div>
              <div className="text-2xl font-bold text-gray-900">{formatCurrency(commissionStats.totalCommission || 0)}</div>
            </div>
          </Card>
          <Card className="!border-0 !shadow-sm">
            <div className="p-4">
              <div className="text-sm text-gray-500 mb-2">交易总量</div>
              <div className="text-2xl font-bold text-blue-600">{(commissionStats.totalVolume || 0).toFixed(2)} 手</div>
            </div>
          </Card>
          <Card className="!border-0 !shadow-sm">
            <div className="p-4">
              <div className="text-sm text-gray-500 mb-2">分佣记录数</div>
              <div className="text-2xl font-bold text-purple-600">{commissionRecords.length || 0}</div>
            </div>
          </Card>
          <Card className="!border-0 !shadow-sm">
            <div className="p-4">
              <div className="text-sm text-gray-500 mb-2">活跃代理</div>
              <div className="text-2xl font-bold text-green-600">{commissionStats.agentCount || 0}</div>
            </div>
          </Card>
        </div>

        <Card className="!border-0 !shadow-sm" title="分佣记录">
          <div className="mb-4 flex gap-4">
            <Input placeholder="搜索代理ID/用户ID" style={{ width: 250 }} clearable />
            <Select placeholder="状态" clearable style={{ width: 120 }}>
              <Select.Option value="pending">待结算</Select.Option>
              <Select.Option value="settled">已结算</Select.Option>
            </Select>
            <DatePicker placeholder="开始日期" clearable style={{ width: 150 }} />
            <DatePicker placeholder="结束日期" clearable style={{ width: 150 }} />
            <Button theme="primary" icon={<RefreshIcon size="16px" />} onClick={loadCommissionData}>
              刷新
            </Button>
            <Button theme="default" icon={<DownloadIcon size="16px" />}>
              导出
            </Button>
          </div>
          <Table
            columns={[
              { colKey: 'id', title: '记录ID', width: 100 },
              { colKey: 'agentId', title: '代理ID', width: 100 },
              { colKey: 'userId', title: '用户ID', width: 100 },
              {
                colKey: 'commission',
                title: '分佣金额',
                cell: (row: any) => formatCurrency(row.commission || 0),
                width: 120
              },
              {
                colKey: 'volume',
                title: '交易量',
                cell: (row: any) => row.volume?.toFixed(2) || '-',
                width: 100
              },
              {
                colKey: 'rate',
                title: '分佣比例',
                cell: (row: any) => (row.rate * 100).toFixed(2) + '%',
                width: 100
              },
              {
                colKey: 'status',
                title: '状态',
                cell: (row: any) => (
                  row.status === 'settled' ? <Tag theme="success">已结算</Tag> : <Tag theme="warning">待结算</Tag>
                ),
                width: 100
              },
              { colKey: 'createdAt', title: '创建时间', width: 160 },
              {
                colKey: 'action',
                title: '操作',
                width: 120,
                cell: (row: any) => (
                  <div className="space-x-2">
                    <Button size="small" variant="text">详情</Button>
                  </div>
                )
              }
            ]}
            data={commissionRecords}
            stripe
            hover
            size="small"
            loading={loading}
            pagination={{ defaultPageSize: 10 }}
          />
        </Card>
      </div>
  );

  // 渲染风控管理
  const renderRisk = () => {
    return (
      <div className="space-y-6">
        <Card className="!border-0 !shadow-sm" title="风控概览">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-red-50 rounded-lg">
              <div className="text-sm text-gray-500 mb-2">高风险用户</div>
              <div className="text-3xl font-bold text-red-600">{riskOverview.high_risk_count || 0}</div>
            </div>
            <div className="p-4 bg-orange-50 rounded-lg">
              <div className="text-sm text-gray-500 mb-2">预警用户</div>
              <div className="text-3xl font-bold text-orange-600">{riskOverview.warning_count || 0}</div>
            </div>
            <div className="p-4 bg-yellow-50 rounded-lg">
              <div className="text-sm text-gray-500 mb-2">今日强平</div>
              <div className="text-3xl font-bold text-yellow-600">{riskOverview.today_liquidations || 0}</div>
            </div>
            <div className="p-4 bg-green-50 rounded-lg">
              <div className="text-sm text-gray-500 mb-2">安全用户</div>
              <div className="text-3xl font-bold text-green-600">{riskOverview.safe_count || 0}</div>
            </div>
          </div>
        </Card>

        <Card className="!border-0 !shadow-sm" title="高风险持仓">
          <div className="mb-4 flex gap-4">
            <Select placeholder="风险等级" clearable style={{ width: 150 }}>
              <Select.Option value="danger">高危</Select.Option>
              <Select.Option value="warning">预警</Select.Option>
            </Select>
            <Select placeholder="品种" clearable style={{ width: 150 }}>
              <Select.Option value="XAUUSD">国际黄金</Select.Option>
              <Select.Option value="XAGUSD">国际白银</Select.Option>
            </Select>
            <Button theme="primary" icon={<RefreshIcon size="16px" />}>
              刷新
            </Button>
            <Button theme="warning" icon={<DownloadIcon size="16px" />}>
              导出报告
            </Button>
          </div>
          <Table
            columns={[
              { colKey: 'user_id', title: '用户ID', width: 100 },
              { colKey: 'id', title: '持仓ID', width: 120 },
              { colKey: 'symbol', title: '品种', width: 100 },
              {
                colKey: 'direction',
                title: '方向',
                cell: (row: any) => (
                  <Tag theme={row.direction === 'LONG' ? 'danger' : 'success'}>
                    {row.direction === 'LONG' ? '做多' : '做空'}
                  </Tag>
                ),
                width: 80
              },
              {
                colKey: 'margin_ratio',
                title: '保证金使用率',
                cell: (row: any) => (
                  <Tag theme={row.margin_ratio > 80 ? 'danger' : row.margin_ratio > 50 ? 'warning' : 'success'}>
                    {row.margin_ratio?.toFixed(1)}%
                  </Tag>
                ),
                width: 120
              },
              {
                colKey: 'floating_pl',
                title: '浮动盈亏',
                cell: (row: any) => (
                  <span className={row.floating_pl >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {formatCurrency(row.floating_pl || 0)}
                  </span>
                ),
                width: 120
              },
              {
                colKey: 'risk_level',
                title: '风险等级',
                cell: (row: any) => {
                  const riskMap: any = {
                    danger: { label: '高危', theme: 'danger' },
                    warning: { label: '预警', theme: 'warning' },
                    safe: { label: '安全', theme: 'success' }
                  };
                  const risk = riskMap[row.risk_level] || { label: row.risk_level || '未知', theme: 'default' };
                  return <Tag theme={risk.theme}>{risk.label}</Tag>;
                },
                width: 100
              },
              {
                colKey: 'action',
                title: '操作',
                width: 150,
                cell: (row: any) => (
                  <div className="space-x-2">
                    <Button size="small" variant="text">详情</Button>
                    <Button size="small" variant="text" theme="danger">强平</Button>
                  </div>
                )
              }
            ]}
            data={riskPositions}
            stripe
            hover
            size="small"
            pagination={{ defaultPageSize: 10 }}
          />
        </Card>

        <Card className="!border-0 !shadow-sm" title="风控设置">
          <div className="space-y-4 max-w-3xl">
            <div className="flex items-center justify-between py-3 border-b">
              <div>
                <div className="text-sm font-medium text-gray-900">自动强平</div>
                <div className="text-xs text-gray-500 mt-1">当保证金使用率超过阈值时自动强平</div>
              </div>
              <Switch defaultValue={true} size="large" />
            </div>
            <div className="flex items-center justify-between py-3 border-b">
              <div>
                <div className="text-sm font-medium text-gray-900">强平阈值</div>
                <div className="text-xs text-gray-500 mt-1">触发自动强平的保证金使用率</div>
              </div>
              <div className="text-lg font-bold text-red-600 font-mono">90%</div>
            </div>
            <div className="flex items-center justify-between py-3 border-b">
              <div>
                <div className="text-sm font-medium text-gray-900">预警阈值</div>
                <div className="text-xs text-gray-500 mt-1">触发系统预警的保证金使用率</div>
              </div>
              <div className="text-lg font-bold text-orange-600 font-mono">70%</div>
            </div>
            <div className="flex items-center justify-between py-3">
              <div>
                <div className="text-sm font-medium text-gray-900">风控检查频率</div>
                <div className="text-xs text-gray-500 mt-1">系统检查用户风险状态的频率</div>
              </div>
              <div className="text-lg font-bold text-blue-600 font-mono">5秒/次</div>
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <Button theme="primary" size="large">
              保存设置
            </Button>
          </div>
        </Card>
      </div>
    );
  };

  // 渲染内容
  const renderContent = () => {
    switch (activeMenu) {
      case 'dashboard':
        return renderDashboard();
      case 'users':
        return renderUsers();
      case 'agents':
        return renderAgents();
      case 'products':
        return renderProducts();
      case 'orders':
        return renderOrders();
      case 'positions':
        return renderPositions();
      case 'finance':
        return renderFinance();
      case 'commission':
        return renderCommission();
      case 'risk':
        return renderRisk();
      case 'settings':
        return renderSettings();
      default:
        return renderDashboard();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* 左侧菜单栏 */}
      <div className={`${collapsed ? 'w-20' : 'w-64'} bg-white border-r border-gray-200 transition-all duration-300 flex flex-col`}>
        {/* Logo区域 */}
        <div className="h-16 flex items-center justify-center border-b border-gray-200">
          {!collapsed ? (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">P</span>
              </div>
              <span className="text-lg font-bold text-gray-900">PreciousMetals</span>
            </div>
          ) : (
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">P</span>
            </div>
          )}
        </div>

        {/* 菜单列表 */}
        <div className="flex-1 overflow-y-auto py-4">
          {menuItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveMenu(item.key)}
              className={`w-full flex items-center gap-3 px-5 py-3 transition-colors ${
                activeMenu === item.key
                  ? 'bg-blue-50 text-blue-600 border-r-4 border-blue-600'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
            </button>
          ))}
        </div>

        {/* 收缩按钮 */}
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center gap-2 py-2 text-gray-500 hover:bg-gray-100 rounded transition-colors"
          >
            {collapsed ? <ChevronRightIcon size="20px" /> : <ChevronLeftIcon size="20px" />}
          </button>
        </div>
      </div>

      {/* 右侧内容区 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶部导航栏 */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm">
          {/* 面包屑 */}
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span className="hover:text-blue-600 cursor-pointer">首页</span>
            <span>/</span>
            <span className="font-medium text-gray-900">{menuItems.find(m => m.key === activeMenu)?.label}</span>
          </div>

          {/* 右侧操作区 */}
          <div className="flex items-center gap-4">
            <Tooltip content="刷新">
              <Button variant="text" icon={<RefreshIcon size="20px" />} />
            </Tooltip>
            <Tooltip content="设置">
              <Button variant="text" icon={<SettingIcon size="20px" />} />
            </Tooltip>
            <div className="w-px h-6 bg-gray-200" />
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm font-medium text-gray-900">{userData.name}</div>
                <div className="text-xs text-gray-500">{userData.role}</div>
              </div>
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-white font-medium">
                {userData.name.charAt(0)}
              </div>
              <Tooltip content="退出登录">
                <Button variant="text" icon={<LogoutIcon size="20px" />} onClick={handleLogout} />
              </Tooltip>
            </div>
          </div>
        </header>

        {/* 主内容区 */}
        <main className="flex-1 p-6 overflow-y-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
