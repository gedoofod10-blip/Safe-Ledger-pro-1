import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllClients, addClient as dbAddClient, getTransactionsByClient, updateClient, deleteClient as dbDeleteClient, addTransaction as dbAddTransaction, type Client } from '@/lib/db';
import AppHeader from '@/components/AppHeader';
import BottomBar from '@/components/BottomBar';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Users, Pencil, Trash2, X, UserPlus, ArrowLeftRight, Plus, ArrowUp, ArrowDown, Layers } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import TransferModal from '@/components/TransferModal';

// Extended Client type to include total balance and transaction count
type ExtendedClient = Client & { balance: number; txCount: number };

const ClientsPage = () => {
  const navigate = useNavigate();
  const [allClients, setAllClients] = useState<ExtendedClient[]>([]);
  
  // التصنيفات الديناميكية
  const [categories, setCategories] = useState<string[]>(['عام', 'عملاء', 'موردين']);
  const [selectedCategory, setSelectedCategory] = useState('عام');
  
  const [selectedCurrency] = useState('جنيه'); 
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newBudgetLimit, setNewBudgetLimit] = useState('');
  const [debitTotal, setDebitTotal] = useState(0);
  const [creditTotal, setCreditTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showTransfer, setShowTransfer] = useState(false);
  const [quickAddClient, setQuickAddClient] = useState<Client | null>(null);
  const [quickAmount, setQuickAmount] = useState('');
  const [quickDetails, setQuickDetails] = useState('');
  const [quickDate, setQuickDate] = useState(new Date().toISOString().split('T')[0]);

  // --- States for Selection Mode & Swipe ---
  const [selectedClientMode, setSelectedClientMode] = useState<ExtendedClient | null>(null);
  const [showChangeCategoryModal, setShowChangeCategoryModal] = useState(false);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const touchStartX = useRef<number | null>(null);

  // جلب التصنيفات المحفوظة
  useEffect(() => {
    const savedCats = localStorage.getItem('customCategories');
    if (savedCats) {
      const parsedCats = JSON.parse(savedCats);
      setCategories(parsedCats);
      if (!parsedCats.includes(selectedCategory) && parsedCats.length > 0) {
        setSelectedCategory(parsedCats[0]);
      }
    }
  }, []);

  const loadClients = useCallback(async () => {
    setLoading(true);
    // التعديل السحري: جلب جميع العملاء من قاعدة البيانات لتفعيل البحث الشامل
    const all = await getAllClients();
    
    let dTotal = 0, cTotal = 0;
    const extendedClients: ExtendedClient[] = [];

    for (const client of all) {
      if (client.currency !== selectedCurrency) continue;

      const txns = await getTransactionsByClient(client.id!);
      let clientBalance = 0;
      
      for (const t of txns) {
        if (t.type === 'debit') { clientBalance += t.amount; }
        else { clientBalance -= t.amount; }
      }
      
      // حساب الإجماليات للتصنيف المحدد حالياً فقط
      if (client.category === selectedCategory) {
        if (clientBalance > 0) { dTotal += clientBalance; } 
        else if (clientBalance < 0) { cTotal += Math.abs(clientBalance); }
      }

      extendedClients.push({ ...client, balance: clientBalance, txCount: txns.length });
    }
    
    setAllClients(extendedClients);
    setDebitTotal(dTotal);
    setCreditTotal(cTotal);
    setLoading(false);
  }, [selectedCategory, selectedCurrency]);

  useEffect(() => { loadClients(); }, [loadClients]);

  // فلترة العملاء: إذا كان هناك بحث يتم البحث في كل التطبيق، وإلا يعرض عملاء التصنيف الحالي
  const displayedClients = searchQuery
    ? allClients.filter(c => c.name.includes(searchQuery) || c.phone?.includes(searchQuery))
    : allClients.filter(c => c.category === selectedCategory);

  // --- Swipe Logic ---
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;

    if (Math.abs(diff) > 50) { 
      const currentIndex = categories.indexOf(selectedCategory);
      if (diff > 0 && currentIndex < categories.length - 1) {
        setSelectedCategory(categories[currentIndex + 1]);
      } else if (diff < 0 && currentIndex > 0) {
        setSelectedCategory(categories[currentIndex - 1]);
      }
    }
    touchStartX.current = null;
  };

  // --- Long Press Logic ---
  const handleLongPressStart = (client: ExtendedClient) => {
    pressTimer.current = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(50);
      setSelectedClientMode(client);
    }, 500);
  };

  const handleLongPressEnd = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  const addClient = async () => {
    const trimmedName = newName.trim();
    if (!trimmedName) return;

    // تم تبسيط فحص التكرار لأننا نمتلك جميع العملاء في allClients الآن
    const existingClient = allClients.find(c => c.name === trimmedName);

    if (existingClient) {
      alert(`هذا الاسم موجود مسبقاً في تصنيف (${existingClient.category})! سيتم تحويلك لحسابه.`);
      setShowAddDialog(false);
      setNewName(''); setNewPhone(''); setNewBudgetLimit('');
      setTimeout(() => navigate(`/ledger/${existingClient.id}`), 500);
      return;
    }

    await dbAddClient({
      name: trimmedName,
      phone: newPhone.trim(),
      category: selectedCategory,
      currency: selectedCurrency,
      budgetLimit: newBudgetLimit ? parseFloat(newBudgetLimit) : undefined,
      createdAt: new Date().toISOString(),
    });
    setNewName(''); setNewPhone(''); setNewBudgetLimit('');
    setShowAddDialog(false);
    loadClients();
  };

  const startEdit = (client: Client) => {
    setEditingClient(client);
    setNewName(client.name);
    setNewPhone(client.phone || '');
    setNewBudgetLimit(client.budgetLimit?.toString() || '');
    setShowEditDialog(true);
    setSelectedClientMode(null);
  };

  const saveEdit = async () => {
    if (!editingClient?.id || !newName.trim()) return;
    await updateClient(editingClient.id, {
      name: newName.trim(),
      phone: newPhone.trim(),
      budgetLimit: newBudgetLimit ? parseFloat(newBudgetLimit) : undefined,
    });
    setShowEditDialog(false);
    setEditingClient(null);
    setNewName(''); setNewPhone(''); setNewBudgetLimit('');
    loadClients();
  };

  const confirmDelete = async () => {
    if (showDeleteConfirm === null) return;
    await dbDeleteClient(showDeleteConfirm);
    setShowDeleteConfirm(null);
    setSelectedClientMode(null);
    loadClients();
  };

  const handleChangeCategory = async (newCategory: string) => {
    if (!selectedClientMode?.id) return;
    await updateClient(selectedClientMode.id, { category: newCategory });
    setShowChangeCategoryModal(false);
    setSelectedClientMode(null);
    loadClients();
  };

  const handleQuickAdd = async (type: 'debit' | 'credit') => {
    if (!quickAddClient?.id || !quickAmount || parseFloat(quickAmount) <= 0) return;
    await dbAddTransaction({
      clientId: quickAddClient.id,
      amount: parseFloat(quickAmount),
      type,
      details: quickDetails.trim(),
      date: quickDate,
    });
    setQuickAddClient(null);
    setQuickAmount(''); setQuickDetails('');
    setQuickDate(new Date().toISOString().split('T')[0]);
    loadClients();
  };

  return (
    <div 
      className="min-h-screen bg-background pb-16 flex flex-col"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {selectedClientMode ? (
        <div className="fixed top-0 left-0 right-0 h-14 bg-[#5D4037] text-white z-50 flex items-center justify-between px-4 animate-fade-in shadow-md" dir="rtl">
          <div className="flex items-center gap-4">
            <button onClick={() => setSelectedClientMode(null)} className="p-2 hover:bg-[#795548] rounded-full transition-colors">
              <ArrowLeftRight className="w-5 h-5 rotate-180" />
            </button>
            <span className="font-semibold text-lg">1 Selected</span>
          </div>
          <div className="flex items-center gap-1">
             <button onClick={() => setShowChangeCategoryModal(true)} className="p-2 hover:bg-[#795548] rounded-full transition-colors" title="نقل لحساب آخر / تغيير التصنيف">
              <Layers className="w-5 h-5" />
            </button>
            <button onClick={() => startEdit(selectedClientMode)} className="p-2 hover:bg-[#795548] rounded-full transition-colors" title="تعديل">
              <Pencil className="w-5 h-5" />
            </button>
            <button onClick={() => setShowDeleteConfirm(selectedClientMode.id!)} className="p-2 hover:bg-[#795548] rounded-full transition-colors text-red-300" title="حذف">
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="sticky top-0 z-40">
          <AppHeader
            title={selectedCategory} 
            showMenu
            showSearch
            showNotifications
            onMenuClick={() => navigate('/menu')}
            onSearchClick={() => setShowSearch(!showSearch)}
          />
        </div>
      )}

      {selectedClientMode && <div className="h-14" />}

      {/* Search Bar */}
      {showSearch && !selectedClientMode && (
        <div className="px-3 pt-2 animate-fade-in">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              autoFocus
              className="w-full bg-card border border-border rounded-xl pr-10 pl-10 py-2.5 text-right text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="ابحث عن أي عميل في كل التصنيفات..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute left-3 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="p-3 flex-1">
        <Card className="shadow-lg border-0 overflow-hidden animate-fade-in">
          <CardContent className="p-0">
            <div className="divide-y divide-border select-none">
              {loading ? (
                <div className="py-20 flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-muted-foreground">جاري التحميل...</span>
                </div>
              ) : displayedClients.length === 0 ? (
                <div className="py-20 flex flex-col items-center gap-3 animate-fade-in">
                  <Users className="w-14 h-14 text-muted-foreground/40" />
                  <p className="text-muted-foreground text-sm font-semibold">
                    {searchQuery ? 'لا توجد نتائج للبحث في أي تصنيف' : 'لا يوجد حسابات في هذا التصنيف'}
                  </p>
                  {!searchQuery && (
                    <button
                      onClick={() => setShowAddDialog(true)}
                      className="mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold flex items-center gap-2"
                    >
                      <UserPlus className="w-4 h-4" />
                      إضافة حساب جديد
                    </button>
                  )}
                </div>
              ) : (
                displayedClients.map((client, i) => (
                  <div
                    key={client.id}
                    className={`flex items-center justify-between transition-all duration-200 cursor-pointer ${selectedClientMode?.id === client.id ? 'bg-[#5D4037]/10' : i % 2 === 0 ? 'bg-card' : 'bg-muted/30'}`}
                    onTouchStart={() => handleLongPressStart(client)}
                    onTouchEnd={handleLongPressEnd}
                    onTouchMove={handleLongPressEnd}
                    onMouseDown={() => handleLongPressStart(client)}
                    onMouseUp={handleLongPressEnd}
                    onMouseLeave={handleLongPressEnd}
                    onClick={() => {
                      if (!selectedClientMode) navigate(`/ledger/${client.id}`);
                    }}
                  >
                    <div className="flex items-center gap-3 pr-4 py-3 flex-1 overflow-hidden">
                       <button
                        onClick={(e) => { e.stopPropagation(); setQuickAddClient(client); }}
                        className="p-1.5 rounded-md border-2 border-[#5D4037] text-[#5D4037] hover:bg-[#5D4037]/10 transition-colors flex-shrink-0"
                      >
                        <Plus className="w-5 h-5 font-bold" />
                      </button>
                      <div className="flex flex-col">
                        <span className="font-bold text-foreground truncate">{client.name}</span>
                        {/* عرض اسم التصنيف تحت اسم العميل أثناء البحث الشامل */}
                        {searchQuery && (
                          <span className="text-[10px] text-[#5D4037] bg-[#FFD54F]/30 px-2 py-0.5 rounded-full w-fit mt-0.5 font-bold">
                            {client.category}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 pl-4 py-3 flex-1">
                      <div className="w-6 h-6 rounded-full bg-[#FFD54F]/40 flex items-center justify-center text-[11px] font-extrabold text-[#5D4037] flex-shrink-0">
                        {formatNumber(client.txCount)}
                      </div>
                      <div className="flex flex-col items-end min-w-[70px]">
                        {client.balance !== 0 && (
                          <span className="flex items-center gap-1 font-bold text-sm">
                             <span className={client.balance > 0 ? 'text-debit' : 'text-credit'}>{formatNumber(Math.abs(client.balance))}</span>
                             
                             {/* --- التعديل: الأسهم مصمتة وملونة بالكامل --- */}
                             {client.balance > 0 ? (
                               <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-debit fill-current" aria-hidden="true">
                                 <path d="M2.5 6l9.5 12 9.5-12h-19z" />
                               </svg>
                             ) : (
                               <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-credit fill-current" aria-hidden="true">
                                 <path d="M21.5 18l-9.5-12-9.5 12h19z" />
                               </svg>
                             )}
                             
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {showChangeCategoryModal && (
        <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-[60] flex items-center justify-center animate-fade-in" onClick={() => setShowChangeCategoryModal(false)}>
          <Card className="shadow-xl w-80 border-0 animate-scale-in" onClick={e => e.stopPropagation()} dir="rtl">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Layers className="w-5 h-5 text-[#5D4037]" />
                <h2 className="text-lg font-bold text-[#5D4037]">تغيير التصنيف</h2>
              </div>
              <div className="space-y-2 mb-6">
                {categories.map(cat => (
                   <button
                   key={cat}
                   onClick={() => handleChangeCategory(cat)}
                   className={`w-full py-3 px-4 rounded-lg text-right font-semibold border ${selectedClientMode?.category === cat ? 'bg-[#FFD54F]/20 border-[#5D4037] text-[#5D4037]' : 'bg-background border-border text-foreground hover:bg-muted'}`}
                 >
                   {cat}
                 </button>
                ))}
              </div>
              <button onClick={() => setShowChangeCategoryModal(false)} className="w-full bg-muted text-foreground py-2.5 rounded-lg font-semibold hover:opacity-90 transition-opacity">إلغاء</button>
            </CardContent>
          </Card>
        </div>
      )}

      {showAddDialog && (
        <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in" onClick={() => setShowAddDialog(false)}>
          <Card className="shadow-xl w-80 border-0 animate-scale-in" onClick={e => e.stopPropagation()}>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <UserPlus className="w-5 h-5 text-[#5D4037]" />
                <h2 className="text-lg font-bold text-foreground">إضافة عميل جديد</h2>
              </div>
              <input className="w-full border border-input rounded-lg px-3 py-2.5 mb-3 text-right bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#5D4037]/30" placeholder="الإسم" value={newName} onChange={e => setNewName(e.target.value)} />
              <input className="w-full border border-input rounded-lg px-3 py-2.5 mb-3 text-right bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#5D4037]/30" placeholder="رقم الهاتف (اختياري)" value={newPhone} onChange={e => setNewPhone(e.target.value)} />
              <input className="w-full border border-input rounded-lg px-3 py-2.5 mb-4 text-right bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#5D4037]/30" placeholder="السقف المالي (اختياري)" type="number" value={newBudgetLimit} onChange={e => setNewBudgetLimit(e.target.value)} />
              <div className="flex gap-2">
                <button onClick={addClient} className="flex-1 bg-[#5D4037] text-white py-2.5 rounded-lg font-semibold hover:opacity-90 transition-opacity">إضافة</button>
                <button onClick={() => setShowAddDialog(false)} className="flex-1 bg-muted text-foreground py-2.5 rounded-lg font-semibold hover:opacity-90 transition-opacity">إلغاء</button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {showEditDialog && (
        <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in" onClick={() => setShowEditDialog(false)}>
          <Card className="shadow-xl w-80 border-0 animate-scale-in" onClick={e => e.stopPropagation()}>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Pencil className="w-5 h-5 text-[#5D4037]" />
                <h2 className="text-lg font-bold text-foreground">تعديل بيانات العميل</h2>
              </div>
              <input className="w-full border border-input rounded-lg px-3 py-2.5 mb-3 text-right bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#5D4037]/30" placeholder="الإسم" value={newName} onChange={e => setNewName(e.target.value)} />
              <input className="w-full border border-input rounded-lg px-3 py-2.5 mb-3 text-right bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#5D4037]/30" placeholder="رقم الهاتف (اختياري)" value={newPhone} onChange={e => setNewPhone(e.target.value)} />
              <input className="w-full border border-input rounded-lg px-3 py-2.5 mb-4 text-right bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#5D4037]/30" placeholder="السقف المالي (اختياري)" type="number" value={newBudgetLimit} onChange={e => setNewBudgetLimit(e.target.value)} />
              <div className="flex gap-2">
                <button onClick={saveEdit} className="flex-1 bg-[#5D4037] text-white py-2.5 rounded-lg font-semibold hover:opacity-90 transition-opacity">حفظ</button>
                <button onClick={() => setShowEditDialog(false)} className="flex-1 bg-muted text-foreground py-2.5 rounded-lg font-semibold hover:opacity-90 transition-opacity">إلغاء</button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {showDeleteConfirm !== null && (
        <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-[60] flex items-center justify-center animate-fade-in" onClick={() => setShowDeleteConfirm(null)}>
          <Card className="shadow-xl w-80 border-0 animate-scale-in" onClick={e => e.stopPropagation()}>
            <CardContent className="p-6 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 className="w-7 h-7 text-red-600" />
              </div>
              <h2 className="text-lg font-bold text-foreground">تأكيد الحذف</h2>
              <p className="text-sm text-muted-foreground">سيتم حذف الحساب وجميع معاملاته بشكل نهائي. هل أنت متأكد؟</p>
              <div className="flex gap-2">
                <button onClick={confirmDelete} className="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-semibold">حذف</button>
                <button onClick={() => setShowDeleteConfirm(null)} className="flex-1 bg-muted text-foreground py-2.5 rounded-lg font-semibold">إلغاء</button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {quickAddClient && (
        <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in" onClick={() => setQuickAddClient(null)}>
          <Card className="shadow-xl w-80 border-0 animate-scale-in" onClick={e => e.stopPropagation()}>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Plus className="w-5 h-5 text-[#5D4037]" />
                <h2 className="text-lg font-bold text-[#5D4037]">إضافة مبلغ - {quickAddClient.name}</h2>
              </div>
              <input
                autoFocus
                className="w-full border border-input rounded-lg px-3 py-2.5 mb-3 text-right bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#5D4037]/30"
                placeholder="المبلغ"
                type="number"
                value={quickAmount}
                onChange={e => setQuickAmount(e.target.value)}
              />
              <input
                className="w-full border border-input rounded-lg px-3 py-2.5 mb-3 text-right bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#5D4037]/30"
                placeholder="التفاصيل (اختياري)"
                value={quickDetails}
                onChange={e => setQuickDetails(e.target.value)}
              />
              <input
                className="w-full border border-input rounded-lg px-3 py-2.5 mb-4 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-[#5D4037]/30"
                type="date"
                value={quickDate}
                onChange={e => setQuickDate(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => handleQuickAdd('debit')}
                  className="flex-1 py-3 rounded-lg bg-[hsl(var(--debit-color))] text-white font-bold flex items-center justify-center gap-1.5 hover:opacity-90 active:scale-[0.97] transition-all"
                >
                  عليه
                  <ArrowDown className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleQuickAdd('credit')}
                  className="flex-1 py-3 rounded-lg bg-[hsl(var(--credit-color))] text-white font-bold flex items-center justify-center gap-1.5 hover:opacity-90 active:scale-[0.97] transition-all"
                >
                  له
                  <ArrowUp className="w-4 h-4" />
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <TransferModal
        open={showTransfer}
        onClose={() => setShowTransfer(false)}
        onComplete={loadClients}
      />

      <BottomBar
        debitTotal={debitTotal}
        creditTotal={creditTotal}
        currency={selectedCurrency}
        onAdd={() => setShowAddDialog(true)}
      />
    </div>
  );
};

export default ClientsPage;
