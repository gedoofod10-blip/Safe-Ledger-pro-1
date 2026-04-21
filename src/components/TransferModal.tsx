import { useState, useEffect } from 'react';
import { getAllClients, addTransaction as dbAddTransaction, type Client } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeftRight, Search, X } from 'lucide-react';
import { toast } from 'sonner';

interface TransferModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

const TransferModal = ({ open, onClose, onComplete }: TransferModalProps) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [fromId, setFromId] = useState<number | null>(null);
  const [toId, setToId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) getAllClients().then(setClients);
  }, [open]);

  if (!open) return null;

  const fromClient = clients.find(c => c.id === fromId);
  const toClient = clients.find(c => c.id === toId);

  const handleTransfer = async () => {
    if (!fromId || !toId) { toast.error('يرجى اختيار العميلين'); return; }
    if (fromId === toId) { toast.error('لا يمكن التحويل لنفس العميل'); return; }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error('يرجى إدخال مبلغ صحيح'); return; }

    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
    const transferNote = note.trim() ? `تحويل: ${note.trim()}` : 'تحويل مالي';

    // Deduct from source (credit = he paid/returned)
    await dbAddTransaction({
      clientId: fromId,
      amount: amt,
      type: 'credit',
      details: `${transferNote} → ${toClient?.name}`,
      date: today,
    });

    // Add to destination (debit = he owes)
    await dbAddTransaction({
      clientId: toId,
      amount: amt,
      type: 'debit',
      details: `${transferNote} ← ${fromClient?.name}`,
      date: today,
    });

    setLoading(false);
    toast.success(`تم تحويل ${amt.toLocaleString()} بنجاح ✓`);
    setFromId(null); setToId(null); setAmount(''); setNote('');
    onComplete();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in" onClick={onClose}>
      <Card className="shadow-xl w-[340px] border-0 animate-scale-in" onClick={e => e.stopPropagation()}>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <ArrowLeftRight className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">تحويل مالي</h2>
          </div>

          {/* From Client */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">من عميل</label>
            <select
              className="w-full border border-input rounded-lg px-3 py-2.5 text-right bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={fromId ?? ''}
              onChange={e => setFromId(Number(e.target.value) || null)}
            >
              <option value="">اختر العميل</option>
              {clients.map(c => (
                <option key={c.id} value={c.id} disabled={c.id === toId}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* To Client */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">إلى عميل</label>
            <select
              className="w-full border border-input rounded-lg px-3 py-2.5 text-right bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={toId ?? ''}
              onChange={e => setToId(Number(e.target.value) || null)}
            >
              <option value="">اختر العميل</option>
              {clients.map(c => (
                <option key={c.id} value={c.id} disabled={c.id === fromId}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Amount */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">المبلغ</label>
            <input
              className="w-full border border-input rounded-lg px-3 py-2.5 text-right bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              type="number"
              placeholder="0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
          </div>

          {/* Note */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">ملاحظة (اختياري)</label>
            <input
              className="w-full border border-input rounded-lg px-3 py-2.5 text-right bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="سبب التحويل"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleTransfer}
              disabled={loading}
              className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? 'جاري التحويل...' : 'تحويل'}
            </button>
            <button onClick={onClose} className="flex-1 bg-muted text-foreground py-2.5 rounded-lg font-semibold hover:opacity-90 transition-opacity">
              إلغاء
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TransferModal;
