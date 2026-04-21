import { useState, useEffect } from 'react';
import { getAllClients, getTransactionsByClient, type Client } from '@/lib/db';
import AppHeader from '@/components/AppHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { formatNumber } from '@/lib/utils';

interface ClientLimit {
  client: Client;
  debit: number;
  credit: number;
  remaining: number;
  consumed: number;
}

const RemainingLimitPage = () => {
  const [clientLimits, setClientLimits] = useState<ClientLimit[]>([]);

  useEffect(() => {
    (async () => {
      const clients = await getAllClients();
      const limits: ClientLimit[] = [];
      for (const c of clients) {
        if (!c.budgetLimit || c.budgetLimit <= 0) continue;
        const txns = await getTransactionsByClient(c.id!);
        let d = 0, cr = 0;
        txns.forEach(t => { if (t.type === 'debit') d += t.amount; else cr += t.amount; });
        const remaining = c.budgetLimit - d + cr;
        const consumed = Math.min(((d - cr) / c.budgetLimit) * 100, 100);
        limits.push({ client: c, debit: d, credit: cr, remaining, consumed });
      }
      setClientLimits(limits);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-background pb-4">
      <AppHeader title="السقف المتبقي" showBack />
      <div className="p-4 space-y-4">
        {clientLimits.length === 0 && (
          <Card className="shadow-lg border-0">
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">لا يوجد عملاء بسقف مالي محدد.<br />حدد السقف المالي عند إضافة عميل جديد.</p>
            </CardContent>
          </Card>
        )}
        {clientLimits.map(cl => {
          const isOver = cl.remaining < 0;
          return (
            <Card key={cl.client.id} className="shadow-lg border-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{cl.client.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative w-36 h-36 mx-auto">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
                    <circle
                      cx="60" cy="60" r="52" fill="none"
                      stroke={isOver ? 'hsl(var(--destructive))' : 'hsl(var(--success))'}
                      strokeWidth="10" strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 52}`}
                      strokeDashoffset={`${2 * Math.PI * 52 * (1 - Math.max(0, cl.consumed) / 100)}`}
                      className="transition-all duration-700"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-xl font-bold ${isOver ? 'text-debit' : 'text-credit'}`}>{formatNumber(Math.abs(cl.remaining))}</span>
                    <span className="text-xs text-muted-foreground">متبقي</span>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between p-2 bg-muted rounded-lg">
                    <span>السقف</span><span className="font-bold">{formatNumber(cl.client.budgetLimit)}</span>
                  </div>
                  <div className="flex justify-between p-2 bg-muted rounded-lg">
                    <span className="flex items-center gap-1">عليه <ArrowDown className="w-3 h-3 text-debit" /></span>
                    <span className="font-bold text-debit">{formatNumber(cl.debit)}</span>
                  </div>
                  <div className="flex justify-between p-2 bg-muted rounded-lg">
                    <span className="flex items-center gap-1">له <ArrowUp className="w-3 h-3 text-credit" /></span>
                    <span className="font-bold text-credit">{formatNumber(cl.credit)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default RemainingLimitPage;
