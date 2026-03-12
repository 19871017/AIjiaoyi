import { User, Lock, Bell, HelpCircle } from 'lucide-react';

interface NavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  count?: number;
}

interface QuickNavProps {
  activeKey: string;
  items: NavItem[];
  onChange: (key: string) => void;
}

export default function QuickNav({ activeKey, items, onChange }: QuickNavProps) {
  return (
    <div className="bg-neutral-900/60 backdrop-blur-sm border border-neutral-800 rounded-2xl p-2">
      <div className="grid grid-cols-4 gap-1">
        {items.map((item) => (
          <button
            key={item.key}
            onClick={() => onChange(item.key)}
            className={`relative flex flex-col items-center gap-2 py-3 px-2 rounded-xl transition-all duration-200 ${
              activeKey === item.key
                ? 'bg-amber-900/30 text-amber-400'
                : 'text-neutral-500 hover:text-neutral-400 hover:bg-neutral-800/50'
            }`}
          >
            {/* 徽章 */}
            {item.count && item.count > 0 && (
              <div className="absolute top-2 right-2 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {item.count > 99 ? '99+' : item.count}
              </div>
            )}

            {/* 图标 */}
            <span className="text-xl">{item.icon}</span>

            {/* 标签 */}
            <span className={`text-xs font-medium whitespace-nowrap ${
              activeKey === item.key ? 'text-amber-400' : ''
            }`}>
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// 默认导航项
export const defaultNavItems: NavItem[] = [
  { key: 'account', label: '账户管理', icon: <User size={20} /> },
  { key: 'security', label: '安全设置', icon: <Lock size={20} /> },
  { key: 'notice', label: '系统公告', icon: <Bell size={20} />, count: 2 },
  { key: 'help', label: '帮助中心', icon: <HelpCircle size={20} /> },
];
