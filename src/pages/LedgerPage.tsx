import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getClient, getTransactionsByClient, addTransaction as dbAddTransaction, updateTransaction, deleteTransaction as dbDeleteTransaction, updateClient, type Client, type Transaction } from '@/lib/db';
import AppHeader from '@/components/AppHeader';
import ClientNotesSheet from '@/components/ClientNotesSheet';
import { Card, CardContent } from '@/components/ui/card';
import { Share2, Plus, AlertTriangle, Pencil, Trash2, X, StickyNote, HelpCircle, MoreVertical, Search, Lock, ShieldAlert, Palette, FileDown, Type, Image as ImageIcon, FileSpreadsheet, ArrowDown, ArrowUp, CheckSquare, Square, ArrowLeftRight, Copy, Star } from 'lucide-react';
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
  
  // States
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDetails, setEditDetails] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editType, setEditType] = useState<'debit' | 'credit'>('debit'); 
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false); 
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [newLimit, setNewLimit] = useState('');
  const [showCloseBalanceModal, setShowCloseBalanceModal] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  // Selection & Context Menu States
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedTxIds, setSelectedTxIds] = useState<number[]>([]);
  const [contextMenuTx, setContextMenuTx] = useState<(Transaction & { balance: number }) | null>(null);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);

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
      if (t.type === 'debit') { balance += safeAmount; dTotal += safeAmount; }
      else { balance -= safeAmount; cTotal += safeAmount; }
      return { ...t, balance };
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

  // Handlers
  const handleTouchStart = (tx: Transaction & { balance: number }) => {
    pressTimer.current = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(50);
      if (isSelectionMode) return;
      setContextMenuTx(tx);
    }, 600);
  };

  const handleTouchEnd = () => { if (pressTimer.current) clearTimeout(pressTimer.current); };

  const handleRowClick = (tx: Transaction & { balance: number }) => {
    if (isSelectionMode) {
      setSelectedTxIds(prev => prev.includes(tx.id!) ? prev.filter(id => id !== tx.id) : [...prev, tx.id!]);
    }
  };

  const handleCopyNote = (note: string) => {
    navigator.clipboard.writeText(note);
    toast.success('تم نسخ الملاحظة');
  };

  const handleSaveLimit = async () => {
    if (!client?.id) return;
    await updateClient(client.id, { budgetLimit: Number(newLimit) });
    setShowLimitModal(false);
    loadData();
    toast.success('تم تحديث السقف');
  };

  const handleRatingChange = async (rating: 'excellent' | 'average' | 'poor') => {
    if (!client?.id) return;
    await updateClient(client.id, { rating });
    setClient(prev => prev ? { ...prev, rating } : prev);
    toast.success('تم تحديث التقييم');
  };

  const handleAddNote = async (note: string) => {
    if (!client?.id || !note.trim()) return;
    const updatedNotes = [...(client.notes || []), note.trim()];
    await updateClient(client.id, { notes: updatedNotes });
    setClient(prev => prev ? { ...prev, notes: updatedNotes } : prev);
    toast.success('تم حفظ الملاحظة');
  };

  const handleDeleteNote = async (index: number) => {
    if (!client?.id) return;
    const updatedNotes = (client.notes || []).filter((_, i) => i !== index);
    await updateClient(client.id, { notes: updatedNotes });
    setClient(prev => prev ? { ...prev, notes: updatedNotes } : prev);
  };

  const handleColorSelect = async (color: string) => {
    if (!contextMenuTx?.id) return;
    await updateTransaction(contextMenuTx.id, { color });
    setContextMenuTx(null);
    setShowColorPicker(false);
    loadData();
    toast.success('تم التلوين');
  };

  const deleteSingleTx = async () => {
    if (!contextMenuTx?.id) return;
    await dbDeleteTransaction(contextMenuTx.id);
    setContextMenuTx(null);
    loadData();
    toast.success('تم حذف المعاملة');
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

  // ---------------- الدوال التي كانت مفقودة وتسببت بالشاشة البيضاء ---------------- //
  const handleSharePDF = async () => {
    if (!client) return;
    toast.info('جاري تجهيز ملف PDF...');
    try {
      const blob = await exportLedgerPDF(client, transactions, totalDebit, totalCredit, netBalance);
      const fileName = `كشف_حساب_${client.name}.pdf`;
      const file = new File([blob], fileName, { type: 'application/pdf' });
      await shareFileNative(file, 'كشف حساب PDF', `كشف حساب العميل ${client.name}`);
    } catch (error) { toast.error('حدث خطأ أثناء تصدير PDF'); }
    setShowShareModal(false);
  };

  const handleShareExcel = async () => {
    if (!client) return;
    toast.info('جاري تجهيز ملف الإكسل...');
    try {
      const file = await generateExcelFile(client, transactions);
      await shareFileNative(file, 'كشف حساب Excel', `كشف حساب العميل ${client.name}`);
    } catch (error) { toast.error('حدث خطأ أثناء تصدير Excel'); }
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
      const canvas = await html2canvas(element, { useCORS: true, scale: 2, backgroundColor: '#ffffff', logging: false });
      canvas.toBlob(async (blob: Blob | null) => {
        if (blob) {
          const fileName = `كشف_حساب_${client?.name || 'عميل'}.png`;
          const file = new File([blob], fileName, { type: 'image/png' });
          await shareFileNative(file, 'صورة كشف الحساب', `كشف حساب العميل ${client?.name}`);
        }
      }, 'image/png');
    } catch (error) { toast.error('فشل إنشاء الصورة'); }
    setShowShareModal(false);
  };
  // ----------------------------------------------------------------------------- //

  const renderRatingStars = () => {
    if (!client?.rating) return null;
    return (
      <div className="flex items-center gap-0.5" dir="ltr">
        {client.rating === 'excellent' && (
          <>
            <Star className="w-4 h-4 fill-green-500 text-green-500" />
            <Star className="w-4 h-4 fill-green-500 text-green-500" />
            <Star className="w-4 h-4 fill-green-500 text-green-500" />
          </>
        )}
        {client.rating === 'average' && (
          <>
            <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
            <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
          </>
        )}
        {client.rating === 'poor' && (
          <Star className="w-4 h-4 fill-red-500 text-red-500" />
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background pb-28 flex flex-col overflow-x-hidden">
      <AppHeader
        title={client?.name ? <span className="font-extrabold text-xl pr-2 block max-w-[55vw] truncate">{client.name}</span> : '...'}
        showBack
        actions={
          <div className="flex items-center gap-2">
            {renderRatingStars()}
            <button onClick={() => setShowMenu(!showMenu)} className="p-1">
              <MoreVertical className="w-7 h-7 text-white drop-shadow-md" />
            </button>
          </div>
        }
      />

      {/* Dropdown Menu */}
      {showMenu && (
        <div className="fixed inset-0 z-50" onClick={() => setShowMenu(false)}>
          <div className="absolute top-14 left-4 w-60 bg-card border border-border shadow-2xl rounded-xl overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()} dir="rtl">
            <button onClick={() => { setShowSearch(true); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold border-b border-border/50 hover:bg-muted transition-colors">
              <Search className="w-4 h-4 text-primary" /> بحث متقدم
            </button>
            <button onClick={() => { setShowNotes(true); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold border-b border-border/50 hover:bg-muted transition-colors">
              <StickyNote className="w-4 h-4 text-primary" /> قائمة الملاحظات الحديثة
            </button>
            <button onClick={() => { setShowLimitModal(true); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold border-b border-border/50 hover:bg-muted transition-colors">
              <ShieldAlert className="w-4 h-4 text-primary" /> سقف الحساب
            </button>
            <button onClick={() => { setShowRatingModal(true); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold border-b border-border/50 hover:bg-muted transition-colors">
              <Star className="w-4 h-4 text-yellow-500" /> تقييم حالة العميل
            </button>
            <button onClick={() => { setIsSelectionMode(!isSelectionMode); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-destructive hover:bg-destructive/10">
              <Trash2 className="w-4 h-4" /> تحديد وحذف معاملات
            </button>
          </div>
        </div>
      )}

      {/* Selection Mode Header */}
      {isSelectionMode && (
        <div className="fixed top-0 left-0 right-0 h-14 bg-header text-header z-[60] flex items-center justify-between px-4 shadow-lg animate-fade-in" dir="rtl">
          <div className="flex items-center gap-4">
            <button onClick={() => {setIsSelectionMode(false); setSelectedTxIds([]);}} className="p-2 bg-white/20 rounded-lg"><X className="w-5 h-5"/></button>
            <span className="font-bold">{selectedTxIds.length} محدد</span>
          </div>
          <button className="flex items-center gap-2 bg-red-500 px-4 py-1.5 rounded-lg text-sm font-bold shadow-md active:scale-95 transition-transform">حذف المحدد</button>
        </div>
      )}

      {/* Budget Box */}
      {budgetLimit > 0 && (
        <div className="mx-3 mt-3 rounded-2xl overflow-hidden shadow-xl border border-white/10 animate-fade-in">
          <div className="bg-gradient-to-l from-[#5D4037] to-[#8D6E63] text-white p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex flex-col items-start">
                <span className="text-[10px] font-bold opacity-80 mb-1">المتبقي من السقف</span>
                <span className={`text-4xl font-black tracking-tight ${isOverBudget ? 'text-red-400' : 'text-yellow-400'}`} dir="ltr">
                  {formatNumber(remaining)}
                </span>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="bg-black/20 px-3 py-1 rounded-lg text-right">
                  <span className="text-[10px] block opacity-70">السقف</span>
                  <span className="text-sm font-bold" dir="ltr">{formatNumber(budgetLimit)}</span>
                </div>
                <div className="bg-black/20 px-3 py-1 rounded-lg text-right">
                  <span className="text-[10px] block opacity-70">الاستهلاك</span>
                  <span className="text-sm font-bold" dir="ltr">{formatNumber(totalDebit - totalCredit)}</span>
                </div>
              </div>
            </div>
            <div className="w-full h-3 bg-black/30 rounded-full overflow-hidden shadow-inner">
              <div className={`h-full rounded-full transition-all duration-1000 ${isOverBudget ? 'bg-red-500' : 'bg-yellow-400'}`} style={{ width: `${Math.min(consumed, 100)}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Transactions Table */}
      <div id="ledger-content-to-capture" className="p-3 flex-1 mt-2">
        <Card className="shadow-lg border-0 overflow-hidden rounded-2xl">
          <CardContent className="p-0">
            {showSearch && (
              <div className="p-3 bg-muted/10 border-b border-border flex items-center gap-2 animate-slide-down" dir="rtl">
                <Search className="w-5 h-5 text-muted-foreground" />
                <input autoFocus placeholder="بحث سريع..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-transparent outline-none font-bold text-sm" />
                <button onClick={() => setShowSearch(false)}><X className="w-5 h-5"/></button>
              </div>
            )}
            <div className="bg-[#5D4037] text-white flex text-center text-[11px] font-extrabold py-3 px-3 shadow-md" dir="rtl">
              <div className="w-[65px] text-right">التاريخ</div>
              <div className="w-[80px]">المبلغ</div>
              <div className="flex-1 text-right pr-4">التفاصيل والبيان</div>
              <div className="w-[75px] text-left">الرصيد</div>
            </div>
            <div className="divide-y divide-border/30 select-none" dir="rtl">
              {transactions.filter(tx => (tx.details || '').includes(searchQuery) || (tx.amount || 0).toString().includes(searchQuery)).map((tx, idx) => (
                <div
                  key={tx.id || idx}
                  onTouchStart={() => handleTouchStart(tx)}
                  onTouchEnd={handleTouchEnd}
                  onMouseDown={() => handleTouchStart(tx)}
                  onMouseUp={handleTouchEnd}
                  onClick={() => handleRowClick(tx)}
                  className={`flex py-4 px-3 items-center transition-all relative ${selectedTxIds.includes(tx.id!) ? 'bg-primary/20 scale-[0.98]' : idx % 2 === 0 ? 'bg-white' : 'bg-muted/5'}`}
                  style={{ backgroundColor: !selectedTxIds.includes(tx.id!) && tx.color ? tx.color : undefined }}
                >
                  {isSelectionMode && (
                    <div className="absolute right-1 top-1/2 -translate-y-1/2">
                      {selectedTxIds.includes(tx.id!) ? <CheckSquare className="text-primary w-5 h-5" /> : <Square className="text-muted-foreground w-5 h-5" />}
                    </div>
                  )}
                  <div className={`w-[65px] text-right text-[10px] font-bold text-muted-foreground whitespace-nowrap ${isSelectionMode ? 'pr-6' : ''}`}>{tx.date}</div>
                  <div className={`w-[80px] flex items-center justify-center gap-1 font-black text-xs ${tx.type === 'debit' ? 'text-red-600' : 'text-green-600'}`}>
                    {tx.type === 'debit' ? <ArrowDown className="w-3 h-3"/> : <ArrowUp className="w-3 h-3"/>}
                    <span dir="ltr">{formatNumber(tx.amount)}</span>
                  </div>
                  <div className="flex-1 text-right text-[13px] font-bold text-foreground break-words pr-4 leading-tight">{tx.details}</div>
                  <div className="w-[75px] text-left font-bold text-[12px] text-foreground/80" dir="ltr">{formatNumber(Math.abs(tx.balance))}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Bar */}
      <footer className="fixed bottom-0 left-0 right-0 bg-[#5D4037] text-white p-3 z-40 pb-safe shadow-[0_-4px_10px_rgba(0,0,0,0.15)]">
        <div className="flex items-center justify-between px-2 w-full">
          <button onClick={() => setShowShareModal(true)} className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center active:scale-90 transition-transform">
            <Share2 className="w-6 h-6" />
          </button>
          <div className="flex flex-col items-center bg-black/20 py-2 px-6 rounded-2xl">
            <span className="text-[10px] font-bold opacity-70 mb-0.5">الرصيد النهائي</span>
            <div className="flex items-center gap-1" dir="rtl">
              <span className="text-xs font-bold">{netBalance >= 0 ? 'عليه' : 'له'}</span>
              <span className={`text-2xl font-black ${netBalance >= 0 ? 'text-red-300' : 'text-green-300'}`} dir="ltr">
                {formatNumber(Math.abs(netBalance))}
              </span>
            </div>
          </div>
          <button onClick={() => navigate(`/add-transaction?clientId=${client?.id}`)} className="w-14 h-14 bg-white text-[#5D4037] rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-transform">
            <Plus className="w-8 h-8 font-black" />
          </button>
        </div>
      </footer>

      {/* Rating Modal */}
      {showRatingModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowRatingModal(false)}>
          <Card className="shadow-2xl w-full max-w-xs border-0 animate-scale-in rounded-3xl overflow-hidden" onClick={e => e.stopPropagation()} dir="rtl">
            <div className="bg-[#5D4037] p-4 text-white text-center">
               <h3 className="text-lg font-black flex items-center justify-center gap-2"><Star className="w-5 h-5"/> تقييم العميل</h3>
            </div>
            <CardContent className="p-5 space-y-3 bg-card">
              <button onClick={() => { handleRatingChange('excellent'); setShowRatingModal(false); }} className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all active:scale-95 ${client?.rating === 'excellent' ? 'border-green-500 bg-green-50' : 'border-border hover:bg-muted'}`}>
                <span className="font-bold text-green-700">ممتاز في الدفع</span>
                <div className="flex gap-1">
                  <Star className="w-5 h-5 fill-green-500 text-green-500"/><Star className="w-5 h-5 fill-green-500 text-green-500"/><Star className="w-5 h-5 fill-green-500 text-green-500"/>
                </div>
              </button>
              <button onClick={() => { handleRatingChange('average'); setShowRatingModal(false); }} className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all active:scale-95 ${client?.rating === 'average' ? 'border-yellow-500 bg-yellow-50' : 'border-border hover:bg-muted'}`}>
                <span className="font-bold text-yellow-700">جيد في الدفع</span>
                <div className="flex gap-1">
                  <Star className="w-5 h-5 fill-yellow-500 text-yellow-500"/><Star className="w-5 h-5 fill-yellow-500 text-yellow-500"/>
                </div>
              </button>
              <button onClick={() => { handleRatingChange('poor'); setShowRatingModal(false); }} className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all active:scale-95 ${client?.rating === 'poor' ? 'border-red-500 bg-red-50' : 'border-border hover:bg-muted'}`}>
                <span className="font-bold text-red-700">سيئ في الدفع</span>
                <div className="flex gap-1">
                  <Star className="w-5 h-5 fill-red-500 text-red-500"/>
                </div>
              </button>
              <button onClick={() => setShowRatingModal(false)} className="w-full mt-2 bg-muted text-foreground py-3 rounded-xl font-bold hover:opacity-90">إلغاء</button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit Tx Modal */}
      {editingTx && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-[80] flex items-center justify-center p-4 animate-fade-in" onClick={() => setEditingTx(null)}>
          <Card className="w-full max-w-sm p-5 space-y-4 rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()} dir="rtl">
            <h3 className="font-bold text-lg text-center flex items-center justify-center gap-2 mb-2"><Pencil className="w-5 h-5"/> تعديل المعاملة</h3>
            <input type="number" className="w-full border p-3 rounded-xl outline-none" value={editAmount} onChange={e => setEditAmount(e.target.value)} placeholder="المبلغ" />
            <input type="text" className="w-full border p-3 rounded-xl outline-none" value={editDetails} onChange={e => setEditDetails(e.target.value)} placeholder="التفاصيل" />
            <input type="date" className="w-full border p-3 rounded-xl outline-none text-right" lang="en" dir="ltr" value={editDate} onChange={e => setEditDate(e.target.value)} />
            <div className="flex gap-4 justify-center py-2">
              <label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="edittype" checked={editType === 'debit'} onChange={() => setEditType('debit')} className="w-5 h-5" /><span className="font-bold">عليه</span></label>
              <label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="edittype" checked={editType === 'credit'} onChange={() => setEditType('credit')} className="w-5 h-5" /><span className="font-bold">له</span></label>
            </div>
            <div className="flex gap-2">
              <button onClick={saveEditTx} className="flex-1 bg-[#5D4037] text-white py-3 rounded-xl font-bold">حفظ</button>
              <button onClick={() => setEditingTx(null)} className="flex-1 bg-muted py-3 rounded-xl font-bold">إلغاء</button>
            </div>
          </Card>
        </div>
      )}

      {/* Context Menu for Single Transaction */}
      {contextMenuTx && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[70] flex items-center justify-center p-6 animate-fade-in" onClick={() => setContextMenuTx(null)}>
          <Card className="w-full max-w-xs shadow-2xl border-0 overflow-hidden animate-scale-in rounded-3xl" onClick={e => e.stopPropagation()} dir="rtl">
            <div className="bg-[#5D4037] p-4 text-white text-center">
              <p className="font-black text-xl" dir="ltr">{formatNumber(contextMenuTx.amount)}</p>
              <p className="text-[11px] opacity-80 truncate mt-1">{contextMenuTx.details}</p>
            </div>
            <div className="p-3 grid grid-cols-1 gap-2">
              <button onClick={() => { setEditAmount((contextMenuTx.amount||0).toString()); setEditDetails(contextMenuTx.details||''); setEditDate(contextMenuTx.date||''); setEditType(contextMenuTx.type); setEditingTx(contextMenuTx); setContextMenuTx(null); }} className="flex items-center gap-3 p-3 hover:bg-muted rounded-xl font-bold transition-colors">
                <Pencil className="w-5 h-5 text-blue-500" /> تعديل المعاملة
              </button>
              <button onClick={() => { setShowColorPicker(true); setContextMenuTx(null); }} className="flex items-center gap-3 p-3 hover:bg-muted rounded-xl font-bold transition-colors">
                <Palette className="w-5 h-5 text-purple-500" /> تلوين المعاملة
              </button>
              <div className="h-px bg-border my-1" />
              <button onClick={deleteSingleTx} className="flex items-center gap-3 p-3 bg-red-50 hover:bg-red-100 rounded-xl font-bold text-red-600 transition-colors">
                <Trash2 className="w-5 h-5" /> حذف المعاملة نهائياً
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* Notes Sheet */}
      {showNotes && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[80] flex items-end justify-center animate-fade-in" onClick={() => setShowNotes(false)}>
          <div className="bg-card w-full max-h-[85vh] rounded-t-3xl p-6 overflow-y-auto animate-slide-up shadow-2xl border-t border-border" onClick={e => e.stopPropagation()} dir="rtl">
             <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-black">ملاحظات {client?.name}</h3>
                <button onClick={() => setShowNotes(false)} className="bg-muted p-2 rounded-full"><X className="w-5 h-5"/></button>
             </div>
             <div className="relative mb-6">
                <textarea id="note-input" placeholder="اكتب ملاحظة جديدة هنا..." className="w-full bg-muted border-none rounded-2xl p-4 text-sm font-bold min-h-[100px] outline-none focus:ring-2 focus:ring-[#5D4037]/30" />
                <button onClick={() => { const el = document.getElementById('note-input') as HTMLTextAreaElement; handleAddNote(el.value); el.value = ''; }} className="absolute bottom-3 left-3 bg-[#5D4037] text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md">حفظ الملاحظة</button>
             </div>
             <div className="space-y-3">
                {client?.notes?.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground opacity-50">لا توجد ملاحظات حالياً</div>
                ) : (
                  client?.notes?.map((note, i) => (
                    <div key={i} className="bg-muted/50 p-4 rounded-2xl flex flex-col gap-3 group border border-border/20">
                       <p className="text-sm font-bold leading-relaxed">{note}</p>
                       <div className="flex justify-end gap-2 border-t border-border/20 pt-2 opacity-60 hover:opacity-100 transition-opacity">
                          <button onClick={() => handleCopyNote(note)} className="p-2 bg-white rounded-lg transition-colors shadow-sm"><Copy className="w-4 h-4 text-blue-600"/></button>
                          <button onClick={() => handleDeleteNote(i)} className="p-2 bg-white rounded-lg transition-colors shadow-sm"><Trash2 className="w-4 h-4 text-red-500"/></button>
                       </div>
                    </div>
                  ))
                )}
             </div>
          </div>
        </div>
      )}

      {/* Limit Modal */}
      {showLimitModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowLimitModal(false)}>
          <Card className="shadow-2xl w-full max-w-xs border-0 animate-scale-in rounded-3xl overflow-hidden" onClick={e => e.stopPropagation()} dir="rtl">
            <div className="bg-[#5D4037] p-4 text-white text-center">
               <h3 className="text-lg font-black flex items-center justify-center gap-2"><ShieldAlert className="w-5 h-5"/> سقف الحساب</h3>
            </div>
            <CardContent className="p-5 space-y-4 bg-card">
              <div>
                <label className="text-sm font-bold text-muted-foreground mb-2 block">السقف المالي الجديد</label>
                <input className="w-full border border-input rounded-xl px-4 py-3 text-left bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-[#5D4037] font-sans text-lg tracking-wider font-bold" type="number" lang="en" dir="ltr" value={newLimit} onChange={e => setNewLimit(e.target.value)} placeholder="0" />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={handleSaveLimit} className="flex-1 bg-[#5D4037] text-white py-3 rounded-xl font-bold active:scale-95 transition-transform">حفظ السقف</button>
                <button onClick={() => setShowLimitModal(false)} className="flex-1 bg-muted text-foreground py-3 rounded-xl font-bold active:scale-95 transition-transform">إلغاء</button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Color Picker Modal */}
      {showColorPicker && (
        <div className="fixed inset-0 bg-black/60 z-[90] flex items-center justify-center animate-fade-in" onClick={() => setShowColorPicker(false)}>
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

      {/* Share Modal */}
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

    </div>
  );
};

export default LedgerPage;
2. مراجعة القائمة الرئيسية (MainMenu.tsx) لتفادي أي أخطاء
للتأكد تماماً من عدم وجود أي خطأ، قمت بضبط واردات (Imports) الملف، استخدم هذا الكود المضمون:

TypeScript
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppHeader from '@/components/AppHeader';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  Plus, FileText, Settings, Share2, Info, LogOut, UserPlus, ChevronLeft
} from 'lucide-react';

const MainMenu = () => {
  const navigate = useNavigate();
  const [showAbout, setShowAbout] = useState(false);

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ 
        title: 'دفتر الحسابات الآمن', 
        text: 'تطبيق دفتر حسابات آمن ومشفر بالكامل لإدارة ديونك وحساباتك بسهولة', 
        url: window.location.origin 
      });
    } else {
      navigator.clipboard.writeText(window.location.origin);
      toast.success('تم نسخ رابط التطبيق ✓');
    }
  };

  const handleExit = () => {
    navigate('/clients');
  };

  const menuItems = [
    { icon: UserPlus, label: 'إضافة عميل', color: 'bg-blue-500/10 text-blue-600', action: () => navigate('/clients') },
    { icon: Plus, label: 'إضافة مبلغ', color: 'bg-green-500/10 text-green-600', action: () => navigate('/add-transaction') },
    { icon: FileText, label: 'التقارير', color: 'bg-purple-500/10 text-purple-600', action: () => navigate('/reports') },
    { icon: Settings, label: 'الإعدادات', color: 'bg-gray-500/10 text-gray-600', action: () => navigate('/settings') },
    { icon: Share2, label: 'مشاركة التطبيق', color: 'bg-cyan-500/10 text-cyan-600', action: handleShare },
    { icon: Info, label: 'حول البرنامج', color: 'bg-amber-500/10 text-amber-600', action: () => setShowAbout(true) },
    { icon: LogOut, label: 'خروج', color: 'bg-red-500/10 text-red-600', action: handleExit },
  ];

  return (
    <div className="min-h-screen bg-background pb-6 flex flex-col" dir="rtl">
      <AppHeader title="القائمة الرئيسية" showBack />
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="flex flex-col gap-3">
          {menuItems.map((item, i) => (
            <button
              key={i}
              onClick={item.action}
              className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-transparent hover:border-primary/20 active:scale-95 transition-all shadow-sm animate-fade-in ${item.color}`}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="p-3 rounded-xl bg-white/60 shadow-inner flex-shrink-0">
                <item.icon className="w-6 h-6" />
              </div>
              <span className="text-base font-bold text-foreground text-right flex-1">{item.label}</span>
              <ChevronLeft className="w-5 h-5 opacity-50" />
            </button>
          ))}
        </div>
      </div>
      {showAbout && (
        <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in" onClick={() => setShowAbout(false)}>
          <Card className="w-80 shadow-xl border-0 animate-scale-in" onClick={e => e.stopPropagation()}>
            <CardContent className="p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                <Info className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground">دفتر الحسابات الآمن</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">تطبيق متطور لإدارة حسابات العملاء والديون بشكل آمن ومشفر بالكامل على جهازك.</p>
              <div className="pt-4 border-t border-border space-y-2">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">المطور</p>
                <p className="text-sm font-bold text-foreground" dir="ltr">+249 11 486 6251</p>
              </div>
              <button onClick={() => setShowAbout(false)} className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-bold mt-2 shadow-lg active:scale-95 transition-transform">إغلاق</button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default MainMenu;
