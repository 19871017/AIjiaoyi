import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  Dialog,
  Form,
  Input,
  MessagePlugin,
  Loading,
} from 'tdesign-react';
import {
  ChevronLeftIcon,
  AddIcon,
  DeleteIcon,
  InfoCircleIcon,
  CheckCircleIcon,
} from 'tdesign-icons-react';
import logger from '../utils/logger';
import { listBankCards, addBankCard, setDefaultBankCard, deleteBankCard } from '../services/bank-card';

const banks = [
  { id: 'icbc', name: '工商银行', icon: '🏦', color: '#C8102E' },
  { id: 'ccb', name: '建设银行', icon: '🏦', color: '#0066B3' },
  { id: 'abc', name: '农业银行', icon: '🏦', color: '#007B3C' },
  { id: 'boc', name: '中国银行', icon: '🏦', color: '#B71C1C' },
  { id: 'bcm', name: '交通银行', icon: '🏦', color: '#003A8C' },
  { id: 'cmb', name: '招商银行', icon: '🏦', color: '#C71A26' },
  { id: 'spdb', name: '浦发银行', icon: '🏦', color: '#0066B3' },
  { id: 'citic', name: '中信银行', icon: '🏦', color: '#D6000C' },
];

const BankCardManagement = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [bankCards, setBankCards] = useState<any[]>([]);
  const [addDialogVisible, setAddDialogVisible] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [formValue, setFormValue] = useState({
    bankName: '',
    cardNumber: '',
    holderName: '',
  });

  useEffect(() => {
    loadBankCards();
  }, []);

  const loadBankCards = async () => {
    setLoading(true);
    try {
      const list = await listBankCards();
      setBankCards(list || []);
    } catch (error) {
      logger.error('获取银行卡失败:', error);
      MessagePlugin.error('获取银行卡失败');
    } finally {
      setLoading(false);
    }
  };

  const maskCardNumber = (cardNumber: string) => {
    if (cardNumber.length >= 8) {
      return (
        cardNumber.substring(0, 4) +
        ' **** **** ' +
        cardNumber.substring(cardNumber.length - 4)
      );
    }
    return cardNumber;
  };

  const handleAddCard = async () => {
    if (!formValue.bankName) {
      MessagePlugin.error('请选择银行');
      return;
    }

    if (!formValue.cardNumber || formValue.cardNumber.length !== 16) {
      MessagePlugin.error('请输入正确的银行卡号（16 位）');
      return;
    }

    if (!formValue.holderName || formValue.holderName.length < 2) {
      MessagePlugin.error('请输入正确的持卡人姓名');
      return;
    }

    try {
      const newCard = await addBankCard({
        bankName: banks.find((b) => b.id === formValue.bankName)?.name || '',
        cardNumber: formValue.cardNumber,
        holderName: formValue.holderName,
      });

      setBankCards([...bankCards, newCard]);
      setAddDialogVisible(false);
      setFormValue({ bankName: '', cardNumber: '', holderName: '' });

      MessagePlugin.success('银行卡绑定成功');
    } catch (error) {
      logger.error('绑定银行卡失败:', error);
      MessagePlugin.error('绑定失败，请重试');
    }
  };

  const handleSetDefault = async (cardId: number) => {
    try {
      await setDefaultBankCard(cardId);
      setBankCards(
        bankCards.map((card) => ({
          ...card,
          isDefault: card.id === cardId,
        }))
      );

      MessagePlugin.success('已设为默认银行卡');
    } catch (error) {
      logger.error('设置默认银行卡失败:', error);
      MessagePlugin.error('设置失败，请重试');
    }
  };

  const handleDeleteClick = (card: any) => {
    setSelectedCard(card);
    setDeleteDialogVisible(true);
  };

  const handleDeleteCard = async () => {
    try {
      await deleteBankCard(selectedCard.id);
      setBankCards(bankCards.filter((card) => card.id !== selectedCard.id));
      setDeleteDialogVisible(false);
      setSelectedCard(null);

      MessagePlugin.success('银行卡已解绑');
    } catch (error) {
      logger.error('解绑银行卡失败:', error);
      MessagePlugin.error('解绑失败，请重试');
    }
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
          <h1 className="text-xl font-bold text-white">银行卡管理</h1>
          <Button
            size="small"
            theme="warning"
            variant="text"
            icon={<AddIcon size="20px" />}
            onClick={() => setAddDialogVisible(true)}
          >
            添加
          </Button>
        </div>
      </div>

      {/* 主要内容 */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* 说明卡片 */}
        <Card
          bordered
          theme="dark"
          className="mb-4 !bg-gray-800/50 !border-amber-500/30"
        >
          <div className="flex items-start gap-3">
            <InfoCircleIcon size="20px" className="text-amber-400 mt-0.5" />
            <div className="flex-1">
              <div className="text-white font-medium mb-2">温馨提示</div>
              <ul className="text-gray-400 text-sm space-y-1">
                <li>• 只能绑定实名认证本人的银行卡</li>
                <li>• 单个账户最多绑定 5 张银行卡</li>
                <li>• 提现时默认使用默认银行卡</li>
                <li>• 绑定后如需更换，请先解绑再重新绑定</li>
              </ul>
            </div>
          </div>
        </Card>

        {/* 银行卡列表 */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loading loading text="加载中..." />
          </div>
        ) : bankCards.length === 0 ? (
          <Card
            bordered
            theme="dark"
            className="!bg-gray-800/50 !border-amber-500/30"
          >
            <div className="text-center py-12">
              <WalletIcon size="64px" className="text-gray-600 mx-auto mb-3" />
              <div className="text-gray-500 mb-4">暂无银行卡</div>
              <Button
                theme="warning"
                variant="base"
                icon={<AddIcon size="20px" />}
                onClick={() => setAddDialogVisible(true)}
              >
                添加银行卡
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {bankCards.map((card) => (
              <Card
                key={card.id}
                bordered
                theme="dark"
                className="!bg-gray-800/50 !border-amber-500/30"
              >
                <div className="flex items-start gap-4">
                  {/* 银行图标 */}
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center text-2xl">
                    🏦
                  </div>

                  {/* 银行卡信息 */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-white font-medium">
                        {card.bankName}
                      </span>
                      {card.isDefault && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-amber-500 text-white">
                          默认
                        </span>
                      )}
                    </div>
                    <div className="text-gray-300 font-mono text-lg">
                      {maskCardNumber(card.cardNumber)}
                    </div>
                    <div className="text-gray-400 text-sm mt-1">
                      持卡人：{card.holderName}
                    </div>
                    <div className="text-gray-500 text-xs mt-1">
                      绑定时间：{card.createdAt}
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex flex-col gap-2">
                    {!card.isDefault && (
                      <Button
                        size="small"
                        variant="text"
                        theme="success"
                        onClick={() => handleSetDefault(card.id)}
                      >
                        设为默认
                      </Button>
                    )}
                    <Button
                      size="small"
                      variant="text"
                      theme="danger"
                      icon={<DeleteIcon size="16px" />}
                      onClick={() => handleDeleteClick(card)}
                    >
                      解绑
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* 已绑定数量提示 */}
        {bankCards.length > 0 && (
          <div className="text-center text-gray-500 text-sm mt-6">
            已绑定 {bankCards.length}/5 张银行卡
          </div>
        )}
      </div>

      {/* 添加银行卡弹窗 - 响应式 */}
      <Dialog
        visible={addDialogVisible}
        header="添加银行卡"
        width="90vw"
        style={{ maxWidth: '450px' }}
        onClose={() => setAddDialogVisible(false)}
        footer={null}
        className="!bg-gray-800 !text-white"
      >
        <div className="space-y-5">
          {/* 选择银行 */}
          <div>
            <div className="text-white font-medium mb-3">选择银行</div>
            <div className="grid grid-cols-4 gap-2">
              {banks.map((bank) => (
                <div
                  key={bank.id}
                  onClick={() =>
                    setFormValue({ ...formValue, bankName: bank.id })
                  }
                  className={`p-3 rounded-lg border-2 cursor-pointer transition-all flex flex-col items-center gap-1 ${
                    formValue.bankName === bank.id
                      ? 'border-amber-500 bg-amber-500/10'
                      : 'border-gray-600 bg-gray-700/50 hover:border-amber-500/50'
                  }`}
                >
                  <div className="text-2xl">{bank.icon}</div>
                  <div className="text-white text-xs">{bank.name}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 卡号 */}
          <div>
            <div className="text-white font-medium mb-2">银行卡号</div>
            <Input
              size="large"
              type="number"
              placeholder="请输入 16 位银行卡号"
              value={formValue.cardNumber}
              onChange={(value) =>
                setFormValue({ ...formValue, cardNumber: value })
              }
              maxLength={16}
              className="!bg-gray-700/50 !text-white"
            />
          </div>

          {/* 持卡人姓名 */}
          <div>
            <div className="text-white font-medium mb-2">持卡人姓名</div>
            <Input
              size="large"
              placeholder="请输入持卡人姓名"
              value={formValue.holderName}
              onChange={(value) =>
                setFormValue({ ...formValue, holderName: value })
              }
              className="!bg-gray-700/50 !text-white"
            />
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-3">
            <Button
              theme="default"
              variant="outline"
              onClick={() => setAddDialogVisible(false)}
              className="flex-1 !border-gray-600 !text-gray-300"
            >
              取消
            </Button>
            <Button
              theme="warning"
              variant="base"
              onClick={handleAddCard}
              className="flex-1"
            >
              确认添加
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 解绑确认弹窗 - 响应式 */}
      <Dialog
        visible={deleteDialogVisible}
        header="确认解绑"
        width="90vw"
        style={{ maxWidth: '400px' }}
        onClose={() => {
          setDeleteDialogVisible(false);
          setSelectedCard(null);
        }}
        footer={null}
        className="!bg-gray-800 !text-white"
      >
        <div className="space-y-4 text-center">
          <div className="flex justify-center">
            <InfoCircleIcon size="48px" className="text-amber-400" />
          </div>
          <div className="text-white">
            确定要解绑以下银行卡吗？
          </div>
          {selectedCard && (
            <div className="p-3 rounded-lg bg-gray-700/50 text-gray-300">
              <div className="font-medium">{selectedCard.bankName}</div>
              <div className="font-mono">{maskCardNumber(selectedCard.cardNumber)}</div>
            </div>
          )}
          <div className="text-gray-400 text-sm">
            解绑后，该银行卡将无法用于提现
          </div>
          <div className="flex gap-3">
            <Button
              theme="default"
              variant="outline"
              onClick={() => {
                setDeleteDialogVisible(false);
                setSelectedCard(null);
              }}
              className="flex-1 !border-gray-600 !text-gray-300"
            >
              取消
            </Button>
            <Button
              theme="danger"
              variant="base"
              onClick={handleDeleteCard}
              className="flex-1"
            >
              确认解绑
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};

export default BankCardManagement;
