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
  const [selectedClientId, setSelectedClientId] = useState<number | null>(preselectedClientId ? Number(preselectedClientId) : null);
  const [clientName, setClientName] = useState('');
  const [amount, setAmount] = useState('');
  const [details, setDetails] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [clientSearch, setClientSearch] = useState('');

  useEffect(() => {
    getAllClients().then(setClients);
    if (preselectedClientId) {
      getClient(Number(preselectedClientId)).then(c => { if (c) setClientName(c.name); });
    }
  }, [preselectedClientId]);

  const filteredPickerClients = clientSearch ? clients.filter(c => c.name.includes(clientSearch) || c.phone?.includes(clientSearch)) : clients;

  const handleSubmit = async (type: 'debit' | 'credit') => {
    if (!selectedClientId || !amount || parseFloat(amount) <= 0) return;
    await dbAddTransaction({
      clientId: selectedClientId,
      amount: parseFloat(amount),
      type,
      details: details.trim(),
      date,
    });
    navigate(-1);
  };

  const selectClient = (c: Client) => {
    setSelectedClientId(c.id!); setClientName(c.name); setShowClientPicker(false); setClientSearch('');
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="إضافة مبلغ" showBack />
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" capture="environment" onChange={(e) => { const file = e.target.files?.[0]; if (file) setDetails(prev => prev ? `${prev} | 📷 ${file.name}` : `📷 ${file.name}`); }} />

      <div className="p-4 animate-fade-in-up">
        <Card className="shadow-lg border-0">
          <CardContent className="p-5 space-y-4">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-sm font-semibold text-muted-foreground mb-1 block">الإسم</label>
                <input className="w-full border-b-2 border-[#5D4037] bg-transparent px-2 py-2 text-right font-bold outline-none" placeholder="اختر العميل" value={clientName} readOnly onClick={() => setShowClientPicker(true)} />
              </div>
              <div className="flex-1">
                <label className="text-sm font-semibold text-muted-foreground mb-1 block">المبلغ</label>
                <div className="flex items-center gap-2">
                  <input className="w-full border-b-2 border-border bg-transparent px-2 py-2 text-right font-bold outline-none" placeholder="0" type="number" value={amount} onChange={e => setAmount(e.target.value)} />
                  <Calculator className="w-6 h-6 text-muted-foreground" />
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-sm font-semibold text-muted-foreground mb-1 block">التفاصيل</label>
                <div className="flex items-center gap-2">
                  <input className="w-full border-b-2 border-border bg-transparent px-2 py-2 text-right font-bold outline-none" placeholder="التفاصيل" value={details} onChange={e => setDetails(e.target.value)} />
                  <button onClick={() => fileInputRef.current?.click()}><Camera className="w-6 h-6 text-muted-foreground" /></button>
                </div>
              </div>
              <div className="w-36">
                <label className="text-sm font-semibold text-muted-foreground mb-1 block">التاريخ</label>
                <input className="w-full border-b-2 border-border bg-transparent px-2 py-2 font-bold outline-none text-right" type="date" lang="en" dir="ltr" value={date} onChange={e => setDate(e.target.value)} />
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button onClick={() => handleSubmit('debit')} className="flex-1 py-4 rounded-xl bg-red-600 text-white font-bold text-lg flex justify-center gap-2 active:scale-95 transition-all">عليه <ArrowDown/></button>
              <button onClick={() => handleSubmit('credit')} className="flex-1 py-4 rounded-xl bg-green-600 text-white font-bold text-lg flex justify-center gap-2 active:scale-95 transition-all">له <ArrowUp/></button>
            </div>
          </CardContent>
        </Card>
      </div>

      {showClientPicker && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowClientPicker(false)}>
          <div className="bg-card w-full rounded-t-2xl max-h-[60vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-card p-4 border-b">
              <h3 className="text-lg font-bold text-center mb-3">اختر العميل</h3>
              <input autoFocus className="w-full bg-muted rounded-lg px-4 py-2 text-right font-bold outline-none" placeholder="ابحث..." value={clientSearch} onChange={e => setClientSearch(e.target.value)} />
            </div>
            {filteredPickerClients.map(c => (
              <button key={c.id} onClick={() => selectClient(c)} className="w-full px-5 py-4 text-right font-bold border-b hover:bg-muted">{c.name}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AddTransactionPage;
