import { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Input,
  Button,
  Select,
  Modal,
  Form,
  FormItem,
  InputNumber,
  DatePicker,
  Tag,
  Space,
  Tooltip,
  Switch,
  Divider
} from 'tdesign-react';
import {
  UserIcon,
  AddIcon,
  CheckIcon,
  CloseIcon,
  SearchIcon,
  RefreshIcon,
  MoneyCircleIcon,
  ChartIcon
} from 'tdesign-icons-react';
import { formatCurrency } from '../utils/format';
import logger from '../utils/logger';
import { adminApi } from '../services/admin';

// 代理类型
const AgentType = {
  TOTAL_AGENT: 1,    // 总代理
  SUB_AGENT: 2         // 分代理
};

// 代理状态
const AgentStatus = {
  DISABLED: 0,         // 禁用
  NORMAL: 1,           // 正常
  PENDING: 2            // 审核中
};

export default function AgentManagement() {
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState<any[]>([]);
  const [createModal, setCreateModal] = useState(false);
  const [detailModal, setDetailModal] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<any>(null);

  // 搜索条件
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // 创建表单
  const [form] = Form.useForm();

  // 获取代理列表
  const fetchAgents = async () => {
    setLoading(true);
    try {
      const result = await adminApi.agent.getList({
        page: 1,
        pageSize: 50,
        level: filterType ? parseInt(filterType) : undefined,
        status: filterStatus ? parseInt(filterStatus) : undefined
      });
      setAgents(result?.list || []);
    } catch (error) {
      logger.error('获取代理列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 创建代理
  const handleCreateAgent = async (values: any) => {
    try {
      await adminApi.agent.create(values);
      setCreateModal(false);
      form.reset();
      fetchAgents();
    } catch (error) {
      logger.error('创建代理失败:', error);
    }
  };

  // 查看详情
  const handleViewDetail = (agent: any) => {
    setSelectedAgent(agent);
    setDetailModal(true);
  };

  // 切换状态
  const handleToggleStatus = async (agentId: number, status: number) => {
    try {
      await adminApi.agent.update(String(agentId), { status });
      fetchAgents();
    } catch (error) {
      logger.error('切换状态失败:', error);
    }
  };

  // 过滤数据
  const filteredAgents = agents.filter(agent => {
    const matchKeyword = !searchKeyword ||
      agent.username.includes(searchKeyword) ||
      agent.realName.includes(searchKeyword) ||
      agent.agentCode.includes(searchKeyword) ||
      agent.phone.includes(searchKeyword);

    const matchType = !filterType || agent.agentType === parseInt(filterType);
    const matchStatus = !filterStatus || agent.status === parseInt(filterStatus);

    return matchKeyword && matchType && matchStatus;
  });

  useEffect(() => {
    fetchAgents();
  }, []);

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="!border-0 !shadow-sm">
          <div className="p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center">
                <UserIcon size="24px" className="text-blue-600" />
              </div>
              <Tag theme="success" shape="round" size="small">+12.5%</Tag>
            </div>
            <div className="text-2xl font-bold text-gray-900 mb-1">156</div>
            <div className="text-sm text-gray-500">总代理数</div>
          </div>
        </Card>

        <Card className="!border-0 !shadow-sm">
          <div className="p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="w-12 h-12 rounded-lg bg-purple-50 flex items-center justify-center">
                <UserIcon size="24px" className="text-purple-600" />
              </div>
              <Tag theme="success" shape="round" size="small">+8.3%</Tag>
            </div>
            <div className="text-2xl font-bold text-gray-900 mb-1">89</div>
            <div className="text-sm text-gray-500">分代理数</div>
          </div>
        </Card>

        <Card className="!border-0 !shadow-sm">
          <div className="p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="w-12 h-12 rounded-lg bg-green-50 flex items-center justify-center">
                <UserIcon size="24px" className="text-green-600" />
              </div>
              <Tag theme="success" shape="round" size="small">+15.7%</Tag>
            </div>
            <div className="text-2xl font-bold text-gray-900 mb-1">3,128</div>
            <div className="text-sm text-gray-500">总客户数</div>
          </div>
        </Card>

        <Card className="!border-0 !shadow-sm">
          <div className="p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="w-12 h-12 rounded-lg bg-orange-50 flex items-center justify-center">
                <MoneyCircleIcon size="24px" className="text-orange-600" />
              </div>
              <Tag theme="success" shape="round" size="small">+22.1%</Tag>
            </div>
            <div className="text-2xl font-bold text-gray-900 mb-1">¥292.5万</div>
            <div className="text-sm text-gray-500">累计分佣</div>
          </div>
        </Card>
      </div>

      {/* 代理列表 */}
      <Card className="!border-0 !shadow-sm" title="代理管理">
        <div className="mb-4 flex gap-4 items-center">
          <Input
            placeholder="搜索用户名/姓名/手机号/代理代码"
            value={searchKeyword}
            onChange={setSearchKeyword}
            style={{ width: 300 }}
            clearable
            prefixIcon={<SearchIcon size="16px" />}
          />
          <Select
            placeholder="代理类型"
            value={filterType}
            onChange={setFilterType}
            style={{ width: 150 }}
            clearable
          >
            <Select.Option value={AgentType.TOTAL_AGENT}>总代理</Select.Option>
            <Select.Option value={AgentType.SUB_AGENT}>分代理</Select.Option>
          </Select>
          <Select
            placeholder="状态"
            value={filterStatus}
            onChange={setFilterStatus}
            style={{ width: 120 }}
            clearable
          >
            <Select.Option value={AgentStatus.NORMAL}>正常</Select.Option>
            <Select.Option value={AgentStatus.DISABLED}>禁用</Select.Option>
            <Select.Option value={AgentStatus.PENDING}>审核中</Select.Option>
          </Select>
          <div className="flex-1" />
          <Button
            icon={<RefreshIcon size="16px" />}
            variant="outline"
            onClick={fetchAgents}
            loading={loading}
          >
            刷新
          </Button>
          <Button
            theme="primary"
            icon={<AddIcon size="16px" />}
            onClick={() => setCreateModal(true)}
          >
            新增代理
          </Button>
        </div>

        <Table
          columns={[
            {
              colKey: 'agentCode',
              title: '代理代码',
              width: 130,
              cell: (row: any) => (
                <span className="font-mono font-medium text-blue-600">{row.agentCode}</span>
              )
            },
            {
              colKey: 'agentType',
              title: '类型',
              width: 80,
              cell: (row: any) => (
                <Tag theme={row.agentType === AgentType.TOTAL_AGENT ? 'warning' : 'primary'}>
                  {row.agentTypeName}
                </Tag>
              )
            },
            {
              colKey: 'parentAgentCode',
              title: '上级代理',
              width: 130,
              cell: (row: any) => row.parentAgentCode ? (
                <div>
                  <div className="font-mono text-xs">{row.parentAgentCode}</div>
                  <div className="text-xs text-gray-500">{row.parentAgentName}</div>
                </div>
              ) : '-'
            },
            { colKey: 'username', title: '用户名', width: 100 },
            { colKey: 'realName', title: '姓名', width: 100 },
            { colKey: 'phone', title: '手机号', width: 120 },
            {
              colKey: 'totalUsers',
              title: '客户数',
              width: 80,
              cell: (row: any) => (
                <div className="text-center font-medium">{row.totalUsers}</div>
              )
            },
            {
              colKey: 'directSubAgents',
              title: '分代理数',
              width: 90,
              cell: (row: any) => (
                <div className="text-center font-medium">{row.directSubAgents}</div>
              )
            },
            {
              colKey: 'totalBalance',
              title: '累计分佣',
              width: 120,
              cell: (row: any) => (
                <span className="font-mono text-green-600">{formatCurrency(row.totalBalance)}</span>
              )
            },
            {
              colKey: 'commissionRate',
              title: '分佣比例',
              width: 100,
              cell: (row: any) => (
                <span className="font-mono text-blue-600">{(row.commissionRate * 100).toFixed(2)}%</span>
              )
            },
            {
              colKey: 'status',
              title: '状态',
              width: 80,
              cell: (row: any) => {
                const statusMap: any = {
                  [AgentStatus.NORMAL]: { label: '正常', theme: 'success' },
                  [AgentStatus.DISABLED]: { label: '禁用', theme: 'danger' },
                  [AgentStatus.PENDING]: { label: '审核中', theme: 'warning' }
                };
                const status = statusMap[row.status];
                return <Tag theme={status.theme}>{status.label}</Tag>;
              }
            },
            { colKey: 'registerTime', title: '注册时间', width: 160 },
            {
              colKey: 'action',
              title: '操作',
              width: 200,
              fixed: 'right',
              cell: (row: any) => (
                <Space>
                  <Button size="small" variant="text" onClick={() => handleViewDetail(row)}>
                    查看
                  </Button>
                  {row.status === AgentStatus.NORMAL ? (
                    <Button
                      size="small"
                      variant="text"
                      theme="danger"
                      onClick={() => handleToggleStatus(row.id, AgentStatus.DISABLED)}
                    >
                      禁用
                    </Button>
                  ) : row.status === AgentStatus.DISABLED ? (
                    <Button
                      size="small"
                      variant="text"
                      theme="success"
                      onClick={() => handleToggleStatus(row.id, AgentStatus.NORMAL)}
                    >
                      启用
                    </Button>
                  ) : (
                    <Button size="small" variant="text" theme="primary">
                      审核通过
                    </Button>
                  )}
                </Space>
              )
            }
          ]}
          data={filteredAgents}
          stripe
          hover
          size="small"
          loading={loading}
          pagination={{ defaultPageSize: 20, total: filteredAgents.length }}
        />
      </Card>

      {/* 创建代理弹窗 - 响应式 */}
      <Modal
        header="新增代理"
        visible={createModal}
        onClose={() => {
          setCreateModal(false);
          form.reset();
        }}
        width="95vw"
        style={{ maxWidth: '600px' }}
        onConfirm={() => form.submit()}
      >
        <Form
          form={form}
          onSubmit={handleCreateAgent}
          labelWidth={120}
        >
          <FormItem label="代理类型" name="agentType" initialData={AgentType.TOTAL_AGENT}>
            <Select>
              <Select.Option value={AgentType.TOTAL_AGENT}>总代理</Select.Option>
              <Select.Option value={AgentType.SUB_AGENT}>分代理</Select.Option>
            </Select>
          </FormItem>

          <FormItem
            label="上级代理代码"
            name="parentAgentCode"
            rules={[{ message: '分代理必须填写上级代理代码' }]}
            dependencies={['agentType']}
          >
            <Input placeholder="请输入上级总代理的代理代码" />
          </FormItem>

          <FormItem
            label="用户名"
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="请输入用户名" />
          </FormItem>

          <FormItem
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input type="password" placeholder="请输入密码" />
          </FormItem>

          <FormItem
            label="姓名"
            name="realName"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input placeholder="请输入真实姓名" />
          </FormItem>

          <FormItem
            label="手机号"
            name="phone"
            rules={[{ required: true, message: '请输入手机号' }]}
          >
            <Input placeholder="请输入手机号" />
          </FormItem>

          <FormItem label="邮箱" name="email">
            <Input placeholder="请输入邮箱（可选）" />
          </FormItem>

          <FormItem
            label="分佣比例"
            name="commissionRate"
            initialData={0.003}
            rules={[{ required: true, message: '请输入分佣比例' }]}
          >
            <InputNumber min={0} max={1} step={0.0001} decimalPlaces={4} placeholder="0.0000 ~ 1.0000" />
          </FormItem>
        </Form>
      </Modal>

      {/* 代理详情弹窗 - 响应式 */}
      <Modal
        header="代理详情"
        visible={detailModal}
        onClose={() => setDetailModal(false)}
        width="95vw"
        style={{ maxWidth: '800px' }}
        footer={null}
      >
        {selectedAgent && (
          <div className="space-y-4">
            {/* 基本信息 */}
            <div>
              <h4 className="text-base font-semibold mb-3">基本信息</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-3 rounded">
                  <div className="text-xs text-gray-500 mb-1">代理代码</div>
                  <div className="font-mono font-medium text-blue-600">{selectedAgent.agentCode}</div>
                </div>
                <div className="bg-gray-50 p-3 rounded">
                  <div className="text-xs text-gray-500 mb-1">代理类型</div>
                  <div>{selectedAgent.agentTypeName}</div>
                </div>
                <div className="bg-gray-50 p-3 rounded">
                  <div className="text-xs text-gray-500 mb-1">用户名</div>
                  <div>{selectedAgent.username}</div>
                </div>
                <div className="bg-gray-50 p-3 rounded">
                  <div className="text-xs text-gray-500 mb-1">姓名</div>
                  <div>{selectedAgent.realName}</div>
                </div>
                <div className="bg-gray-50 p-3 rounded">
                  <div className="text-xs text-gray-500 mb-1">手机号</div>
                  <div className="font-mono">{selectedAgent.phone}</div>
                </div>
                <div className="bg-gray-50 p-3 rounded">
                  <div className="text-xs text-gray-500 mb-1">邮箱</div>
                  <div>{selectedAgent.email || '-'}</div>
                </div>
              </div>
            </div>

            <Divider />

            {/* 财务信息 */}
            <div>
              <h4 className="text-base font-semibold mb-3">财务信息</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-50 p-3 rounded text-center">
                  <div className="text-xs text-gray-500 mb-1">累计分佣</div>
                  <div className="text-lg font-bold text-green-600">
                    {formatCurrency(selectedAgent.totalBalance)}
                  </div>
                </div>
                <div className="bg-gray-50 p-3 rounded text-center">
                  <div className="text-xs text-gray-500 mb-1">可用金额</div>
                  <div className="text-lg font-bold text-blue-600">
                    {formatCurrency(selectedAgent.availableBalance)}
                  </div>
                </div>
                <div className="bg-gray-50 p-3 rounded text-center">
                  <div className="text-xs text-gray-500 mb-1">冻结金额</div>
                  <div className="text-lg font-bold text-orange-600">
                    {formatCurrency(selectedAgent.frozenBalance)}
                  </div>
                </div>
              </div>
            </div>

            <Divider />

            {/* 统计信息 */}
            <div>
              <h4 className="text-base font-semibold mb-3">统计信息</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-50 p-3 rounded text-center">
                  <div className="text-xs text-gray-500 mb-1">直属客户</div>
                  <div className="text-lg font-bold">{selectedAgent.totalUsers}</div>
                </div>
                <div className="bg-gray-50 p-3 rounded text-center">
                  <div className="text-xs text-gray-500 mb-1">分代理数</div>
                  <div className="text-lg font-bold">{selectedAgent.directSubAgents}</div>
                </div>
                <div className="bg-gray-50 p-3 rounded text-center">
                  <div className="text-xs text-gray-500 mb-1">分佣比例</div>
                  <div className="text-lg font-bold text-blue-600">
                    {(selectedAgent.commissionRate * 100).toFixed(2)}%
                  </div>
                </div>
              </div>
            </div>

            <Divider />

            {/* 操作按钮 */}
            <div className="flex justify-end gap-3">
              <Button variant="outline">查看客户</Button>
              <Button variant="outline">查看分佣记录</Button>
              <Button variant="outline">修改分佣比例</Button>
              <Button theme="primary">关闭</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
