import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Tabs,
  Table,
  Input,
  Button,
  Select,
  Switch,
  Modal,
  Message,
  Form,
  Space,
  Tag,
  Tooltip
} from 'tdesign-react';
import {
  UserIcon,
  ShopIcon,
  ChartIcon,
  TimeIcon,
  CheckIcon,
  CloseIcon,
  SettingIcon,
  WalletIcon,
  LockOnIcon
} from 'tdesign-icons-react';
import { formatCurrency, formatPrice } from '../utils/format';
import { adminApi } from '../services/admin';

export default function Admin() {\n  useEffect(() => {\n    const loadData = async () => {\n      try {\n        const stats = await adminApi.dashboard.getStats();\n        setStats({\n          totalUsers: stats.total_users ?? 0,\n          activeUsers: stats.active_users ?? 0,\n          totalAgents: stats.total_agents ?? 0,\n          todayOrders: stats.today_orders ?? 0,\n          openPositions: stats.open_positions ?? 0,\n          totalVolume: stats.total_volume ?? 0,\n          totalBalance: stats.total_balance ?? 0,\n          todayProfit: stats.today_profit ?? 0\n        });\n\n        const usersResult = await adminApi.user.getList({ page: 1, pageSize: 20 });\n        setUsers(usersResult.list || []);\n\n        const ordersResult = await adminApi.order.getList({ page: 1, pageSize: 20 });\n        setOrders(ordersResult.list || []);\n\n        const financeResult = await adminApi.finance.getList({ page: 1, pageSize: 20 });\n        setTransactions(financeResult.list || []);\n      } catch (error) {\n        Message.error('加载后台数据失败');\n      }\n    };\n\n    loadData();\n  }, []);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');

  // 仪表盘数据
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    totalAgents: 0,
    todayOrders: 0,
    openPositions: 0,
    totalVolume: 0,
    totalBalance: 0,
    todayProfit: 0
  });

  // 用户管理
  const [users, setUsers] = useState<any[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userModal, setUserModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);

  // 订单管理
  const [orders, setOrders] = useState<any[]>([]);
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('');

  // 财务管理
  const [transactions, setTransactions] = useState<any[]>([]);
  const [txnFilter, setTxnFilter] = useState('');

  // 系统设置
  const [systemSettings, setSystemSettings] = useState({
    maintenanceMode: false,
    allowRegister: true,
    maxLeverage: 100,
    minDeposit: 100,
    minWithdraw: 100,
    commissionRate: 0.002,
    platformFee: 0.001
  });

  // 计算统计数据
  const dashboardStats = [
    {
      title: '总用户数',
      value: stats.totalUsers.toLocaleString(),
      icon: <UserIcon size="24px" />,
      color: '#fbbf24',
      change: '+12.5%'
    },
    {
      title: '活跃用户',
      value: stats.activeUsers.toLocaleString(),
      icon: <UserIcon size="24px" />,
      color: '#22c55e',
      change: '+8.3%'
    },
    {
      title: '今日订单',
      value: stats.todayOrders.toLocaleString(),
      icon: <ShopIcon size="24px" />,
      color: '#3b82f6',
      change: '+15.7%'
    },
    {
      title: '持仓数',
      value: stats.openPositions.toLocaleString(),
      icon: <ChartIcon size="24px" />,
      color: '#a855f7',
      change: '-3.2%'
    },
    {
      title: '总交易量',
      value: formatCurrency(stats.totalVolume),
      icon: <TimeIcon size="24px" />,
      color: '#f97316',
      change: '+22.1%'
    },
    {
      title: '平台资金',
      value: formatCurrency(stats.totalBalance),
      icon: <WalletIcon size="24px" />,
      color: '#06b6d4',
      change: '+18.9%'
    },
    {
      title: '今日盈亏',
      value: formatCurrency(stats.todayProfit),
      icon: <ChartIcon size="24px" />,
      color: stats.todayProfit >= 0 ? '#22c55e' : '#ef4444',
      change: '+25.6%'
    },
    {
      title: '代理数',
      value: stats.totalAgents.toLocaleString(),
      icon: <UserIcon size="24px" />,
      color: '#ec4899',
      change: '+5.0%'
    }
  ];

  // 用户表格列
  const userColumns = [
    {
      colKey: 'id',
      title: 'ID',
      width: 80
    },
    {
      colKey: 'username',
      title: '用户名',
      width: 120
    },
    {
      colKey: 'realName',
      title: '姓名',
      width: 100
    },
    {
      colKey: 'phone',
      title: '手机号',
      width: 120
    },
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
        <span style={{ color: row.profit >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
          {formatCurrency(row.profit)}
        </span>
      ),
      width: 120
    },
    {
      colKey: 'agentLevel',
      title: '代理等级',
      cell: (row: any) => {
        const levels = ['普通用户', '一级代理', '二级代理'];
        const colors = ['default', 'warning', 'error'];
        return <Tag theme={colors[row.agentLevel]}>{levels[row.agentLevel]}</Tag>;
      },
      width: 100
    },
    {
      colKey: 'status',
      title: '状态',
      cell: (row: any) => (
        row.status === 'active' ? (
          <Tag theme="success" shape="round"><CheckIcon size="12px" style={{ marginRight: 4 }} />正常</Tag>
        ) : (
          <Tag theme="danger" shape="round"><CloseIcon size="12px" style={{ marginRight: 4 }} />禁用</Tag>
        )
      ),
      width: 100
    },
    {
      colKey: 'registerTime',
      title: '注册时间',
      width: 160
    },
    {
      colKey: 'action',
      title: '操作',
      cell: (row: any) => (
        <Space>
          <Button size="small" variant="text" onClick={() => handleViewUser(row)}>
            查看
          </Button>
          <Button size="small" variant="text" onClick={() => handleEditUser(row)}>
            编辑
          </Button>
        </Space>
      ),
      width: 120
    }
  ];

  // 订单表格列
  const orderColumns = [
    {
      colKey: 'id',
      title: '订单号',
      width: 150
    },
    {
      colKey: 'username',
      title: '用户',
      width: 100
    },
    {
      colKey: 'symbolName',
      title: '品种',
      width: 100
    },
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
    {
      colKey: 'volume',
      title: '手数',
      cell: (row: any) => row.volume,
      width: 80
    },
    {
      colKey: 'price',
      title: '价格',
      cell: (row: any) => formatPrice(row.price),
      width: 100
    },
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
      width: 100
    },
    {
      colKey: 'profit',
      title: '盈亏',
      cell: (row: any) => (
        <span style={{ color: row.profit >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
          {formatCurrency(row.profit)}
        </span>
      ),
      width: 100
    },
    {
      colKey: 'status',
      title: '状态',
      cell: (row: any) => (
        row.status === 'open' ? (
          <Tag theme="primary" shape="round">持仓中</Tag>
        ) : (
          <Tag theme="default" shape="round">已平仓</Tag>
        )
      ),
      width: 100
    },
    {
      colKey: 'createTime',
      title: '创建时间',
      width: 160
    }
  ];

  // 财务表格列
  const transactionColumns = [
    {
      colKey: 'id',
      title: '流水号',
      width: 150
    },
    {
      colKey: 'username',
      title: '用户',
      width: 100
    },
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
        const methods = { bank: '银行卡', usdt: 'USDT', alipay: '支付宝' };
        return methods[row.method as keyof typeof methods] || row.method;
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
        const status = statusMap[statusKey] || statusMap.pending;
        return <Tag theme={status.theme}>{status.label}</Tag>;
      },
      width: 100
    },
    {
      colKey: 'createTime',
      title: '创建时间',
      width: 160
    },
    {
      colKey: 'action',
      title: '操作',
      cell: (row: any) => (
        row.status === 'pending' ? (
          <Space>
            <Button size="small" theme="success" variant="outline" onClick={() => handleApproveTxn(row)}>
              通过
            </Button>
            <Button size="small" theme="danger" variant="outline" onClick={() => handleRejectTxn(row)}>
              拒绝
            </Button>
          </Space>
        ) : (
          <Button size="small" variant="text" disabled>
            已处理
          </Button>
        ),
      width: 150,
    }
  ];

  const handleViewUser = (user: any) => {
    setSelectedUser(user);
    setUserModal(true);
  };

  const handleEditUser = (user: any) => {
    Message.info('编辑功能开发中');
  };

  const handleApproveTxn = (txn: any) => {
    setTransactions(transactions.map(t =>
      t.id === txn.id ? { ...t, status: 'completed', approvedBy: 'admin', approvedTime: new Date().toLocaleString() } : t
    ));
    Message.success('提现申请已通过');
  };

  const handleRejectTxn = (txn: any) => {
    setTransactions(transactions.map(t =>
      t.id === txn.id ? { ...t, status: 'rejected' } : t
    ));
    Message.warning('提现申请已拒绝');
  };

  const filteredUsers = users.filter(u =>
    u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.realName.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.phone.includes(userSearch)
  );

  const filteredOrders = orders.filter(o =>
    (orderStatusFilter ? o.status === orderStatusFilter : true) &&
    (o.username.toLowerCase().includes(orderSearch.toLowerCase()) ||
     o.id.toLowerCase().includes(orderSearch.toLowerCase()))
  );

  const filteredTxns = transactions.filter(t =>
    !txnFilter || t.status === txnFilter
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-neutral-950 pb-20 pt-2">
      <div className="max-w-7xl mx-auto px-3">
        {/* Header */}
        <header className="flex justify-between items-center mb-4 py-2">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-neutral-100 tracking-wide">后台管理</h1>
            <Tag theme="warning" shape="round">管理员</Tag>
          </div>
          <Button
            variant="outline"
            size="small"
            onClick={() => navigate('/home')}
          >
            返回首页
          </Button>
        </header>

        <Tabs
          value={activeTab}
          onChange={setActiveTab}
          theme="card"
          size="medium"
        >
          <Tabs.TabPanel value="dashboard" label="仪表盘">
            <div className="space-y-4">
              {/* 统计卡片 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {dashboardStats.map((stat, index) => (
                  <Card key={index} className="!bg-neutral-900 !border-neutral-800 !p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="text-xs text-neutral-500 mb-1">{stat.title}</div>
                        <div className="text-xl font-bold text-neutral-100 font-mono mb-1">
                          {stat.value}
                        </div>
                        <div className="text-[11px] text-neutral-400">
                          较昨日 <span style={{ color: stat.color }}>{stat.change}</span>
                        </div>
                      </div>
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${stat.color}20` }}>
                        <span style={{ color: stat.color }}>{stat.icon}</span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              {/* 实时交易概览 */}
              <Card className="!bg-neutral-900 !border-neutral-800">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-neutral-100">实时交易概览</h3>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-xs text-neutral-500">实时更新</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-neutral-950 rounded-lg p-3 text-center">
                    <div className="text-xs text-neutral-500 mb-1">今日订单数</div>
                    <div className="text-2xl font-bold text-neutral-100">{stats.todayOrders}</div>
                  </div>
                  <div className="bg-neutral-950 rounded-lg p-3 text-center">
                    <div className="text-xs text-neutral-500 mb-1">持仓订单</div>
                    <div className="text-2xl font-bold text-amber-500">{stats.openPositions}</div>
                  </div>
                  <div className="bg-neutral-950 rounded-lg p-3 text-center">
                    <div className="text-xs text-neutral-500 mb-1">交易金额</div>
                    <div className="text-2xl font-bold text-green-500">{formatCurrency(stats.totalVolume)}</div>
                  </div>
                </div>
              </Card>
            </div>
          </Tabs.TabPanel>

          <Tabs.TabPanel value="users" label="用户管理">
            <Card className="!bg-neutral-900 !border-neutral-800">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-neutral-100">用户列表</h3>
                <Input
                  placeholder="搜索用户名/姓名/手机号"
                  value={userSearch}
                  onChange={setUserSearch}
                  style={{ width: 250 }}
                  clearable
                />
              </div>
              <Table
                columns={userColumns}
                data={filteredUsers}
                stripe
                hover
                size="small"
                pagination={{ defaultPageSize: 10 }}
              />
            </Card>
          </Tabs.TabPanel>

          <Tabs.TabPanel value="orders" label="订单管理">
            <Card className="!bg-neutral-900 !border-neutral-800">
              <div className="flex items-center justify-between mb-4 gap-4">
                <Input
                  placeholder="搜索订单号/用户名"
                  value={orderSearch}
                  onChange={setOrderSearch}
                  style={{ width: 250 }}
                  clearable
                />
                <Select
                  placeholder="订单状态"
                  value={orderStatusFilter}
                  onChange={setOrderStatusFilter}
                  style={{ width: 120 }}
                  clearable
                >
                  <Select.Option value="open">持仓中</Select.Option>
                  <Select.Option value="closed">已平仓</Select.Option>
                </Select>
              </div>
              <Table
                columns={orderColumns}
                data={filteredOrders}
                stripe
                hover
                size="small"
                pagination={{ defaultPageSize: 10 }}
              />
            </Card>
          </Tabs.TabPanel>

          <Tabs.TabPanel value="finance" label="财务管理">
            <Card className="!bg-neutral-900 !border-neutral-800">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-neutral-100">充值/提现审核</h3>
                <Select
                  placeholder="状态筛选"
                  value={txnFilter}
                  onChange={setTxnFilter}
                  style={{ width: 120 }}
                  clearable
                >
                  <Select.Option value="pending">待审核</Select.Option>
                  <Select.Option value="completed">已完成</Select.Option>
                  <Select.Option value="rejected">已拒绝</Select.Option>
                </Select>
              </div>
              <Table
                columns={transactionColumns}
                data={filteredTxns.map((t: any) => ({
                  ...t,
                  status: t.status_text || t.status,
                  payment_method: t.payment_method_text || t.payment_method
                }))}
                stripe
                hover
                size="small"
                pagination={{ defaultPageSize: 10 }}
              />
            </Card>
          </Tabs.TabPanel>

          <Tabs.TabPanel value="settings" label="系统设置">
            <Card className="!bg-neutral-900 !border-neutral-800">
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-100 mb-4">基本设置</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between py-2 border-b border-neutral-800">
                      <div>
                        <div className="text-sm text-neutral-200">维护模式</div>
                        <div className="text-xs text-neutral-500">开启后普通用户无法访问系统</div>
                      </div>
                      <Switch
                        value={systemSettings.maintenanceMode}
                        onChange={(v) => setSystemSettings({ ...systemSettings, maintenanceMode: v })}
                      />
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-neutral-800">
                      <div>
                        <div className="text-sm text-neutral-200">允许注册</div>
                        <div className="text-xs text-neutral-500">是否开放用户注册功能</div>
                      </div>
                      <Switch
                        value={systemSettings.allowRegister}
                        onChange={(v) => setSystemSettings({ ...systemSettings, allowRegister: v })}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-neutral-100 mb-4">交易设置</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between py-2 border-b border-neutral-800">
                      <div>
                        <div className="text-sm text-neutral-200">最大杠杆</div>
                        <div className="text-xs text-neutral-500">用户可使用的最大杠杆倍数</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-amber-500 font-mono">{systemSettings.maxLeverage}x</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-neutral-800">
                      <div>
                        <div className="text-sm text-neutral-200">最小充值金额</div>
                        <div className="text-xs text-neutral-500">单次充值最低金额</div>
                      </div>
                      <div className="text-lg font-bold text-neutral-100 font-mono">
                        ${systemSettings.minDeposit}
                      </div>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-neutral-800">
                      <div>
                        <div className="text-sm text-neutral-200">最小提现金额</div>
                        <div className="text-xs text-neutral-500">单次提现最低金额</div>
                      </div>
                      <div className="text-lg font-bold text-neutral-100 font-mono">
                        ${systemSettings.minWithdraw}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-neutral-100 mb-4">费率设置</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between py-2 border-b border-neutral-800">
                      <div>
                        <div className="text-sm text-neutral-200">手续费率</div>
                        <div className="text-xs text-neutral-500">每笔交易的手续费比例</div>
                      </div>
                      <div className="text-lg font-bold text-amber-500 font-mono">
                        {(systemSettings.commissionRate * 100).toFixed(3)}%
                      </div>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-neutral-800">
                      <div>
                        <div className="text-sm text-neutral-200">平台服务费</div>
                        <div className="text-xs text-neutral-500">平台收取的额外服务费</div>
                      </div>
                      <div className="text-lg font-bold text-amber-500 font-mono">
                        {(systemSettings.platformFee * 100).toFixed(3)}%
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4">
                  <Button theme="primary" size="large" block>
                    保存设置
                  </Button>
                </div>
              </div>
            </Card>
          </Tabs.TabPanel>
        </Tabs>
      </div>

      {/* 用户详情弹窗 - 响应式 */}
      <Modal
        header="用户详情"
        visible={userModal}
        onClose={() => setUserModal(false)}
        width="90vw"
        style={{ maxWidth: '600px' }}
        footer={null}
      >
        {selectedUser && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-neutral-500 mb-1">用户名</div>
                <div className="text-sm text-neutral-200 font-mono">{selectedUser.username}</div>
              </div>
              <div>
                <div className="text-xs text-neutral-500 mb-1">姓名</div>
                <div className="text-sm text-neutral-200">{selectedUser.realName}</div>
              </div>
              <div>
                <div className="text-xs text-neutral-500 mb-1">手机号</div>
                <div className="text-sm text-neutral-200 font-mono">{selectedUser.phone}</div>
              </div>
              <div>
                <div className="text-xs text-neutral-500 mb-1">邮箱</div>
                <div className="text-sm text-neutral-200 font-mono">{selectedUser.email}</div>
              </div>
              <div>
                <div className="text-xs text-neutral-500 mb-1">账户余额</div>
                <div className="text-lg font-bold text-amber-500 font-mono">
                  {formatCurrency(selectedUser.balance)}
                </div>
              </div>
              <div>
                <div className="text-xs text-neutral-500 mb-1">冻结金额</div>
                <div className="text-sm text-neutral-300 font-mono">
                  {formatCurrency(selectedUser.frozen)}
                </div>
              </div>
              <div>
                <div className="text-xs text-neutral-500 mb-1">累计盈亏</div>
                <div className={`text-lg font-bold font-mono ${selectedUser.profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {formatCurrency(selectedUser.profit)}
                </div>
              </div>
              <div>
                <div className="text-xs text-neutral-500 mb-1">代理等级</div>
                <div className="text-sm text-neutral-200">
                  {['普通用户', '一级代理', '二级代理'][selectedUser.agentLevel]}
                </div>
              </div>
              <div>
                <div className="text-xs text-neutral-500 mb-1">注册时间</div>
                <div className="text-sm text-neutral-400">{selectedUser.registerTime}</div>
              </div>
              <div>
                <div className="text-xs text-neutral-500 mb-1">最后登录</div>
                <div className="text-sm text-neutral-400">{selectedUser.lastLogin}</div>
              </div>
            </div>
            <div className="pt-4 border-t border-neutral-800">
              <Button theme="primary" block onClick={() => setUserModal(false)}>
                关闭
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}


