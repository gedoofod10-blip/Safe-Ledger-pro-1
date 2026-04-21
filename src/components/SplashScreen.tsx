import { useState, useEffect } from 'react';
import logoImg from '@/assets/logo.png';
import { toast } from 'sonner';

const SplashScreen = ({ onFinish }: { onFinish: () => void }) => {
  const [loading, setLoading] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [savedPassword, setSavedPassword] = useState('');
  const [inputPassword, setInputPassword] = useState('');
  const [showPasswordScreen, setShowPasswordScreen] = useState(false);

  // فحص الإعدادات عند تحميل الشاشة
  useEffect(() => {
    const savedSettingsRaw = localStorage.getItem('appSettings');
    if (savedSettingsRaw) {
      const settings = JSON.parse(savedSettingsRaw);
      if (settings.requirePassword && settings.appPassword) {
        setIsLocked(true);
        setSavedPassword(settings.appPassword);
      }
    }
  }, []);

  const handleStart = () => {
    if (isLocked) {
      setShowPasswordScreen(true);
    } else {
      setLoading(true);
      setTimeout(() => onFinish(), 500); // تأخير بسيط للشياكة
    }
  };

  const handleUnlock = () => {
    if (inputPassword === savedPassword) {
      onFinish();
    } else {
      toast.error('كلمة السر غير صحيحة!');
      setInputPassword(''); // مسح الحقل بعد الخطأ
    }
  };

  // شاشة إدخال كلمة السر
  if (showPasswordScreen) {
    return (
      <div 
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center px-8"
        style={{ background: 'linear-gradient(170deg, #FFFDF7 0%, #F5EFE0 50%, #EDE4D0 100%)' }}
      >
        <div className="relative flex flex-col items-center gap-6 animate-fade-in w-full max-w-xs">
          <div className="w-20 h-20 bg-[#5D4037] rounded-full flex items-center justify-center shadow-lg mb-4">
            <span className="text-4xl">🔒</span>
          </div>
          <h2 className="text-2xl font-bold text-[#5D4037]">التطبيق مقفل</h2>
          <p className="text-sm text-gray-500 mb-4">الرجاء إدخال كلمة السر للمتابعة</p>
          
          <input 
            type="password" 
            value={inputPassword}
            onChange={(e) => setInputPassword(e.target.value)}
            className="w-full text-center text-2xl tracking-widest p-4 rounded-xl border-2 border-[#5D4037]/20 outline-none focus:border-[#5D4037] shadow-inner bg-white"
            placeholder="••••••"
            autoFocus
          />

          <button
            onClick={handleUnlock}
            className="w-full mt-4 py-4 rounded-xl font-bold text-lg text-white transition-all active:scale-95 shadow-md"
            style={{ background: '#5D4037' }}
          >
            فتح القفل
          </button>
          
          <button
            onClick={() => setShowPasswordScreen(false)}
            className="mt-4 text-sm font-semibold text-gray-400 hover:text-gray-600"
          >
            رجوع
          </button>
        </div>
      </div>
    );
  }

  // شاشة البداية العادية
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center px-8"
      style={{ background: 'linear-gradient(170deg, #FFFDF7 0%, #F5EFE0 50%, #EDE4D0 100%)' }}
    >
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[220px] rounded-b-full opacity-30"
        style={{ background: 'radial-gradient(ellipse at center bottom, hsl(36, 60%, 32%), transparent 70%)' }}
      />

      <div className="relative flex flex-col items-center gap-5 animate-fade-in">
        <div
          className="relative w-56 h-56 rounded-full flex items-center justify-center"
          style={{ background: 'radial-gradient(circle, rgba(218,165,32,0.08) 0%, transparent 70%)' }}
        >
          <img
            src={logoImg}
            alt="دفتر الحسابات"
            className="w-52 h-52 object-contain drop-shadow-xl"
            style={{ filter: 'drop-shadow(0 4px 24px rgba(218, 165, 32, 0.35))', mixBlendMode: 'multiply' }}
          />
        </div>

        <h1
          className="text-3xl font-extrabold tracking-wide"
          style={{ color: 'hsl(30, 50%, 20%)', textShadow: '0 1px 8px rgba(218, 165, 32, 0.15)' }}
        >
          دفتر الحسابات
        </h1>

        <div
          className="w-20 h-0.5 rounded-full"
          style={{ background: 'linear-gradient(90deg, transparent, hsl(36, 60%, 50%), transparent)' }}
        />

        <p className="text-sm font-semibold text-center" style={{ color: 'hsl(30, 20%, 45%)' }}>
          إدارة حساباتك بأمان وسهولة
        </p>
      </div>

      <div className="mt-12 w-full max-w-xs animate-fade-in" style={{ animationDelay: '200ms' }}>
        <button
          onClick={handleStart}
          disabled={loading}
          className="w-full py-4 rounded-2xl font-extrabold text-lg tracking-wide transition-all duration-200 active:scale-[0.97] disabled:opacity-70 flex justify-center items-center gap-2"
          style={{
            background: 'linear-gradient(135deg, hsl(36, 60%, 32%) 0%, hsl(38, 70%, 42%) 100%)',
            color: '#FFFDF7',
            boxShadow: '0 6px 24px rgba(140, 100, 30, 0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
          }}
        >
          {loading ? (
            <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : isLocked ? (
            <><span>🔒</span> فتح التطبيق</>
          ) : (
            'ابدأ الآن'
          )}
        </button>
      </div>
    </div>
  );
};

export default SplashScreen;
