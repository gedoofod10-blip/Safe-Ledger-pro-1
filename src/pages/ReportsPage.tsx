import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllClients, getAllTransactions, type Client, type Transaction } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight, Share2, FileDown, Type, Image as ImageIcon, FileSpreadsheet, ListFilter, Users, ArrowDown, ArrowUp, ChevronRight, ChevronLeft } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
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
  
  // Tabs: 'transactions' = سجل المعاملات | 'balances' = أرصدة التصنيفات
  const [activeTab, setActiveTab] = useState<'transactions' | 'balances'>('transactions');
  
  // Data
  const [transactionsData, setTransactionsData] = useState<TransactionRow[]>([]);
  const [balancesData, setBalancesData] = useState<BalanceRow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('الكل');

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

        // 1. Prepare Transactions Data (Sorted by Date Descending)
        const txData: TransactionRow[] = txns.map(tx => {
          const client = clients.find(c => c.id === tx.clientId);
          return {
            ...tx,
            clientName: client?.name || 'غير معروف',
            category: client?.category || 'عام'
          };
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // 2. Prepare Balances Data (Grouped by Client)
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
        }).filter(row => row.balance !== 0) // إخفاء الأرصدة المصفّرة
          .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

        // 3. Extract Unique Categories
        const cats = Array.from(new Set(clients.map(c => c.category || 'عام')));

        setTransactionsData(txData);
        setBalancesData(balData);
        setCategories(cats);
      } catch (error) {
        toast.error('حدث خطأ أثناء تحميل البيانات');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const fullCategoriesList = ['الكل', ...categories];
  
  const filteredBalances = selectedCategory === 'الكل' 
    ? balancesData 
    : balancesData.filter(b => b.category === selectedCategory);

  // --- Swipe Logic Handlers ---
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;
    
    const currentIndex = fullCategoriesList.indexOf(selectedCategory);

    // RTL Swipe Logic:
    // Swiping Right (diff < -50) goes to Next category
    // Swiping Left (diff > 50) goes to Previous category
    if (diff < -50 && currentIndex < fullCategoriesList.length - 1) {
      setSelectedCategory(fullCategoriesList[currentIndex + 1]);
    } else if (diff > 50 && currentIndex > 0) {
      setSelectedCategory(fullCategoriesList[currentIndex - 1]);
    }
    
    touchStartX.current = null;
  };

  const nextCategory = () => {
    const currentIndex = fullCategoriesList.indexOf(selectedCategory);
    if (currentIndex < fullCategoriesList.length - 1) setSelectedCategory(fullCategoriesList[currentIndex + 1]);
  };

  const prevCategory = () => {
    const currentIndex = fullCategoriesList.indexOf(selectedCategory);
    if (currentIndex > 0) setSelectedCategory(fullCategoriesList[currentIndex - 1]);
  };


  // --- Sharing & Export Logic ---
  const handleSharePDF = async () => {
    if (!reportRef.current) return;
    const loadingToast = toast.loading('جاري تجهيز التقرير...');
    try {
      const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      
      const blob = pdf.output('blob');
      const file = new File([blob], `تقرير_${activeTab === 'transactions' ? 'المعاملات' : 'الارصدة'}.pdf`, { type: 'application/pdf' });
      
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
      const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      canvas.toBlob(async (blob) => {
        if (blob) {
          const file = new File([blob], `تقرير_${activeTab === 'transactions' ? 'المعاملات' : 'الارصدة'}.png`, { type: 'image/png' });
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
      let csvContent = "\uFEFF"; // BOM for Arabic support
      
      if (activeTab === 'transactions') {
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
      const file = new File([blob], `تقرير_${activeTab === 'transactions' ? 'المعاملات' : 'الارصدة'}.csv`, { type: 'text/csv' });
      
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
      let text = `📄 تقرير ${activeTab === 'transactions' ? 'سجل المعاملات' : 'أرصدة التصنيفات'}\n`;
      text += `📅 التاريخ: ${new Date().toISOString().split('T')[0]}\n\n`;

      if (activeTab === 'transactions') {
        transactionsData.forEach(tx => {
          text += `▪ ${tx.date} | ${tx.clientName}\n`;
          text += `المبلغ: ${tx.amount} (${tx.type === 'debit' ? 'عليه' : 'له'}) - ${tx.details}\n`;
          text += `-----------------\n`;
        });
      } else {
        text += `التصنيف: ${selectedCategory}\n\n`;
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
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      {/* --- HEADER --- */}
      <div className="bg-header text-header flex items-center justify-between p-4 shadow-md sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1 hover:bg-white/20 rounded-full transition-colors">
            <ArrowRight className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold">التقارير</h1>
        </div>
        {/* Export Button */}
        <button onClick={() => setShowShareModal(true)} className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors">
          <Share2 className="w-5 h-5" />
          <span className="text-sm font-bold">تصدير</span>
        </button>
      </div>

      {/* --- TABS --- */}
      <div className="bg-card border-b border-border p-3">
        <div className="flex bg-muted rounded-xl p-1 shadow-inner">
          <button
            onClick={() => setActiveTab('transactions')}
            className={`flex-1 py-2.5 text-sm font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${activeTab === 'transactions' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:bg-background/50'}`}
          >
            <ListFilter className="w-4 h-4" /> سجل المعاملات
          </button>
          <button
            onClick={() => setActiveTab('balances')}
            className={`flex-1 py-2.5 text-sm font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${activeTab === 'balances' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:bg-background/50'}`}
          >
            <Users className="w-4 h-4" /> أرصدة التصنيفات
          </button>
        </div>
      </div>

      {/* --- REPORT CONTENT (To be captured) --- */}
      <div ref={reportRef} className="flex-1 bg-background p-3 pb-24">
        
        {/* Print Header */}
        <div className="hidden print-header text-center mb-4 pb-2 border-b-2 border-primary">
          <h2 className="text-xl font-black text-foreground">
            {activeTab === 'transactions' ? 'سجل المعاملات الشامل' : `تقرير أرصدة التصنيفات (${selectedCategory})`}
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
                {activeTab === 'transactions' && (
                  <>
                    <div className="bg-table-header text-table-header grid grid-cols-[80px_1fr_80px_1.5fr] text-center text-[12px] font-extrabold py-3 px-2 border-b border-border/50 sticky top-0 shadow-sm">
                      <div className="text-right pr-2">التاريخ</div>
                      <div className="text-right">العميل</div>
                      <div>المبلغ</div>
                      <div className="text-right">التفاصيل</div>
                    </div>
                    <div className="divide-y divide-border/40">
                      {transactionsData.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground font-bold">لا توجد معاملات مسجلة</div>
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

                {/* 2. Balances View (With Swipe Logic) */}
                {activeTab === 'balances' && (
                  <div 
                    onTouchStart={handleTouchStart} 
                    onTouchEnd={handleTouchEnd}
                    className="animate-fade-in"
                    key={selectedCategory} // Forces re-render for animation when category changes
                  >
                    {/* Category Swipe Indicator Header */}
                    <div className="bg-muted/30 flex items-center justify-between p-3 border-b border-border select-none">
                      <button 
                        onClick={prevCategory} 
                        disabled={fullCategoriesList.indexOf(selectedCategory) === 0}
                        className="p-1 hover:bg-muted rounded-full transition-colors disabled:opacity-30"
                      >
                        <ChevronRight className="w-5 h-5 text-foreground" />
                      </button>
                      
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">تصنيف التقرير</span>
                        <span className="text-sm font-extrabold text-primary">{selectedCategory}</span>
                      </div>

                      <button 
                        onClick={nextCategory} 
                        disabled={fullCategoriesList.indexOf(selectedCategory) === fullCategoriesList.length - 1}
                        className="p-1 hover:bg-muted rounded-full transition-colors disabled:opacity-30"
                      >
                        <ChevronLeft className="w-5 h-5 text-foreground" />
                      </button>
                    </div>

                    <div className="bg-table-header text-table-header flex justify-between text-[13px] font-extrabold py-3 px-5 border-b border-border/50 sticky top-0 shadow-sm">
                      <div className="text-right">اسم العميل</div>
                      <div className="text-left">الرصيد النهائي</div>
                    </div>
                    
                    <div className="divide-y divide-border/40">
                      {filteredBalances.length === 0 ? (
                        <div className="p-12 text-center text-muted-foreground flex flex-col items-center gap-2">
                           <Users className="w-10 h-10 opacity-20 mb-2" />
                           <span className="font-bold">لا يوجد أرصدة في تصنيف "{selectedCategory}"</span>
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
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* --- SHARE MODAL --- */}
      {showShareModal && (
        <div className="fixed inset-0 bg-foreground/50 backdrop-blur-sm z-50 flex items-end justify-center animate-fade-in" onClick={() => setShowShareModal(false)}>
          <div className="bg-card w-full rounded-t-3xl p-6 space-y-5 animate-slide-up shadow-2xl border-t border-border" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-1.5 bg-muted mx-auto rounded-full mb-2" />
            <div className="text-center">
              <h3 className="text-xl font-extrabold text-foreground">مشاركة التقرير</h3>
              <p className="text-xs text-muted-foreground mt-1 font-bold">عبر قائمة الهاتف المباشرة</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mt-4">
              <button onClick={handleSharePDF} className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-primary/5 hover:bg-primary/10 border border-primary/10 transition-all group">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center group-active:scale-90 transition-transform"><FileDown className="w-6 h-6 text-primary" /></div>
                <span className="font-bold text-sm">ملف PDF</span>
              </button>
              <button onClick={handleShareImage} className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-primary/5 hover:bg-primary/10 border border-primary/10 transition-all group">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center group-active:scale-90 transition-transform"><ImageIcon className="w-6 h-6 text-primary" /></div>
                <span className="font-bold text-sm">صورة تقرير</span>
              </button>
              <button onClick={handleShareCSV} className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-primary/5 hover:bg-primary/10 border border-primary/10 transition-all group">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center group-active:scale-90 transition-transform"><FileSpreadsheet className="w-6 h-6 text-primary" /></div>
                <span className="font-bold text-sm">ملف إكسل</span>
              </button>
              <button onClick={handleShareText} className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-primary/5 hover:bg-primary/10 border border-primary/10 transition-all group">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center group-active:scale-90 transition-transform"><Type className="w-6 h-6 text-primary" /></div>
                <span className="font-bold text-sm">نص فقط</span>
              </button>
            </div>
            
            <button onClick={() => setShowShareModal(false)} className="w-full mt-2 p-4 rounded-xl bg-muted text-foreground font-bold hover:bg-muted/80 transition-colors">إلغاء</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsPage;
