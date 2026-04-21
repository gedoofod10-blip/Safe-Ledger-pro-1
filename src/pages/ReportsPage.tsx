import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllClients, getAllTransactions, type Client, type Transaction } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight, Share2, FileDown, Type, Image as ImageIcon, FileSpreadsheet, ListFilter, Users, ArrowDown, ArrowUp, ChevronRight, ChevronLeft } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { toast } from 'sonner';
import { shareFileNative, shareTextNative } from '@/lib/sharing';

// --- Types ---
interface TransactionRow extends Transaction {
  clientName: string;
  category: string;
}

interface BalanceRow {
  clientId: number;
  clientName: string;
  category: string;
  balance: number;
}

const ReportsPage = () => {
  const navigate = useNavigate();
  const reportRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  
  // Data
  const [transactionsData, setTransactionsData] = useState<TransactionRow[]>([]);
  const [balancesData, setBalancesData] = useState<BalanceRow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  
  // Unified Swipe Views
  const [views, setViews] = useState<string[]>(['transactions', 'الكل']);
  const [activeViewIndex, setActiveViewIndex] = useState(0);

  // Swipe logic states
  const touchStartX = useRef<number | null>(null);

  // Share Modal
  const [showShareModal, setShowShareModal] = useState(false);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const clients = await getAllClients();
        const txns = await getAllTransactions();

        // 1. Prepare Transactions Data
        const txData: TransactionRow[] = txns.map(tx => {
          const client = clients.find(c => c.id === tx.clientId);
          return {
            ...tx,
            clientName: client?.name || 'غير معروف',
            category: client?.category || 'عام'
          };
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // 2. Prepare Balances Data
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
        }).filter(row => row.balance !== 0)
          .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

        // 3. Extract Unique Categories & Build Views
        const cats = Array.from(new Set(clients.map(c => c.category || 'عام')));
        
        setTransactionsData(txData);
        setBalancesData(balData);
        setCategories(cats);
        setViews(['transactions', 'الكل', ...cats]); 

      } catch (error) {
        toast.error('حدث خطأ أثناء تحميل البيانات');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const currentView = views[activeViewIndex];

  const filteredBalances = currentView === 'الكل' 
    ? balancesData 
    : balancesData.filter(b => b.category === currentView);

  // --- Swipe Logic Handlers ---
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;
    
    if (diff > 50 && activeViewIndex < views.length - 1) {
      setActiveViewIndex(prev => prev + 1);
    } else if (diff < -50 && activeViewIndex > 0) {
      setActiveViewIndex(prev => prev - 1);
    }
    
    touchStartX.current = null;
  };

  const nextView = () => {
    if (activeViewIndex < views.length - 1) setActiveViewIndex(prev => prev + 1);
  };

  const prevView = () => {
    if (activeViewIndex > 0) setActiveViewIndex(prev => prev - 1);
  };

  // --- Sharing & Export Logic ---
  const handleSharePDF = async () => {
    if (!reportRef.current) return;
    const loadingToast = toast.loading('جاري تجهيز التقرير...');
    try {
      // تم استخدام الاستدعاء الديناميكي هنا لمنع الشاشة البيضاء
      const module = await import('html2canvas');
      const html2canvas = (module as any).default || (module as any);
      const jsPDFModule = await import('jspdf');
      const jsPDF = (jsPDFModule as any).default || (jsPDFModule as any);

      const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      
      const blob = pdf.output('blob');
      const file = new File([blob], `تقرير_${currentView === 'transactions' ? 'المعاملات' : 'الارصدة'}.pdf`, { type: 'application/pdf' });
      
      toast.dismiss(loadingToast);
      setShowShareModal(false);
      await shareFileNative(file, 'تقرير PDF', 'إليك التقرير المطلوب');
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error('فشل تصدير التقرير');
    }
  };

  const handleShareImage = async () => {
    if (!reportRef.current) return;
    const loadingToast = toast.loading('جاري تجهيز التقرير...');
    try {
      // تم استخدام الاستدعاء الديناميكي هنا لمنع الشاشة البيضاء
      const module = await import('html2canvas');
      const html2canvas = (module as any).default || (module as any);

      const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      canvas.toBlob(async (blob: Blob | null) => {
        if (blob) {
          const file = new File([blob], `تقرير_${currentView === 'transactions' ? 'المعاملات' : 'الارصدة'}.png`, { type: 'image/png' });
          toast.dismiss(loadingToast);
          setShowShareModal(false);
          await shareFileNative(file, 'صورة تقرير', 'إليك التقرير المطلوب');
        }
      }, 'image/png');
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error('فشل إنشاء الصورة');
    }
  };

  const handleShareCSV = async () => {
    const loadingToast = toast.loading('جاري تجهيز ملف الإكسل...');
    try {
      let csvContent = "\uFEFF"; 
      
      if (currentView === 'transactions') {
        csvContent += "التاريخ,اسم العميل,المبلغ,النوع,التفاصيل\n";
        transactionsData.forEach(tx => {
          const typeStr = tx.type === 'debit' ? 'عليه' : 'له';
          csvContent += `${tx.date},"${tx.clientName}",${tx.amount},${typeStr},"${tx.details}"\n`;
        });
      } else {
        csvContent += "اسم العميل,الرصيد,الحالة,التصنيف\n";
        filteredBalances.forEach(b => {
          const typeStr = b.balance > 0 ? 'عليه' : 'له';
          csvContent += `"${b.clientName}",${Math.abs(b.balance)},${typeStr},"${b.category}"\n`;
        });
      }

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const file = new File([blob], `تقرير_${currentView === 'transactions' ? 'المعاملات' : 'الارصدة'}.csv`, { type: 'text/csv' });
      
      toast.dismiss(loadingToast);
      setShowShareModal(false);
      await shareFileNative(file, 'ملف إكسل (CSV)', 'إليك التقرير كملف إكسل');
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error('فشل تصدير الإكسل');
    }
  };

  const handleShareText = async () => {
    try {
      let text = `📄 تقرير ${currentView === 'transactions' ? 'سجل المعاملات' : `أرصدة التصنيفات (${currentView})`}\n`;
      text += `📅 التاريخ: ${new Date().toISOString().split('T')[0]}\n\n`;

      if (currentView === 'transactions') {
        transactionsData.forEach(tx => {
          text += `▪ ${tx.date} | ${tx.clientName}\n`;
          text += `المبلغ: ${tx.amount} (${tx.type === 'debit' ? 'عليه' : 'له'}) - ${tx.details}\n`;
          text += `-----------------\n`;
        });
      } else {
        filteredBalances.forEach(b => {
          text += `▪ ${b.clientName}: ${formatNumber(Math.abs(b.balance))} (${b.balance > 0 ? 'عليه' : 'له'})\n`;
        });
      }

      setShowShareModal(false);
      await shareTextNative('مشاركة التقرير', text);
    } catch (error) {
      toast.error('فشل مشاركة النص');
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col overflow-x-hidden" dir="rtl">
      {/* --- HEADER --- */}
      <div className="bg-header text-header flex items-center justify-between p-4 shadow-md sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1 hover:bg-white/20 rounded-full transition-colors">
            <ArrowRight className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold">التقارير</h1>
        </div>
        <button onClick={() => setShowShareModal(true)} className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors active:scale-95">
          <Share2 className="w-5 h-5" />
          <span className="text-sm font-bold">تصدير</span>
        </button>
      </div>

      {/* --- DOTS INDICATOR & NAVIGATION --- */}
      <div className="bg-card border-b border-border p-3 flex flex-col items-center justify-center shadow-sm">
        <div className="w-full flex items-center justify-between mb-2 px-2">
           <button onClick={prevView} disabled={activeViewIndex === 0} className="p-2 bg-muted rounded-full disabled:opacity-20 active:scale-90 transition-all"><ChevronRight className="w-5 h-5"/></button>
           
           <div className="flex flex-col items-center animate-fade-in" key={currentView}>
             <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">نوع التقرير</span>
             <h2 className="text-base font-black text-primary">
               {currentView === 'transactions' ? 'سجل المعاملات الشامل' : `أرصدة التصنيفات (${currentView})`}
             </h2>
           </div>

           <button onClick={nextView} disabled={activeViewIndex === views.length - 1} className="p-2 bg-muted rounded-full disabled:opacity-20 active:scale-90 transition-all"><ChevronLeft className="w-5 h-5"/></button>
        </div>

        {/* Dots */}
        <div className="flex gap-1.5 mt-1">
          {views.map((v, i) => (
            <div key={v} className={`h-1.5 rounded-full transition-all duration-300 ${i === activeViewIndex ? 'w-6 bg-primary shadow-sm' : 'w-2 bg-muted-foreground/30'}`} />
          ))}
        </div>
      </div>

      {/* --- REPORT CONTENT (Swipeable Container) --- */}
      <div 
        className="flex-1 bg-background p-3 pb-24"
        onTouchStart={handleTouchStart} 
        onTouchEnd={handleTouchEnd}
      >
        <div ref={reportRef} className="animate-slide-up" key={currentView}>
          
          <div className="hidden print-header text-center mb-4 pb-2 border-b-2 border-primary">
            <h2 className="text-xl font-black text-foreground">
              {currentView === 'transactions' ? 'سجل المعاملات الشامل' : `تقرير أرصدة التصنيفات (${currentView})`}
            </h2>
            <p className="text-sm text-muted-foreground">تاريخ الإصدار: {new Date().toISOString().split('T')[0]}</p>
          </div>

          <Card className="shadow-lg border-0 overflow-hidden rounded-2xl">
            <CardContent className="p-0">
              {loading ? (
                <div className="p-10 text-center font-bold text-muted-foreground">جاري تحميل التقرير...</div>
              ) : (
                <>
                  {/* 1. Transactions View */}
                  {currentView === 'transactions' && (
                    <>
                      <div className="bg-table-header text-table-header grid grid-cols-[80px_1fr_80px_1.5fr] text-center text-[12px] font-extrabold py-3 px-2 border-b border-border/50 sticky top-0 shadow-sm">
                        <div className="text-right pr-2">التاريخ</div>
                        <div className="text-right">العميل</div>
                        <div>المبلغ</div>
                        <div className="text-right">التفاصيل</div>
                      </div>
                      <div className="divide-y divide-border/40 select-none">
                        {transactionsData.length === 0 ? (
                          <div className="p-12 text-center text-muted-foreground flex flex-col items-center gap-2">
                             <ListFilter className="w-10 h-10 opacity-20 mb-2" />
                             <span className="font-bold">لا توجد معاملات مسجلة</span>
                             <span className="text-xs">اسحب لليمين أو اليسار للتنقل للتقارير الأخرى</span>
                          </div>
                        ) : (
                          transactionsData.map((tx, idx) => (
                            <div key={idx} className={`grid grid-cols-[80px_1fr_80px_1.5fr] py-3 px-2 items-center ${idx % 2 === 0 ? 'bg-white' : 'bg-muted/5'}`}>
                              <div className="text-right text-[10px] font-bold text-muted-foreground pr-1">{tx.date}</div>
                              <div className="text-right text-xs font-bold text-foreground truncate pl-2">{tx.clientName}</div>
                              <div className="flex items-center justify-center gap-0.5 font-black text-xs">
                                {tx.type === 'debit' ? <ArrowDown className="w-3 h-3 text-debit"/> : <ArrowUp className="w-3 h-3 text-credit"/>}
                                <span className={tx.type === 'debit' ? 'text-debit' : 'text-credit'} dir="ltr">{formatNumber(tx.amount)}</span>
                              </div>
                              <div className="text-right text-[11px] font-bold text-foreground break-words leading-tight">{tx.details}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  )}

                  {/* 2. Balances View */}
                  {currentView !== 'transactions' && (
                    <>
                      <div className="bg-table-header text-table-header flex justify-between text-[13px] font-extrabold py-3 px-5 border-b border-border/50 sticky top-0 shadow-sm">
                        <div className="text-right">اسم العميل</div>
                        <div className="text-left">الرصيد النهائي</div>
                      </div>
                      <div className="divide-y divide-border/40 select-none">
                        {filteredBalances.length === 0 ? (
                          <div className="p-12 text-center text-muted-foreground flex flex-col items-center gap-2">
                             <Users className="w-10 h-10 opacity-20 mb-2" />
                             <span className="font-bold">لا توجد أرصدة مسجلة في هذا التصنيف</span>
                             <span className="text-xs">اسحب لليمين أو اليسار للتنقل</span>
                          </div>
                        ) : (
                          filteredBalances.map((b, idx) => (
                            <div key={idx} className={`flex justify-between py-4 px-5 items-center ${idx % 2 === 0 ? 'bg-white' : 'bg-muted/5'}`}>
                              <div className="text-right text-sm font-bold text-foreground">{b.clientName}</div>
                              <div className="text-left flex items-center gap-1.5 font-black text-sm">
                                {b.balance > 0 ? <ArrowDown className="w-4 h-4 text-debit"/> : <ArrowUp className="w-4 h-4 text-credit"/>}
                                <span className="text-foreground" dir="ltr">{formatNumber(Math.abs(b.balance))}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* --- SHARE MODAL --- */}
      {showShareModal && (
        <div className="fixed inset-0 bg-foreground/50 backdrop-blur-sm z-[100] flex items-end justify-center animate-fade-in" onClick={() => setShowShareModal(false)}>
          <div className="bg-card w-full rounded-t-3xl p-6 space-y-5 animate-slide-up shadow-2xl border-t border-border" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-1.5 bg-muted mx-auto rounded-full mb-2" />
            <div className="text-center">
              <h3 className="text-xl font-extrabold text-foreground">مشاركة التقرير</h3>
              <p className="text-xs text-muted-foreground mt-1 font-bold">عبر قائمة الهاتف المباشرة</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mt-4">
              <button onClick={handleSharePDF} className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-primary/5 hover:bg-primary/10 border border-primary/10 transition-all group active:scale-95">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center transition-transform"><FileDown className="w-6 h-6 text-primary" /></div>
                <span className="font-bold text-sm">ملف PDF</span>
              </button>
              <button onClick={handleShareImage} className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-primary/5 hover:bg-primary/10 border border-primary/10 transition-all group active:scale-95">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center transition-transform"><ImageIcon className="w-6 h-6 text-primary" /></div>
                <span className="font-bold text-sm">صورة تقرير</span>
              </button>
              <button onClick={handleShareCSV} className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-primary/5 hover:bg-primary/10 border border-primary/10 transition-all group active:scale-95">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center transition-transform"><FileSpreadsheet className="w-6 h-6 text-primary" /></div>
                <span className="font-bold text-sm">ملف إكسل</span>
              </button>
              <button onClick={handleShareText} className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-primary/5 hover:bg-primary/10 border border-primary/10 transition-all group active:scale-95">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center transition-transform"><Type className="w-6 h-6 text-primary" /></div>
                <span className="font-bold text-sm">نص فقط</span>
              </button>
            </div>
            
            <button onClick={() => setShowShareModal(false)} className="w-full mt-2 p-4 rounded-xl bg-muted text-foreground font-bold hover:bg-muted/80 transition-colors active:scale-95">إلغاء</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsPage;
