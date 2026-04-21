import type { Client, Transaction } from './db';
import { toast } from 'sonner';

/**
 * دالة للمشاركة الحقيقية للملفات والنصوص باستخدام Web Share API
 * تفتح قائمة المشاركة الأصلية في الهاتف وتدعم إرسال ملفات حقيقية
 */
export async function shareFileNative(file: File, title: string, text?: string): Promise<boolean> {
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: title,
        text: text || title,
      });
      toast.success('✓ تم فتح قائمة المشاركة');
      return true;
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Share failed:', error);
        toast.error('فشل فتح قائمة المشاركة');
      }
      return false;
    }
  } else {
    // fallback للتحميل العادي إذا كان المتصفح لا يدعم المشاركة
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('✓ تم تنزيل الملف بنجاح');
    return true;
  }
}

/**
 * دالة لمشاركة النص فقط عبر قائمة المشاركة الأصلية
 */
export async function shareTextNative(title: string, text: string): Promise<boolean> {
  if (navigator.share) {
    try {
      await navigator.share({
        title: title,
        text: text,
      });
      toast.success('✓ تم فتح قائمة المشاركة');
      return true;
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Text share failed:', error);
      }
      return false;
    }
  } else {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('✓ تم نسخ النص للحافظة');
      return true;
    } catch (err) {
      toast.error('فشل نسخ النص');
      return false;
    }
  }
}

/**
 * إنشاء رسالة نصية مرتبة لمشاركتها كنص
 */
export function generateShareText(
  client: Client,
  transactions: (Transaction & { balance: number })[],
  totalDebit: number,
  totalCredit: number,
  netBalance: number
): string {
  let text = `كشف حساب: ${client.name}\n`;
  text += `التاريخ: ${new Date().toLocaleDateString('en-US')}\n`;
  text += `---------------------------\n`;
  text += `إجمالي عليه: ${totalDebit.toLocaleString('en-US')}\n`;
  text += `إجمالي له: ${totalCredit.toLocaleString('en-US')}\n`;
  text += `الرصيد الحالي: ${Math.abs(netBalance).toLocaleString('en-US')} ${netBalance >= 0 ? 'عليه' : 'له'}\n`;
  text += `---------------------------\n`;
  text += `جميع المعاملات:\n`;
  
  transactions.forEach(tx => {
    text += `${tx.date}: ${tx.amount.toLocaleString('en-US')} (${tx.type === 'debit' ? 'عليه' : 'له'}) - ${tx.details}\n`;
  });
  
  text += `\nتم التصدير بواسطة تطبيق دفتر الحسابات`;
  return text;
}

/**
 * إنشاء ملف Excel حقيقي (XLSX) لمشاركته
 * يستخدم مكتبة xlsx لإنشاء ملف Excel حقيقي
 */
export async function generateExcelFile(
  client: Client,
  transactions: (Transaction & { balance: number })[]
): Promise<File> {
  try {
    // محاولة استيراد مكتبة xlsx
    const XLSX = await import('xlsx');
    
    // إنشاء ورقة العمل الأولى: المعاملات
    const transactionData = transactions.map(tx => ({
      'التاريخ': tx.date,
      'المبلغ': tx.amount,
      'النوع': tx.type === 'debit' ? 'عليه' : 'له',
      'التفاصيل': tx.details,
      'الرصيد': tx.balance
    }));

    // إنشاء ورقة العمل الثانية: الملخص
    const summaryData = [
      { 'البيان': 'اسم العميل', 'القيمة': client.name },
      { 'البيان': 'رقم الهاتف', 'القيمة': client.phone || 'N/A' },
      { 'البيان': 'التصنيف', 'القيمة': client.category || 'عام' },
      { 'البيان': 'إجمالي عليه', 'القيمة': transactions.reduce((sum, tx) => tx.type === 'debit' ? sum + tx.amount : sum, 0) },
      { 'البيان': 'إجمالي له', 'القيمة': transactions.reduce((sum, tx) => tx.type === 'credit' ? sum + tx.amount : sum, 0) },
      { 'البيان': 'الرصيد النهائي', 'القيمة': transactions.length > 0 ? transactions[transactions.length - 1].balance : 0 },
      { 'البيان': 'تاريخ التصدير', 'القيمة': new Date().toLocaleDateString('en-US') }
    ];

    // إنشاء Workbook
    const wb = XLSX.utils.book_new();
    
    // إضافة ورقات العمل
    const wsTransactions = XLSX.utils.json_to_sheet(transactionData);
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    
    XLSX.utils.book_append_sheet(wb, wsSummary, 'الملخص');
    XLSX.utils.book_append_sheet(wb, wsTransactions, 'المعاملات');
    
    // تعيين عرض الأعمدة
    wsTransactions['!cols'] = [
      { wch: 12 },
      { wch: 12 },
      { wch: 10 },
      { wch: 30 },
      { wch: 12 }
    ];
    
    wsSummary['!cols'] = [
      { wch: 20 },
      { wch: 20 }
    ];

    // تحويل الـ Workbook إلى Blob
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    const fileName = `كشف_حساب_${client.name}_${new Date().toISOString().split('T')[0]}.xlsx`;
    return new File([blob], fileName, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  } catch (error) {
    console.warn('Failed to generate XLSX, falling back to CSV');
    // fallback إلى CSV إذا فشل XLSX
    return generateExcelFileCSV(client, transactions);
  }
}

/**
 * Fallback: إنشاء ملف CSV إذا فشل XLSX
 */
function generateExcelFileCSV(
  client: Client,
  transactions: (Transaction & { balance: number })[]
): File {
  // استخدام \uFEFF لضمان ترميز UTF-8 مع BOM لفتح الملف بشكل صحيح في Excel
  let csvContent = '\uFEFF' + 'التاريخ,المبلغ,النوع,التفاصيل,الرصيد\n';
  
  transactions.forEach(tx => {
    const typeStr = tx.type === 'debit' ? 'عليه' : 'له';
    // استخدام أرقام إنجليزية في الملف
    csvContent += `${tx.date},${tx.amount},${typeStr},"${tx.details.replace(/"/g, '""')}",${tx.balance}\n`;
  });
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const fileName = `كشف_حساب_${client.name}_${new Date().toISOString().split('T')[0]}.csv`;
  return new File([blob], fileName, { type: 'text/csv' });
}
