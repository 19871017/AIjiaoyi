import { useState } from 'react';
import { Dialog, Form, Input, Upload, Button, MessagePlugin } from 'tdesign-react';
import { UploadIcon, CameraIcon } from 'tdesign-icons-react';
import { updateProfile } from '../../services/profile';

interface EditProfileDialogProps {
  visible: boolean;
  onClose: () => void;
  userData: {
    name: string;
    phone: string;
    email?: string;
    avatar?: string;
  };
  onSave: (data: any) => void;
}

const EditProfileDialog: React.FC<EditProfileDialogProps> = ({
  visible,
  onClose,
  userData,
  onSave,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [formValue, setFormValue] = useState({
    name: userData.name || '',
    phone: userData.phone || '',
    email: userData.email || '',
    avatar: userData.avatar || '',
  });
  const [previewAvatar, setPreviewAvatar] = useState(userData.avatar || '');

  const handleSubmit = async () => {
    if (!formValue.name || !formValue.name.trim()) {
      MessagePlugin.error('请输入昵称');
      return;
    }

    if (formValue.name.length > 20) {
      MessagePlugin.error('昵称不能超过 20 个字符');
      return;
    }

    if (!formValue.phone || !/^1\d{10}$/.test(formValue.phone)) {
      MessagePlugin.error('请输入正确的手机号');
      return;
    }

    if (formValue.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formValue.email)) {
      MessagePlugin.error('请输入正确的邮箱地址');
      return;
    }

    setSubmitting(true);

    try {
      await updateProfile({
        name: formValue.name,
        phone: formValue.phone,
        email: formValue.email,
        avatar: previewAvatar,
      });

      // 调用保存回调
      onSave({
        ...formValue,
        avatar: previewAvatar,
      });

      MessagePlugin.success('个人信息修改成功');
      onClose();
    } catch (error) {
      MessagePlugin.error('修改失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAvatarChange = (files: any[]) => {
    if (files && files.length > 0) {
      const file = files[0].raw;
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewAvatar(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      header="编辑个人信息"
      width="500px"
      footer={null}
      className="!bg-gray-800 !text-white"
    >
      <div className="space-y-6">
        {/* 头像上传 */}
        <div className="flex justify-center">
          <div className="relative">
            {previewAvatar ? (
              <img
                src={previewAvatar}
                alt="头像"
                className="w-24 h-24 rounded-full object-cover border-4 border-amber-500"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gray-700 border-4 border-amber-500 flex items-center justify-center">
                <CameraIcon size="40px" className="text-gray-500" />
              </div>
            )}
            <Upload
              theme="file-input"
              accept="image/*"
              onChange={handleAvatarChange}
              className="absolute inset-0 opacity-0 cursor-pointer"
            >
              <Button
                size="small"
                theme="warning"
                variant="outline"
                icon={<CameraIcon size="16px" />}
                className="absolute bottom-0 right-0"
              >
                更换
              </Button>
            </Upload>
          </div>
        </div>

        {/* 昵称 */}
        <div>
          <div className="text-white font-medium mb-2">昵称</div>
          <Input
            placeholder="请输入昵称"
            value={formValue.name}
            onChange={(value) => setFormValue({ ...formValue, name: value })}
            maxLength={20}
            className="!bg-gray-700/50 !text-white"
          />
          <div className="text-gray-400 text-xs mt-1">2-20 个字符</div>
        </div>

        {/* 手机号 */}
        <div>
          <div className="text-white font-medium mb-2">手机号</div>
          <Input
            placeholder="请输入手机号"
            value={formValue.phone}
            onChange={(value) => setFormValue({ ...formValue, phone: value })}
            maxLength={11}
            className="!bg-gray-700/50 !text-white"
          />
          <div className="text-gray-400 text-xs mt-1">
            用于接收重要通知和验证码
          </div>
        </div>

        {/* 邮箱 */}
        <div>
          <div className="text-white font-medium mb-2">邮箱（选填）</div>
          <Input
            placeholder="请输入邮箱地址"
            value={formValue.email}
            onChange={(value) => setFormValue({ ...formValue, email: value })}
            className="!bg-gray-700/50 !text-white"
          />
          <div className="text-gray-400 text-xs mt-1">
            用于接收重要通知
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
            {submitting ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
};

export default EditProfileDialog;
