import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, Button, Checkbox, MessagePlugin } from 'tdesign-react';
import { UserIcon, LockOnIcon, ShopIcon, ChartIcon } from 'tdesign-icons-react';
import { adminApi } from '../services/admin';

export default function AgentLogin() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [form, setForm] = useState({
    username: '',
    password: ''
  });

  const setFieldValue = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  // 从本地存储恢复记住的用户名
  useEffect(() => {
    const remembered = localStorage.getItem('agentRemember');
    if (remembered) {
      const { username } = JSON.parse(remembered);
      setFieldValue('username', username);
      setRememberMe(true);
    }

  }, []);

  // 提交登录
  const handleSubmit = async () => {
    if (!form.username) {
      MessagePlugin.warning('请输入用户名或代理ID');
      return;
    }
    if (!form.password) {
      MessagePlugin.warning('请输入密码');
      return;
    }

    setLoading(true);
    try {
      // 真实 API 登录
      const response = await fetch('/admin/agent/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: form.username,
          password: form.password
        })
      });

      if (!response.ok) {
        throw new Error('登录请求失败');
      }

      const loginData = await response.json();

      if (loginData.code === 0) {
        const { agentId, agentCode, agentType, username, realName, phone, totalBalance, availableBalance } = loginData.data;

        // 保存代理信息到 localStorage
        localStorage.setItem('agentInfo', JSON.stringify({
          agentId,
          agentCode,
          agentType,
          username,
          realName,
          phone,
          totalBalance,
          availableBalance,
          loginTime: new Date().toISOString()
        }));

        // 保存 token（如果有）
        if (loginData.data.token) {
          localStorage.setItem('agentToken', loginData.data.token);
        }

        if (rememberMe) {
          localStorage.setItem('agentRemember', JSON.stringify({ username: form.username }));
        } else {
          localStorage.removeItem('agentRemember');
        }

        MessagePlugin.success(`欢迎回来，${realName}`);
        navigate('/agent/dashboard');
      } else {
        MessagePlugin.error(loginData.message || '登录失败');
      }
    } catch (error: any) {
      console.error('登录失败:', error);
      MessagePlugin.error(error.message || '登录失败，请检查用户名和密码');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  // 快速填充测试账号
  const fillTestAccount = (username: string) => {
    setForm({ username, password: 'agent123' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex">
      {/* 左侧：品牌和功能展示 */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-emerald-950/40 to-slate-950/60 relative overflow-hidden">
        {/* 装饰性背景 */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 opacity-10">
            <svg className="w-full h-full" viewBox="0 0 400 600" fill="none">
              {[50, 120, 200, 280, 350].map((x, i) => (
                <line
                  key={`v-${i}`}
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={600}
                  stroke="currentColor"
                  strokeWidth="0.5"
                  className="text-emerald-500/30"
                />
              ))}
              {[100, 200, 300, 400, 500].map((y, i) => (
                <line
                  key={`h-${i}`}
                  x1={0}
                  y1={y}
                  x2={400}
                  y2={y}
                  stroke="currentColor"
                  strokeWidth="0.5"
                  className="text-emerald-500/30"
                />
              ))}
            </svg>
          </div>
        </div>

        {/* 内容区 */}
        <div className="relative z-10 flex flex-col justify-center items-center h-full p-12">
          {/* LOGO */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-14 h-14 bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-900/30">
                <ShopIcon size="28px" style={{ color: '#fff' }} />
              </div>
              <div>
                <span className="text-2xl font-bold text-white tracking-tight">代理管理系统</span>
                <p className="text-emerald-300/70 text-sm">Agent Management System</p>
              </div>
            </div>
          </div>

          {/* 核心功能 */}
          <div className="space-y-4 w-full max-w-md">
            <div className="flex items-center gap-4 p-4 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10">
              <div className="flex-shrink-0 w-10 h-10 bg-emerald-600/20 rounded-lg flex items-center justify-center border border-emerald-500/30">
                <UserIcon size="20px" style={{ color: '#34d399' }} />
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm">客户管理</h3>
                <p className="text-emerald-300/60 text-xs">高效管理您的客户资源</p>
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10">
              <div className="flex-shrink-0 w-10 h-10 bg-emerald-600/20 rounded-lg flex items-center justify-center border border-emerald-500/30">
                <ChartIcon size="20px" style={{ color: '#34d399' }} />
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm">佣金结算</h3>
                <p className="text-emerald-300/60 text-xs">实时查看佣金收益</p>
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10">
              <div className="flex-shrink-0 w-10 h-10 bg-emerald-600/20 rounded-lg flex items-center justify-center border border-emerald-500/30">
                <ShopIcon size="20px" style={{ color: '#34d399' }} />
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm">数据分析</h3>
                <p className="text-emerald-300/60 text-xs">多维度业务数据分析</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 右侧：登录表单 */}
      <div className="flex-1 flex items-center justify-center p-4 lg:p-12">
        <div className="w-full max-w-md">
          {/* 移动端 Logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-xl flex items-center justify-center">
              <ShopIcon size="24px" style={{ color: '#fff' }} />
            </div>
            <span className="text-xl font-bold text-white">代理管理系统</span>
          </div>

          {/* 登录卡片 */}
          <div className="bg-slate-900/80 backdrop-blur-sm rounded-2xl p-8 border border-slate-800 shadow-2xl">
            {/* 标题 */}
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-white mb-2">代理登录</h1>
              <p className="text-slate-400 text-sm">总代理 / 分代理 统一入口</p>
            </div>

            {/* 快速填充测试账号 */}
            <div className="mb-6 p-4 bg-emerald-900/20 border border-emerald-700/50 rounded-lg">
              <p className="text-emerald-300 text-xs mb-3 font-medium">点击快速填充测试账号：</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fillTestAccount('agent001')}
                  className="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded-lg transition-colors"
                >
                  总代理 (agent001)
                </button>
                <button
                  type="button"
                  onClick={() => fillTestAccount('agent002')}
                  className="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded-lg transition-colors"
                >
                  分代理 (agent002)
                </button>
              </div>
            </div>

            {/* 表单 */}
            <form className="space-y-5">
              {/* 用户名/代理ID */}
              <div>
                <label className="block text-slate-300 text-xs mb-2 font-medium">
                  用户名 / 代理ID
                </label>
                <Input
                  size="medium"
                  placeholder="请输入用户名或代理ID"
                  value={form.username}
                  onChange={(val) => setFieldValue('username', val as string)}
                  onKeyPress={handleKeyPress}
                  prefixIcon={<UserIcon />}
                  className="!bg-slate-900/50 !border-slate-700 !text-white !py-2.5 focus:!border-emerald-500 focus:!ring-1 focus:!ring-emerald-500/20"
                />
              </div>

              {/* 密码 */}
              <div>
                <label className="block text-slate-300 text-xs mb-2 font-medium">
                  密码
                </label>
                <Input
                  size="medium"
                  type="password"
                  placeholder="请输入密码"
                  value={form.password}
                  onChange={(val) => setFieldValue('password', val as string)}
                  onKeyPress={handleKeyPress}
                  prefixIcon={<LockOnIcon />}
                  className="!bg-slate-900/50 !border-slate-700 !text-white !py-2.5 focus:!border-emerald-500 focus:!ring-1 focus:!ring-emerald-500/20"
                />
              </div>

              {/* 登录按钮 */}
              <Button
                size="medium"
                theme="primary"
                type="submit"
                loading={loading}
                block
                onClick={handleSubmit}
                className="!bg-emerald-600 hover:!bg-emerald-500 !text-white !font-semibold !border-0 !shadow-lg !shadow-emerald-900/30 hover:!shadow-emerald-900/50 transition-all !py-2.5"
              >
                {loading ? '登录中...' : '登录系统'}
              </Button>
            </form>

            {/* 分割线 */}
            <div className="flex items-center gap-4 my-6">
              <div className="flex-1 h-px bg-slate-700/50" />
              <span className="text-slate-500 text-xs">快捷入口</span>
              <div className="flex-1 h-px bg-slate-700/50" />
            </div>

            {/* 底部链接 */}
            <div className="space-y-3">
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="text-slate-400 text-xs hover:text-slate-300 transition-colors"
                >
                  返回用户登录页面
                </button>
              </div>

            </div>
          </div>

          {/* 版权信息 */}
          <div className="text-center mt-6">
            <p className="text-slate-600 text-[11px]">
              贵金属交易系统 © 2024 · 代理管理后台
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}





