import { useState } from 'react';
import { Dialog, Input, Button, MessagePlugin } from 'tdesign-react';
import { LockOnIcon, InfoCircleIcon } from 'tdesign-icons-react';
import { changePassword, getUser } from '../../services/auth';

interface ChangePasswordDialogProps {
  visible: boolean;
  onClose: () => void;
  onSave: () => void;
}

const ChangePasswordDialog: React.FC<ChangePasswordDialogProps> = ({
  visible,
  onClose,
  onSave,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [formValue, setFormValue] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
    securityCode: '',
  });
  const [showPassword, setShowPassword] = useState({
    old: false,
    new: false,
    confirm: false,
  });

  const validatePassword = (password: string) => {
    // 至少 8 位，包含字母和数字
    return password.length >= 8 && /[a-zA-Z]/.test(password) && /\d/.test(password);
  };

  const handleSubmit = async () => {
    if (!formValue.oldPassword) {
      MessagePlugin.error('请输入当前密码');
      return;
    }

    if (!formValue.newPassword) {
      MessagePlugin.error('请输入新密码');
      return;
    }

    if (!formValue.securityCode) {
      MessagePlugin.error('请输入安全码');
      return;
    }

    if (!validatePassword(formValue.newPassword)) {
      MessagePlugin.error('新密码必须至少 8 位，且包含字母和数字');
      return;
    }

    if (formValue.newPassword === formValue.oldPassword) {
      MessagePlugin.error('新密码不能与当前密码相同');
      return;
    }

    if (!formValue.confirmPassword) {
      MessagePlugin.error('请确认新密码');
      return;
    }

    if (formValue.newPassword !== formValue.confirmPassword) {
      MessagePlugin.error('两次输入的密码不一致');
      return;
    }

    setSubmitting(true);

    try {
      const user = getUser();
      if (!user) {
        MessagePlugin.error('未登录');
        return;
      }

      await changePassword({
        username: user.username,
        oldPassword: formValue.oldPassword,
        newPassword: formValue.newPassword,
        securityCode: formValue.securityCode
      });

      // 调用保存回调
      onSave();

      MessagePlugin.success('密码修改成功，请重新登录');

      // 重置表单
      setFormValue({
        oldPassword: '',
        newPassword: '',
        confirmPassword: '',
        securityCode: '',
      });

      onClose();
    } catch (error) {
      MessagePlugin.error('密码修改失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const getPasswordStrength = (password: string) => {
    if (!password) return 0;
    let strength = 0;
    if (password.length >= 8) strength += 1;
    if (password.length >= 12) strength += 1;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength += 1;
    if (/\d/.test(password)) strength += 1;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) strength += 1;
    return Math.min(strength, 5);
  };

  const strength = getPasswordStrength(formValue.newPassword);
  const strengthText = ['极弱', '弱', '中等', '强', '很强'][strength - 1] || '未设置';
  const strengthColor = ['text-red-400', 'text-orange-400', 'text-yellow-400', 'text-green-400', 'text-emerald-400'][strength - 1];

  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      header="修改登录密码"
      width="450px"
      footer={null}
      className="!bg-gray-800 !text-white"
    >
      <div className="space-y-5">
        {/* 密码要求说明 */}
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <div className="flex items-start gap-2">
            <InfoCircleIcon size="18px" className="text-amber-400 mt-0.5" />
            <div className="text-gray-300 text-sm">
              <div className="font-medium text-amber-400 mb-1">密码要求</div>
              <ul className="space-y-1 text-xs">
                <li>• 长度至少 8 位</li>
                <li>• 包含字母和数字</li>
                <li>• 建议包含特殊字符</li>
                <li>• 不能与当前密码相同</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 当前密码 */}
        <div>
          <div className="text-white font-medium mb-2">当前密码</div>
          <div className="relative">
            <Input
              type={showPassword.old ? 'text' : 'password'}
              placeholder="请输入当前密码"
              value={formValue.oldPassword}
              onChange={(value) =>
                setFormValue({ ...formValue, oldPassword: value })
              }
              className="!bg-gray-700/50 !text-white"
            />
          </div>
        </div>

        {/* 新密码 */}
        <div>
          <div className="text-white font-medium mb-2">新密码</div>
          <div className="relative">
            <Input
              type={showPassword.new ? 'text' : 'password'}
              placeholder="请输入新密码"
              value={formValue.newPassword}
              onChange={(value) =>
                setFormValue({ ...formValue, newPassword: value })
              }
              className="!bg-gray-700/50 !text-white"
            />
          </div>
          {formValue.newPassword && (
            <div className={`text-xs mt-2 ${strengthColor}`}>
              密码强度：<span className="font-medium">{strengthText}</span>
            </div>
          )}
        </div>

        {/* 确认新密码 */}
        <div>
          <div className="text-white font-medium mb-2">确认新密码</div>
          <div className="relative">
            <Input
              type={showPassword.confirm ? 'text' : 'password'}
              placeholder="请再次输入新密码"
              value={formValue.confirmPassword}
              onChange={(value) =>
                setFormValue({ ...formValue, confirmPassword: value })
              }
              className={`!bg-gray-700/50 !text-white ${
                formValue.confirmPassword &&
                formValue.newPassword !== formValue.confirmPassword
                  ? '!border-red-500'
                  : ''
              }`}
            />
            {formValue.confirmPassword &&
              formValue.newPassword !== formValue.confirmPassword && (
                <div className="text-red-400 text-xs mt-2">
                  两次输入的密码不一致
                </div>
              )}
          </div>
        </div>

        {/* 安全码 */}
        <div>
          <div className="text-white font-medium mb-2">安全码</div>
          <div className="relative">
            <Input
              type="password"
              placeholder="请输入安全码"
              value={formValue.securityCode}
              onChange={(value) =>
                setFormValue({ ...formValue, securityCode: value })
              }
              className="!bg-gray-700/50 !text-white"
            />
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-3">
          <Button
            theme="default"
            variant="outline"
            onClick={onClose}
            className="flex-1 !border-gray-600 !text-gray-300"
          >
            取消
          </Button>
          <Button
            theme="warning"
            variant="base"
            loading={submitting}
            onClick={handleSubmit}
            className="flex-1"
          >
            {submitting ? '修改中...' : '确认修改'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
};

export default ChangePasswordDialog;
