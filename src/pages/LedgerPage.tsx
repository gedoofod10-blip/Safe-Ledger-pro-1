import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getClient, getTransactionsByClient, addTransaction as dbAddTransaction, updateTransaction, deleteTransaction as dbDeleteTransaction, updateClient, type Client, type Transaction } from '@/lib/db';
import AppHeader from '@/components/AppHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Share2, Plus, Pencil, Trash2, X, StickyNote, MoreVertical, Search, Lock, ShieldAlert, Palette, FileDown, Type, Image as ImageIcon, FileSpreadsheet, CheckSquare, Square, Star, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { formatNumber } from '@/lib/utils';
import { exportLedgerPDF } from '@/lib/pdfExport';
import { shareFileNative, shareTextNative, generateExcelFile } from '@/lib/sharing';
import html2canvas from 'html2canvas';

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
  const [showMenu, setShowMenu] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false); 
  const [showRatingModal, setShowRatingModal] = useState(false);
  
  const [showNotes, setShowNotes] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [editingNoteIdx, setEditingNoteIdx] = useState<number | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');

  const [showLimitModal, setShowLimitModal] = useState(false);
  const [newLimit, setNewLimit] = useState('');
  const [showCloseBalanceModal, setShowCloseBalanceModal] = useState(false);
  
  const [contextMenuTx, setContextMenuTx] = useState<(Transaction & { balance: number }) | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedTxIds, setSelectedTxIds] = useState<number[]>([]);

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
      if (!isSelectionMode) setContextMenuTx(tx);
    }, 500); 
  };
  const handleTouchEnd = () => { if (pressTimer.current) clearTimeout(pressTimer.current); };
  const handleRowClick = (tx: Transaction & { balance: number }) => {
    if (isSelectionMode) {
      setSelectedTxIds(prev => prev.includes(tx.id!) ? prev.filter(id => id !== tx.id) : [...prev, tx.id!]);
    }
  };

  const handleAddNote = async () => {
    if (!client?.id || !newNote.trim()) return;
    const updatedNotes = [...(client.notes || []), newNote.trim()];
    await updateClient(client.id, { notes: updatedNotes });
    setClient(prev => prev ? { ...prev, notes: updatedNotes } : prev);
    setNewNote('');
    toast.success('تمت إضافة الملاحظة');
  };

  const handleSaveEditNote = async () => {
    if (!client?.id || editingNoteIdx === null || !editingNoteText.trim()) return;
    const updatedNotes = [...(client.notes || [])];
    updatedNotes[editingNoteIdx] = editingNoteText.trim();
    await updateClient(client.id, { notes: updatedNotes });
    setClient(prev => prev ? { ...prev, notes: updatedNotes } : prev);
    setEditingNoteIdx(null);
    toast.success('تم تعديل الملاحظة');
  };

  const handleDeleteNote = async (index: number) => {
    if (!client?.id) return;
    const updatedNotes = (client.notes || []).filter((_, i) => i !== index);
    await updateClient(client.id, { notes: updatedNotes });
    setClient(prev => prev ? { ...prev, notes: updatedNotes } : prev);
    toast.success('تم حذف الملاحظة');
  };

  const handleSaveLimit = async () => {
    if (!client?.id) return;
    await updateClient(client.id, { budgetLimit: Number(newLimit) });
    setShowLimitModal(false);
    loadData();
    toast.success('تم تحديث سقف الحساب');
  };

  const handleCloseBalance = async () => {
    if (!client?.id || netBalance === 0) {
      toast.info('الرصيد مصفر بالفعل');
      setShowCloseBalanceModal(false);
      return;
    }
    const amountToZero = Math.abs(netBalance);
    const type = netBalance >= 0 ? 'credit' : 'debit'; 
    await dbAddTransaction({ clientId: client.id, amount: amountToZero, type, date: new Date().toISOString().split('T')[0], details: 'تصفية وإغلاق الحساب' });
    setShowCloseBalanceModal(false);
    loadData();
    toast.success('تم إغلاق وتصفية الحساب بنجاح');
  };

  const saveEditTx = async () => {
    if (!editingTx?.id) return;
    await updateTransaction(editingTx.id, { amount: parseFloat(editAmount) || 0, details: editDetails.trim(), date: editDate, type: editType });
    setEditingTx(null);
    loadData();
    toast.success('تم التعديل');
  };

  const confirmDeleteTx = async () => {
    if (!contextMenuTx?.id) return;
    await dbDeleteTransaction(contextMenuTx.id);
    setContextMenuTx(null);
    loadData();
    toast.success('تم حذف المعاملة');
  };

  const handleColorSelect = async (color: string) => {
    if (!contextMenuTx?.id) return;
    await updateTransaction(contextMenuTx.id, { color });
    setContextMenuTx(null);
    setShowColorPicker(false);
    loadData();
    toast.success('تم التلوين ✓');
  };

  const deleteSelectedTx = async () => {
    if (selectedTxIds.length === 0) return;
    for (const id of selectedTxIds) {
      await dbDeleteTransaction(id);
    }
    setIsSelectionMode(false);
    setSelectedTxIds([]);
    loadData();
    toast.success('تم حذف المعاملات المحددة');
  };

  const handleRatingChange = async (rating: 'excellent' | 'average' | 'poor') => {
    if (!client?.id) return;
    await updateClient(client.id, { rating });
    setClient(prev => prev ? { ...prev, rating } : prev);
    toast.success('تم تحديث التقييم');
  };

  const safeShareFile = async (file: File) => {
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'مشاركة كشف الحساب' });
      } else {
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success('تم تنزيل الملف بنجاح');
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') toast.error('خطأ في المشاركة');
    }
    setShowShareModal(false);
  };

  const handleSharePDF = async () => {
    if (!client) return;
    const t = toast.loading('جاري تجهيز ملف PDF...');
    try {
      const blob = await exportLedgerPDF(client, transactions, totalDebit, totalCredit, netBalance);
      await safeShareFile(new File([blob], `كشف_حساب_${client.name}.pdf`, { type: 'application/pdf' }));
      toast.dismiss(t);
    } catch (e) { 
      toast.dismiss(t);
      toast.error('خطأ أثناء التصدير'); 
    }
    setShowShareModal(false);
  };

  const handleShareImage = async () => {
    const t = toast.loading('جاري تجهيز الصورة...');
    try {
      const element = document.getElementById('ledger-content-to-capture');
      if (!element) return;
      const canvas = await html2canvas(element, { useCORS: true, scale: 2, backgroundColor: '#ffffff' });
      canvas.toBlob(async (blob) => {
        toast.dismiss(t);
        if (blob) await safeShareFile(new File([blob], `كشف_${client?.name}.png`, { type: 'image/png' }));
      });
    } catch (e) { 
      toast.dismiss(t);
      toast.error('فشل إنشاء الصورة'); 
    }
    setShowShareModal(false);
  };

  const handleShareExcel = async () => {
    if (!client) return;
    try {
      const file = await generateExcelFile(client, transactions);
      await safeShareFile(file);
    } catch (e) { toast.error('خطأ بالتصدير'); }
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
          <div className="absolute top-14 left-4 w-60 bg-card border border-border shadow-2xl rounded-2xl overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>
            <button onClick={() => {setShowSearch(true); setShowMenu(false);}} className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-bold border-b border-border/50 hover:bg-muted text-right">
              <Search className="w-5 h-5 text-primary" /> بحث متقدم
            </button>
            <button onClick={() => {setShowLimitModal(true); setShowMenu(false);}} className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-bold border-b border-border/50 hover:bg-muted text-right">
              <ShieldAlert className="w-5 h-5 text-primary" /> سقف الحساب
            </button>
            <button onClick={() => {setShowCloseBalanceModal(true); setShowMenu(false);}} className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-bold border-b border-border/50 hover:bg-muted text-right">
              <Lock className="w-5 h-5 text-primary" /> إغلاق الحساب
            </button>
            <button onClick={() => {setShowNotes(true); setShowMenu(false);}} className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-bold border-b border-border/50 hover:bg-muted text-right">
              <StickyNote className="w-5 h-5 text-primary" /> الملاحظات
            </button>
            <button onClick={() => {setShowRatingModal(true); setShowMenu(false);}} className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-bold border-b border-border/50 hover:bg-muted text-right">
              <Star className="w-5 h-5 text-yellow-500" /> التقييم
            </button>
            <button onClick={() => {setIsSelectionMode(!isSelectionMode); setShowMenu(false);}} className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-bold text-destructive hover:bg-destructive/10 text-right">
              <CheckSquare className="w-5 h-5 text-destructive" /> تحديد وحذف المعاملات
            </button>
          </div>
        </div>
      )}

      {isSelectionMode && (
        <div className="fixed top-0 left-0 right-0 h-14 bg-[#5D4037] text-white z-[60] flex items-center justify-between px-4 shadow-lg animate-fade-in" dir="rtl">
          <div className="flex items-center gap-4">
            <button onClick={() => {setIsSelectionMode(false); setSelectedTxIds([]);}} className="p-2 bg-white/20 rounded-lg"><X className="w-5 h-5"/></button>
            <span className="font-bold">{selectedTxIds.length} محدد</span>
          </div>
          <button onClick={deleteSelectedTx} className="flex items-center gap-2 bg-red-500 px-4 py-1.5 rounded-lg text-sm font-bold shadow-md active:scale-95 transition-transform">حذف المحدد</button>
        </div>
      )}

      {budgetLimit > 0 && (
        <div className="sticky top-[52px] z-30 mx-3 mt-2 rounded-xl overflow-hidden shadow-md animate-fade-in border border-white/10">
          <div className="bg-gradient-to-l from-[#5D4037] to-[#8D6E63] text-white p-3.5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[10px] opacity-80 font-bold mb-1">المتبقي من السقف</span>
                <div className="flex items-center gap-1.5 leading-none">
                  {isOverBudget && <AlertTriangle className="w-4 h-4 text-red-400 animate-pulse" />}
                  <span className={`text-2xl font-black ${isOverBudget ? 'text-red-400' : 'text-yellow-400'}`} dir="ltr">
                    {formatNumber(remaining)}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 items-end">
                <div className="flex items-center justify-between bg-black/20 px-2 py-1 rounded w-[110px]">
                  <span className="text-[9px] opacity-70">السقف:</span>
                  <span className="text-xs font-bold" dir="ltr">{formatNumber(budgetLimit)}</span>
                </div>
                <div className="flex items-center justify-between bg-black/20 px-2 py-1 rounded w-[110px]">
                  <span className="text-[9px] opacity-70">الاستهلاك:</span>
                  <span className="text-xs font-bold text-red-300" dir="ltr">{formatNumber(totalDebit - totalCredit)}</span>
                </div>
              </div>
            </div>
            <div className="w-full h-3 bg-black/30 rounded-full overflow-hidden shadow-inner">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${isOverBudget ? 'bg-red-500' : 'bg-yellow-400'}`}
                style={{ width: `${Math.min(consumed, 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* الجدول الجديد المطور: قابل للتمرير الأفقي، مساحات واسعة، وبدون ضغط */}
      <div id="ledger-content-to-capture" className="mt-2 w-full">
        <Card className="shadow-lg border-0 rounded-none sm:rounded-2xl overflow-hidden">
          <CardContent className="p-0">
            {showSearch && (
              <div className="p-3 bg-muted/10 border-b border-border flex items-center gap-2 animate-slide-down">
                <Search className="w-5 h-5 text-muted-foreground" />
                <input autoFocus placeholder="بحث سريع..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-transparent outline-none font-bold text-sm" />
                <button onClick={() => setShowSearch(false)}><X className="w-5 h-5"/></button>
              </div>
            )}
            
            {/* حاوية التمرير الأفقي التي تضمن عرضاً أدنى لا ينضغط أبداً */}
            <div className="w-full overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <div className="min-w-[550px]">
                
                {/* الهيدر بمساحات متسعة */}
                <div className="bg-[#5D4037] text-white grid grid-cols-[90px_110px_1fr_110px] text-center text-[13px] font-extrabold py-4 px-3 shadow-md">
                  <div className="text-right pl-2">التاريخ</div>
                  <div>المبلغ</div>
                  <div className="text-center">التفاصيل</div>
                  <div className="text-left pr-2">الرصيد</div>
                </div>
                
                {/* جسم الجدول */}
                <div className="bg-white divide-y divide-border/40 select-none pb-4">
                  {loading ? (
                    <div className="p-10 text-center font-bold text-muted-foreground">جاري التحميل...</div>
                  ) : filteredTransactions.length === 0 ? (
                    <div className="p-10 text-center text-muted-foreground">لا توجد معاملات مسجلة</div>
                  ) : (
                    filteredTransactions.map((tx, idx) => (
                      <div
                        key={tx.id || idx}
                        onTouchStart={() => handleTouchStart(tx)}
                        onTouchEnd={handleTouchEnd}
                        onMouseDown={() => handleTouchStart(tx)}
                        onMouseUp={handleTouchEnd}
                        /* زيادة المسافات العلوية والسفلية (py-5) لراحة العين */
                        className={`grid grid-cols-[90px_110px_1fr_110px] text-center px-3 py-5 items-center transition-colors relative ${idx % 2 === 0 ? 'bg-white' : 'bg-[#faf9f6]'}`}
                        style={{ backgroundColor: tx.color || undefined }}
                      >
                        {isSelectionMode && (
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10" onClick={() => handleRowClick(tx)}>
                            {selectedTxIds.includes(tx.id!) ? <CheckSquare className="w-5 h-5 text-primary" /> : <Square className="w-5 h-5 text-muted-foreground" />}
                          </div>
                        )}
                        
                        <div className={`text-right text-[11px] font-bold text-muted-foreground pl-2 ${isSelectionMode ? 'pr-6' : ''}`}>
                          {tx.date}
                        </div>
                        
                        <div className={`font-black text-[15px] tracking-wide`} dir="ltr">
                          <span className={tx.type === 'debit' ? 'text-red-600' : 'text-green-600'}>
                            {tx.type === 'debit' ? '(-) ' : '(+) '}
                            {formatNumber(tx.amount)}
                          </span>
                        </div>
                        
                        <div className="flex items-center justify-center px-3">
                          <span className="text-center text-[13px] font-bold text-foreground leading-relaxed break-words w-full">
                            {tx.details}
                          </span>
                        </div>
                        
                        <div className="text-left flex items-center justify-end gap-2 font-black text-[14px] w-full pr-2 tracking-wide" dir="ltr">
                          <span className="text-foreground/90">{formatNumber(Math.abs(tx.balance))}</span>
                          {tx.balance >= 0 ? (
                            <svg width="12" height="11" viewBox="0 0 10 9" className="text-red-600 fill-current flex-shrink-0" aria-hidden="true">
                              <polygon points="0,0 10,0 5,9" />
                            </svg>
                          ) : (
                            <svg width="12" height="11" viewBox="0 0 10 9" className="text-green-600 fill-current flex-shrink-0" aria-hidden="true">
                              <polygon points="5,0 10,9 0,9" />
                            </svg>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <footer className="fixed bottom-0 left-0 right-0 bg-[#5D4037] text-white p-3 z-40 pb-safe shadow-[0_-4px_10px_rgba(0,0,0,0.15)]">
        <div className="flex items-center justify-between px-2 w-full">
          <button onClick={() => navigate(`/add-transaction?clientId=${client?.id}`)} className="w-14 h-14 bg-white text-[#5D4037] rounded-2xl flex items-center justify-center shadow-lg active:scale-95 transition-transform">
            <Plus className="w-8 h-8 font-black" />
          </button>
          <div className="flex flex-col items-center bg-black/20 py-2 px-6 rounded-2xl">
            <span className="text-[10px] font-bold opacity-70 mb-0.5">الرصيد النهائي</span>
            <div className="flex items-center gap-1">
              <span className="text-xs font-bold">{netBalance >= 0 ? 'عليه' : 'له'}</span>
              <span className={`text-2xl font-black ${netBalance >= 0 ? 'text-red-300' : 'text-green-300'}`} dir="ltr">{formatNumber(Math.abs(netBalance))}</span>
            </div>
          </div>
          <button onClick={() => setShowShareModal(true)} className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center active:scale-95 transition-transform">
            <Share2 className="w-6 h-6" />
          </button>
        </div>
      </footer>

      {showNotes && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-end justify-center animate-fade-in" onClick={() => {setShowNotes(false); setEditingNoteIdx(null);}}>
          <div className="bg-white w-full max-h-[85vh] rounded-t-3xl p-6 overflow-y-auto animate-slide-up shadow-2xl" onClick={e => e.stopPropagation()}>
             <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-black text-[#5D4037]">ملاحظات العميل</h3>
                <button onClick={() => {setShowNotes(false); setEditingNoteIdx(null);}} className="p-2 bg-muted rounded-full"><X className="w-5 h-5"/></button>
             </div>
             <div className="relative mb-6">
                <textarea placeholder="اكتب ملاحظة جديدة..." value={newNote} onChange={e => setNewNote(e.target.value)} className="w-full bg-muted/50 border border-border/50 rounded-2xl p-4 text-sm font-bold min-h-[100px] outline-none text-right" />
                <button onClick={handleAddNote} className="absolute bottom-3 left-3 bg-[#5D4037] text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md active:scale-95">حفظ</button>
             </div>
             <div className="space-y-3">
                {client?.notes?.map((note, i) => (
                  <div key={i} className="bg-muted/30 border border-border/50 p-4 rounded-2xl flex flex-col gap-3 text-right">
                    {editingNoteIdx === i ? (
                      <div className="flex flex-col gap-2">
                        <textarea value={editingNoteText} onChange={e => setEditingNoteText(e.target.value)} className="w-full bg-background border border-border rounded-xl p-3 text-sm font-bold min-h-[80px] outline-none" />
                        <div className="flex gap-2"><button onClick={handleSaveEditNote} className="flex-1 bg-[#5D4037] text-white py-2 rounded-lg font-bold text-xs">حفظ</button><button onClick={() => setEditingNoteIdx(null)} className="flex-1 bg-muted py-2 rounded-lg font-bold text-xs">إلغاء</button></div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-start gap-3">
                        <p className="font-bold text-sm flex-1 leading-relaxed text-foreground"><span className="text-[#5D4037] ml-1 bg-[#5D4037]/10 px-1.5 py-0.5 rounded-md text-xs">{i + 1}</span>{note}</p>
                        <div className="flex gap-2">
                          <button onClick={() => { setEditingNoteIdx(i); setEditingNoteText(note); }} className="p-1.5 bg-white border border-border/50 rounded-lg shadow-sm hover:text-blue-600"><Pencil className="w-4 h-4"/></button>
                          <button onClick={() => handleDeleteNote(i)} className="p-1.5 bg-white border border-border/50 rounded-lg shadow-sm hover:text-red-500"><Trash2 className="w-4 h-4"/></button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
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
              <button onClick={() => setShowRatingModal(false)} className="w-full mt-2 py-3 font-bold text-muted-foreground text-center">إلغاء</button>
            </CardContent>
          </Card>
        </div>
      )}

      {contextMenuTx && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[110] flex items-center justify-center p-6 animate-fade-in" onClick={() => setContextMenuTx(null)}>
          <Card className="w-full max-w-xs shadow-2xl rounded-3xl overflow-hidden text-right" onClick={e => e.stopPropagation()}>
            <div className="bg-[#5D4037] p-4 text-white text-center font-black" dir="ltr">{formatNumber(contextMenuTx.amount)}</div>
            <div className="p-3 grid grid-cols-1 gap-2 bg-card">
              <button onClick={() => { setEditAmount((contextMenuTx.amount||0).toString()); setEditDetails(contextMenuTx.details||''); setEditDate(contextMenuTx.date||''); setEditType(contextMenuTx.type); setEditingTx(contextMenuTx); setContextMenuTx(null); }} className="flex items-center justify-end gap-3 p-3 hover:bg-muted rounded-xl font-bold"><span className="flex-1 text-right">تعديل المعاملة</span><Pencil className="w-5 h-5 text-blue-500" /></button>
              <button onClick={() => { setShowColorPicker(true); }} className="flex items-center justify-end gap-3 p-3 hover:bg-muted rounded-xl font-bold"><span className="flex-1 text-right">تلوين المعاملة</span><Palette className="w-5 h-5 text-purple-500" /></button>
              <button onClick={confirmDeleteTx} className="flex items-center justify-end gap-3 p-3 bg-red-50 text-red-600 rounded-xl font-bold"><span className="flex-1 text-right">حذف المعاملة</span><Trash2 className="w-5 h-5" /></button>
            </div>
          </Card>
        </div>
      )}

      {showColorPicker && (
        <div className="fixed inset-0 bg-black/60 z-[120] flex items-center justify-center animate-fade-in" onClick={() => setShowColorPicker(false)}>
           <Card className="p-6 w-80 rounded-3xl shadow-2xl" onClick={e => e.stopPropagation()} dir="rtl">
              <h4 className="text-center font-black mb-5 text-[#5D4037] text-lg">اختر لون المعاملة</h4>
              <div className="grid grid-cols-4 gap-4">
                 {[ { name: 'افتراضي', color: '' }, { name: 'أحمر', color: '#fee2e2' }, { name: 'أخضر', color: '#dcfce7' }, { name: 'أصفر', color: '#fef3c7' }, { name: 'أزرق', color: '#dbeafe' }, { name: 'بنفسجي', color: '#f3e8ff' }, { name: 'برتقالي', color: '#ffedd5' }, { name: 'رمادي', color: '#f3f4f6' }].map(c => (
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

      {editingTx && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4 animate-fade-in" onClick={() => setEditingTx(null)}>
          <Card className="w-full max-w-sm p-5 space-y-4 rounded-3xl shadow-2xl" onClick={e => e.stopPropagation()} dir="rtl">
            <h3 className="font-bold text-lg text-center flex items-center justify-center gap-2 mb-2"><Pencil className="w-5 h-5"/> تعديل المعاملة</h3>
            <input type="number" className="w-full border p-3 rounded-xl outline-none bg-muted/50 font-bold" value={editAmount} onChange={e => setEditAmount(e.target.value)} placeholder="المبلغ" />
            <input type="text" className="w-full border p-3 rounded-xl outline-none bg-muted/50 font-bold" value={editDetails} onChange={e => setEditDetails(e.target.value)} placeholder="التفاصيل" />
            <input type="date" className="w-full border p-3 rounded-xl outline-none text-right bg-muted/50 font-bold" lang="en" dir="ltr" value={editDate} onChange={e => setEditDate(e.target.value)} />
            <div className="flex gap-4 justify-center py-2">
              <label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={editType === 'debit'} onChange={() => setEditType('debit')} className="w-5 h-5" /><span className="font-bold">عليه</span></label>
              <label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={editType === 'credit'} onChange={() => setEditType('credit')} className="w-5 h-5" /><span className="font-bold">له</span></label>
            </div>
            <div className="flex gap-2"><button onClick={saveEditTx} className="flex-1 bg-[#5D4037] text-white py-3 rounded-xl font-bold">حفظ التعديل</button><button onClick={() => setEditingTx(null)} className="flex-1 bg-muted py-3 rounded-xl font-bold">إلغاء</button></div>
          </Card>
        </div>
      )}

      {showLimitModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowLimitModal(false)}>
          <Card className="shadow-2xl w-full max-w-xs border-0 animate-scale-in rounded-3xl overflow-hidden" onClick={e => e.stopPropagation()} dir="rtl">
            <div className="bg-[#5D4037] p-4 text-white text-center font-black">سقف الحساب</div>
            <CardContent className="p-5 space-y-4 bg-card">
              <input className="w-full border border-input rounded-xl px-4 py-3 text-left bg-background font-sans text-lg tracking-wider font-bold" type="number" lang="en" dir="ltr" value={newLimit} onChange={e => setNewLimit(e.target.value)} placeholder="0" />
              <div className="flex gap-2"><button onClick={handleSaveLimit} className="flex-1 bg-[#5D4037] text-white py-3 rounded-xl font-bold active:scale-95 transition-transform">حفظ</button><button onClick={() => setShowLimitModal(false)} className="flex-1 bg-muted py-3 rounded-xl font-bold">إلغاء</button></div>
            </CardContent>
          </Card>
        </div>
      )}

      {showCloseBalanceModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowCloseBalanceModal(false)}>
          <Card className="shadow-2xl w-full max-w-xs border-0 animate-scale-in rounded-3xl overflow-hidden" onClick={e => e.stopPropagation()} dir="rtl">
            <div className="bg-[#5D4037] p-4 text-white text-center font-black">إغلاق الحساب</div>
            <CardContent className="p-5 text-center space-y-4"><p className="font-bold text-sm text-muted-foreground">سيتم إنشاء معاملة تصفير للرصيد لإنهاء الحساب الحالي.</p>
              <div className="flex gap-2"><button onClick={handleCloseBalance} className="flex-1 bg-green-600 text-white py-3 rounded-xl font-bold active:scale-95 transition-transform">تصفية وإغلاق</button><button onClick={() => setShowCloseBalanceModal(false)} className="flex-1 bg-muted py-3 rounded-xl font-bold">إلغاء</button></div>
            </CardContent>
          </Card>
        </div>
      )}

      {showShareModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-end justify-center animate-fade-in" onClick={() => setShowShareModal(false)}>
          <div className="bg-card w-full rounded-t-3xl p-6 space-y-5 animate-slide-up shadow-2xl border-t border-border" onClick={e => e.stopPropagation()} dir="rtl">
            <div className="w-12 h-1.5 bg-muted mx-auto rounded-full mb-2" />
            <div className="text-center"><h3 className="text-xl font-extrabold text-foreground">مشاركة كشف الحساب</h3></div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <button onClick={handleSharePDF} className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-primary/5 active:scale-95"><div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center"><FileDown className="w-6 h-6 text-primary" /></div><span className="font-bold text-sm">ملف PDF</span></button>
              <button onClick={handleShareImage} className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-primary/5 active:scale-95"><div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center"><ImageIcon className="w-6 h-6 text-primary" /></div><span className="font-bold text-sm">صورة كشف</span></button>
              <button onClick={handleShareExcel} className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-primary/5 active:scale-95"><div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center"><FileSpreadsheet className="w-6 h-6 text-primary" /></div><span className="font-bold text-sm">ملف إكسل</span></button>
              <button onClick={() => { const text = `📄 كشف حساب: ${client?.name}\nالرصيد: ${formatNumber(Math.abs(netBalance))} ${netBalance >= 0 ? 'عليه' : 'له'}`; navigator.share({ text }); }} className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-primary/5 active:scale-95"><div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center"><Type className="w-6 h-6 text-primary" /></div><span className="font-bold text-sm">نص فقط</span></button>
            </div>
            <button onClick={() => setShowShareModal(false)} className="w-full mt-2 p-4 rounded-xl bg-muted font-bold">إلغاء</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LedgerPage;
