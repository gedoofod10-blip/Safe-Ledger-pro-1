import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppHeader from '@/components/AppHeader';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  Plus, Table2, FileText, Calendar, LayoutGrid,
  Settings, Share2, X, Info, LogOut, UserPlus, BarChart3
} from 'lucide-react';

const MainMenu = () => {
  const navigate = useNavigate();
  const [showAbout, setShowAbout] = useState(false);

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ 
        title: 'دفتر الحسابات الآمن', 
        text: 'تطبيق دفتر حسابات آمن ومشفر بالكامل لإدارة ديونك وحساباتك بسهولة', 
        url: window.location.origin 
      });
    } else {
      navigator.clipboard.writeText(window.location.origin);
      toast.success('تم نسخ رابط التطبيق ✓');
    }
  };

  const handleExit = () => {
    // في تطبيقات الويب لا يمكن إغلاق النافذة برمجياً إلا إذا فتحت بواسطة script
    // لذا سنقوم بالتوجيه للصفحة الرئيسية كبديل
    navigate('/clients');
  };

  const menuItems = [
    { icon: UserPlus, label: 'إضافة عميل', color: 'bg-blue-500/10 text-blue-600', action: () => navigate('/clients') },
    { icon: Plus, label: 'إضافة مبلغ', color: 'bg-green-500/10 text-green-600', action: () => navigate('/add-transaction') },
    { icon: Table2, label: 'تقرير شامل', color: 'bg-purple-500/10 text-purple-600', action: () => navigate('/reports?type=total') },
    { icon: FileText, label: 'تقرير مفصل', color: 'bg-orange-500/10 text-orange-600', action: () => navigate('/reports?type=details') },
    { icon: Calendar, label: 'تقرير شهري', color: 'bg-pink-500/10 text-pink-600', action: () => navigate('/reports?type=monthly') },
    { icon: LayoutGrid, label: 'التصنيفات', color: 'bg-indigo-500/10 text-indigo-600', action: () => navigate('/reports?type=categories') },
    { icon: Settings, label: 'الإعدادات', color: 'bg-gray-500/10 text-gray-600', action: () => navigate('/settings') },
    { icon: Share2, label: 'مشاركة', color: 'bg-cyan-500/10 text-cyan-600', action: handleShare },
    { icon: Info, label: 'حول البرنامج', color: 'bg-amber-500/10 text-amber-600', action: () => setShowAbout(true) },
    { icon: LogOut, label: 'خروج', color: 'bg-red-500/10 text-red-600', action: handleExit },
  ];

  return (
    <div className="min-h-screen bg-background pb-6 flex flex-col" dir="rtl">
      <AppHeader 
        title="القائمة الرئيسية" 
        showBack 
      />
      
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="grid grid-cols-2 gap-4 auto-rows-max">
          {menuItems.map((item, i) => (
            <button
              key={i}
              onClick={item.action}
              className={`flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 border-transparent hover:border-primary/20 active:scale-95 transition-all shadow-sm animate-fade-in ${item.color}`}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="p-3 rounded-xl bg-white/50 shadow-inner">
                <item.icon className="w-8 h-8" />
              </div>
              <span className="text-sm font-bold text-foreground text-center">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {showAbout && (
        <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in" onClick={() => setShowAbout(false)}>
          <Card className="w-80 shadow-xl border-0 animate-scale-in" onClick={e => e.stopPropagation()}>
            <CardContent className="p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                <Info className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground">دفتر الحسابات الآمن</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">تطبيق متطور لإدارة حسابات العملاء والديون بشكل آمن ومشفر بالكامل على جهازك.</p>
              <div className="pt-4 border-t border-border space-y-2">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">المطور</p>
                <p className="text-sm font-bold text-foreground">0114866251</p>
              </div>
              <button onClick={() => setShowAbout(false)} className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-bold mt-2 shadow-lg active:scale-95 transition-transform">إغلاق</button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default MainMenu;
