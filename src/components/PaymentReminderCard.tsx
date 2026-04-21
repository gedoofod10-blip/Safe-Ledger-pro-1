import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, Check, Share2, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format, differenceInDays } from 'date-fns';
import { ar } from 'date-fns/locale';

interface PaymentReminderCardProps {
  date?: string;
  onDateChange: (date: string) => void;
  onClearDate: () => void;
  onMarkPaid: () => void;
  onMarkUnpaid: () => void;
  clientName?: string;
}

const PaymentReminderCard = ({ date, onDateChange, onClearDate, onMarkPaid, onMarkUnpaid, clientName }: PaymentReminderCardProps) => {
  const [open, setOpen] = useState(false);
  const selectedDate = date ? new Date(date) : undefined;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysRemaining = selectedDate ? differenceInDays(selectedDate, today) : null;
  const isOverdue = daysRemaining !== null && daysRemaining < 0;

  const getCountdownText = () => {
    if (daysRemaining === null) return null;
    if (daysRemaining === 0) return 'اليوم هو موعد السداد';
    if (daysRemaining > 0) return `باقي ${daysRemaining} يوم`;
    return `متأخر ${Math.abs(daysRemaining)} يوم`;
  };

  const handleShare = () => {
    const message = clientName
      ? `تذكير ودي: اقترب موعد سداد الدفعة الخاصة بك يا ${clientName}. نرجو التكرم بالسداد في أقرب وقت. شكراً لتعاملكم معنا.`
      : `تذكير: اقترب موعد سداد الدفعة الخاصة بك.`;
    if (navigator.share) {
      navigator.share({ title: 'تذكير بموعد السداد', text: message });
    }
  };

  return (
    <Card className="border-0 shadow-lg overflow-hidden animate-fade-in-up">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <button className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 active:scale-95 transition-all">
                  {date ? 'تعديل' : 'تحديد موعد'}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarPicker
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => {
                    if (d) {
                      onDateChange(format(d, 'yyyy-MM-dd'));
                      setOpen(false);
                    }
                  }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            {date && (
              <>
                <button
                  onClick={handleShare}
                  className="p-2 rounded-lg hover:bg-muted transition-colors"
                  title="مشاركة تذكير"
                >
                  <Share2 className="w-4 h-4 text-primary" />
                </button>
                <button
                  onClick={onClearDate}
                  className="p-2 rounded-lg hover:bg-destructive/10 transition-colors"
                  title="حذف الموعد"
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 text-right">
            <div>
              <h3 className="text-sm font-bold text-foreground">موعد السداد القادم</h3>
              {date ? (
                <>
                  <p className={cn("text-lg font-extrabold mt-0.5", isOverdue ? 'text-destructive' : 'text-primary')}>
                    {format(new Date(date), 'dd MMM yyyy', { locale: ar })}
                  </p>
                  <p className={cn("text-xs font-semibold mt-0.5", isOverdue ? 'text-destructive' : 'text-muted-foreground')}>
                    {getCountdownText()}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground mt-0.5">لم يتم التحديد بعد</p>
              )}
            </div>
            <div className={cn(
              "w-11 h-11 rounded-full flex items-center justify-center",
              isOverdue ? 'bg-destructive/10' : 'bg-primary/10'
            )}>
              {date && !isOverdue ? (
                <Check className="w-5 h-5 text-primary" />
              ) : (
                <Calendar className={cn("w-5 h-5", isOverdue ? 'text-destructive' : 'text-primary')} />
              )}
            </div>
          </div>
        </div>

        {/* Action buttons for active timer */}
        {date && (
          <div className="flex gap-2 mt-3 pt-3 border-t border-border">
            <button
              onClick={onMarkPaid}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[hsl(var(--credit-color))]/10 text-[hsl(var(--credit-color))] font-semibold text-sm hover:bg-[hsl(var(--credit-color))]/20 active:scale-95 transition-all"
            >
              <CheckCircle className="w-4 h-4" />
              ✅ سداد
            </button>
            <button
              onClick={onMarkUnpaid}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-destructive/10 text-destructive font-semibold text-sm hover:bg-destructive/20 active:scale-95 transition-all"
            >
              <XCircle className="w-4 h-4" />
              ❌ لم يسدد
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PaymentReminderCard;
