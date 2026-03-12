import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, Button, MessagePlugin } from 'tdesign-react';
import { MailIcon, ArrowLeftIcon } from 'tdesign-icons-react';
import AuthLayout from '../components/auth/AuthLayout';
import { sendVerificationCode, resetPassword } from '../services/auth';

// 双语字典
const i18n = {
  zh: {
    title: '重置密码',
    subtitle: '输入邮箱并获取验证码',
    subtitleNewPassword: '请输入新密码',
    emailLabel: '邮箱地址',
    emailPlaceholder: '请输入注册邮箱',
    codeLabel: '验证码',
    codePlaceholder: '请输入验证码',
    sendCode: '发送验证码',
    codeSent: '已发送',
    passwordLabel: '新密码',
    passwordPlaceholder: '至少6位字母数字组合',
    confirmPasswordLabel: '确认新密码',
    confirmPasswordPlaceholder: '再次输入新密码',
    submitButton: '重置密码',
    sending: '发送中…',
    resetting: '重置中…',
    backToSignIn: '返回登录',
    aiHint: '验证码已发送到您的邮箱',
    success: '密码重置成功！',
    // 错误提示
    errorEmail: '请输入您的邮箱',
    errorEmailInvalid: '请输入有效的邮箱',
    errorCode: '请输入验证码',
    errorPassword: '请输入密码',
    errorPasswordLength: '密码至少需要 6 个字符',
    errorPasswordFormat: '密码必须包含字母和数字',
    passwordMismatch: '两次输入的密码不一致',
  },
  en: {
    title: 'Reset Password',
    subtitle: 'Enter email and get verification code',
    subtitleNewPassword: 'Enter your new password',
    emailLabel: 'Email Address',
    emailPlaceholder: 'Enter your registered email',
    codeLabel: 'Verification Code',
    codePlaceholder: 'Enter verification code',
    sendCode: 'Send Code',
    codeSent: 'Sent',
    passwordLabel: 'New Password',
    passwordPlaceholder: 'At least 6 characters, letters & numbers',
    confirmPasswordLabel: 'Confirm New Password',
    confirmPasswordPlaceholder: 'Confirm your new password',
    submitButton: 'Reset Password',
    sending: 'Sending...',
    resetting: 'Resetting...',
    backToSignIn: 'Back to Sign In',
    aiHint: 'Verification code sent to your email',
    success: 'Password reset successfully!',
    // 错误提示
    errorEmail: 'Please enter your email',
    errorEmailInvalid: 'Please enter a valid email',
    errorCode: 'Please enter verification code',
    errorPassword: 'Please enter password',
    errorPasswordLength: 'Password must be at least 6 characters',
    errorPasswordFormat: 'Password must contain letters and numbers',
    passwordMismatch: 'Passwords do not match',
  },
};

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const t = i18n[lang];

  // 检查是否包含字母和数字
  const hasLettersAndNumbers = (str: string): boolean => {
    const hasLetters = /[a-zA-Z]/.test(str);
    const hasNumbers = /[0-9]/.test(str);
    return hasLetters && hasNumbers;
  };

  const handleSendCode = async () => {
    if (!email) {
      MessagePlugin.error(t.errorEmail);
      return;
    }
    if (!email.includes('@')) {
      MessagePlugin.error(t.errorEmailInvalid);
      return;
    }

    setLoading(true);
    try {
      await sendVerificationCode(email);
      setCodeSent(true);
      MessagePlugin.success('Verification code sent');
      // 开始倒计时
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (error: any) {
      MessagePlugin.error(error.message || '发送验证码失败');
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    if (!email) {
      MessagePlugin.error(t.errorEmail);
      return false;
    }
    if (!email.includes('@')) {
      MessagePlugin.error(t.errorEmailInvalid);
      return false;
    }
    if (!code) {
      MessagePlugin.error(t.errorCode);
      return false;
    }
    if (!password) {
      MessagePlugin.error(t.errorPassword);
      return false;
    }
    if (password.length < 6) {
      MessagePlugin.error(t.errorPasswordLength);
      return false;
    }
    if (!hasLettersAndNumbers(password)) {
      MessagePlugin.error(t.errorPasswordFormat);
      return false;
    }
    if (password !== confirmPassword) {
      MessagePlugin.error(t.passwordMismatch);
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setResetting(true);
    try {
      await resetPassword({ email, code, newPassword: password });
      MessagePlugin.success(t.success);
      navigate('/login');
    } catch (error: any) {
      MessagePlugin.error(error.message || '重置密码失败');
    } finally {
      setResetting(false);
    }
  };

  const handleBackToLogin = () => {
    navigate('/login');
  };

  return (
    <AuthLayout type="forgot">
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
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-white mb-1.5">{t.title}</h1>
        <p className="text-slate-400 text-sm">
          {t.subtitle}
        </p>
      </div>

      {/* AI 提示 */}
      {codeSent && (
        <div className="mb-5 p-3 bg-green-900/20 rounded-lg border border-green-500/30">
          <p className="text-green-300/80 text-xs text-center">
            {t.aiHint}
          </p>
        </div>
      )}

      {/* 表单 */}
      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="space-y-4">
        {/* 邮箱输入 */}
        <div>
          <label className="block text-slate-300 text-xs mb-1.5 font-medium">
            {t.emailLabel}
          </label>
          <div className="flex gap-2">
            <Input
              size="medium"
              placeholder={t.emailPlaceholder}
              value={email}
              onChange={(val) => setEmail(val as string)}
              prefixIcon={<MailIcon />}
              disabled={codeSent}
              className="!bg-slate-900/50 !border-slate-700 !text-white !py-2 focus:!border-blue-500 focus:!ring-1 focus:!ring-blue-500/20 flex-1"
            />
            <Button
              size="medium"
              theme="primary"
              onClick={handleSendCode}
              loading={loading}
              disabled={codeSent || countdown > 0}
              className="!bg-blue-600 hover:!bg-blue-500 !text-white !font-medium !border-0 !whitespace-nowrap"
            >
              {loading ? t.sending : (countdown > 0 ? `${countdown}s` : (codeSent ? t.codeSent : t.sendCode))}
            </Button>
          </div>
        </div>

        {/* 验证码输入 */}
        {codeSent && (
          <div>
            <label className="block text-slate-300 text-xs mb-1.5 font-medium">
              {t.codeLabel}
            </label>
            <Input
              size="medium"
              placeholder={t.codePlaceholder}
              value={code}
              onChange={(val) => setCode(val as string)}
              className="!bg-slate-900/50 !border-slate-700 !text-white !py-2 focus:!border-blue-500 focus:!ring-1 focus:!ring-blue-500/20"
            />
          </div>
        )}

        {/* 新密码输入 */}
        {codeSent && (
          <div>
            <label className="block text-slate-300 text-xs mb-1.5 font-medium">
              {t.passwordLabel}
            </label>
            <Input
              size="medium"
              type="password"
              placeholder={t.passwordPlaceholder}
              value={password}
              onChange={(val) => setPassword(val as string)}
              className="!bg-slate-900/50 !border-slate-700 !text-white !py-2 focus:!border-blue-500 focus:!ring-1 focus:!ring-blue-500/20"
            />
          </div>
        )}

        {/* 确认新密码输入 */}
        {codeSent && (
          <div>
            <label className="block text-slate-300 text-xs mb-1.5 font-medium">
              {t.confirmPasswordLabel}
            </label>
            <Input
              size="medium"
              type="password"
              placeholder={t.confirmPasswordPlaceholder}
              value={confirmPassword}
              onChange={(val) => setConfirmPassword(val as string)}
              className="!bg-slate-900/50 !border-slate-700 !text-white !py-2 focus:!border-blue-500 focus:!ring-1 focus:!ring-blue-500/20"
            />
          </div>
        )}

        {/* 重置按钮 */}
        {codeSent && (
          <Button
            size="medium"
            theme="primary"
            type="submit"
            loading={resetting}
            block
            className="!bg-blue-600 hover:!bg-blue-500 !text-white !font-semibold !border-0 !shadow-lg !shadow-blue-900/30 hover:!shadow-blue-900/50 transition-all !py-2.5"
          >
            {resetting ? t.resetting : t.submitButton}
          </Button>
        )}
      </form>

      {/* 返回登录 */}
      <div className="text-center mt-5">
        <Button
          variant="text"
          theme="default"
          size="small"
          onClick={handleBackToLogin}
          className="!text-slate-400 hover:!text-slate-300 text-xs"
        >
          <ArrowLeftIcon size="12px" className="mr-1" />
          {t.backToSignIn}
        </Button>
      </div>
    </AuthLayout>
  );
}
