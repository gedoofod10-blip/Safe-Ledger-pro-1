import { useState } from 'react';
import { FileDown, Share2 } from 'lucide-react';
import { exportLedgerPDF } from '@/lib/pdfExport';
import { toast } from 'sonner';
import type { Client, Transaction } from '@/lib/db';
import { cn } from '@/lib/utils';

interface LedgerPDFExportProps {
  client: Client;
  transactions: (Transaction & { balance: number })[];
  totalDebit: number;
  totalCredit: number;
  netBalance: number;
}

const LedgerPDFExport = ({ client, transactions, totalDebit, totalCredit, netBalance }: LedgerPDFExportProps) => {
  const [loading, setLoading] = useState(false);

  const generatePDF = async (): Promise<Blob | null> => {
    setLoading(true);
    try {
      const blob = await exportLedgerPDF(client, transactions, totalDebit, totalCredit, netBalance);
      return blob;
    } catch (err) {
      toast.error('حدث خطأ أثناء التصدير');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    const blob = await generatePDF();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `كشف_حساب_${client.name}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('تم تصدير الملف بنجاح ✓');
  };

  const handleShareWhatsApp = async () => {
    const text = encodeURIComponent(`كشف حساب ${client.name}\nإجمالي عليه: ${totalDebit.toLocaleString()}\nإجمالي له: ${totalCredit.toLocaleString()}\nالرصيد: ${Math.abs(netBalance).toLocaleString()} ${netBalance >= 0 ? 'عليه' : 'له'}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

 return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleDownload}
        disabled={loading}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
          "bg-primary/10 text-primary hover:bg-primary/20 active:scale-95",
          loading && "opacity-50 pointer-events-none"
        )}
      >
        <FileDown className="w-3.5 h-3.5" />
        {loading ? 'جاري التصدير...' : 'تصدير PDF'}
      </button>
    </div>
  );
};

export default LedgerPDFExport;
