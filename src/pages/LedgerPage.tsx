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

  // Helper to render stars based on rating
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
            {/* عرض النجوم في الشريط العلوي هنا */}
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

      {/* Selection Mode Header Overlay */}
      {isSelectionMode && (
        <div className="fixed top-0 left-0 right-0 h-14 bg-header text-header z-[60] flex items-center justify-between px-4 shadow-lg animate-fade-in" dir="rtl">
          <div className="flex items-center gap-4">
            <button onClick={() => {setIsSelectionMode(false); setSelectedTxIds([]);}} className="p-2 bg-white/20 rounded-lg"><X className="w-5 h-5"/></button>
            <span className="font-bold">{selectedTxIds.length} محدد</span>
          </div>
          <button className="flex items-center gap-2 bg-red-500 px-4 py-1.5 rounded-lg text-sm font-bold shadow-md active:scale-95 transition-transform">حذف المحدد</button>
        </div>
      )}

      {/* Budget Box - Fixed Consistency with English Numbers */}
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
      <div className="p-3 flex-1 mt-2">
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
              {filteredTransactions.map((tx, idx) => (
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

      {/* --- REFRESHED BOTTOM BAR --- */}
      <footer className="fixed bottom-0 left-0 right-0 bg-[#5D4037] text-white p-3 z-40 pb-safe shadow-[0_-4px_10px_rgba(0,0,0,0.15)]">
        <div className="flex items-center justify-between px-2 w-full">
          {/* Share - Far Left */}
          <button onClick={() => setShowShareModal(true)} className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center active:scale-90 transition-transform">
            <Share2 className="w-6 h-6" />
          </button>

          {/* Balance - Center */}
          <div className="flex flex-col items-center bg-black/20 py-2 px-6 rounded-2xl">
            <span className="text-[10px] font-bold opacity-70 mb-0.5">الرصيد النهائي</span>
            <div className="flex items-center gap-1" dir="rtl">
              <span className="text-xs font-bold">{netBalance >= 0 ? 'عليه' : 'له'}</span>
              <span className={`text-2xl font-black ${netBalance >= 0 ? 'text-red-300' : 'text-green-300'}`} dir="ltr">
                {formatNumber(Math.abs(netBalance))}
              </span>
            </div>
          </div>

          {/* Add - Far Right */}
          <button onClick={() => navigate(`/add-transaction?clientId=${client?.id}`)} className="w-14 h-14 bg-white text-[#5D4037] rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-transform">
            <Plus className="w-8 h-8 font-black" />
          </button>
        </div>
      </footer>

      {/* Modal: Rating Client */}
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

      {/* Context Menu for Single Transaction */}
      {contextMenuTx && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[70] flex items-center justify-center p-6 animate-fade-in" onClick={() => setContextMenuTx(null)}>
          <Card className="w-full max-w-xs shadow-2xl border-0 overflow-hidden animate-scale-in rounded-3xl" onClick={e => e.stopPropagation()} dir="rtl">
            <div className="bg-[#5D4037] p-4 text-white text-center">
              <p className="font-black text-xl" dir="ltr">{formatNumber(contextMenuTx.amount)}</p>
              <p className="text-[11px] opacity-80 truncate mt-1">{contextMenuTx.details}</p>
            </div>
            <div className="p-3 grid grid-cols-1 gap-2">
              <button onClick={() => { setEditingTx(contextMenuTx); setContextMenuTx(null); }} className="flex items-center gap-3 p-3 hover:bg-muted rounded-xl font-bold transition-colors">
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

      {/* Modern Notes Sheet Overlay */}
      {showNotes && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[80] flex items-end justify-center animate-fade-in" onClick={() => setShowNotes(false)}>
          <div className="bg-card w-full max-h-[85vh] rounded-t-3xl p-6 overflow-y-auto animate-slide-up shadow-2xl border-t border-border" onClick={e => e.stopPropagation()} dir="rtl">
             <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-black">ملاحظات {client?.name}</h3>
                <button onClick={() => setShowNotes(false)} className="bg-muted p-2 rounded-full"><X className="w-5 h-5"/></button>
             </div>
             
             {/* Add Note Input */}
             <div className="relative mb-6">
                <textarea 
                  id="note-input"
                  placeholder="اكتب ملاحظة جديدة هنا..." 
                  className="w-full bg-muted border-none rounded-2xl p-4 text-sm font-bold min-h-[100px] outline-none focus:ring-2 focus:ring-[#5D4037]/30"
                />
                <button 
                  onClick={() => {
                    const el = document.getElementById('note-input') as HTMLTextAreaElement;
                    handleAddNote(el.value);
                    el.value = '';
                  }}
                  className="absolute bottom-3 left-3 bg-[#5D4037] text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md"
                >حفظ الملاحظة</button>
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

      {/* Modal: سقف الحساب */}
      {showLimitModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowLimitModal(false)}>
          <Card className="shadow-2xl w-full max-w-xs border-0 animate-scale-in rounded-3xl overflow-hidden" onClick={e => e.stopPropagation()} dir="rtl">
            <div className="bg-[#5D4037] p-4 text-white text-center">
               <h3 className="text-lg font-black flex items-center justify-center gap-2"><ShieldAlert className="w-5 h-5"/> سقف الحساب</h3>
            </div>
            <CardContent className="p-5 space-y-4 bg-card">
              <div>
                <label className="text-sm font-bold text-muted-foreground mb-2 block">السقف المالي الجديد</label>
                {/* إجبار الأرقام على أن تكون إنجليزية هنا */}
                <input 
                  className="w-full border border-input rounded-xl px-4 py-3 text-left bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-[#5D4037] font-sans text-lg tracking-wider font-bold" 
                  type="number" 
                  lang="en" 
                  dir="ltr" 
                  value={newLimit} 
                  onChange={e => setNewLimit(e.target.value)} 
                  placeholder="0" 
                />
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
    </div>
  );
};

export default LedgerPage;
