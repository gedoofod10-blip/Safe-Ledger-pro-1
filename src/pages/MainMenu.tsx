import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppHeader from '@/components/AppHeader';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { Plus, FileText, Settings, Share2, Info, LogOut, UserPlus, ChevronLeft } from 'lucide-react';

const MainMenu = () => {
  const navigate = useNavigate();
  const [showAbout, setShowAbout] = useState(false);

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: 'دفتر الحسابات الآمن', url: window.location.origin });
    } else {
      navigator.clipboard.writeText(window.location.origin);
      toast.success('تم النسخ ✓');
    }
  };

  const menuItems = [
    { icon: UserPlus, label: 'إضافة عميل', color: 'text-blue-600', bg: 'bg-blue-50/50 border-blue-100', action: () => navigate('/clients') },
    { icon: Plus, label: 'إضافة مبلغ', color: 'text-green-600', bg: 'bg-green-50/50 border-green-100', action: () => navigate('/add-transaction') },
    { icon: FileText, label: 'التقارير الشاملة', color: 'text-purple-600', bg: 'bg-purple-50/50 border-purple-100', action: () => navigate('/reports') },
    { icon: Settings, label: 'الإعدادات', color: 'text-gray-600', bg: 'bg-gray-50/50 border-gray-200', action: () => navigate('/settings') },
    { icon: Share2, label: 'مشاركة التطبيق', color: 'text-cyan-600', bg: 'bg-cyan-50/50 border-cyan-100', action: handleShare },
    { icon: Info, label: 'حول البرنامج', color: 'text-amber-600', bg: 'bg-amber-50/50 border-amber-100', action: () => setShowAbout(true) },
    { icon: LogOut, label: 'خروج', color: 'text-red-600', bg: 'bg-red-50/50 border-red-100', action: () => navigate('/clients') },
  ];

  return (
    <div className="min-h-screen bg-background pb-6 flex flex-col" dir="rtl">
      <AppHeader title="القائمة الرئيسية" showBack />
      
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="flex flex-col gap-3">
          {menuItems.map((item, i) => (
            <button
              key={i}
              onClick={item.action}
              className={`w-full flex items-center gap-4 p-4 rounded-2xl border active:scale-95 transition-all shadow-sm ${item.bg}`}
            >
              <div className="p-3 rounded-xl bg-white shadow-sm flex-shrink-0">
                <item.icon className={`w-6 h-6 ${item.color}`} />
              </div>
              <span className="text-base font-bold text-gray-800 text-right flex-1">{item.label}</span>
              <ChevronLeft className="w-5 h-5 text-gray-400" />
            </button>
          ))}
        </div>
      </div>

      {showAbout && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in" onClick={() => setShowAbout(false)}>
          <Card className="w-full max-w-xs shadow-2xl rounded-3xl" onClick={e => e.stopPropagation()}>
            <CardContent className="p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-[#5D4037]/10 rounded-full flex items-center justify-center mx-auto">
                <Info className="w-8 h-8 text-[#5D4037]" />
              </div>
              <h2 className="text-xl font-bold">دفتر الحسابات</h2>
              <p className="text-sm text-gray-500">إدارة حسابات آمنة ومشفرة بالكامل.</p>
              <p className="text-sm font-black" dir="ltr">+249 11 486 6251</p>
              <button onClick={() => setShowAbout(false)} className="w-full bg-[#5D4037] text-white py-3 rounded-xl font-bold mt-2">إغلاق</button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default MainMenu;
