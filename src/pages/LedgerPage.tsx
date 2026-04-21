import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getClient, getTransactionsByClient, addTransaction as dbAddTransaction, updateTransaction, deleteTransaction as dbDeleteTransaction, updateClient, type Client, type Transaction } from '@/lib/db';
import AppHeader from '@/components/AppHeader';
import ClientNotesSheet from '@/components/ClientNotesSheet';
import { Card, CardContent } from '@/components/ui/card';
import { Share2, Plus, AlertTriangle, Pencil, Trash2, X, StickyNote, HelpCircle, MoreVertical, Search, Lock, ShieldAlert, ListFilter, Camera, Palette, FileDown, Type, Image as ImageIcon, FileSpreadsheet, ArrowDown, ArrowUp, CheckSquare, Square, ArrowLeftRight } from 'lucide-react';
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
  
  // Edit Tx States
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDetails, setEditDetails] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editType, setEditType] = useState<'debit' | 'credit'>('debit'); 
  
  // UI States
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false); 
  
  // Modals & Popups
  const [clickedTx, setClickedTx] = useState<(Transaction & { balance: number }) | null>(null);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [newLimit, setNewLimit] = useState('');
  const [showCloseBalanceModal, setShowCloseBalanceModal] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  // --- New Selection Mode States ---
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedTxIds, setSelectedTxIds] = useState<number[]>([]);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

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

  // --- Touch & Selection Logic ---
  const handleTouchStart = (tx: Transaction) => {
    pressTimer.current = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(50);
      setIsSelectionMode(true);
      if (!selectedTxIds.includes(tx.id!)) {
        setSelectedTxIds(prev => [...prev, tx.id!]);
      }
    }, 500); 
  };

  const handleTouchEnd = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  const handleRowClick = (tx: Transaction & { balance: number }) => {
    if (isSelectionMode) {
      if (selectedTxIds.includes(tx.id!)) {
        const newSelection = selectedTxIds.filter(id => id !== tx.id);
        setSelectedTxIds(newSelection);
        if (newSelection.length === 0) setIsSelectionMode(false); 
      } else {
        setSelectedTxIds(prev => [...prev, tx.id!]);
      }
    } else {
      setClickedTx(tx);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedTxIds.length === 0) return;
    for (const id of selectedTxIds) {
      await dbDeleteTransaction(id);
    }
    setShowBulkDeleteConfirm(false);
    setIsSelectionMode(false);
    setSelectedTxIds([]);
    toast.success(`تم حذف ${selectedTxIds.length} معاملة بنجاح ✓`);
    loadData();
  };

  const cancelSelection = () => {
    setIsSelectionMode(false);
    setSelectedTxIds([]);
  };

  // --- Old Functions ---
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

  const confirmSingleDeleteTx = async () => {
    if (!clickedTx?.id) return;
    await dbDeleteTransaction(clickedTx.id);
    setClickedTx(null);
    toast.success('تم حذف المعاملة');
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
    if (!clickedTx?.id) return;
    await updateTransaction(clickedTx.id, { color });
    setClickedTx(null);
    setShowColorPicker(false);
    loadData();
    toast.success('تم تلوين المعاملة ✓');
  };

  // --- Share Functions ---
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

  return (
    <div className="min-h-screen bg-background pb-24 flex flex-col">
      {/* Selection Mode Header */}
      {isSelectionMode ? (
        <div className="fixed top-0 left-0 right-0 h-14 bg-header text-header z-50 flex items-center justify-between px-4 animate-fade-in shadow-md" dir="rtl">
          <div className="flex items-center gap-4">
            <button onClick={cancelSelection} className="p-2 hover:bg-white/20 rounded-full transition-colors">
              <ArrowLeftRight className="w-5 h-5 rotate-180" />
            </button>
            <span className="font-semibold text-lg">{selectedTxIds.length} محدد</span>
          </div>
          {selectedTxIds.length > 0 && (
            <button onClick={() => setShowBulkDeleteConfirm(true)} className="p-2 hover:bg-white/20 rounded-full transition-colors text-red-300 flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>
      ) : (
        <AppHeader
          /* تم توسيع اسم العميل هنا ليأخذ مساحة أكبر بدون قص */
          title={client?.name ? <span className="font-extrabold text-xl tracking-tight block max-w-[65vw] truncate text-right drop-shadow-sm pr-1">{client.name}</span> : '...'}
          showBack
          showSearch={false} 
          showNotifications={false}
          actions={
            <div className="flex items-center gap-2 overflow-visible">
              <div className="relative z-50 flex-shrink-0">
                {/* تم فرض اللون الأبيض لأيقونة الـ 3 نقاط وإضافة ظل لتكون واضحة تماماً */}
                <button onClick={() => setShowMenu(!showMenu)} className="p-1 hover:opacity-70 transition-opacity">
                  <MoreVertical color="white" className="w-7 h-7 text-white drop-shadow-md" />
                </button>
                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                    <div className="absolute top-full left-0 mt-2 w-60 bg-card border border-border shadow-2xl rounded-xl overflow-hidden z-50 animate-scale-in" dir="rtl">
                      
                      <button onClick={() => { setShowSearch(!showSearch); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors border-b border-border/50 font-bold">
                        <Search className="w-4 h-4 text-primary" /> بحث متقدم
                      </button>
                      
                      <button onClick={() => { setShowCloseBalanceModal(true); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors border-b border-border/50 font-bold">
                        <Lock className="w-4 h-4 text-primary" /> إغلاق الرصيد وتصفيره
                      </button>
                      
                      <button onClick={() => { setShowLimitModal(true); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors border-b border-border/50 font-bold">
                        <ShieldAlert className="w-4 h-4 text-primary" /> سقف الحساب
                      </button>
                      
                      <button onClick={() => { setShowNotes(true); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors border-b border-border/50 font-bold">
                        <StickyNote className="w-4 h-4 text-primary" /> قائمة الملاحظات الحديثة
                      </button>
                      
                      <div className="border-b border-border/50">
                        <div className="px-4 py-2 text-xs font-bold text-muted-foreground text-center">حالة العميل (زر التقييم)</div>
                        <div className="px-4 py-3 flex justify-center gap-4">
                          <button onClick={() => { handleRatingChange('excellent'); setShowMenu(false); }} className={`w-10 h-10 rounded-full bg-green-500 hover:bg-green-600 transition-colors border-2 ${client?.rating === 'excellent' ? 'border-foreground' : 'border-transparent'}`} title="ممتاز" />
                          <button onClick={() => { handleRatingChange('average'); setShowMenu(false); }} className={`w-10 h-10 rounded-full bg-yellow-500 hover:bg-yellow-600 transition-colors border-2 ${client?.rating === 'average' ? 'border-foreground' : 'border-transparent'}`} title="متوسط" />
                          <button onClick={() => { handleRatingChange('poor'); setShowMenu(false); }} className={`w-10 h-10 rounded-full bg-red-500 hover:bg-red-600 transition-colors border-2 ${client?.rating === 'poor' ? 'border-foreground' : 'border-transparent'}`} title="ضعيف" />
                        </div>
                      </div>

                      <button onClick={() => { setIsSelectionMode(true); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-destructive hover:bg-destructive/10 transition-colors font-bold">
                        <CheckSquare className="w-4 h-4" /> تحديد وحذف المعاملات
                      </button>

                    </div>
                  </>
                )}
              </div>
            </div>
          }
        />
      )}

      {isSelectionMode && <div className="h-14" />}

      <div id="ledger-content-to-capture" className="flex flex-col flex-1 bg-background pb-2">
        {budgetLimit > 0 && (
          <div className="sticky top-[52px] z-30 mx-3 mt-3 rounded-2xl overflow-hidden shadow-xl animate-fade-in border border-white/10">
            {/* تم تحسين بطاقة السقف هنا لتكون أوسع وأكثر تناسقاً */}
            <div className="bg-gradient-to-l from-[hsl(var(--header-bg))] to-[hsl(var(--limit-bar-bg))] text-white p-6">
              <div className="flex items-center justify-between mb-5 gap-4">
                <div className="flex items-center gap-3 flex-1">
                  {isOverBudget && <AlertTriangle className="w-6 h-6 text-red-400 animate-pulse flex-shrink-0" />}
                  <div className="flex flex-col flex-1">
                    <span className="text-xs opacity-90 font-bold mb-1">المتبقي من السقف</span>
                    <span className={`text-4xl font-black tracking-tight drop-shadow-md ${isOverBudget ? 'text-red-400' : 'text-yellow-400'}`} dir="ltr">
                      {formatNumber(remaining)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 flex-1">
                  <div className="flex justify-end items-center gap-1.5">
                    <span className="font-sans font-bold text-sm bg-black/20 px-2 py-0.5 rounded text-white shadow-sm" dir="ltr">{formatNumber(budgetLimit)}</span>
                    <span className="text-[11px] font-bold opacity-90">السقف:</span>
                  </div>
                  <div className="flex justify-end items-center gap-1.5">
                    <span className="font-sans font-bold text-sm bg-black/20 px-2 py-0.5 rounded text-white shadow-sm" dir="ltr">{formatNumber(totalDebit - totalCredit)}</span>
                    <span className="text-[11px] font-bold opacity-90">الاستهلاك:</span>
                  </div>
                </div>
              </div>
              <div className="w-full h-4 bg-black/30 rounded-full overflow-hidden backdrop-blur-sm shadow-inner p-0.5">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ease-out shadow-sm ${isOverBudget ? 'bg-red-500' : 'bg-yellow-400'}`}
                  style={{ width: `${Math.min(consumed, 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}

        <div className="p-3 flex-1 mt-2">
          <Card className="shadow-lg border-0 overflow-hidden animate-fade-in-up rounded-2xl">
            <CardContent className="p-0">
              
              {showSearch && (
                <div className="p-3 bg-muted/10 border-b border-border animate-in slide-in-from-top duration-200 flex items-center gap-2">
                  <Search className="w-5 h-5 text-muted-foreground ml-2" />
                  <input
                    autoFocus
                    type="text"
                    placeholder="ابحث في التفاصيل، المبالغ، أو التواريخ..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-background border border-input rounded-lg px-3 py-2.5 text-sm text-right outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button onClick={() => {setSearchQuery(''); setShowSearch(false);}} className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors"><X className="w-5 h-5"/></button>
                </div>
              )}

              <div className="bg-table-header text-table-header flex text-center text-[12px] font-extrabold py-3 px-2 border-b border-border/50 sticky top-0 z-10 shadow-sm" dir="rtl">
                <div className="w-[65px] shrink-0 text-right">التاريخ</div>
                <div className="w-[75px] shrink-0 text-center">المبلغ</div>
                <div className="flex-1 px-2 text-right">التفاصيل</div>
                <div className="w-[75px] shrink-0 text-left">الرصيد</div>
              </div>

              <div className="divide-y divide-border/40 select-none" dir="rtl">
                {loading ? (
                  <div className="p-10 text-center text-muted-foreground font-bold">جاري التحميل...</div>
                ) : filteredTransactions.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground flex flex-col items-center gap-3">
                    <HelpCircle className="w-10 h-10 opacity-20" />
                    <p className="text-sm">لا توجد معاملات مسجلة لهذا العميل</p>
                  </div>
                ) : (
                  filteredTransactions.map((tx, index) => {
                    const isSelected = selectedTxIds.includes(tx.id!);
                    return (
                      <div
                        key={tx.id || index}
                        onTouchStart={() => handleTouchStart(tx)}
                        onTouchEnd={handleTouchEnd}
                        onMouseDown={() => handleTouchStart(tx)}
                        onMouseUp={handleTouchEnd}
                        onMouseLeave={handleTouchEnd}
                        onClick={() => handleRowClick(tx)}
                        className={`flex py-4 px-2 items-center transition-colors cursor-pointer relative 
                          ${isSelected ? 'bg-primary/10' : index % 2 === 0 ? 'bg-white' : 'bg-muted/5'}`}
                        style={{ backgroundColor: !isSelected && tx.color ? tx.color : undefined }}
                      >
                        {isSelectionMode && (
                          <div className="absolute right-1 top-1/2 -translate-y-1/2 z-10 bg-background/80 rounded-full p-0.5">
                            {isSelected ? <CheckSquare className="w-5 h-5 text-primary" /> : <Square className="w-5 h-5 text-muted-foreground" />}
                          </div>
                        )}

                        <div className={`w-[65px] shrink-0 text-right text-[10px] font-bold text-muted-foreground whitespace-nowrap ${isSelectionMode ? 'pr-6' : ''}`}>
                          {tx.date}
                        </div>
                        
                        <div className="w-[75px] shrink-0 flex items-center justify-center gap-1 font-black text-[13px]">
                          {tx.type === 'debit' ? <ArrowDown className="w-3.5 h-3.5 text-debit shrink-0"/> : <ArrowUp className="w-3.5 h-3.5 text-credit shrink-0"/>}
                          <span className={tx.type === 'debit' ? 'text-debit' : 'text-credit'} dir="ltr">{formatNumber(tx.amount)}</span>
                        </div>
                        
                        <div className="flex-1 px-2 text-right text-[13px] font-bold text-foreground break-words whitespace-pre-wrap leading-tight">
                          {tx.details}
                        </div>
                        
                        <div className="w-[75px] shrink-0 text-left flex items-center justify-end gap-1 font-bold text-[13px]">
                          {tx.balance > 0 ? <ArrowDown className="w-3.5 h-3.5 text-debit shrink-0"/> : tx.balance < 0 ? <ArrowUp className="w-3.5 h-3.5 text-credit shrink-0"/> : null}
                          <span className="text-foreground" dir="ltr">{formatNumber(Math.abs(tx.balance))}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <footer className="fixed bottom-0 left-0 right-0 bg-header text-header p-3 shadow-[0_-4px_20px_rgba(0,0,0,0.15)] z-40 pb-safe">
        <div className="max-w-md mx-auto flex items-center justify-between gap-4">
          
          <button onClick={() => setShowShareModal(true)} className="w-14 h-14 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-2xl transition-all active:scale-95 shadow-sm flex-shrink-0">
            <Share2 className="w-6 h-6" />
          </button>

          <div className="flex flex-col items-center justify-center flex-1 text-center bg-black/10 py-2 rounded-2xl">
            <span className="text-[11px] opacity-80 font-bold mb-0.5">الرصيد النهائي</span>
            <div className="flex items-center gap-1.5 justify-center" dir="rtl">
              <span className="text-sm font-bold opacity-90">{netBalance >= 0 ? 'عليه' : 'له'}</span>
              <span className={`text-2xl font-black tracking-tight ${netBalance >= 0 ? 'text-red-300' : 'text-green-300'}`} dir="ltr">
                {formatNumber(Math.abs(netBalance))}
              </span>
            </div>
          </div>
          
          <button onClick={() => navigate(`/add-transaction?clientId=${client?.id}`)} className="w-14 h-14 flex items-center justify-center bg-white hover:bg-gray-100 text-[#5D4037] rounded-2xl transition-all active:scale-95 shadow-lg flex-shrink-0">
            <Plus className="w-8 h-8 font-bold" />
          </button>

        </div>
      </footer>

      {showShareModal && (
        <div className="fixed inset-0 bg-foreground/50 backdrop-blur-sm z-50 flex items-end justify-center animate-fade-in" onClick={() => setShowShareModal(false)}>
          <div className="bg-card w-full rounded-t-3xl p-6 space-y-5 animate-slide-up shadow-2xl border-t border-border" onClick={e => e.stopPropagation()} dir="rtl">
            <div className="w-12 h-1.5 bg-muted mx-auto rounded-full mb-2" />
            <div className="text-center">
              <h3 className="text-xl font-extrabold text-foreground">مشاركة كشف الحساب</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={handleSharePDF} className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-primary/5 hover:bg-primary/10 border border-primary/10 transition-all group">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center group-active:scale-90 transition-transform"><FileDown className="w-6 h-6 text-primary" /></div>
                <span className="font-bold text-sm">ملف PDF</span>
              </button>
              <button onClick={handleShareImage} className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-primary/5 hover:bg-primary/10 border border-primary/10 transition-all group">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center group-active:scale-90 transition-transform"><ImageIcon className="w-6 h-6 text-primary" /></div>
                <span className="font-bold text-sm">صورة كشف</span>
              </button>
              <button onClick={handleShareExcel} className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-primary/5 hover:bg-primary/10 border border-primary/10 transition-all group">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center group-active:scale-90 transition-transform"><FileSpreadsheet className="w-6 h-6 text-primary" /></div>
                <span className="font-bold text-sm">ملف إكسل</span>
              </button>
              <button onClick={handleShareText} className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-primary/5 hover:bg-primary/10 border border-primary/10 transition-all group">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center group-active:scale-90 transition-transform"><Type className="w-6 h-6 text-primary" /></div>
                <span className="font-bold text-sm">نص فقط</span>
              </button>
            </div>
            <button onClick={() => setShowShareModal(false)} className="w-full p-4 rounded-xl bg-muted text-foreground font-bold hover:bg-muted/80 transition-colors">إلغاء</button>
          </div>
        </div>
      )}

      {clickedTx && !isSelectionMode && (
        <div className="fixed inset-0 bg-foreground/50 backdrop-blur-sm z-50 flex items-end justify-center animate-fade-in" onClick={() => setClickedTx(null)}>
          <div className="bg-card w-full rounded-t-2xl p-4 space-y-3 animate-slide-up shadow-2xl border-t border-border" onClick={e => e.stopPropagation()} dir="rtl">
            <div className="w-12 h-1.5 bg-muted mx-auto rounded-full mb-4" />
            <div className="text-center mb-4">
              <p className="font-bold text-lg text-foreground">{formatNumber(clickedTx.amount)}</p>
              <p className="text-sm text-muted-foreground">{clickedTx.details}</p>
            </div>
            <button onClick={confirmSingleDeleteTx} className="w-full flex items-center gap-3 p-4 rounded-xl bg-destructive/10 hover:bg-destructive/20 text-destructive font-semibold transition-colors">
              <Trash2 className="w-5 h-5" /> حذف العملية
            </button>
            <button onClick={() => { startEditTx(clickedTx); setClickedTx(null); }} className="w-full flex items-center gap-3 p-4 rounded-xl bg-muted/50 hover:bg-muted text-foreground font-semibold transition-colors">
              <Pencil className="w-5 h-5 text-blue-500" /> تعديل العملية
            </button>
            <button onClick={() => {setShowColorPicker(true);}} className="w-full flex items-center gap-3 p-4 rounded-xl bg-muted/50 hover:bg-muted text-foreground font-semibold transition-colors">
              <Palette className="w-5 h-5 text-purple-500" /> تلوين المعاملة
            </button>
          </div>
        </div>
      )}

      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in" onClick={() => setShowBulkDeleteConfirm(false)}>
          <Card className="shadow-xl w-80 border-0 animate-scale-in" onClick={e => e.stopPropagation()} dir="rtl">
            <CardContent className="p-6 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
                <Trash2 className="w-7 h-7 text-destructive" />
              </div>
              <h2 className="text-lg font-bold text-foreground">تأكيد الحذف</h2>
              <p className="text-sm text-muted-foreground">سيتم حذف {selectedTxIds.length} معاملة نهائياً. هل أنت متأكد؟</p>
              <div className="flex gap-2">
                <button onClick={handleBulkDelete} className="flex-1 bg-destructive text-destructive-foreground py-2.5 rounded-lg font-semibold">تأكيد الحذف</button>
                <button onClick={() => setShowBulkDeleteConfirm(false)} className="flex-1 bg-muted text-foreground py-2.5 rounded-lg font-semibold">إلغاء</button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {showLimitModal && (
        <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in" onClick={() => setShowLimitModal(false)}>
          <Card className="shadow-xl w-80 border-0 animate-scale-in" onClick={e => e.stopPropagation()} dir="rtl">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <ShieldAlert className="w-6 h-6 text-primary" />
                <h2 className="text-lg font-bold text-foreground">تعديل سقف الحساب</h2>
              </div>
              <div>
                <label className="text-sm font-semibold text-muted-foreground mb-2 block">السقف المالي الجديد</label>
                <input className="w-full border border-input rounded-lg px-4 py-3 text-left bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary font-sans text-lg tracking-wider font-bold" type="number" value={newLimit} onChange={e => setNewLimit(e.target.value)} placeholder="أدخل مبلغ السقف..." dir="ltr" />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={handleSaveLimit} className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-lg font-semibold">حفظ السقف</button>
                <button onClick={() => setShowLimitModal(false)} className="flex-1 bg-muted text-foreground py-2.5 rounded-lg font-semibold">إلغاء</button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {showCloseBalanceModal && (
        <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in" onClick={() => setShowCloseBalanceModal(false)}>
          <Card className="shadow-xl w-80 border-0 animate-scale-in" onClick={e => e.stopPropagation()} dir="rtl">
            <CardContent className="p-6 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                <Lock className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-lg font-bold text-foreground">تصفية وإغلاق الرصيد</h2>
              <p className="text-sm text-muted-foreground">سيتم إنشاء معاملة تلقائية بمبلغ <strong className="text-foreground">{formatNumber(Math.abs(netBalance))}</strong> لتصفية الحساب بالكامل. هل أنت متأكد؟</p>
              <div className="flex gap-2">
                <button onClick={handleCloseBalance} className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-lg font-semibold">تأكيد التصفية</button>
                <button onClick={() => setShowCloseBalanceModal(false)} className="flex-1 bg-muted text-foreground py-2.5 rounded-lg font-semibold">إلغاء</button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {showColorPicker && (
        <div className="fixed inset-0 bg-foreground/50 backdrop-blur-sm z-[60] flex items-center justify-center animate-fade-in" onClick={() => setShowColorPicker(false)}>
          <Card className="w-80 border-0 shadow-2xl animate-scale-in" onClick={e => e.stopPropagation()} dir="rtl">
            <CardContent className="p-6">
              <h3 className="text-lg font-bold mb-4 text-center">اختر لون المعاملة</h3>
              <div className="grid grid-cols-4 gap-4">
                {[
                  { name: 'شفاف', color: '' }, { name: 'أحمر', color: '#fee2e2' }, { name: 'أخضر', color: '#dcfce7' }, { name: 'أصفر', color: '#fef3c7' },
                  { name: 'أزرق', color: '#dbeafe' }, { name: 'بنفسجي', color: '#f3e8ff' }, { name: 'برتقالي', color: '#ffedd5' }, { name: 'رمادي', color: '#f3f4f6' }
                ].map((c) => (
                  <button key={c.name} onClick={() => handleColorSelect(c.color)} className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded-full border border-border shadow-sm" style={{ backgroundColor: c.color || '#ffffff' }} />
                    <span className="text-[10px]">{c.name}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => setShowColorPicker(false)} className="w-full mt-6 py-2 bg-muted rounded-lg font-bold">إلغاء</button>
            </CardContent>
          </Card>
        </div>
      )}

      {editingTx && (
        <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in" onClick={() => setEditingTx(null)}>
          <Card className="shadow-xl w-80 border-0 animate-scale-in" onClick={e => e.stopPropagation()} dir="rtl">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <Pencil className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-bold text-foreground">تعديل المعاملة</h2>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">المبلغ</label>
                <input className="w-full border border-input rounded-lg px-3 py-2.5 text-right bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">التفاصيل</label>
                <input className="w-full border border-input rounded-lg px-3 py-2.5 text-right bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" value={editDetails} onChange={e => setEditDetails(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">التاريخ</label>
                <input className="w-full border border-input rounded-lg px-3 py-2.5 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" type="date" value={editDate} onChange={e => setEditDate(e.target.value)} />
              </div>
              <div className="flex gap-4 justify-center pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="editTransactionType" value="debit" checked={editType === 'debit'} onChange={() => setEditType('debit')} className="w-5 h-5 accent-[hsl(var(--debit-color))]" />
                  <span className="font-bold text-foreground">عليه</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="editTransactionType" value="credit" checked={editType === 'credit'} onChange={() => setEditType('credit')} className="w-5 h-5 accent-[hsl(var(--credit-color))]" />
                  <span className="font-bold text-foreground">له</span>
                </label>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={saveEditTx} className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-lg font-semibold">حفظ</button>
                <button onClick={() => setEditingTx(null)} className="flex-1 bg-muted text-foreground py-2.5 rounded-lg font-semibold">إلغاء</button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <ClientNotesSheet isOpen={showNotes} onClose={() => setShowNotes(false)} notes={client?.notes || []} onAddNote={handleAddNote} onDeleteNote={handleDeleteNote} />
    </div>
  );
};

export default LedgerPage;
