import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Input,
  Radio,
  Form,
  MessagePlugin,
  Card,
  Divider,
  Loading,
  Dialog,
} from 'tdesign-react';
import {
  ChevronLeftIcon,
  CheckCircleIcon,
  InfoCircleIcon,
  WalletIcon,
  TimeIcon,
} from 'tdesign-icons-react';
import logger from '../utils/logger';
import { createDeposit, getFinanceRecords } from '../services/finance';

const Deposit = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formValue, setFormValue] = useState({
    amount: '',
    paymentMethod: 'bank',
  });
  const [selectedBank, setSelectedBank] = useState('icbc');
  const [records, setRecords] = useState<any[]>([]);
  const [successDialog, setSuccessDialog] = useState(false);
  const [depositResult, setDepositResult] = useState<any>(null);

  const banks = [
    { id: 'icbc', name: '工商银行', icon: '🏦' },
    { id: 'ccb', name: '建设银行', icon: '🏦' },
    { id: 'abc', name: '农业银行', icon: '🏦' },
    { id: 'boc', name: '中国银行', icon: '🏦' },
    { id: 'bcm', name: '交通银行', icon: '🏦' },
  ];

  const paymentMethods = [
    { value: 'bank', label: '银行卡转账', icon: <WalletIcon size="20px" /> },
    { value: 'usdt', label: 'USDT 充值', icon: <WalletIcon size="20px" /> },
    { value: 'alipay', label: '支付宝', icon: <WalletIcon size="20px" /> },
    { value: 'wechat', label: '微信支付', icon: <WalletIcon size="20px" /> },
  ];

  useEffect(() => {
    // 加载充值记录
    loadDepositRecords();
  }, []);

  const loadDepositRecords = async () => {
    setLoading(true);
    try {
      const result = await getFinanceRecords({ type: 'deposit', page: 1, pageSize: 20 });
      setRecords(result.list || []);
    } catch (error) {
      logger.error('获取充值记录失败:', error);
      MessagePlugin.error('获取充值记录失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formValue.amount || parseFloat(formValue.amount) <= 0) {
      MessagePlugin.error('请输入有效的充值金额');
      return;
    }

    const amount = parseFloat(formValue.amount);
    if (amount < 10) {
      MessagePlugin.error('最低充值金额为 10 元');
      return;
    }

    if (amount > 1000000) {
      MessagePlugin.error('单笔充值金额不能超过 100 万元');
      return;
    }

    setSubmitting(true);

    try {
      const result = await createDeposit({
        amount,
        method: formValue.paymentMethod,
        bankName: formValue.paymentMethod === 'bank' ? getPaymentMethodName(formValue.paymentMethod) : undefined,
        bankAccount: formValue.paymentMethod === 'bank' ? selectedBank : undefined,
      });

      await loadDepositRecords();

      // 显示成功弹窗
      setDepositResult({
        amount,
        method: getPaymentMethodName(formValue.paymentMethod),
        orderNo: result.record_number || result.id || `DP${Date.now()}`,
      });
      setSuccessDialog(true);

      // 重置表单
      setFormValue({ amount: '', paymentMethod: 'bank' });

      MessagePlugin.success('充值申请已提交');
    } catch (error) {
      logger.error('充值失败:', error);
      MessagePlugin.error('充值失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const getPaymentMethodName = (method: string) => {
    const methodMap: Record<string, string> = {
      bank: banks.find((b) => b.id === selectedBank)?.name || '银行卡',
      usdt: 'USDT-TRC20',
      alipay: '支付宝',
      wechat: '微信支付',
    };
    return methodMap[method] || method;
  };

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { text: string; theme: string }> = {
      pending: { text: '审核中', theme: 'warning' },
      completed: { text: '已完成', theme: 'success' },
      rejected: { text: '已拒绝', theme: 'danger' },
    };
    return statusMap[status] || { text: status, theme: 'default' };
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900">
      {/* 顶部导航栏 */}
      <div className="sticky top-0 z-50 bg-gray-900/95 backdrop-blur-sm border-b border-amber-500/20">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="text-amber-400 hover:text-amber-300 transition-colors"
          >
            <ChevronLeftIcon size="24px" />
          </button>
          <h1 className="text-xl font-bold text-white">账户充值</h1>
          <div className="w-6" />
        </div>
      </div>

      {/* 主要内容 */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* 充值说明卡片 */}
        <Card
          bordered
          theme="dark"
          className="mb-4 !bg-gray-800/50 !border-amber-500/30"
        >
          <div className="flex items-start gap-3">
            <InfoCircleIcon size="20px" className="text-amber-400 mt-0.5" />
            <div className="flex-1">
              <div className="text-white font-medium mb-2">充值说明</div>
              <ul className="text-gray-400 text-sm space-y-1">
                <li>• 最低充值金额：10 元</li>
                <li>• 单笔充值上限：100 万元</li>
                <li>• 银行卡充值 T+1 到账</li>
                <li>• USDT 充值实时到账</li>
              </ul>
            </div>
          </div>
        </Card>

        {/* 充值表单 */}
        <Card
          bordered
          theme="dark"
          className="mb-6 !bg-gray-800/50 !border-amber-500/30"
        >
          <div className="space-y-6">
            {/* 选择充值方式 */}
            <div>
              <div className="text-white font-medium mb-3">选择充值方式</div>
              <div className="grid grid-cols-2 gap-3">
                {paymentMethods.map((method) => (
                  <div
                    key={method.value}
                    onClick={() =>
                      setFormValue({ ...formValue, paymentMethod: method.value })
                    }
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all flex items-center gap-3 ${
                      formValue.paymentMethod === method.value
                        ? 'border-amber-500 bg-amber-500/10'
                        : 'border-gray-600 bg-gray-700/50 hover:border-amber-500/50'
                    }`}
                  >
                    <div className="text-amber-400">{method.icon}</div>
                    <div className="text-white font-medium">{method.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 银行卡选择 */}
            {formValue.paymentMethod === 'bank' && (
              <div>
                <div className="text-white font-medium mb-3">选择银行</div>
                <div className="grid grid-cols-3 gap-2">
                  {banks.map((bank) => (
                    <div
                      key={bank.id}
                      onClick={() => setSelectedBank(bank.id)}
                      className={`p-3 rounded-lg border-2 cursor-pointer transition-all flex flex-col items-center gap-1 ${
                        selectedBank === bank.id
                          ? 'border-amber-500 bg-amber-500/10'
                          : 'border-gray-600 bg-gray-700/50 hover:border-amber-500/50'
                      }`}
                    >
                      <div className="text-2xl">{bank.icon}</div>
                      <div className="text-white text-sm">{bank.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 充值金额 */}
            <div>
              <div className="text-white font-medium mb-3">充值金额</div>
              <Input
                size="large"
                type="number"
                placeholder="请输入充值金额"
                value={formValue.amount}
                onChange={(value) =>
                  setFormValue({ ...formValue, amount: value })
                }
                suffix="元"
                className="!bg-gray-700/50 !text-white"
              />
              <div className="flex gap-2 mt-3">
                {['100', '500', '1000', '5000', '10000'].map((amount) => (
                  <Button
                    key={amount}
                    size="small"
                    variant="outline"
                    theme="warning"
                    onClick={() =>
                      setFormValue({ ...formValue, amount })
                    }
                  >
                    {amount}
                  </Button>
                ))}
              </div>
            </div>

            {/* USDT 充值地址 */}
            {formValue.paymentMethod === 'usdt' && (
              <div className="p-4 rounded-lg bg-gray-700/50 border border-amber-500/30">
                <div className="text-amber-400 font-medium mb-2">USDT 充值地址</div>
                <div className="bg-gray-800 rounded-lg p-3 text-white text-sm break-all mb-3 font-mono">
                  TX7ZqZ8P9jK3LmN5oP7qR9sT2vW4xY6zA8bC1dE3f
                </div>
                <div className="text-gray-400 text-sm">
                  • 请勿向上述地址充值任何非 USDT 资产，否则资产将不可找回。
                  <br />
                  • 最小充值金额：10 USDT
                </div>
              </div>
            )}

            {/* 提交按钮 */}
            <Button
              size="large"
              theme="warning"
              variant="base"
              block
              loading={submitting}
              onClick={handleSubmit}
              className="!h-12 !text-base !font-bold"
            >
              {submitting ? '提交中...' : '立即充值'}
            </Button>
          </div>
        </Card>

        {/* 充值记录 */}
        <Card
          bordered
          theme="dark"
          className="!bg-gray-800/50 !border-amber-500/30"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="text-white font-medium">充值记录</div>
            <Button
              size="small"
              variant="text"
              theme="warning"
              onClick={() => logger.debug('查看更多记录')}
            >
              查看全部
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loading loading text="加载中..." />
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <InfoCircleIcon size="48px" className="mb-2" />
              <div>暂无充值记录</div>
            </div>
          ) : (
            <div className="space-y-3">
              {records.slice(0, 5).map((record) => {
                const status = getStatusTag(record.status);
                return (
                  <div
                    key={record.id}
                    className="p-4 rounded-lg bg-gray-700/30 border border-gray-600/30"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="text-white font-medium">
                          {record.method}
                        </div>
                        <div className="text-gray-400 text-sm mt-1 flex items-center gap-1">
                          <TimeIcon size="14px" />
                          {record.createdAt}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-amber-400 font-bold text-lg">
                          +{record.amount.toLocaleString()} 元
                        </div>
                        <div
                          className={`text-xs mt-1 px-2 py-0.5 rounded-full ${
                            status.theme === 'success'
                              ? 'bg-green-500/20 text-green-400'
                              : status.theme === 'warning'
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}
                        >
                          {status.text}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* 成功弹窗 */}
      <Dialog
        visible={successDialog}
        header="充值申请已提交"
        onClose={() => setSuccessDialog(false)}
        footer={null}
        className="!bg-gray-800 !text-white"
      >
        <div className="text-center py-6">
          <CheckCircleIcon
            size="64px"
            className="text-green-400 mx-auto mb-4"
          />
          <div className="text-white font-medium text-lg mb-2">
            充值申请已成功提交
          </div>
          <div className="text-gray-400 text-sm mb-4">
            充值金额：{depositResult?.amount?.toLocaleString()} 元
          </div>
          <div className="text-gray-400 text-sm mb-6">
            订单编号：{depositResult?.orderNo}
          </div>
          <Button
            theme="warning"
            variant="base"
            onClick={() => setSuccessDialog(false)}
            block
          >
            确定
          </Button>
        </div>
      </Dialog>
    </div>
  );
};

export default Deposit;
