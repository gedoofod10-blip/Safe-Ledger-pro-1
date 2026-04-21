import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getAllClients, getAllTransactions, type Client, type Transaction } from '@/lib/db';
import { Search, FileText, ArrowLeft, TrendingUp, AlertCircle, Calendar } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { differenceInDays, parseISO } from 'date-fns';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { toast } from 'sonner';

interface ReportRow {
  id?: number;
  name: string;
  balance: number;
  days: number;
  rating?: 'excellent' | 'average' | 'poor';
  budgetLimit?: number;
  isOverBudget?: boolean;
  color?: string;
  category?: string;
  lastTransactionDate?: string;
}

const ReportsPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reportRef = useRef<HTMLDivElement>(null);
  const [reportData, setReportData] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [reportType] = useState(searchParams.get('type') || 'total');

  useEffect(() => {
    async function fetchData() {
      try {
        const allClients = await getAllClients();
        const allTx = await getAllTransactions();

        const processed = allClients.map(client => {
          const clientTxns = allTx.filter(tx => tx.clientId === client.id);
          let balance = 0;
          let lastDate = client.createdAt;

          clientTxns.forEach(tx => {
            if (tx.type === 'debit') balance += tx.amount;
            else balance -= tx.amount;
            lastDate = tx.date;
          });

          const days = differenceInDays(new Date(), parseISO(lastDate));
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
            color: client.notes?.[0] || undefined,
            category: client.category || 'عام',
            lastTransactionDate: lastDate
          };
        }).filter(row => row.balance !== 0).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

        setReportData(processed);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching report data:', error);
        toast.error('فشل تحميل التقرير');
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const getFilteredData = () => {
    let filtered = searchQuery
      ? reportData.filter(row => row.name.includes(searchQuery))
      : reportData;

    switch (reportType) {
      case 'details':
        // تقرير مفصل: جميع العملاء مع تفاصيل كاملة
        return filtered;
      case 'monthly':
        // تقرير شهري: العملاء الذين تعاملوا في آخر 30 يوم
        return filtered.filter(row => row.days <= 30);
      case 'categories':
        // تقرير حسب التصنيفات: مجموعة حسب التصنيف
        return filtered;
      case 'total':
      default:
        // تقرير شامل: جميع العملاء
        return filtered;
    }
  };

  const filteredData = getFilteredData();

  const totalBalance = filteredData.reduce((sum, row) => sum + row.balance, 0);
  const totalClients = filteredData.length;
  const overBudgetCount = filteredData.filter(row => row.isOverBudget).length;
  const averageDays = totalClients > 0 ? Math.round(filteredData.reduce((sum, row) => sum + row.days, 0) / totalClients) : 0;

  const getRatingColor = (rating?: string) => {
    switch (rating) {
      case 'excellent': return '#10b981';
      case 'average': return '#f59e0b';
      case 'poor': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getReportTitle = () => {
    switch (reportType) {
      case 'details': return 'تقرير مفصل';
      case 'monthly': return 'تقرير شهري';
      case 'categories': return 'تقرير التصنيفات';
      case 'total':
      default: return 'تقرير شامل';
    }
  };

  const getReportDescription = () => {
    switch (reportType) {
      case 'details': return 'تفاصيل كاملة لجميع العملاء والأرصدة';
      case 'monthly': return 'العملاء الذين تعاملوا في آخر 30 يوم';
      case 'categories': return 'تقسيم العملاء حسب التصنيفات';
      case 'total':
      default: return 'جميع العملاء والأرصدة';
    }
  };

  const handleExportPDF = async () => {
    if (!reportRef.current) return;
    const loadingToast = toast.loading('جاري تجهيز ملف PDF...');
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`تقرير_${getReportTitle()}_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.dismiss(loadingToast);
      toast.success('✓ تم تصدير التقرير بنجاح');
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error('فشل تصدير التقرير');
    }
  };

  // تجميع البيانات حسب التصنيف
  const groupedByCategory = reportType === 'categories' ? 
    filteredData.reduce((acc, row) => {
      const cat = row.category || 'عام';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(row);
      return acc;
    }, {} as Record<string, ReportRow[]>) : null;

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      {/* الشريط العلوي */}
      <div className="bg-gradient-to-l from-header to-header text-header flex items-center justify-between p-4 shadow-lg sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-lg font-bold">{getReportTitle()}</h1>
            <p className="text-xs opacity-80">{getReportDescription()}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleExportPDF} className="p-2 hover:bg-white/10 rounded-lg transition-colors" title="تصدير PDF">
            <FileText className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* شريط البحث */}
      <div className="bg-card border-b border-border p-3">
        <div className="relative">
          <input
            type="text"
            placeholder="ابحث عن عميل..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-background border border-input rounded-lg px-4 py-2.5 text-right text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              ✕
            </button>
          )}
        </div>
      </div>

      {/* الإحصائيات العامة */}
      <div className="grid grid-cols-2 gap-3 p-3 bg-background">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs text-muted-foreground mb-1">إجمالي العملاء</div>
          <div className="text-2xl font-bold text-foreground">{formatNumber(totalClients)}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs text-muted-foreground mb-1">الرصيد الإجمالي</div>
          <div className={`text-2xl font-bold ${totalBalance >= 0 ? 'text-red-500' : 'text-green-500'}`}>
            {formatNumber(Math.abs(totalBalance))}
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs text-muted-foreground mb-1">متوسط الأيام</div>
          <div className="text-2xl font-bold text-foreground">{formatNumber(averageDays)}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs text-muted-foreground mb-1">تجاوز السقف</div>
          <div className={`text-2xl font-bold ${overBudgetCount > 0 ? 'text-red-500' : 'text-green-500'}`}>
            {formatNumber(overBudgetCount)}
          </div>
        </div>
      </div>

      {/* محتوى التقرير */}
      <div ref={reportRef} className="flex-1 bg-white">
        {reportType === 'categories' && groupedByCategory ? (
          // عرض التقارير مجمعة حسب التصنيفات
          <div>
            {Object.entries(groupedByCategory).map(([category, items]) => (
              <div key={category} className="mb-6">
                {/* رأس التصنيف */}
                <div className="bg-primary/10 px-4 py-3 border-b-2 border-primary">
                  <h3 className="font-bold text-lg text-primary">{category}</h3>
                  <p className="text-sm text-muted-foreground">عدد العملاء: {items.length}</p>
                </div>

                {/* رأس الجدول */}
                <div className="bg-table-header text-table-header grid grid-cols-[0.8fr_2fr_1.2fr_1.2fr_1fr] text-center text-sm font-bold py-3 px-2">
                  <span>التقييم</span>
                  <span>اسم العميل</span>
                  <span>الرصيد</span>
                  <span>الأيام</span>
                  <span>الحالة</span>
                </div>

                {/* البيانات */}
                {items.map((row, index) => (
                  <div
                    key={row.id || index}
                    className={`grid grid-cols-[0.8fr_2fr_1.2fr_1.2fr_1fr] text-center py-3 px-2 border-b border-gray-200 ${
                      index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                    } hover:bg-blue-50 transition-colors`}
                  >
                    <div className="flex justify-center items-center">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                        style={{ backgroundColor: getRatingColor(row.rating) }}
                        title={`التقييم: ${row.rating || 'بدون'}`}
                      >
                        {row.rating === 'excellent' ? '✓' : row.rating === 'average' ? '○' : row.rating === 'poor' ? '✕' : '-'}
                      </div>
                    </div>
                    <div className="text-right font-semibold text-gray-800 truncate pr-2">{row.name}</div>
                    <div className={`font-bold ${row.balance >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatNumber(row.balance)}
                    </div>
                    <div className={`font-semibold ${row.days > 30 ? 'text-red-600' : row.days > 15 ? 'text-yellow-600' : 'text-green-600'}`}>
                      {formatNumber(row.days)}
                    </div>
                    <div className="flex justify-center">
                      {row.isOverBudget && (
                        <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full">تجاوز</span>
                      )}
                      {!row.isOverBudget && row.budgetLimit && (
                        <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-full">آمن</span>
                      )}
                      {!row.budgetLimit && (
                        <span className="bg-gray-100 text-gray-700 text-xs font-bold px-2 py-1 rounded-full">بدون سقف</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          // عرض التقرير العادي
          <>
            {/* رأس الجدول */}
            <div className="bg-table-header text-table-header grid grid-cols-[0.8fr_2fr_1.2fr_1.2fr_1fr] text-center text-sm font-bold py-3 px-2 sticky top-0">
              <span>التقييم</span>
              <span>اسم العميل</span>
              <span>الرصيد</span>
              <span>الأيام</span>
              <span>الحالة</span>
            </div>

            {/* المحتوى */}
            <div className="overflow-y-auto max-h-[calc(100vh-400px)]">
              {loading ? (
                <div className="p-10 text-center text-muted-foreground font-bold">
                  <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  جاري التحميل...
                </div>
              ) : filteredData.length === 0 ? (
                <div className="p-10 text-center text-muted-foreground">
                  <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  لا توجد بيانات للعرض
                </div>
              ) : (
                filteredData.map((row, index) => (
                  <div
                    key={row.id || index}
                    className={`grid grid-cols-[0.8fr_2fr_1.2fr_1.2fr_1fr] text-center py-3 px-2 border-b border-gray-200 ${
                      index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                    } hover:bg-blue-50 transition-colors`}
                  >
                    <div className="flex justify-center items-center">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                        style={{ backgroundColor: getRatingColor(row.rating) }}
                        title={`التقييم: ${row.rating || 'بدون'}`}
                      >
                        {row.rating === 'excellent' ? '✓' : row.rating === 'average' ? '○' : row.rating === 'poor' ? '✕' : '-'}
                      </div>
                    </div>
                    <div className="text-right font-semibold text-gray-800 truncate pr-2">{row.name}</div>
                    <div className={`font-bold ${row.balance >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatNumber(row.balance)}
                    </div>
                    <div className={`font-semibold ${row.days > 30 ? 'text-red-600' : row.days > 15 ? 'text-yellow-600' : 'text-green-600'}`}>
                      {formatNumber(row.days)}
                    </div>
                    <div className="flex justify-center">
                      {row.isOverBudget && (
                        <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full">تجاوز</span>
                      )}
                      {!row.isOverBudget && row.budgetLimit && (
                        <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-full">آمن</span>
                      )}
                      {!row.budgetLimit && (
                        <span className="bg-gray-100 text-gray-700 text-xs font-bold px-2 py-1 rounded-full">بدون سقف</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* الشريط السفلي - الملخص */}
      <div className="bg-gradient-to-r from-header to-header text-header p-4 shadow-lg border-t border-white/10">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-xs opacity-80 mb-1">الإجمالي</div>
            <div className="text-xl font-bold">
              {totalBalance >= 0 ? `عليه ${formatNumber(totalBalance)}` : `له ${formatNumber(Math.abs(totalBalance))}`}
            </div>
          </div>
          <div>
            <div className="text-xs opacity-80 mb-1">عدد العملاء</div>
            <div className="text-xl font-bold">{formatNumber(totalClients)}</div>
          </div>
          <div>
            <div className="text-xs opacity-80 mb-1">تجاوز السقف</div>
            <div className={`text-xl font-bold ${overBudgetCount > 0 ? 'text-red-300' : 'text-green-300'}`}>
              {formatNumber(overBudgetCount)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;
