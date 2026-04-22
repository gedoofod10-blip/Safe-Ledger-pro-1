import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getAllClients, getAllTransactions } from '@/lib/db';
import { Search, FileText, ArrowLeft, AlertCircle } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { toast } from 'sonner';

interface ReportRow {
  id?: number;
  name: string;
  balance: number;
  days: number;
  rating?: 'excellent' | 'average' | 'poor';
  budgetLimit?: number;
  isOverBudget?: boolean;
  category?: string;
}

const ReportsPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reportRef = useRef<HTMLDivElement>(null);
  const [reportData, setReportData] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const reportType = searchParams.get('type') || 'total';

  useEffect(() => {
    async function fetchData() {
      try {
        const allClients = await getAllClients();
        const allTx = await getAllTransactions();

        const processed = allClients.map(client => {
          const clientTxns = allTx.filter(tx => tx.clientId === client.id);
          let balance = 0;
          let lastDateStr = client.createdAt || new Date().toISOString();

          clientTxns.forEach(tx => {
            if (tx.type === 'debit') balance += tx.amount;
            else balance -= tx.amount;
            if (tx.date) lastDateStr = tx.date;
          });

          // الحل الجذري والآمن بدلاً من مكتبة date-fns المفقودة
          const lastDate = new Date(lastDateStr).getTime();
          const today = new Date().getTime();
          const diffTime = Math.abs(today - lastDate);
          const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));

          const budgetLimit = client.budgetLimit || 0;
          const isOverBudget = budgetLimit > 0 && balance > budgetLimit;

          return {
            id: client.id,
            name: client.name,
            balance,
            days: Math.max(0, days),
            rating: client.rating,
            budgetLimit,
            isOverBudget,
            category: client.category || 'عام',
          };
        }).filter(row => row.balance !== 0).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

        setReportData(processed);
        setLoading(false);
      } catch (error) {
        toast.error('فشل تحميل التقرير');
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const filteredData = searchQuery ? reportData.filter(row => row.name.includes(searchQuery)) : reportData;
  const totalBalance = filteredData.reduce((sum, row) => sum + row.balance, 0);

  const handleExportPDF = async () => {
    if (!reportRef.current) return;
    const loadingToast = toast.loading('جاري تجهيز التقرير...');
    try {
      const html2canvasModule = await import('html2canvas');
      const html2canvas = html2canvasModule.default || html2canvasModule;
      const jsPDFModule = await import('jspdf');
      const jsPDF = jsPDFModule.default || jsPDFModule;

      const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`تقرير_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.dismiss(loadingToast);
      toast.success('تم تصدير التقرير');
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error('فشل التصدير');
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <div className="bg-[#5D4037] text-white flex items-center justify-between p-4 shadow-lg sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft className="w-6 h-6" /></button>
          <h1 className="text-lg font-bold">التقارير</h1>
        </div>
        <button onClick={handleExportPDF} className="p-2 bg-white/20 rounded-lg"><FileText className="w-5 h-5" /></button>
      </div>

      <div className="bg-card border-b border-border p-3">
        <input type="text" placeholder="ابحث عن عميل..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-background border border-input rounded-lg px-4 py-2.5 text-right text-foreground focus:outline-none focus:ring-2 focus:ring-[#5D4037]" />
      </div>

      <div className="grid grid-cols-2 gap-3 p-3 bg-background">
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <div className="text-xs text-muted-foreground mb-1">الرصيد الإجمالي</div>
          <div className={`text-2xl font-bold ${totalBalance >= 0 ? 'text-red-500' : 'text-green-500'}`} dir="ltr">{formatNumber(Math.abs(totalBalance))}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <div className="text-xs text-muted-foreground mb-1">عدد الحسابات</div>
          <div className="text-2xl font-bold text-foreground">{filteredData.length}</div>
        </div>
      </div>

      <div ref={reportRef} className="flex-1 bg-white">
        <div className="bg-gray-100 text-gray-700 grid grid-cols-[2fr_1.5fr_1fr] text-center text-sm font-bold py-3 px-2 sticky top-0">
          <span className="text-right">اسم العميل</span>
          <span>الرصيد</span>
          <span>الأيام</span>
        </div>
        <div className="divide-y max-h-[calc(100vh-300px)] overflow-y-auto">
          {loading ? (
             <div className="p-10 text-center font-bold">جاري التحميل...</div>
          ) : filteredData.length === 0 ? (
             <div className="p-10 text-center text-gray-400"><AlertCircle className="w-12 h-12 mx-auto mb-2 opacity-50"/>لا توجد بيانات</div>
          ) : (
            filteredData.map((row, index) => (
              <div key={row.id || index} className="grid grid-cols-[2fr_1.5fr_1fr] text-center py-4 px-2 items-center bg-white">
                <div className="text-right font-bold text-gray-800 truncate pr-2">{row.name}</div>
                <div className={`font-black tracking-tight ${row.balance >= 0 ? 'text-red-600' : 'text-green-600'}`} dir="ltr">{formatNumber(row.balance)}</div>
                <div className={`font-bold ${row.days > 30 ? 'text-red-600' : row.days > 15 ? 'text-yellow-600' : 'text-green-600'}`}>{row.days}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;
