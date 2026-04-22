import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getClient, getTransactionsByClient, addTransaction as dbAddTransaction, updateTransaction, deleteTransaction as dbDeleteTransaction, updateClient, type Client, type Transaction } from '@/lib/db';
import AppHeader from '@/components/AppHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Share2, Plus, AlertTriangle, Pencil, Trash2, X, StickyNote, HelpCircle, MoreVertical, Search, Lock, ShieldAlert, Palette, FileDown, Type, Image as ImageIcon, FileSpreadsheet, ArrowDown, ArrowUp, CheckSquare, Square, Copy, Star, Eraser } from 'lucide-react';
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
  
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDetails, setEditDetails] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editType, setEditType] = useState<'debit' | 'credit'>('debit'); 
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false); 
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [newLimit, setNewLimit] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);

  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedTxIds, setSelectedTxIds] = useState<number[]>([]);
  const [contextMenuTx, setContextMenuTx] = useState<(Transaction & { balance: number }) | null>(null);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);

  const loadData = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    const c = await getClient(Number(clientId));
    if (c) { setClient(c); setNewLimit(c.budgetLimit?.toString() || '0'); }
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

  const handleTouchStart = (tx: Transaction & { balance: number }) => {
    pressTimer.current = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(50);
      if (!isSelectionMode) setContextMenuTx(tx);
    }, 600);
  };
  const handleTouchEnd = () => { if (pressTimer.current) clearTimeout(pressTimer.current); };

  const handleRowClick = (tx: Transaction & { balance: number }) => {
    if (isSelectionMode) {
      setSelectedTxIds(prev => prev.includes(tx.id!) ? prev.filter(id => id !== tx.id) : [...prev, tx.id!]);
    }
  };

  const handleRatingChange = async (rating: 'excellent' | 'average' | 'poor') => {
    if (!client?.id) return;
    await updateClient(client.id, { rating });
    setClient(prev => prev ? { ...prev, rating } : prev);
    toast.success('تم التقييم');
  };

  const handleAddNote = async () => {
    if (!client?.id || !newNote.trim()) return;
    const updatedNotes = [...(client.notes || []), newNote.trim()];
    await updateClient(client.id, { notes: updatedNotes });
    setClient(prev => prev ? { ...prev, notes: updatedNotes } : prev);
    setNewNote('');
    toast.success('تم حفظ الملاحظة');
  };

  const handleDeleteNote = async (index: number) => {
    if (!client?.id) return;
    const updatedNotes = (client.notes || []).filter((_, i) => i !== index);
    await updateClient(client.id, { notes: updatedNotes });
    setClient(prev => prev ? { ...prev, notes: updatedNotes } : prev);
  };

  const handleClearAllTransactions = async () => {
    if (!client?.id) return;
    for (const tx of transactions) {
      if (tx.id) await dbDeleteTransaction(tx.id);
    }
    setShowDeleteAllConfirm(false);
    toast.success('تم حذف جميع المعاملات');
    loadData();
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
    loadData();
    toast.success('تم التعديل');
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

      {isSelectionMode && (
        <div className="fixed top-0 left-0 right-0 h-14 bg-header text-header z-[60] flex items-center justify-between px-4 shadow-lg animate-fade-in" dir="rtl">
          <div className="flex items-center gap-4">
            <button onClick={() => {setIsSelectionMode(false); setSelectedTxIds([]);}} className="p-2 bg-white/20 rounded-lg"><X className="w-5 h-5"/></button>
            <span className="font-bold">{selectedTxIds.length} محدد</span>
          </div>
          <button onClick={async () => {
            for (const id of selectedTxIds) await dbDeleteTransaction(id);
            setIsSelectionMode(false); setSelectedTxIds([]); loadData(); toast.success('تم الحذف');
          }} className="flex items-center gap-2 bg-red-500 px-4 py-1.5 rounded-lg text-sm font-bold shadow-md active:scale-95 transition-transform">حذف المحدد</button>
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
                <div className="bg-black/20 px-3 py-1.5 rounded-lg text-right min-w-[80px]">
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

      <div className="p-3 flex-1 mt-2">
        <Card className="shadow-lg border-0 overflow-hidden rounded-2xl">
          <CardContent className="p-0">
            {showSearch && (
              <div className="p-3 bg-muted/10 border-b border-border flex items-center gap-2 animate-slide-down">
                <Search className="w-5 h-5 text-muted-foreground" />
                <input autoFocus placeholder="بحث سريع..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-transparent outline-none font-bold text-sm" />
                <button onClick={() => setShowSearch(false)}><X className="w-5 h-5"/></button>
              </div>
            )}
            <div className="bg-[#5D4037] text-white flex text-center text-[11px] font-extrabold py-3 px-3 shadow-md">
              <div className="w-[65px] text-right">التاريخ</div>
              <div className="w-[80px]">المبلغ</div>
              <div className="flex-1 text-right pr-4">التفاصيل</div>
              <div className="w-[75px] text-left">الرصيد</div>
            </div>
            <div className="divide-y divide-border/30 select-none">
              {!loading && transactions.filter(tx => (tx.details || '').includes(searchQuery) || (tx.amount || 0).toString().includes(searchQuery)).map((tx, idx) => (
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

      {showNotes && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-end justify-center animate-fade-in" onClick={() => setShowNotes(false)}>
          <div className="bg-white w-full max-h-[85vh] rounded-t-3xl p-6 overflow-y-auto animate-slide-up" onClick={e => e.stopPropagation()}>
             <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-black">ملاحظات {client?.name}</h3>
                <button onClick={() => setShowNotes(false)} className="bg-muted p-2 rounded-full"><X className="w-5 h-5"/></button>
             </div>
             <div className="relative mb-6">
                <textarea placeholder="اكتب ملاحظة جديدة..." value={newNote} onChange={e => setNewNote(e.target.value)} className="w-full bg-muted border-none rounded-2xl p-4 text-sm font-bold min-h-[100px] outline-none" />
                <button onClick={handleAddNote} className="absolute bottom-3 left-3 bg-[#5D4037] text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md">حفظ</button>
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

      {contextMenuTx && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[110] flex items-center justify-center p-6 animate-fade-in" onClick={() => setContextMenuTx(null)}>
          <Card className="w-full max-w-xs shadow-2xl rounded-3xl overflow-hidden text-right" onClick={e => e.stopPropagation()}>
            <div className="bg-[#5D4037] p-4 text-white text-center font-black">{formatNumber(contextMenuTx.amount)}</div>
            <div className="p-3 grid grid-cols-1 gap-2 bg-card">
              <button onClick={() => { setEditAmount((contextMenuTx.amount||0).toString()); setEditDetails(contextMenuTx.details||''); setEditDate(contextMenuTx.date||''); setEditType(contextMenuTx.type); setEditingTx(contextMenuTx); setContextMenuTx(null); }} className="flex items-center justify-end gap-3 p-3 hover:bg-muted rounded-xl font-bold"><span className="flex-1 text-right">تعديل المعاملة</span><Pencil className="w-5 h-5 text-blue-500" /></button>
              <button onClick={() => { setShowColorPicker(true); setContextMenuTx(null); }} className="flex items-center justify-end gap-3 p-3 hover:bg-muted rounded-xl font-bold"><span className="flex-1 text-right">تلوين المعاملة</span><Palette className="w-5 h-5 text-purple-500" /></button>
              <button onClick={async () => { await dbDeleteTransaction(contextMenuTx.id!); setContextMenuTx(null); loadData(); toast.success('تم الحذف'); }} className="flex items-center justify-end gap-3 p-3 bg-red-50 text-red-600 rounded-xl font-bold"><span className="flex-1 text-right">حذف المعاملة</span><Trash2 className="w-5 h-5" /></button>
            </div>
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
