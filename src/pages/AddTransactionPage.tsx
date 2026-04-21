import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getAllClients, addTransaction as dbAddTransaction, getClient, type Client } from '@/lib/db';
import AppHeader from '@/components/AppHeader';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowUp, ArrowDown, Calculator, Camera, Search, X } from 'lucide-react';

const AddTransactionPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedClientId = searchParams.get('clientId');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(
    preselectedClientId ? Number(preselectedClientId) : null
  );
  const [clientName, setClientName] = useState('');
  const [amount, setAmount] = useState('');
  const [details, setDetails] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [clientSearch, setClientSearch] = useState('');

  useEffect(() => {
    getAllClients().then(setClients);
    if (preselectedClientId) {
      getClient(Number(preselectedClientId)).then(c => {
        if (c) setClientName(c.name);
      });
    }
  }, [preselectedClientId]);

  const filteredPickerClients = clientSearch
    ? clients.filter(c => c.name.includes(clientSearch) || c.phone?.includes(clientSearch))
    : clients;

  const handleSubmit = async (type: 'debit' | 'credit') => {
    if (!selectedClientId) return;
    if (!amount || parseFloat(amount) <= 0) return;
    
    await dbAddTransaction({
      clientId: selectedClientId,
      amount: parseFloat(amount),
      type,
      details: details.trim(),
      notes: notes.trim(),
      date,
    });
    
    // تم كتم الرسالة المزعجة هنا
    navigate(-1);
  };

  const selectClient = (c: Client) => {
    setSelectedClientId(c.id!);
    setClientName(c.name);
    setShowClientPicker(false);
    setClientSearch('');
  };

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setDetails(prev => prev ? `${prev} | 📷 ${file.name}` : `📷 ${file.name}`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="إضافة مبلغ" showBack />
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        capture="environment"
        onChange={handleCameraCapture}
      />

      <div className="p-4 animate-fade-in-up">
        <Card className="shadow-lg border-0">
          <CardContent className="p-5 space-y-4">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-sm font-semibold text-muted-foreground mb-1 block">الإسم</label>
                <input
                  className="w-full border-b-2 border-destructive bg-transparent px-2 py-2 text-right text-foreground font-semibold placeholder:text-muted-foreground focus:outline-none focus:border-secondary transition-colors"
                  placeholder="اختر العميل"
                  value={clientName}
                  readOnly
                  onClick={() => setShowClientPicker(true)}
                />
              </div>
              <div className="flex-1">
                <label className="text-sm font-semibold text-muted-foreground mb-1 block">المبلغ</label>
                <div className="flex items-center gap-2">
                  <input
                    className="w-full border-b-2 border-border bg-transparent px-2 py-2 text-right text-foreground font-semibold placeholder:text-muted-foreground focus:outline-none focus:border-secondary transition-colors"
                    placeholder="0"
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                  />
                  <Calculator className="w-6 h-6 text-muted-foreground flex-shrink-0" />
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-sm font-semibold text-muted-foreground mb-1 block">التفاصيل</label>
                <div className="flex items-center gap-2">
                  <input
                    className="w-full border-b-2 border-border bg-transparent px-2 py-2 text-right text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-secondary transition-colors"
                    placeholder="التفاصيل"
                    value={details}
                    onChange={e => setDetails(e.target.value)}
                  />
                  <button onClick={() => fileInputRef.current?.click()} className="flex-shrink-0 hover:opacity-70 transition-opacity">
                    <Camera className="w-6 h-6 text-muted-foreground" />
                  </button>
                </div>
              </div>
              <div className="w-36">
                <label className="text-sm font-semibold text-muted-foreground mb-1 block">التاريخ</label>
                <input
                  className="w-full border-b-2 border-border bg-transparent px-2 py-2 text-foreground focus:outline-none focus:border-secondary transition-colors"
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-muted-foreground mb-1 block">ملاحظات إضافية</label>
              <textarea
                className="w-full border-2 border-border rounded-lg bg-transparent px-3 py-2 text-right text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-secondary transition-colors min-h-[80px]"
                placeholder="أضف ملاحظاتك هنا..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
           {/* تم توحيد الكلمات جوة الحساب لـ (له) و (عليه) */}
            <div className="flex gap-3 pt-4">
              <button
                onClick={() => handleSubmit('debit')}
                className="flex-1 py-4 rounded-xl bg-destructive/90 text-destructive-foreground font-bold text-lg flex items-center justify-center gap-2 shadow-md hover:opacity-90 active:scale-[0.97] transition-all"
              >
                عليه
                <ArrowDown className="w-5 h-5" />
              </button>
              <button
                onClick={() => handleSubmit('credit')}
                className="flex-1 py-4 rounded-xl bg-[hsl(var(--credit-color))] text-[hsl(var(--success-foreground))] font-bold text-lg flex items-center justify-center gap-2 shadow-md hover:opacity-90 active:scale-[0.97] transition-all"
              >
                له
                <ArrowUp className="w-5 h-5" />
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      {showClientPicker && (
        <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-end animate-fade-in" onClick={() => setShowClientPicker(false)}>
          <div className="bg-card w-full rounded-t-2xl max-h-[60vh] overflow-y-auto shadow-xl animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-card p-4 border-b border-border space-y-3">
              <h3 className="text-lg font-bold text-foreground text-center">اختر العميل</h3>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  autoFocus
                  className="w-full bg-muted rounded-lg pr-10 pl-10 py-2 text-right text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="ابحث عن عميل..."
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                />
                {clientSearch && (
                  <button onClick={() => setClientSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>
            {filteredPickerClients.length === 0 ? (
              <p className="text-center text-muted-foreground py-10 text-sm">
                {clientSearch ? 'لا توجد نتائج' : 'لا يوجد عملاء. أضف عميل أولاً.'}
              </p>
            ) : (
              filteredPickerClients.map(c => (
                <button
                  key={c.id}
                  onClick={() => selectClient(c)}
                  className="w-full px-5 py-4 text-right font-semibold text-foreground border-b border-border hover:bg-muted transition-colors"
                >
                  {c.name}
                  {c.phone && <span className="text-xs text-muted-foreground mr-2">{c.phone}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AddTransactionPage;
