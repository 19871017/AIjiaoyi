import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, Button, Alert, MessagePlugin } from 'tdesign-react';
import { UserIcon, LockOnIcon, CallIcon, MailIcon, CheckIcon, CloseIcon } from 'tdesign-icons-react';
import AuthLayout from '../components/auth/AuthLayout';
import axios from 'axios';

// 双语字典
const i18n = {
  zh: {
    title: '创建账号',
    subtitle: '加入我们的 AI 交易工作空间',
    inviteLabel: '邀请码',
    invitePlaceholder: '请输入邀请码',
    usernameLabel: '用户名',
    usernamePlaceholder: '请输入用户名',
    realNameLabel: '真实姓名',
    realNamePlaceholder: '请输入真实姓名',
    phoneLabel: '手机号',
    phonePlaceholder: '请输入手机号',
    emailLabel: '邮箱（可选）',
    emailPlaceholder: '请输入邮箱',
    passwordLabel: '密码',
    passwordPlaceholder: '请输入密码（至少6位）',
    confirmPasswordLabel: '确认密码',
    confirmPasswordPlaceholder: '请再次输入密码',
    securityCodeLabel: '安全码',
    securityCodePlaceholder: '用于修改密码/提现（至少4位）',
    confirmSecurityCodeLabel: '确认安全码',
    confirmSecurityCodePlaceholder: '请再次输入安全码',
    validating: '验证邀请码中…',
    inviteSuccess: '邀请码验证成功',
    inviteError: '邀请码无效',
    inviteErrorDesc: '请检查邀请码是否正确，或联系您的推荐人',
    registerButton: '立即注册',
    registering: 'AI 处理中…',
    hasAccount: '已有账号？',
    loginNow: '立即登录',
    agreeTerms: '注册即表示您同意',
    userAgreement: '用户协议',
    privacyPolicy: '隐私政策',
  },
  en: {
    title: 'Create Account',
    subtitle: 'Join our AI trading workspace',
    inviteLabel: 'Invite Code',
    invitePlaceholder: 'Enter invite code',
    usernameLabel: 'Username',
    usernamePlaceholder: 'Enter username',
    realNameLabel: 'Real Name',
    realNamePlaceholder: 'Enter real name',
    phoneLabel: 'Phone',
    phonePlaceholder: 'Enter phone number',
    emailLabel: 'Email (Optional)',
    emailPlaceholder: 'Enter email',
    passwordLabel: 'Password',
    passwordPlaceholder: 'Enter password (min 6 chars)',
    confirmPasswordLabel: 'Confirm Password',
    confirmPasswordPlaceholder: 'Enter password again',
    securityCodeLabel: 'Security Code',
    securityCodePlaceholder: 'For password/withdraw (min 4 chars)',
    confirmSecurityCodeLabel: 'Confirm Security Code',
    confirmSecurityCodePlaceholder: 'Enter security code again',
    validating: 'Validating invite code…',
    inviteSuccess: 'Invite code verified',
    inviteError: 'Invalid invite code',
    inviteErrorDesc: 'Please check the invite code or contact your referrer',
    registerButton: 'Create Account',
    registering: 'AI Processing...',
    hasAccount: 'Already have an account?',
    loginNow: 'Sign In',
    agreeTerms: 'By registering, you agree to our',
    userAgreement: 'User Agreement',
    privacyPolicy: 'Privacy Policy',
  },
};

interface RegisterData {
  username: string;
  password: string;
  confirmPassword: string;
  securityCode: string;
  confirmSecurityCode: string;
  realName: string;
  phone: string;
  email?: string;
  agentCode: string;
}

export default function Register() {
  const navigate = useNavigate();
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const [loading, setLoading] = useState(false);
  const [validatingAgent, setValidatingAgent] = useState(false);
  const [agentValid, setAgentValid] = useState<boolean | null>(null);
  const [agentInfo, setAgentInfo] = useState<any>(null);

  const [form, setForm] = useState<RegisterData>({
    username: '',
    password: '',
    confirmPassword: '',
    securityCode: '',
    confirmSecurityCode: '',
    realName: '',
    phone: '',
    email: '',
    agentCode: ''
  });

  const t = i18n[lang];

  const setFieldValue = (field: keyof RegisterData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  // 从URL获取邀请码
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const inviteCode = urlParams.get('invite');
    if (inviteCode) {
      setFieldValue('agentCode', inviteCode);
      validateAgentCode(inviteCode);
    }
  }, []);

  // 验证代理代码
  const validateAgentCode = async (code: string) => {
    if (!code || code.length < 5) {
      setAgentValid(false);
      setAgentInfo(null);
      return;
    }

    setValidatingAgent(true);
    try {
      const response = await axios.post('/api/agent/validate-code', {
        agentCode: code
      });

      if (response.data.code === 0) {
        setAgentValid(true);
        setAgentInfo(response.data.data);
        MessagePlugin.success(`${t.inviteSuccess}：${response.data.data.agentName}`);
      } else {
        setAgentValid(false);
        setAgentInfo(null);
        MessagePlugin.error(t.inviteError);
      }
    } catch (error) {
      setAgentValid(false);
      setAgentInfo(null);
      console.error('验证邀请码失败:', error);
    } finally {
      setValidatingAgent(false);
    }
  };

  // 提交注册
  const handleSubmit = async () => {
    // 验证代理代码
    if (!agentValid) {
      MessagePlugin.error('请先验证邀请码');
      return;
    }

    // 验证必填字段
    if (!form.username || form.username.length < 3) {
      MessagePlugin.error('请输入用户名（至少3个字符）');
      return;
    }
    if (!form.realName) {
      MessagePlugin.error('请输入真实姓名');
      return;
    }
    if (!form.phone || !/^1[3-9]\d{9}$/.test(form.phone)) {
      MessagePlugin.error('请输入正确的手机号');
      return;
    }
    if (!form.password || form.password.length < 6) {
      MessagePlugin.error('请输入密码（至少6位）');
      return;
    }
    if (form.password !== form.confirmPassword) {
      MessagePlugin.error('两次输入的密码不一致');
      return;
    }
    if (!form.securityCode || form.securityCode.length < 4) {
      MessagePlugin.error('请输入安全码（至少4位）');
      return;
    }
    if (form.securityCode !== form.confirmSecurityCode) {
      MessagePlugin.error('两次输入的安全码不一致');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post('/api/auth/register', {
        username: form.username,
        password: form.password,
        securityCode: form.securityCode,
        realName: form.realName,
        phone: form.phone,
        email: form.email,
        agentCode: form.agentCode
      });

      if (response.data.code === 0) {
        MessagePlugin.success('注册成功，请登录');
        navigate('/login');
      } else {
        MessagePlugin.error(response.data.message || '注册失败');
      }
    } catch (error: any) {
      console.error('注册失败:', error);
      MessagePlugin.error(error.response?.data?.message || '注册失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout type="register">
      {/* 语言切换 */}
      <div className="absolute top-0 right-0">
        <button
          onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
          className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors border border-slate-700/50 rounded-lg hover:border-slate-600"
        >
          {lang === 'zh' ? 'EN' : '中文'}
        </button>
      </div>

      {/* 标题区 */}
      <div className="text-center mb-5">
        <h1 className="text-2xl font-bold text-white mb-1.5">{t.title}</h1>
        <p className="text-slate-400 text-sm">{t.subtitle}</p>
      </div>

      {/* 邀请码验证提示 */}
      {agentValid && agentInfo && (
        <Alert
          theme="success"
          message={t.inviteSuccess}
          description={`推荐人：${agentInfo.agentName} (${agentInfo.agentType === 1 ? '总代理' : '分代理'})`}
          className="mb-4 !bg-green-900/20 !border-green-700/50"
        />
      )}

      {agentValid === false && (
        <Alert
          theme="error"
          message={t.inviteError}
          description={t.inviteErrorDesc}
          className="mb-4 !bg-red-900/20 !border-red-700/50"
        />
      )}

      {/* 表单 */}
      <div className="space-y-4">
        {/* 邀请码 */}
        <div>
          <label className="block text-slate-300 text-xs mb-1.5 font-medium">
            {t.inviteLabel} <span className="text-red-400">*</span>
          </label>
          <Input
            size="medium"
            placeholder={t.invitePlaceholder}
            value={form.agentCode}
            onChange={(val) => setFieldValue('agentCode', val as string)}
            onBlur={() => validateAgentCode(form.agentCode)}
            disabled={validatingAgent}
            prefixIcon={<UserIcon />}
            suffixIcon={agentValid ? <CheckIcon className="text-green-400" /> : agentValid === false ? <CloseIcon className="text-red-400" /> : null}
            className="!bg-slate-900/50 !border-slate-700 !text-white !py-2 focus:!border-blue-500 focus:!ring-1 focus:!ring-blue-500/20"
          />
        </div>

        {validatingAgent && (
          <div className="text-center py-2 text-slate-400 text-xs animate-pulse">
            {t.validating}
          </div>
        )}

        {/* 用户名 */}
        <div>
          <label className="block text-slate-300 text-xs mb-1.5 font-medium">
            {t.usernameLabel} <span className="text-red-400">*</span>
          </label>
          <Input
            size="medium"
            placeholder={t.usernamePlaceholder}
            value={form.username}
            onChange={(val) => setFieldValue('username', val as string)}
            prefixIcon={<UserIcon />}
            className="!bg-slate-900/50 !border-slate-700 !text-white !py-2 focus:!border-blue-500 focus:!ring-1 focus:!ring-blue-500/20"
          />
        </div>

        {/* 真实姓名 */}
        <div>
          <label className="block text-slate-300 text-xs mb-1.5 font-medium">
            {t.realNameLabel} <span className="text-red-400">*</span>
          </label>
          <Input
            size="medium"
            placeholder={t.realNamePlaceholder}
            value={form.realName}
            onChange={(val) => setFieldValue('realName', val as string)}
            className="!bg-slate-900/50 !border-slate-700 !text-white !py-2 focus:!border-blue-500 focus:!ring-1 focus:!ring-blue-500/20"
          />
        </div>

        {/* 手机号 */}
        <div>
          <label className="block text-slate-300 text-xs mb-1.5 font-medium">
            {t.phoneLabel} <span className="text-red-400">*</span>
          </label>
          <Input
            size="medium"
            placeholder={t.phonePlaceholder}
            value={form.phone}
            onChange={(val) => setFieldValue('phone', val as string)}
            prefixIcon={<CallIcon />}
            className="!bg-slate-900/50 !border-slate-700 !text-white !py-2 focus:!border-blue-500 focus:!ring-1 focus:!ring-blue-500/20"
          />
        </div>

        {/* 邮箱（可选） */}
        <div>
          <label className="block text-slate-300 text-xs mb-1.5 font-medium">
            {t.emailLabel}
          </label>
          <Input
            size="medium"
            placeholder={t.emailPlaceholder}
            value={form.email}
            onChange={(val) => setFieldValue('email', val as string)}
            prefixIcon={<MailIcon />}
            className="!bg-slate-900/50 !border-slate-700 !text-white !py-2 focus:!border-blue-500 focus:!ring-1 focus:!ring-blue-500/20"
          />
        </div>

        {/* 密码 */}
        <div>
          <label className="block text-slate-300 text-xs mb-1.5 font-medium">
            {t.passwordLabel} <span className="text-red-400">*</span>
          </label>
          <Input
            size="medium"
            type="password"
            placeholder={t.passwordPlaceholder}
            value={form.password}
            onChange={(val) => setFieldValue('password', val as string)}
            prefixIcon={<LockOnIcon />}
            className="!bg-slate-900/50 !border-slate-700 !text-white !py-2 focus:!border-blue-500 focus:!ring-1 focus:!ring-blue-500/20"
          />
        </div>

        {/* 确认密码 */}
        <div>
          <label className="block text-slate-300 text-xs mb-1.5 font-medium">
            {t.confirmPasswordLabel} <span className="text-red-400">*</span>
          </label>
          <Input
            size="medium"
            type="password"
            placeholder={t.confirmPasswordPlaceholder}
            value={form.confirmPassword}
            onChange={(val) => setFieldValue('confirmPassword', val as string)}
            prefixIcon={<LockOnIcon />}
            className="!bg-slate-900/50 !border-slate-700 !text-white !py-2 focus:!border-blue-500 focus:!ring-1 focus:!ring-blue-500/20"
          />
        </div>

        {/* 安全码 */}
        <div>
          <label className="block text-slate-300 text-xs mb-1.5 font-medium">
            {t.securityCodeLabel} <span className="text-red-400">*</span>
          </label>
          <Input
            size="medium"
            type="password"
            placeholder={t.securityCodePlaceholder}
            value={form.securityCode}
            onChange={(val) => setFieldValue('securityCode', val as string)}
            prefixIcon={<LockOnIcon />}
            className="!bg-slate-900/50 !border-slate-700 !text-white !py-2 focus:!border-blue-500 focus:!ring-1 focus:!ring-blue-500/20"
          />
        </div>

        {/* 确认安全码 */}
        <div>
          <label className="block text-slate-300 text-xs mb-1.5 font-medium">
            {t.confirmSecurityCodeLabel} <span className="text-red-400">*</span>
          </label>
          <Input
            size="medium"
            type="password"
            placeholder={t.confirmSecurityCodePlaceholder}
            value={form.confirmSecurityCode}
            onChange={(val) => setFieldValue('confirmSecurityCode', val as string)}
            prefixIcon={<LockOnIcon />}
            className="!bg-slate-900/50 !border-slate-700 !text-white !py-2 focus:!border-blue-500 focus:!ring-1 focus:!ring-blue-500/20"
          />
        </div>

        {/* 注册按钮 */}
        <Button
          size="medium"
          theme="primary"
          type="submit"
          loading={loading}
          disabled={!agentValid}
          block
          onClick={handleSubmit}
          className="!bg-blue-600 hover:!bg-blue-500 !text-white !font-semibold !border-0 !shadow-lg !shadow-blue-900/30 hover:!shadow-blue-900/50 transition-all !py-2.5"
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-2 h-2 bg-white rounded-full ai-loading-dot"
                  style={{
                    animationDelay: `${i * 0.2}s`,
                  }}
                />
              ))}
            </div>
          ) : (
            t.registerButton
          )}
        </Button>
      </div>

      {/* 登录入口 */}
      <div className="text-center mt-5">
        <p className="text-slate-400 text-xs">
          {t.hasAccount}{' '}
          <Button
            variant="text"
            theme="primary"
            size="small"
            onClick={() => navigate('/login')}
            className="!text-blue-400 hover:!text-blue-300 !font-medium text-xs"
          >
            {t.loginNow}
          </Button>
        </p>
      </div>

      {/* 用户协议 */}
      <div className="text-center mt-3">
        <p className="text-slate-500 text-[11px]">
          {t.agreeTerms}{' '}
          <a href="#" className="text-blue-400 hover:text-blue-300">
            {t.userAgreement}
          </a>
          {' '}和{' '}
          <a href="#" className="text-blue-400 hover:text-blue-300">
            {t.privacyPolicy}
          </a>
        </p>
      </div>
    </AuthLayout>
  );
}
