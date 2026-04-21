import { getAllClients, type Client } from './db';
import { differenceInDays } from 'date-fns';

export interface AppNotification {
  id: string;
  clientId: number;
  clientName: string;
  message: string;
  type: 'warning' | 'overdue' | 'today';
  date: string;
  read: boolean;
  createdAt: string;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function sendWebNotification(title: string, body: string, icon?: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  new Notification(title, { body, icon: icon || '/favicon.ico', dir: 'rtl', lang: 'ar' });
}

export async function checkPaymentReminders(): Promise<AppNotification[]> {
  const clients = await getAllClients();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const notifications: AppNotification[] = [];

  for (const client of clients) {
    if (!client.paymentReminderDate) continue;
    const dueDate = new Date(client.paymentReminderDate);
    const days = differenceInDays(dueDate, today);

    if (days <= 3 && days > 0) {
      notifications.push({
        id: `${client.id}-warning-${client.paymentReminderDate}`,
        clientId: client.id!,
        clientName: client.name,
        message: `باقي ${days} يوم على موعد سداد ${client.name}`,
        type: 'warning',
        date: client.paymentReminderDate,
        read: false,
        createdAt: new Date().toISOString(),
      });
    } else if (days === 0) {
      notifications.push({
        id: `${client.id}-today-${client.paymentReminderDate}`,
        clientId: client.id!,
        clientName: client.name,
        message: `اليوم هو موعد سداد ${client.name}`,
        type: 'today',
        date: client.paymentReminderDate,
        read: false,
        createdAt: new Date().toISOString(),
      });
    } else if (days < 0) {
      notifications.push({
        id: `${client.id}-overdue-${client.paymentReminderDate}`,
        clientId: client.id!,
        clientName: client.name,
        message: `متأخر ${Math.abs(days)} يوم عن موعد سداد ${client.name}`,
        type: 'overdue',
        date: client.paymentReminderDate,
        read: false,
        createdAt: new Date().toISOString(),
      });
    }
  }

  return notifications;
}

export function triggerWebNotifications(notifications: AppNotification[]) {
  const unnotified = getUnnotifiedIds();
  for (const n of notifications) {
    if (unnotified.has(n.id)) continue;
    sendWebNotification('تذكير بموعد السداد', n.message);
    markAsNotified(n.id);
  }
}

function getUnnotifiedIds(): Set<string> {
  try {
    const raw = localStorage.getItem('notified_reminders');
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

function markAsNotified(id: string) {
  const ids = getUnnotifiedIds();
  ids.add(id);
  // Keep only last 200 entries
  const arr = [...ids].slice(-200);
  localStorage.setItem('notified_reminders', JSON.stringify(arr));
}
