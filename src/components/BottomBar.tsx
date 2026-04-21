import { useState } from 'react';
import { Plus, HelpCircle } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

interface BottomBarProps {
  debitTotal?: number;
  creditTotal?: number;
  currency?: string;
  onAdd?: () => void;
  remainingLimit?: number | null;
}

const BottomBar = ({ debitTotal = 0, creditTotal = 0, currency = 'محلي', onAdd, remainingLimit }: BottomBarProps) => {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <>
      <footer className="bg-bottom-bar text-bottom-bar flex items-center justify-between px-4 py-2.5 fixed bottom-0 left-0 right-0 z-50 shadow-[0_-2px_10px_rgba(0,0,0,0.15)]">
        <button className="p-1" onClick={() => setShowHelp(true)}>
          <HelpCircle className="w-6 h-6 opacity-80" />
        </button>
        <div className="text-center text-sm font-semibold leading-tight">
          {/* التعديل هنا: لك (للمسحوبات/debit) وعليك (للمسدد/credit) */}
          <span>لك: {formatNumber(debitTotal)} | عليك: {formatNumber(creditTotal)}</span>
          <br />
          <span>{currency}</span>
          {remainingLimit !== null && remainingLimit !== undefined && (
            <span className="mr-2">| المتبقي: {formatNumber(remainingLimit)}</span>
          )}
        </div>
        {onAdd && (
          <button onClick={onAdd} className="w-9 h-9 rounded-full border-2 border-current flex items-center justify-center">
            <Plus className="w-5 h-5" />
          </button>
        )}
      </footer>

      {showHelp && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center animate-fade-in" onClick={() => setShowHelp(false)}>
          <Card className="w-80 shadow-xl border-0 animate-scale-in" onClick={e => e.stopPropagation()}>
            <CardContent className="p-6 text-center space-y-4">
              <HelpCircle className="w-12 h-12 mx-auto text-primary" />
              <h2 className="text-lg font-bold text-foreground">كيفية الاستخدام</h2>
              <p className="text-sm text-foreground leading-relaxed text-right">
                لإضافة عميل جديد: اضغط على زر (+) في الشاشة الرئيسية. ثم ادخل إلى حسابه وسجل ما أخذه (لك) أو ما أرجعه وسدده (عليك).
              </p>
              <button onClick={() => setShowHelp(false)} className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg font-bold">فهمت</button>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
};

export default BottomBar;
