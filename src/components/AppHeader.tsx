import { useState } from 'react';
import { ArrowRight, Search, Menu, X, UserPlus, Plus, FileText, Settings, Share2, Info, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import NotificationBell from '@/components/NotificationBell';
import { toast } from 'sonner';

interface AppHeaderProps {
  title: string | React.ReactNode;
  showBack?: boolean;
  showSearch?: boolean;
  showMenu?: boolean;
  showNotifications?: boolean;
  onMenuClick?: () => void;
  onSearchClick?: () => void;
  actions?: React.ReactNode;
}

const AppHeader = ({ title, showBack, showSearch, showMenu, showNotifications, onMenuClick, onSearchClick, actions }: AppHeaderProps) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ 
        title: 'دفتر الحسابات الآمن', 
        text: 'تطبيق دفتر حسابات آمن لإدارة ديونك وحساباتك بسهولة', 
        url: window.location.origin 
      });
    } else {
      navigator.clipboard.writeText(window.location.origin);
      toast.success('تم نسخ رابط التطبيق ✓');
    }
  };

  const menuItems = [
    { icon: UserPlus, label: 'إضافة عميل', color: 'text-blue-600', bg: 'bg-blue-50', action: () => navigate('/clients') },
    { icon: Plus, label: 'إضافة مبلغ', color: 'text-green-600', bg: 'bg-green-50', action: () => navigate('/add-transaction') },
    { icon: FileText, label: 'التقارير الشاملة', color: 'text-purple-600', bg: 'bg-purple-50', action: () => navigate('/reports') },
    { icon: Settings, label: 'الإعدادات', color: 'text-gray-600', bg: 'bg-gray-50', action: () => navigate('/settings') },
    { icon: Share2, label: 'مشاركة التطبيق', color: 'text-cyan-600', bg: 'bg-cyan-50', action: handleShare },
    { icon: Info, label: 'حول البرنامج', color: 'text-amber-600', bg: 'bg-amber-50', action: () => { toast.info('نسخة المحترف V2.0'); } },
  ];

  return (
    <>
      <header className="bg-[#5D4037] text-white flex items-center justify-between px-4 py-3 sticky top-0 z-50 shadow-md h-14">
        <div className="flex items-center gap-3 overflow-hidden">
          {showMenu && (
            <button onClick={() => setIsOpen(true)} className="p-1 active:scale-90 transition-transform">
              <Menu className="w-7 h-7 text-white" />
            </button>
          )}
          {showBack && (
            <button onClick={() => navigate(-1)} className="p-1 active:scale-90 transition-transform">
              <ArrowRight className="w-7 h-7 text-white" />
            </button>
          )}
          <h1 className="text-lg font-bold truncate max-w-[50vw]">{title}</h1>
        </div>
        
        <div className="flex items-center gap-2">
          {showNotifications && <NotificationBell />}
          {showSearch && (
            <button onClick={onSearchClick} className="p-1 active:scale-90 transition-transform">
              <Search className="w-6 h-6 text-white" />
            </button>
          )}
          {actions}
        </div>
      </header>

      {/* القائمة الجانبية (Sidebar) بتصميم المستطيلات */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex animate-fade-in" dir="rtl">
          {/* الخلفية المظلمة */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
          
          {/* محتوى القائمة */}
          <div className="relative w-[280px] bg-white h-full shadow-2xl flex flex-col animate-slide-in-right">
            <div className="bg-[#5D4037] p-6 text-white">
              <div className="flex justify-between items-center mb-4">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                  <FileText className="w-7 h-7 text-white" />
                </div>
                <button onClick={() => setIsOpen(false)} className="p-1 bg-white/10 rounded-full">
                  <X className="w-6 h-6 text-white" />
                </button>
              </div>
              <h2 className="text-xl font-black">دفتر الحسابات</h2>
              <p className="text-xs opacity-70 font-bold mt-1">الإدارة المالية الذكية</p>
            </div>

            <div className="flex-1 p-4 flex flex-col gap-3 overflow-y-auto">
              {menuItems.map((item, i) => (
                <button
                  key={i}
                  onClick={() => { item.action(); setIsOpen(false); }}
                  className={`w-full flex items-center gap-4 p-3.5 rounded-xl border border-transparent active:scale-[0.98] transition-all shadow-sm ${item.bg}`}
                >
                  <div className={`p-2 rounded-lg bg-white shadow-sm ${item.color}`}>
                    <item.icon className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-bold text-gray-800 flex-1 text-right">{item.label}</span>
                  <ChevronLeft className="w-4 h-4 text-gray-400" />
                </button>
              ))}
            </div>

            <div className="p-4 border-t border-gray-100">
               <p className="text-[10px] text-center text-gray-400 font-bold">إصدار V2.0.4 | 2026</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AppHeader;
