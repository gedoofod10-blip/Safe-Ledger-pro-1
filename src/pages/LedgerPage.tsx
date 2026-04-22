import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getClient, getTransactionsByClient, addTransaction as dbAddTransaction, updateTransaction, deleteTransaction as dbDeleteTransaction, deleteAllTransactions, updateClient, type Client, type Transaction } from '@/lib/db';
import AppHeader from '@/components/AppHeader';
import ClientRating from '@/components/ClientRating';
import ClientNotesSheet from '@/components/ClientNotesSheet';
import { Card, CardContent } from '@/components/ui/card';
import { Phone, MessageCircle, Share2, Plus, AlertTriangle, Pencil, Trash2, FileText, X, StickyNote, HelpCircle, MoreVertical, Search, Printer, FileSpreadsheet, MessageSquare, Lock, ArrowRightLeft, Bell, ShieldAlert, ListFilter, Camera, Palette, FileDown, Type, Image as ImageIcon, Eraser } from 'lucide-react';
import { toast } from 'sonner';
import { formatNumber } from '@/lib/utils';
import { exportLedgerPDF } from '@/lib/pdfExport';
import { shareFileNative, shareTextNative, generateShareText, generateExcelFile } from '@/lib/sharing';

const LedgerPage = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [transactions, setTransactions] = useState<(Transaction & { balance: number })[]>([]);
  const [totalDebit, setTotalDebit] = useState(0);
  const [totalCredit, setTotalCredit] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  
  // States for Edit
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDetails, setEditDetails] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editType, setEditType] = useState<'debit' | 'credit'>('debit'); 
  
  // UI States
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false); 
  
  // New States for Long Press & Modals
  const [longPressedTx, setLongPressedTx] = useState<(Transaction & { balance: number }) | null>(null);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [newLimit, setNewLimit] = useState('');
  const [showCloseBalanceModal, setShowCloseBalanceModal] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const loadData = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    const c = await getClient(Number(clientId));
    if (c) {
      setClient(c);
      setNewLimit(c.budgetLimit?.toString() || '0');
    }

    const txns = await getTransactionsByClient(Number(clientId));
    let balance = 0, dTotal = 0, cTotal = 0;
    
    const withBalance = txns.map(t => {
      const safeAmount = Number(t.amount) || 0;
      const safeDetails = t.details || '';
      const safeDate = t.date || '';
      const safeType = t.type === 'credit' ? 'credit' : 'debit';

      if (safeType === 'debit') { balance += safeAmount; dTotal += safeAmount; }
      else { balance -= safeAmount; cTotal += safeAmount; }
      
      return { ...t, amount: safeAmount, details: safeDetails, date: safeDate, type: safeType, balance };
    });
    
    setTransactions(withBalance.reverse());
    setTotalDebit(dTotal);
    setTotalCredit(cTotal);
    setLoading(false);
  }, [clientId]);

  useEffect(() => { loadData(); }, [loadData]);

  const netBalance = totalDebit - totalCredit;
  const budgetLimit = client?.budgetLimit || 0;
  const remaining = budgetLimit - totalDebit + totalCredit;
  const consumed = budgetLimit > 0 ? Math.min(((totalDebit - totalCredit) / budgetLimit) * 100, 100) : 0;
  const isOverBudget = budgetLimit > 0 && remaining < 0;

  const filteredTransactions = searchQuery
    ? transactions.filter(tx => 
        (tx.details || '').includes(searchQuery) || 
        (tx.amount || 0).toString().includes(searchQuery) || 
        (tx.date || '').includes(searchQuery)
      )
    : transactions;

  const handleTouchStart = (tx: Transaction & { balance: number }) => {
    pressTimer.current = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(50);
      setLongPressedTx(tx);
    }, 500); 
  };

  const handleTouchEnd = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  const handleSaveLimit = async () => {
    if (!client?.id) return;
    await updateClient(client.id, { budgetLimit: Number(newLimit) });
    setShowLimitModal(false);
    loadData();
    toast.success('تم تحديث سقف الحساب بنجاح');
  };

  const handleCloseBalance = async () => {
    if (!client?.id || netBalance === 0) {
      toast.info('الرصيد مصفر بالفعل');
      setShowCloseBalanceModal(false);
      return;
    }
    const amountToZero = Math.abs(netBalance);
    const type = netBalance >= 0 ? 'credit' : 'debit'; 
    await dbAddTransaction({ 
      clientId: client.id, 
      amount: amountToZero, 
      type, 
      date: new Date().toISOString().split('T')[0], 
      details: 'إغلاق وتصفية الحساب' 
    });
    setShowCloseBalanceModal(false);
    loadData();
    toast.success('تم تصفية الرصيد بنجاح ✓');
  };

  const startEditTx = (tx: Transaction & { balance: number }) => {
    setEditingTx(tx);
    setEditAmount((tx.amount || 0).toString());
    setEditDetails(tx.details || '');
    setEditDate(tx.date || '');
    setEditType(tx.type);
  };

  const saveEditTx = async () => {
    if (!editingTx?.id) return;
    await updateTransaction(editingTx.id, {
      amount: parseFloat(editAmount) || 0,
      details: editDetails.trim(),
      date: editDate,
      type: editType,
    });
    setEditingTx(null);
    toast.success('تم تعديل المعاملة ✓');
    loadData();
  };

  const confirmDeleteTx = async () => {
    if (showDeleteConfirm === null) return;
    await dbDeleteTransaction(showDeleteConfirm);
    setShowDeleteConfirm(null);
    toast.success('تم حذف المعاملة');
    loadData();
  };

  const handleClearAllTransactions = async () => {
    if (!client?.id) return;
    await deleteAllTransactions(client.id);
    setShowDeleteAllConfirm(false);
    setShowMenu(false);
    toast.success('تم حذف جميع المعاملات بنجاح');
    loadData();
  };

  const handleRatingChange = async (rating: 'excellent' | 'average' | 'poor') => {
    if (!client?.id) return;
    await updateClient(client.id, { rating });
    setClient(prev => prev ? { ...prev, rating } : prev);
    toast.success('تم تحديث التقييم ✓');
  };

  const handleAddNote = async (note: string) => {
    if (!client?.id) return;
    const updatedNotes = [...(client.notes || []), note];
    await updateClient(client.id, { notes: updatedNotes });
    setClient(prev => prev ? { ...prev, notes: updatedNotes } : prev);
  };

  const handleDeleteNote = async (index: number) => {
    if (!client?.id) return;
    const updatedNotes = [...(client.notes || [])];
    updatedNotes.splice(index, 1);
    await updateClient(client.id, { notes: updatedNotes });
    setClient(prev => prev ? { ...prev, notes: updatedNotes } : prev);
  };

  const handleColorSelect = async (color: string) => {
    if (!longPressedTx?.id) return;
    await updateTransaction(longPressedTx.id, { color });
    setLongPressedTx(null);
    setShowColorPicker(false);
    loadData();
    toast.success('تم تلوين المعاملة ✓');
  };

  const handleSharePDF = async () => {
    if (!client) return;
    toast.info('جاري تجهيز ملف PDF...');
    try {
      const blob = await exportLedgerPDF(client, transactions, totalDebit, totalCredit, netBalance);
      const fileName = `كشف_حساب_${client.name}.pdf`;
      const file = new File([blob], fileName, { type: 'application/pdf' });
      await shareFileNative(file, 'كشف حساب PDF', `كشف حساب العميل ${client.name}`);
    } catch (error) {
      toast.error('حدث خطأ أثناء تصدير PDF');
    }
    setShowShareModal(false);
  };

  const handleShareExcel = async () => {
    if (!client) return;
    toast.info('جاري تجهيز ملف الإكسل...');
    try {
      const file = await generateExcelFile(client, transactions);
      await shareFileNative(file, 'كشف حساب Excel', `كشف حساب العميل ${client.name}`);
    } catch (error) {
      toast.error('حدث خطأ أثناء تصدير Excel');
    }
    setShowShareModal(false);
  };

  const handleShareText = async () => {
    if (!client) return;
    const text = generateShareText(client, transactions, totalDebit, totalCredit, netBalance);
    await shareTextNative(`كشف حساب ${client.name}`, text);
    setShowShareModal(false);
  };

  const handleShareImage = async () => {
    toast.info('جاري تجهيز الصورة، الرجاء الانتظار...');
    try {
      const module = await import('html2canvas');
      const html2canvas = (module as any).default || (module as any);
      const element = document.getElementById('ledger-content-to-capture');
      if (!element) return;

      const canvas = await html2canvas(element, {
        useCORS: true,
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
      });

      canvas.toBlob(async (blob: Blob | null) => {
        if (blob) {
          const fileName = `كشف_حساب_${client?.name || 'عميل'}.png`;
          const file = new File([blob], fileName, { type: 'image/png' });
          await shareFileNative(file, 'صورة كشف الحساب', `كشف حساب العميل ${client?.name}`);
        }
      }, 'image/png');
    } catch (error) {
      toast.error('فشل إنشاء الصورة');
    }
    setShowShareModal(false);
  };

  return (
    <div className="min-h-screen bg-background pb-28 flex flex-col overflow-x-hidden" dir="rtl">
      <AppHeader
        title={client?.name ? <span className="font-extrabold text-xl pr-2 block max-w-[55vw] truncate">{client.name}</span> : '...'}
        showBack
        actions={
          <div className="flex items-center gap-2">
            {client?.rating === 'excellent' && <div className="flex gap-0.5"><Star className="w-4 h-4 fill-green-500 text-green-500"/><Star className="w-4 h-4 fill-green-500 text-green-500"/><Star className="w-4 h-4 fill-green-500 text-green-500"/></div>}
            {client?.rating === 'average' && <div className="flex gap-0.5"><Star className="w-4 h-4 fill-yellow-500 text-yellow-500"/><Star className="w-4 h-4 fill-yellow-500 text-yellow-500"/></div>}
            {client?.rating === 'poor' && <Star className="w-4 h-4 fill-red-500 text-red-500"/>}
            <button onClick={() => setShowMenu(!showMenu)} className="p-1"><MoreVertical className="w-7 h-7 text-white drop-shadow-md" /></button>
          </div>
        }
      />

      {showMenu && (
        <div className="fixed inset-0 z-50" onClick={() => setShowMenu(false)}>
          <div className="absolute top-14 left-4 w-60 bg-card border border-border shadow-2xl rounded-xl overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>
            <button onClick={() => {setShowSearch(true); setShowMenu(false);}} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold border-b border-border/50 hover:bg-muted transition-colors text-right">
              <Search className="w-4 h-4 text-primary" /> بحث متقدم
            </button>
            <button onClick={() => {setShowNotes(true); setShowMenu(false);}} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold border-b border-border/50 hover:bg-muted transition-colors text-right">
              <StickyNote className="w-4 h-4 text-primary" /> ملاحظات العميل
            </button>
            <button onClick={() => {setShowLimitModal(true); setShowMenu(false);}} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold border-b border-border/50 hover:bg-muted transition-colors text-right">
              <ShieldAlert className="w-4 h-4 text-primary" /> سقف الحساب
            </button>
            <button onClick={() => {setShowRatingModal(true); setShowMenu(false);}} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold border-b border-border/50 hover:bg-muted transition-colors text-right">
              <Star className="w-4 h-4 text-yellow-500" /> تقييم العميل
            </button>
            <button onClick={() => {setShowDeleteAllConfirm(true); setShowMenu(false);}} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors text-right">
              <Eraser className="w-4 h-4 text-red-600" /> مسح كل المعاملات
            </button>
          </div>
        </div>
      )}

      {budgetLimit > 0 && (
        <div className="mx-3 mt-3 rounded-2xl overflow-hidden shadow-xl border border-white/10 animate-fade-in">
          <div className="bg-gradient-to-l from-[#5D4037] to-[#8D6E63] text-white p-5">
            <div className="flex justify-between items-end mb-4">
              <div className="flex flex-col text-right">
                <span className="text-[11px] font-bold opacity-80 mb-1">المتبقي</span>
                <span className="text-4xl font-black tracking-tight" dir="ltr">{formatNumber(remaining)}</span>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="bg-black/20 px-3 py-1.5 rounded-lg text-right min-w-[80px]">
                  <span className="text-[10px] block opacity-70">السقف</span>
                  <span className="text-sm font-bold" dir="ltr">{formatNumber(budgetLimit)}</span>
                </div>
                <div className

            <footer className="fixed bottom-0 left-0 right-0 bg-[#5D4037] text-white p-3 z-40 pb-safe shadow-[0_-4px_10px_rgba(0,0,0,0.15)]">
        <div className="flex items-center justify-between px-2 w-full">
          <button onClick={() => navigate(`/add-transaction?clientId=${client?.id}`)} className="w-14 h-14 bg-white text-[#5D4037] rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-transform">
            <Plus className="w-8 h-8 font-black" />
          </button>
          <div className="flex flex-col items-center bg-black/20 py-2 px-6 rounded-2xl">
            <span className="text-[10px] font-bold opacity-70 mb-0.5">الرصيد النهائي</span>
            <div className="flex items-center gap-1">
              <span className="text-xs font-bold">{netBalance >= 0 ? 'عليه' : 'له'}</span>
              <span className={`text-2xl font-black ${netBalance >= 0 ? 'text-red-300' : 'text-green-300'}`} dir="ltr">{formatNumber(Math.abs(netBalance))}</span>
            </div>
          </div>
          <button onClick={() => setShowShareModal(true)} className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center active:scale-90 transition-transform">
            <Share2 className="w-6 h-6" />
          </button>
        </div>
      </footer>

      {showShareModal && (
        <div className="fixed inset-0 bg-foreground/50 backdrop-blur-sm z-[100] flex items-end justify-center animate-fade-in" onClick={() => setShowShareModal(false)}>
          <div className="bg-card w-full rounded-t-3xl p-6 space-y-5 animate-slide-up shadow-2xl border-t border-border" onClick={e => e.stopPropagation()} dir="rtl">
            <div className="w-12 h-1.5 bg-muted mx-auto rounded-full mb-2" />
            <div className="text-center">
              <h3 className="text-xl font-extrabold text-foreground">مشاركة كشف الحساب</h3>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <button onClick={handleSharePDF} className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-primary/5 hover:bg-primary/10 border border-primary/10 transition-all group active:scale-95">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center transition-transform"><FileDown className="w-6 h-6 text-primary" /></div>
                <span className="font-bold text-sm">ملف PDF</span>
              </button>
              <button onClick={handleShareImage} className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-primary/5 hover:bg-primary/10 border border-primary/10 transition-all group active:scale-95">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center transition-transform"><ImageIcon className="w-6 h-6 text-primary" /></div>
                <span className="font-bold text-sm">صورة كشف</span>
              </button>
              <button onClick={handleShareExcel} className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-primary/5 hover:bg-primary/10 border border-primary/10 transition-all group active:scale-95">
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

      {showNotes && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-end justify-center animate-fade-in" onClick={() => setShowNotes(false)}>
          <div className="bg-white w-full max-h-[85vh] rounded-t-3xl p-6 overflow-y-auto animate-slide-up" onClick={e => e.stopPropagation()}>
             <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-black">ملاحظات {client?.name}</h3>
                <button onClick={() => setShowNotes(false)} className="bg-muted p-2 rounded-full"><X className="w-5 h-5"/></button>
             </div>
             <div className="relative mb-6">
                <textarea id="note-input" placeholder="اكتب ملاحظة جديدة هنا..." className="w-full bg-muted border-none rounded-2xl p-4 text-sm font-bold min-h-[100px] outline-none" />
                <button onClick={() => { const el = document.getElementById('note-input') as HTMLTextAreaElement; handleAddNote(el.value); el.value = ''; }} className="absolute bottom-3 left-3 bg-[#5D4037] text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md">حفظ</button>
             </div>
             <div className="space-y-3">
                {client?.notes?.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground opacity-50">لا توجد ملاحظات</div>
                ) : (
                  client?.notes?.map((note, i) => (
                    <div key={i} className="bg-muted/50 p-4 rounded-2xl flex justify-between gap-3 group">
                       <p className="text-sm font-bold leading-relaxed flex-1">{note}</p>
                       <div className="flex flex-col gap-2">
                          <button onClick={() => navigator.clipboard.writeText(note)} className="p-2 bg-white rounded-lg shadow-sm"><Copy className="w-4 h-4 text-blue-600"/></button>
                          <button onClick={() => handleDeleteNote(i)} className="p-2 bg-white rounded-lg shadow-sm"><Trash2 className="w-4 h-4 text-red-500"/></button>
                       </div>
                    </div>
                  ))
                )}
             </div>
          </div>
        </div>
      )}

      {showRatingModal && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowRatingModal(false)}>
          <Card className="shadow-2xl w-full max-w-xs border-0 rounded-3xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-[#5D4037] p-4 text-white text-center font-black">تقييم العميل</div>
            <CardContent className="p-5 space-y-3 bg-card">
              <button onClick={() => { handleRatingChange('excellent'); setShowRatingModal(false); }} className="w-full p-4 rounded-2xl bg-green-50 text-green-700 font-bold border-2 border-green-200">ممتاز (3 نجوم)</button>
              <button onClick={() => { handleRatingChange('average'); setShowRatingModal(false); }} className="w-full p-4 rounded-2xl bg-yellow-50 text-yellow-700 font-bold border-2 border-yellow-200">جيد (نجمتين)</button>
              <button onClick={() => { handleRatingChange('poor'); setShowRatingModal(false); }} className="w-full p-4 rounded-2xl bg-red-50 text-red-700 font-bold border-2 border-red-200">سيئ (نجمة واحدة)</button>
              <button onClick={() => setShowRatingModal(false)} className="w-full mt-2 py-3 font-bold text-muted-foreground">إلغاء</button>
            </CardContent>
          </Card>
        </div>
      )}

      {longPressedTx && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[110] flex items-center justify-center p-6 animate-fade-in" onClick={() => setLongPressedTx(null)}>
          <Card className="w-full max-w-xs shadow-2xl rounded-3xl overflow-hidden text-right" onClick={e => e.stopPropagation()}>
            <div className="bg-[#5D4037] p-4 text-white text-center font-black">{formatNumber(longPressedTx.amount)}</div>
            <div className="p-3 grid grid-cols-1 gap-2 bg-card">
              <button onClick={() => { startEditTx(longPressedTx); setLongPressedTx(null); }} className="flex items-center justify-end gap-3 p-3 hover:bg-muted rounded-xl font-bold"><span className="flex-1 text-right">تعديل المعاملة</span><Pencil className="w-5 h-5 text-blue-500" /></button>
              <button onClick={() => { setShowColorPicker(true); }} className="flex items-center justify-end gap-3 p-3 hover:bg-muted rounded-xl font-bold"><span className="flex-1 text-right">تلوين المعاملة</span><Palette className="w-5 h-5 text-purple-500" /></button>
              <button onClick={() => { setShowDeleteConfirm(longPressedTx.id!); setLongPressedTx(null); }} className="flex items-center justify-end gap-3 p-3 bg-red-50 text-red-600 rounded-xl font-bold"><span className="flex-1 text-right">حذف المعاملة</span><Trash2 className="w-5 h-5" /></button>
            </div>
          </Card>
        </div>
      )}

      {showColorPicker && (
        <div className="fixed inset-0 bg-black/60 z-[120] flex items-center justify-center animate-fade-in" onClick={() => setShowColorPicker(false)}>
           <Card className="p-6 w-80 rounded-3xl shadow-2xl" onClick={e => e.stopPropagation()} dir="rtl">
              <h4 className="text-center font-black mb-5 text-[#5D4037] text-lg">اختر لون التمييز</h4>
              <div className="grid grid-cols-4 gap-4">
                 {[
                   { name: 'افتراضي', color: '' }, { name: 'أحمر', color: '#fee2e2' }, { name: 'أخضر', color: '#dcfce7' }, { name: 'أصفر', color: '#fef3c7' },
                   { name: 'أزرق', color: '#dbeafe' }, { name: 'بنفسجي', color: '#f3e8ff' }, { name: 'برتقالي', color: '#ffedd5' }, { name: 'رمادي', color: '#f3f4f6' }
                 ].map(c => (
                   <button key={c.name} onClick={() => handleColorSelect(c.color)} className="flex flex-col items-center gap-2 active:scale-90 transition-transform">
                      <div className="w-12 h-12 rounded-full border-2 border-border shadow-sm" style={{ backgroundColor: c.color || '#fff' }} />
                      <span className="text-[10px] font-bold text-muted-foreground">{c.name}</span>
                   </button>
                 ))}
              </div>
              <button onClick={() => setShowColorPicker(false)} className="w-full mt-6 py-3 bg-muted rounded-xl font-bold hover:opacity-90">إلغاء</button>
           </Card>
        </div>
      )}

      {showLimitModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowLimitModal(false)}>
          <Card className="shadow-2xl w-full max-w-xs border-0 animate-scale-in rounded-3xl overflow-hidden" onClick={e => e.stopPropagation()} dir="rtl">
            <div className="bg-[#5D4037] p-4 text-white text-center">
               <h3 className="text-lg font-black flex items-center justify-center gap-2"><ShieldAlert className="w-5 h-5"/> سقف الحساب</h3>
            </div>
            <CardContent className="p-5 space-y-4 bg-card">
              <input className="w-full border border-input rounded-xl px-4 py-3 text-left bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-[#5D4037] font-sans text-lg tracking-wider font-bold" type="number" lang="en" dir="ltr" value={newLimit} onChange={e => setNewLimit(e.target.value)} placeholder="0" />
              <button onClick={handleSaveLimit} className="w-full bg-[#5D4037] text-white py-3 rounded-xl font-bold active:scale-95 transition-transform">حفظ السقف</button>
            </CardContent>
          </Card>
        </div>
      )}

      {editingTx && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4 animate-fade-in" onClick={() => setEditingTx(null)}>
          <Card className="w-full max-w-sm p-5 space-y-4 rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg text-center flex items-center justify-center gap-2 mb-2"><Pencil className="w-5 h-5"/> تعديل المعاملة</h3>
            <input type="number" className="w-full border p-3 rounded-xl outline-none" value={editAmount} onChange={e => setEditAmount(e.target.value)} placeholder="المبلغ" />
            <input type="text" className="w-full border p-3 rounded-xl outline-none" value={editDetails} onChange={e => setEditDetails(e.target.value)} placeholder="التفاصيل" />
            <input type="date" className="w-full border p-3 rounded-xl outline-none text-right" lang="en" dir="ltr" value={editDate} onChange={e => setEditDate(e.target.value)} />
            <div className="flex gap-4 justify-center py-2">
              <label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={editType === 'debit'} onChange={() => setEditType('debit')} className="w-5 h-5" /><span className="font-bold">عليه</span></label>
              <label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={editType === 'credit'} onChange={() => setEditType('credit')} className="w-5 h-5" /><span className="font-bold">له</span></label>
            </div>
            <div className="flex gap-2">
              <button onClick={saveEditTx} className="flex-1 bg-[#5D4037] text-white py-3 rounded-xl font-bold">حفظ</button>
              <button onClick={() => setEditingTx(null)} className="flex-1 bg-muted py-3 rounded-xl font-bold">إلغاء</button>
            </div>
          </Card>
        </div>
      )}
      
      {showDeleteConfirm !== null && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowDeleteConfirm(null)}>
          <Card className="shadow-2xl w-full max-w-xs border-0 rounded-3xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <CardContent className="p-6 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-red-100 flex items-center justify-center"><Trash2 className="w-7 h-7 text-red-600" /></div>
              <h2 className="text-lg font-bold">حذف المعاملة</h2>
              <p className="text-sm text-muted-foreground">هل أنت متأكد من حذف هذه المعاملة؟</p>
              <div className="flex gap-2">
                <button onClick={confirmDeleteTx} className="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-bold">حذف</button>
                <button onClick={() => setShowDeleteConfirm(null)} className="flex-1 bg-muted py-2.5 rounded-lg font-bold">إلغاء</button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {showDeleteAllConfirm && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowDeleteAllConfirm(false)}>
          <Card className="shadow-2xl w-full max-w-xs border-0 rounded-3xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <CardContent className="p-6 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-red-100 flex items-center justify-center"><Eraser className="w-7 h-7 text-red-600" /></div>
              <h2 className="text-lg font-bold">حذف جميع المعاملات</h2>
              <p className="text-sm text-muted-foreground">هل أنت متأكد من مسح السجل بالكامل؟</p>
              <div className="flex gap-2">
                <button onClick={handleClearAllTransactions} className="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-bold">مسح</button>
                <button onClick={() => setShowDeleteAllConfirm(false)} className="flex-1 bg-muted py-2.5 rounded-lg font-bold">إلغاء</button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default LedgerPage;
