import { useState, useRef, useEffect } from 'react';

type Rating = 'excellent' | 'average' | 'poor';

interface ClientRatingProps {
  rating?: Rating;
  onChange: (rating: Rating) => void;
}

const ratingConfig: Record<Rating, { color: string; label: string }> = {
  excellent: { color: 'hsl(142, 60%, 40%)', label: 'أخضر' },
  average: { color: '#eab308', label: 'أصفر' },
  poor: { color: 'hsl(0, 72%, 51%)', label: 'أحمر' },
};

const ClientRating = ({ rating, onChange }: ClientRatingProps) => {
  const [showPicker, setShowPicker] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowPicker(false);
    };
    if (showPicker) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPicker]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setShowPicker(!showPicker)}
        className="w-5 h-5 rounded-full border-2 border-white/80 shadow-sm transition-all hover:scale-110 active:scale-95"
        style={{
          backgroundColor: rating ? ratingConfig[rating].color : 'hsl(var(--muted-foreground))',
        }}
      />

      {showPicker && (
        <>
          {/* خلفية مغبشة مع blur */}
          <div className="fixed inset-0 bg-foreground/50 backdrop-blur-sm z-[9998]" onClick={() => setShowPicker(false)} />
          
          {/* القائمة في منتصف الشاشة بشكل احترافي */}
          <div 
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card border-2 border-border rounded-3xl shadow-2xl p-6 z-[9999] animate-in fade-in zoom-in duration-300 w-80" 
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-6">
              <h3 className="text-lg font-bold text-foreground mb-1">تقييم العميل</h3>
              <p className="text-xs text-muted-foreground">اختر لون يعكس حالة العميل</p>
            </div>
            
            <div className="flex justify-center gap-6 mb-6">
              {(['excellent', 'average', 'poor'] as Rating[]).map(r => (
                <button
                  key={r}
                  onClick={() => { onChange(r); setShowPicker(false); }}
                  className={`flex flex-col items-center gap-2 transition-all ${
                    rating === r ? 'scale-110' : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  <div
                    className={`w-16 h-16 rounded-full transition-all shadow-lg ${
                      rating === r ? 'ring-4 ring-offset-2 ring-primary' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: ratingConfig[r].color }}
                  />
                  <span className="text-xs font-semibold text-foreground">{ratingConfig[r].label}</span>
                </button>
              ))}
            </div>
            
            <button 
              onClick={() => setShowPicker(false)}
              className="w-full py-3 text-sm font-bold text-foreground bg-muted hover:bg-muted/80 rounded-xl transition-colors"
            >
              إغلاق
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default ClientRating;
