import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Input,
  Radio,
  Form,
  MessagePlugin,
  Card,
  Dialog,
  Loading,
} from 'tdesign-react';
import {
  ChevronLeftIcon,
  CheckCircleIcon,
  InfoCircleIcon,
  WalletIcon,
  TimeIcon,
  RemoveIcon,
} from 'tdesign-icons-react';
import logger from '../utils/logger';
import { createWithdraw, getFinanceRecords, getAccountInfo } from '../services/finance';

const Withdraw = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [availableBalance, setAvailableBalance] = useState(0);
  const [frozenAmount, setFrozenAmount] = useState(0);
  const [formValue, setFormValue] = useState({
    amount: '',
    paymentMethod: 'bank',
    bankCard: '',
    usdtAddress: '',
    securityCode: '',
  });
  const [records, setRecords] = useState<any[]>([]);
  const [successDialog, setSuccessDialog] = useState(false);
  const [withdrawResult, setWithdrawResult] = useState<any>(null);

  const banks = [
    { id: 1, bank: '工商银行', card: '****8888', balance: availableBalance },
  ];

  const paymentMethods = [
    { value: 'bank', label: '银行卡提现', icon: <WalletIcon size="20px" /> },
    { value: 'usdt', label: 'USDT 提现', icon: <WalletIcon size="20px" /> },
  ];

  useEffect(() => {
    // 加载提现记录和余额
    loadWithdrawData();
  }, []);

  const loadWithdrawData = async () => {
    setLoading(true);
    try {
      const account = await getAccountInfo();
      setAvailableBalance(account.available_balance ?? account.availableBalance ?? 0);
      setFrozenAmount(account.frozen_margin ?? account.frozenMargin ?? 0);

      const result = await getFinanceRecords({ type: 'withdraw', page: 1, pageSize: 20 });
      setRecords(result.list || []);
    } catch (error) {
      logger.error('获取提现数据失败:', error);
      MessagePlugin.error('获取提现数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleMaxAmount = () => {
    const max = Math.floor(availableBalance);
    setFormValue({ ...formValue, amount: max.toString() });
  };

  const handleSubmit = async () => {
    if (!formValue.amount || parseFloat(formValue.amount) <= 0) {
      MessagePlugin.error('请输入有效的提现金额');
      return;
    }

    const amount = parseFloat(formValue.amount);
    if (amount < 100) {
      MessagePlugin.error('最低提现金额为 100 元');
      return;
    }

    if (amount > availableBalance) {
      MessagePlugin.error('提现金额不能超过可用余额');
      return;
    }

    if (formValue.paymentMethod === 'bank' && !formValue.bankCard) {
      MessagePlugin.error('请选择银行卡');
      return;
    }

    if (formValue.paymentMethod === 'usdt' && !formValue.usdtAddress) {
      MessagePlugin.error('请输入 USDT 提现地址');
      return;
    }

    if (!formValue.securityCode) {
      MessagePlugin.error('请输入安全码');
      return;
    }

    setSubmitting(true);

    try {
      const result = await createWithdraw({
        amount,
        method: formValue.paymentMethod,
        bankName: formValue.paymentMethod === 'bank'
          ? banks.find((b) => b.id === parseInt(formValue.bankCard))?.bank
          : undefined,
        bankAccount: formValue.paymentMethod === 'bank'
          ? banks.find((b) => b.id === parseInt(formValue.bankCard))?.card
          : undefined,
        usdtAddress: formValue.paymentMethod === 'usdt' ? formValue.usdtAddress : undefined,
        securityCode: formValue.securityCode,
      });

      await loadWithdrawData();

      // 显示成功弹窗
      setWithdrawResult({
        amount,
        fee: 0,
        actualAmount: amount,
        method: formValue.paymentMethod === 'bank'
          ? banks.find((b) => b.id === parseInt(formValue.bankCard))?.bank || '银行卡'
          : 'USDT-TRC20',
        orderNo: result.record_number || result.id || `WD${Date.now()}`,
      });
      setSuccessDialog(true);

      // 重置表单
      setFormValue({
        amount: '',
        paymentMethod: 'bank',
        bankCard: '',
        usdtAddress: '',
        securityCode: '',
      });

      MessagePlugin.success('提现申请已提交');
    } catch (error) {
      logger.error('提现失败:', error);
      MessagePlugin.error('提现失败，请重试');
    } finally {
      setSubmitting(false);
    }
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
          <h1 className="text-xl font-bold text-white">账户提现</h1>
          <div className="w-6" />
        </div>
      </div>

      {/* 主要内容 */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* 资产信息卡片 */}
        <Card
          bordered
          theme="dark"
          className="mb-4 !bg-gray-800/50 !border-amber-500/30"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-gray-400 text-sm mb-1">可用余额</div>
              <div className="text-amber-400 font-bold text-2xl">
                ¥{availableBalance.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-gray-400 text-sm mb-1">占用资金</div>
              <div className="text-gray-300 font-bold text-2xl">
                ¥{frozenAmount.toLocaleString()}
              </div>
            </div>
          </div>
        </Card>

        {/* 提现说明卡片 */}
        <Card
          bordered
          theme="dark"
          className="mb-4 !bg-gray-800/50 !border-amber-500/30"
        >
          <div className="flex items-start gap-3">
            <InfoCircleIcon size="20px" className="text-amber-400 mt-0.5" />
            <div className="flex-1">
              <div className="text-white font-medium mb-2">提现说明</div>
              <ul className="text-gray-400 text-sm space-y-1">
                <li>• 最低提现金额：100 元</li>
                <li>• 银行卡提现 T+1 到账</li>
                <li>• USDT 提现实时到账，手续费 0.1%（最低 5 USDT）</li>
                <li>• 工作日 16:00 前提交当日处理，次日到账</li>
                <li>• 如有疑问，请联系客服</li>
              </ul>
            </div>
          </div>
        </Card>

        {/* 提现表单 */}
        <Card
          bordered
          theme="dark"
          className="mb-6 !bg-gray-800/50 !border-amber-500/30"
        >
          <div className="space-y-6">
            {/* 选择提现方式 */}
            <div>
              <div className="text-white font-medium mb-3">选择提现方式</div>
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
                <div className="text-white font-medium mb-3">选择银行卡</div>
                <div className="space-y-2">
                  {banks.map((bank) => (
                    <div
                      key={bank.id}
                      onClick={() =>
                        setFormValue({ ...formValue, bankCard: bank.id.toString() })
                      }
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-all flex items-center justify-between ${
                        formValue.bankCard === bank.id.toString()
                          ? 'border-amber-500 bg-amber-500/10'
                          : 'border-gray-600 bg-gray-700/50 hover:border-amber-500/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <WalletIcon size="24px" className="text-amber-400" />
                        <div>
                          <div className="text-white font-medium">{bank.bank}</div>
                          <div className="text-gray-400 text-sm">{bank.card}</div>
                        </div>
                      </div>
                      {formValue.bankCard === bank.id.toString() && (
                        <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
                          <div className="w-3 h-3 rounded-full bg-white" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* USDT 提现地址 */}
            {formValue.paymentMethod === 'usdt' && (
              <div>
                <div className="text-white font-medium mb-3">USDT 提现地址</div>
                <Input
                  size="large"
                  placeholder="请输入 USDT 提现地址"
                  value={formValue.usdtAddress}
                  onChange={(value) =>
                    setFormValue({ ...formValue, usdtAddress: value })
                  }
                  className="!bg-gray-700/50 !text-white"
                />
              </div>
            )}

            {/* 提现金额 */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="text-white font-medium">提现金额</div>
                <Button
                  size="small"
                  variant="outline"
                  theme="warning"
                  icon={<RemoveIcon size="14px" />}
                  onClick={handleMaxAmount}
                >
                  全部
                </Button>
              </div>
              <Input
                size="large"
                type="number"
                placeholder="请输入提现金额"
                value={formValue.amount}
                onChange={(value) =>
                  setFormValue({ ...formValue, amount: value })
                }
                suffix="元"
                className="!bg-gray-700/50 !text-white"
              />
              <div className="text-gray-400 text-sm mt-2">
                可提现：¥{availableBalance.toLocaleString()}
              </div>
              {formValue.paymentMethod === 'usdt' && formValue.amount && (
                <div className="text-amber-400 text-sm mt-2">
                  手续费：{Math.max(5, parseFloat(formValue.amount) * 0.001).toFixed(2)} USDT
                  <br />
                  实际到账：{(parseFloat(formValue.amount) - Math.max(5, parseFloat(formValue.amount) * 0.001)).toFixed(2)} USDT
                </div>
              )}
            </div>

            {/* 安全码 */}
            <div>
              <div className="text-white font-medium mb-3">安全码</div>
              <Input
                size="large"
                type="password"
                placeholder="请输入安全码"
                value={formValue.securityCode}
                onChange={(value) =>
                  setFormValue({ ...formValue, securityCode: value })
                }
                className="!bg-gray-700/50 !text-white"
              />
            </div>

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
              {submitting ? '提交中...' : '立即提现'}
            </Button>
          </div>
        </Card>

        {/* 提现记录 */}
        <Card
          bordered
          theme="dark"
          className="!bg-gray-800/50 !border-amber-500/30"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="text-white font-medium">提现记录</div>
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
              <div>暂无提现记录</div>
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
                        {record.rejectReason && (
                          <div className="text-red-400 text-sm mt-1">
                            拒绝原因：{record.rejectReason}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-white font-bold text-lg">
                          -{record.amount.toLocaleString()} 元
                        </div>
                        {record.fee > 0 && (
                          <div className="text-gray-400 text-xs">
                            手续费：{record.fee}
                          </div>
                        )}
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
        header="提现申请已提交"
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
            提现申请已成功提交
          </div>
          <div className="text-gray-400 text-sm mb-2">
            提现金额：¥{withdrawResult?.amount?.toLocaleString()}
          </div>
          {withdrawResult?.fee > 0 && (
            <div className="text-gray-400 text-sm mb-2">
              手续费：{withdrawResult.fee.toFixed(2)}
            </div>
          )}
          <div className="text-gray-400 text-sm mb-2">
            实际到账：¥{withdrawResult?.actualAmount?.toLocaleString()}
          </div>
          <div className="text-gray-400 text-sm mb-4">
            订单编号：{withdrawResult?.orderNo}
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

export default Withdraw;



