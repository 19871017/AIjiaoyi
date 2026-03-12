import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Badge, Dialog, MessagePlugin } from 'tdesign-react';
import {
  WalletIcon,
  UserIcon,
  LogoutIcon,
  ChevronRightIcon,
  SettingIcon,
  LockOnIcon,
  CheckIcon,
  CallIcon,
  MailIcon
} from 'tdesign-icons-react';
import UserCard from '../components/profile/UserCard';
import AssetCard from '../components/profile/AssetCard';
import FunctionGrid from '../components/profile/FunctionGrid';
import QuickNav, { defaultNavItems } from '../components/profile/QuickNav';
import EditProfileDialog from '../components/profile/EditProfileDialog';
import ChangePasswordDialog from '../components/profile/ChangePasswordDialog';
import NoticeDetailDialog from '../components/profile/NoticeDetailDialog';
import logger from '../utils/logger';
import api from '../services/api';
import { getUser } from '../services/auth';
import { getAnnouncements } from '../services/announcement';


// 账户管理功能
const accountFunctions = [
  {
    icon: <WalletIcon size="24px" />,
    title: '账户充值',
    description: '快捷充值，即时到账',
    badge: 'NEW',
    onClick: (navigate: any) => navigate('/deposit')
  },
  {
    icon: <WalletIcon size="24px" />,
    title: '账户提现',
    description: '安全快捷，T+1到账',
    onClick: (navigate: any) => navigate('/withdraw')
  },
  {
    icon: <WalletIcon size="24px" />,
    title: '银行卡管理',
    description: '绑定/解绑银行卡',
    onClick: (navigate: any) => navigate('/bank-cards')
  },
  {
    icon: <UserIcon size="24px" />,
    title: '个人信息',
    description: '修改昵称、头像',
    onClick: () => {
      /* 由 UserCard 组件处理 */
    }
  }
];

// 安全设置项目
const securityItems = [
  {
    icon: <LockOnIcon size="24px" />,
    title: '登录密码',
    description: '定期修改密码，保障账户安全',
    status: '已设置',
    onClick: () => {
      /* 由 Dialog 组件处理 */
    }
  },
  {
    icon: <CallIcon size="24px" />,
    title: '手机验证',
    description: '已绑定 138****8888',
    status: '已绑定',
    onClick: () => {
      /* TODO: 实现手机号修改功能 */
      MessagePlugin.info('手机号修改功能开发中');
    }
  },
  {
    icon: <MailIcon size="24px" />,
    title: '邮箱验证',
    description: '未绑定',
    status: '未绑定',
    onClick: () => {
      /* TODO: 实现邮箱绑定功能 */
      MessagePlugin.info('邮箱绑定功能开发中');
    }
  },
  {
    icon: <CheckIcon size="24px" />,
    title: '实名认证',
    description: '张三，身份证认证完成',
    status: '已认证',
    onClick: () => {
      /* TODO: 实现实名认证流程 */
      MessagePlugin.info('实名认证已完成');
    }
  }
];


export default function Profile() {
  const navigate = useNavigate();
  const [activeNav, setActiveNav] = useState('account');
  const [logoutDialogVisible, setLogoutDialogVisible] = useState(false);
  const [editProfileVisible, setEditProfileVisible] = useState(false);
  const [changePasswordVisible, setChangePasswordVisible] = useState(false);
  const [noticeDetailVisible, setNoticeDetailVisible] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState<any>(null);
  const [systemNotices, setSystemNotices] = useState<any[]>([]);

  const [userData, setUserData] = useState({
    name: '',
    phone: '',
    isVerified: false,
    avatar: ''
  });

  const [assetData, setAssetData] = useState({
    totalAssets: 0,
    availableFunds: 0,
    frozenMargin: 0,
    dailyPL: 0,
    dailyPLPercent: 0
  });

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const current = getUser();
        if (current) {
          setUserData({
            name: current.realName || current.username,
            phone: current.phone || '',
            isVerified: true,
            avatar: current.avatar || ''
          });
        }

        const accountInfo = await api.account.getInfo();
        setAssetData({
          totalAssets: accountInfo.totalBalance ?? 0,
          availableFunds: accountInfo.availableBalance ?? 0,
          frozenMargin: accountInfo.frozenMargin ?? 0,
          dailyPL: accountInfo.unrealizedPnl ?? 0,
          dailyPLPercent: 0
        });

        const notices = await getAnnouncements();
        setSystemNotices((notices || []).map((n: any) => ({
          id: n.id,
          title: n.title,
          content: n.content,
          date: n.created_at,
          type: 'normal',
          read: false
        })));
      } catch (error) {
        logger.error('加载账户信息失败:', error);
      }
    };

    loadProfile();
  }, []);

  const handleLogout = () => {
    window.location.href = '/';
  };

  const handleEditProfile = () => {
    setEditProfileVisible(true);
  };

  const handleProfileSave = (data: any) => {
    logger.debug('保存个人信息:', data);
    // 更新用户数据（实际应调用API）
  };

  const handleChangePassword = () => {
    setChangePasswordVisible(true);
  };

  const handlePasswordChange = () => {
    setChangePasswordVisible(false);
    // 退出登录，让用户重新登录
    window.location.href = '/';
  };

  const handleNoticeClick = (notice: any) => {
    setSelectedNotice(notice);
    setNoticeDetailVisible(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-neutral-950 pb-24">
      <div className="max-w-2xl mx-auto px-4">
        {/* 顶部标题栏 */}
        <header className="flex justify-between items-center py-5 mb-4">
          <div>
            <h1 className="text-xl font-bold text-white tracking-wide">我的账户</h1>
            <p className="text-xs text-neutral-500 mt-1">专业的金融账户管理中心</p>
          </div>
          <button className="w-10 h-10 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-500 hover:bg-neutral-800 hover:text-neutral-400 transition-all duration-200">
            <SettingIcon size="18px" />
          </button>
        </header>

        {/* 主内容区 */}
        <div className="space-y-6">
          {/* 用户卡片 */}
          <UserCard
            name={userData.name}
            phone={userData.phone}
            avatar={userData.avatar}
            isVerified={userData.isVerified}
            onEdit={handleEditProfile}
          />

          {/* 资产概览卡片 */}
          <AssetCard
            assets={assetData}
            showTrend={false}
            trendData={[]}
          />

          {/* 后台管理入口（管理员可见） */}
          <button
            onClick={() => navigate('/admin')}
            className="w-full bg-gradient-to-r from-amber-900/30 to-amber-800/30 border border-amber-700/50 rounded-xl p-4 flex items-center justify-between hover:from-amber-900/40 hover:to-amber-800/40 transition-all duration-200 group"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-amber-600/20 border border-amber-600/40 rounded-xl flex items-center justify-center">
                <SettingIcon size="24px" className="text-amber-500" />
              </div>
              <div className="text-left">
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-amber-200 transition-colors">
                  后台管理
                </h4>
                <p className="text-[11px] text-neutral-500">系统管理 · 数据统计 · 用户管理</p>
              </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-amber-600/20 flex items-center justify-center group-hover:bg-amber-600/30 transition-colors">
              <ChevronRightIcon size="16px" className="text-amber-500 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </button>

          {/* 快捷导航 */}
          <QuickNav
            activeKey={activeNav}
            items={defaultNavItems}
            onChange={setActiveNav}
          />

          {/* 功能区域 */}
          {activeNav === 'account' && (
            <FunctionGrid
              title="常用功能"
              items={accountFunctions.map(item => ({
                ...item,
                onClick: () => (item.onClick as any)(navigate)
              }))}
              columns={2}
            />
          )}

          {activeNav === 'security' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-4 bg-amber-700 rounded-full" />
                <h3 className="text-sm font-bold text-white">安全设置</h3>
              </div>
              {securityItems.map((item, index) => (
                <button
                  key={index}
                  onClick={() => (item.onClick as any)()}
                  className="w-full bg-neutral-900/80 border border-neutral-800/80 rounded-xl p-4 flex items-center justify-between hover:bg-neutral-800/80 hover:border-neutral-700 transition-all duration-200 group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-amber-700/20 to-amber-900/20 border border-amber-700/30 rounded-xl flex items-center justify-center">
                      <span className="text-amber-600">{item.icon}</span>
                    </div>
                    <div className="text-left">
                      <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-amber-200 transition-colors">
                        {item.title}
                      </h4>
                      <p className="text-[11px] text-neutral-500">{item.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium ${
                      item.status === '已设置' || item.status === '已绑定' || item.status === '已认证'
                        ? 'text-green-600'
                        : 'text-neutral-500'
                    }`}>
                      {item.status}
                    </span>
                    <ChevronRightIcon size="16px" className="text-neutral-600 group-hover:text-neutral-500 transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          )}

          {activeNav === 'notice' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-4 bg-amber-700 rounded-full" />
                <h3 className="text-sm font-bold text-white">系统公告</h3>
              </div>
              {systemNotices.map((notice) => (
                <button
                  key={notice.id}
                  onClick={() => handleNoticeClick(notice)}
                  className="w-full bg-neutral-900/80 border border-neutral-800/80 rounded-xl p-4 text-left hover:bg-neutral-800/80 hover:border-neutral-700 transition-all duration-200"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h4 className={`text-sm font-semibold ${
                      notice.read ? 'text-neutral-400' : 'text-white'
                    }`}>
                      {notice.title}
                    </h4>
                    {!notice.read && (
                      <Badge count="NEW" color="#14532d" shape="round" size="small" />
                    )}
                  </div>
                  <p className="text-xs text-neutral-500 mb-2 leading-relaxed">{notice.content}</p>
                  <p className="text-[10px] text-neutral-600 font-mono">{notice.date}</p>
                </button>
              ))}
            </div>
          )}

        onClose={() => setEditProfileVisible(false)}
        userData={userData}
        onSave={handleProfileSave}
      />

      {/* 修改密码弹窗 */}
      <ChangePasswordDialog
        visible={changePasswordVisible}
        onClose={() => setChangePasswordVisible(false)}
        onSave={handlePasswordChange}
      />

      {/* 公告详情弹窗 */}
      <NoticeDetailDialog
        visible={noticeDetailVisible}
        notice={selectedNotice}
        onClose={() => setNoticeDetailVisible(false)}
      />
    </div>
  );
}


