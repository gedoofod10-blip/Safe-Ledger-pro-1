import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllClients, getAllTransactions, type Client, type Transaction } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight, Share2, FileDown, Type, Image as ImageIcon, FileSpreadsheet, ArrowDown, ArrowUp, ChevronRight, ChevronLeft, Users, FileText } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { toast } from 'sonner';

// دالة المشاركة الآمنة للهواتف
const safeShareFile = async (file: File) => {
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'مشاركة التقرير' });
    } else {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('تم تنزيل التقرير في جهازك');
    }
  } catch (error: any) {
    if (error.name !== 'AbortError') toast.error('حدث خطأ في المشاركة');
  }
};

interface TransactionRow extends Transaction {
  clientName: string;
}

interface BalanceRow {
  clientId: number;
  clientName: string;
  category: string;
  balance: number;
}

type ViewMode = 'menu' | 'transactions' | 'balances';

const ReportsPage = () => {
  const navigate = useNavigate();
  const reportRef = useRef<HTMLDivElement>(null);
  
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('menu');
  const [showShareModal, setShowShareModal] = useState(false);

  // البيانات
  const [transactionsData, setTransactionsData] = useState<TransactionRow[]>([]);
  const [balancesData, setBalancesData] = useState<BalanceRow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategoryIndex, setActiveCategoryIndex] = useState(0);

  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const clients = await getAllClients();
        const txns = await getAllTransactions();

        // سجل المعاملات
        const txData: TransactionRow[] = txns.map(tx => {
          const client = clients.find(c => c.id === tx.clientId);
          return { ...tx, clientName: client?.name || 'غير معروف' };
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // أرصدة العملاء
        const balData: BalanceRow[] = clients.map(client => {
          const clientTxns = txns.filter(tx => tx.clientId === client.id);
          let balance = 0;
          clientTxns.forEach(tx => {
            if (tx.type === 'debit') balance += tx.amount;
            else balance -= tx.amount;
          });
          return {
            clientId: client.id!,
            clientName: client.name,
            category: client.category || 'عام',
            balance
          };
        }).filter(row => row.balance !== 0).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

        // استخراج التصنيفات الموجودة
        const cats = Array.from(new Set(clients.map(c => c.category || 'عام')));

        setTransactionsData(txData);
        setBalancesData(balData);
        setCategories(cats.length > 0 ? cats : ['عام']);
      } catch (error) {
        toast.error('حدث خطأ أثناء تحميل البيانات');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // السحب يميناً ويساراً (يعمل فقط في وضع الأرصدة)
  const handleTouchStart = (e: React.TouchEvent) => { 
    if (viewMode !== 'balances') return;
    touchStartX.current = e.touches[0].clientX; 
  };
  
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (viewMode !== 'balances' || touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    
    if (diff > 50 && activeCategoryIndex < categories.length - 1) {
      setActiveCategoryIndex(prev => prev + 1);
    } else if (diff < -50 && activeCategoryIndex > 0) {
      setActiveCategoryIndex(prev => prev - 1);
    }
    touchStartX.current = null;
  };

  const currentCategory = categories[activeCategoryIndex];

  // دوال التصدير
  const handleSharePDF = async () => {
    if (!reportRef.current) return;
    const t = toast.loading('جاري تجهيز PDF...');
    try {
      const h2cModule = await import('html2canvas');
      const html2canvas = h2cModule.default || h2cModule;
      const jspdfModule = await import('jspdf');
      const jsPDF = jspdfModule.default || jspdfModule;

      const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      
      const blob = pdf.output('blob');
      const fileName = viewMode === 'transactions' ? 'سجل_المعاملات.pdf' : `مديونية_${currentCategory}.pdf`;
      const file = new File([blob], fileName, { type: 'application/pdf' });
      
      toast.dismiss(t);
      await safeShareFile(file);
    } catch (e) { toast.dismiss(t); toast.error('خطأ في التصدير'); }
    setShowShareModal(false);
  };

  const handleShareImage = async () => {
    if (!reportRef.current) return;
    const t = toast.loading('جاري تجهيز الصورة...');
    try {
      const h2cModule = await import('html2canvas');
      const html2canvas = h2cModule.default || h2cModule;
      const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      
      canvas.toBlob(async (blob) => {
        toast.dismiss(t);
        if (blob) {
          const fileName = viewMode === 'transactions' ? 'سجل_المعاملات.png' : `مديونية_${currentCategory}.png`;
          await safeShareFile(new File([blob], fileName, { type: 'image/png' }));
        }
      }, 'image/png');
    } catch (e) { toast.dismiss(t); toast.error('خطأ في الصورة'); }
    setShowShareModal(false);
  };

  const handleShareExcel = async () => {
    const t = toast.loading('جاري تجهيز الإكسل...');
    try {
      let csv = "\uFEFF"; 
      if (viewMode === 'transactions') {
        csv += "التاريخ,اسم العميل,المبلغ,النوع,التفاصيل\n";
        transactionsData.forEach(tx => {
          csv += `${tx.date},"${tx.clientName}",${tx.amount},${tx.type === 'debit' ? 'عليه' : 'له'},"${tx.details}"\n`;
        });
      } else {
        csv += "اسم العميل,الرصيد,الحالة\n";
        balancesData.filter(b => b.category === currentCategory).forEach(b => {
          csv += `"${b.clientName}",${Math.abs(b.balance)},${b.balance > 0 ? 'عليه' : 'له'}\n`;
        });
      }
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const fileName = viewMode === 'transactions' ? 'سجل_المعاملات.csv' : `مديونية_${currentCategory}.csv`;
      
      toast.dismiss(t);
      await safeShareFile(new File([blob], fileName, { type: 'text/csv' }));
    } catch (e) { toast.dismiss(t); toast.error('خطأ في التصدير'); }
    setShowShareModal(false);
  };

  const handleShareText = async () => {
    try {
      let text = `📄 تقرير: ${viewMode === 'transactions' ? 'سجل المعاملات' : `مديونية (${currentCategory})`}\n\n`;
      if (viewMode === 'transactions') {
        transactionsData.forEach(tx => {
          text += `▪ ${tx.date} | ${tx.clientName} | ${tx.amount} (${tx.type === 'debit' ? 'عليه' : 'له'})\n`;
        });
      } else {
        balancesData.filter(b => b.category === currentCategory).forEach(b => {
          text += `▪ ${b.clientName}: ${formatNumber(Math.abs(b.balance))} (${b.balance > 0 ? 'عليه' : 'له'})\n`;
        });
      }
      if (navigator.share) await navigator.share({ title: 'تقرير', text });
      else { await navigator.clipboard.writeText(text); toast.success('تم النسخ للحافظة'); }
    } catch (e:any) { if (e.name !== 'AbortError') toast.error('خطأ'); }
    setShowShareModal(false);
  };

  // الشاشة الأولى (الخيارات المربعة)
  if (viewMode === 'menu') {
    return (
      <div className="min-h-screen bg-background flex flex-col" dir="rtl">
        <div className="bg-[#5D4037] text-white flex items-center p-4 shadow-md sticky top-0 z-40">
          <button onClick={() => navigate(-1)} className="ml-4 p-1"><ArrowRight className="w-6 h-6" /></button>
          <h1 className="text-xl font-bold">بوابة التقارير</h1>
        </div>
        <div className="flex-1 p-6 flex flex-col justify-center gap-6">
          <button onClick={() => setViewMode('balances')} className="bg-white border-2 border-primary/20 rounded-3xl p-8 shadow-xl flex flex-col items-center gap-4 active:scale-95 transition-transform">
            <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center"><Users className="w-10 h-10" /></div>
            <h2 className="text-2xl font-black text-[#5D4037]">مديونية العملاء</h2>
            <p className="text-sm text-muted-foreground text-center font-bold">عرض أرصدة العملاء وتقسيمهم حسب التصنيفات مع إمكانية السحب للتنقل.</p>
          </button>

          <button onClick={() => setViewMode('transactions')} className="bg-white border-2 border-primary/20 rounded-3xl p-8 shadow-xl flex flex-col items-center gap-4 active:scale-95 transition-transform">
            <div className="w-20 h-20 bg-green-50 text-green-600 rounded-full flex items-center justify-center"><FileText className="w-10 h-10" /></div>
            <h2 className="text-2xl font-black text-[#5D4037]">سجل المعاملات</h2>
            <p className="text-sm text-muted-foreground text-center font-bold">عرض جميع المعاملات الواردة والصادرة بالتسلسل الزمني لجميع العملاء.</p>
          </button>
        </div>
      </div>
    );
  }

  // شاشات التقارير (المديونية أو المعاملات)
  return (
    <div className="min-h-screen bg-background flex flex-col overflow-x-hidden" dir="rtl">
      {/* الهيدر */}
      <div className="bg-[#5D4037] text-white flex items-center justify-between p-4 shadow-md sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <button onClick={() => setViewMode('menu')} className="p-1"><ArrowRight className="w-6 h-6" /></button>
          <h1 className="text-xl font-bold">{viewMode === 'transactions' ? 'سجل المعاملات' : 'مديونية العملاء'}</h1>
        </div>
        <button onClick={() => setShowShareModal(true)} className="flex items-center gap-2 bg-white/20 px-3 py-1.5 rounded-lg active:scale-95">
          <Share2 className="w-5 h-5" />
          <span className="text-sm font-bold">تصدير</span>
        </button>
      </div>

      {/* شريط التنقل للتصنيفات (يظهر فقط في وضع المديونية) */}
      {viewMode === 'balances' && (
        <div className="bg-card border-b border-border p-3 shadow-sm flex items-center justify-between">
          <button onClick={() => activeCategoryIndex > 0 && setActiveCategoryIndex(prev => prev - 1)} disabled={activeCategoryIndex === 0} className="p-2 bg-muted rounded-full disabled:opacity-20 active:scale-90 transition-all"><ChevronRight/></button>
          <div className="flex flex-col items-center animate-fade-in" key={currentCategory}>
            <span className="text-[10px] font-bold text-muted-foreground mb-0.5">تصنيف ({activeCategoryIndex + 1}/${categories.length})</span>
            <h2 className="text-base font-black text-[#5D4037]">{currentCategory}</h2>
          </div>
          <button onClick={() => activeCategoryIndex < categories.length - 1 && setActiveCategoryIndex(prev => prev + 1)} disabled={activeCategoryIndex === categories.length - 1} className="p-2 bg-muted rounded-full disabled:opacity-20 active:scale-90 transition-all"><ChevronLeft/></button>
        </div>
      )}

      {/* المحتوى */}
      <div className="flex-1 p-3 pb-24" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <div ref={reportRef} className="animate-slide-up" key={viewMode === 'balances' ? currentCategory : 'transactions'}>
          <div className="hidden print-header text-center mb-4 pb-2 border-b-2 border-black">
            <h2 className="text-xl font-black">{viewMode === 'transactions' ? 'سجل المعاملات الشامل' : `مديونية العملاء - تصنيف (${currentCategory})`}</h2>
            <p className="text-sm font-bold">تاريخ الإصدار: {new Date().toISOString().split('T')[0]}</p>
          </div>

          <Card className="shadow-lg border-0 rounded-2xl overflow-hidden">
            <CardContent className="p-0">
              {loading ? (
                <div className="p-10 text-center font-bold text-muted-foreground">جاري التحميل...</div>
              ) : viewMode === 'transactions' ? (
                <>
                  <div className="bg-[#5D4037] text-white grid grid-cols-[75px_1fr_80px_1.5fr] text-center text-[11px] font-extrabold py-3 px-2 shadow-md">
                    <div className="text-right">التاريخ</div>
                    <div className="text-right">العميل</div>
                    <div>المبلغ</div>
                    <div className="text-right">التفاصيل</div>
                  </div>
                  <div className="divide-y divide-border/40 select-none">
                    {transactionsData.length === 0 ? (
                      <div className="p-10 text-center text-muted-foreground font-bold">لا توجد معاملات</div>
                    ) : (
                      transactionsData.map((tx, idx) => (
                        <div key={idx} className={`grid grid-cols-[75px_1fr_80px_1.5fr] py-3.5 px-2 items-center ${idx % 2 === 0 ? 'bg-white' : 'bg-muted/10'}`}>
                          <div className="text-right text-[10px] font-bold text-muted-foreground">{tx.date}</div>
                          <div className="text-right text-xs font-bold text-foreground truncate pl-1">{tx.clientName}</div>
                          <div className={`font-black text-sm ${tx.type === 'debit' ? 'text-red-600' : 'text-green-600'}`} dir="ltr">{formatNumber(tx.amount)}</div>
                          <div className="text-right text-[11px] font-bold text-foreground break-words leading-tight">{tx.details}</div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-[#5D4037] text-white flex justify-between text-[13px] font-extrabold py-3 px-5 shadow-md">
                    <div className="text-right">اسم العميل</div>
                    <div className="text-left">الرصيد النهائي</div>
                  </div>
                  <div className="divide-y divide-border/40 select-none">
                    {balancesData.filter(b => b.category === currentCategory).length === 0 ? (
                      <div className="p-10 text-center text-muted-foreground font-bold">لا توجد ديون في هذا التصنيف</div>
                    ) : (
                      balancesData.filter(b => b.category === currentCategory).map((b, idx) => (
                        <div key={idx} className={`flex justify-between py-4 px-5 items-center ${idx % 2 === 0 ? 'bg-white' : 'bg-muted/10'}`}>
                          <div className="text-right text-sm font-bold text-foreground">{b.clientName}</div>
                          <div className="text-left flex items-center gap-1.5 font-black text-sm">
                            {b.balance > 0 ? <ArrowDown className="w-4 h-4 text-red-600"/> : <ArrowUp className="w-4 h-4 text-green-600"/>}
                            <span className={b.balance > 0 ? 'text-red-600' : 'text-green-600'} dir="ltr">{formatNumber(Math.abs(b.balance))}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* مودال المشاركة */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center animate-fade-in" onClick={() => setShowShareModal(false)}>
          <div className="bg-card w-full rounded-t-3xl p-6 space-y-5 animate-slide-up shadow-2xl border-t border-border" onClick={e => e.stopPropagation()} dir="rtl">
            <div className="w-12 h-1.5 bg-muted mx-auto rounded-full mb-2" />
            <div className="text-center"><h3 className="text-xl font-extrabold text-foreground">مشاركة التقرير</h3></div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <button onClick={handleSharePDF} className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-primary/10 active:scale-95"><FileDown className="w-6 h-6 text-primary" /><span className="font-bold text-sm">ملف PDF</span></button>
              <button onClick={handleShareImage} className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-primary/10 active:scale-95"><ImageIcon className="w-6 h-6 text-primary" /><span className="font-bold text-sm">صورة</span></button>
              <button onClick={handleShareExcel} className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-primary/10 active:scale-95"><FileSpreadsheet className="w-6 h-6 text-primary" /><span className="font-bold text-sm">ملف إكسل</span></button>
              <button onClick={handleShareText} className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-primary/10 active:scale-95"><Type className="w-6 h-6 text-primary" /><span className="font-bold text-sm">نص</span></button>
            </div>
            <button onClick={() => setShowShareModal(false)} className="w-full mt-2 p-3 rounded-xl bg-muted font-bold active:scale-95">إلغاء</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsPage;
