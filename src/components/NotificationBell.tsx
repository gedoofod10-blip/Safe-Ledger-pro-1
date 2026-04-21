import { useState, useEffect, useCallback } from 'react';
import { Bell, AlertTriangle, Clock, CalendarCheck } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { checkPaymentReminders, triggerWebNotifications, requestNotificationPermission, type AppNotification } from '@/lib/notifications';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

const NotificationBell = () => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  const loadNotifications = useCallback(async () => {
    const items = await checkPaymentReminders();
    setNotifications(items);
    // Send web notifications
    triggerWebNotifications(items);
  }, []);

  useEffect(() => {
    requestNotificationPermission();
    loadNotifications();
    const interval = setInterval(loadNotifications, 60000); // check every minute
    return () => clearInterval(interval);
  }, [loadNotifications]);

  const unreadCount = notifications.filter(n => !readIds.has(n.id)).length;

  const markAllRead = () => {
    setReadIds(new Set(notifications.map(n => n.id)));
  };

  const getIcon = (type: AppNotification['type']) => {
    switch (type) {
      case 'overdue': return <AlertTriangle className="w-4 h-4 text-destructive" />;
      case 'today': return <CalendarCheck className="w-4 h-4 text-primary" />;
      case 'warning': return <Clock className="w-4 h-4 text-[hsl(var(--secondary))]" />;
    }
  };

  const getBg = (type: AppNotification['type']) => {
    switch (type) {
      case 'overdue': return 'bg-destructive/5 border-destructive/20';
      case 'today': return 'bg-primary/5 border-primary/20';
      case 'warning': return 'bg-secondary/5 border-secondary/20';
    }
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) markAllRead(); }}>
      <PopoverTrigger asChild>
        <button className="relative p-1.5 hover:opacity-70 transition-opacity">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center animate-pulse">
              {unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 max-h-80 overflow-y-auto" align="end">
        <div className="p-3 border-b border-border bg-muted/30">
          <h3 className="text-sm font-bold text-foreground text-right">الإشعارات</h3>
        </div>
        {notifications.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            لا توجد إشعارات حالياً
          </div>
        ) : (
          <div className="divide-y divide-border">
            {notifications.map(n => (
              <button
                key={n.id}
                onClick={() => { navigate(`/ledger/${n.clientId}`); setOpen(false); }}
                className={cn("w-full p-3 text-right hover:bg-muted/50 transition-colors flex items-start gap-2.5 border-r-2", getBg(n.type))}
              >
                <div className="mt-0.5">{getIcon(n.type)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{n.clientName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">{n.date}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default NotificationBell;
