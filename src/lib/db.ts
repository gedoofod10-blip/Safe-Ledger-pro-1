import { openDB, type IDBPDatabase } from 'idb';
import CryptoJS from 'crypto-js';

const ENC_KEY = 'L3dg3r-S3cur3-K3y-2026-AES256';
const DB_NAME = 'LedgerDB';
const DB_VERSION = 2;

export function encrypt(data: string): string {
  return CryptoJS.AES.encrypt(data, ENC_KEY).toString();
}

export function decrypt(cipher: string): string {
  const bytes = CryptoJS.AES.decrypt(cipher, ENC_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

export interface Client {
  id?: number;
  name: string;
  phone?: string;
  category: string;
  currency: string;
  budgetLimit?: number;
  createdAt: string;
  paymentReminderDate?: string;
  notes?: string[];
  rating?: 'excellent' | 'average' | 'poor';
}

export interface Transaction {
  id?: number;
  clientId: number;
  amount: number;
  type: 'credit' | 'debit';
  details: string;
  date: string;
  color?: string;
  notes?: string;
  attachments?: string[];
}

export interface AppSetting {
  key: string;
  value: string;
}

let dbPromise: Promise<IDBPDatabase>;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('clients')) {
          const clientStore = db.createObjectStore('clients', { keyPath: 'id', autoIncrement: true });
          clientStore.createIndex('category', 'category');
          clientStore.createIndex('currency', 'currency');
        }
        if (!db.objectStoreNames.contains('transactions')) {
          const txStore = db.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
          txStore.createIndex('clientId', 'clientId');
          txStore.createIndex('date', 'date');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

// Client operations
export async function addClient(client: Omit<Client, 'id'>): Promise<number> {
  const db = await getDB();
  return (await db.add('clients', client)) as number;
}

export async function getClient(id: number): Promise<Client | undefined> {
  const db = await getDB();
  return db.get('clients', id);
}

export async function getAllClients(): Promise<Client[]> {
  const db = await getDB();
  return db.getAll('clients');
}

export async function getClientsByFilter(category: string, currency: string): Promise<Client[]> {
  const all = await getAllClients();
  return all.filter(c => c.category === category && c.currency === currency);
}

export async function updateClient(id: number, data: Partial<Client>): Promise<void> {
  const db = await getDB();
  const existing = await db.get('clients', id);
  if (!existing) return;
  await db.put('clients', { ...existing, ...data, id });
}

export async function deleteClient(id: number): Promise<void> {
  const db = await getDB();
  await db.delete('clients', id);
  // Delete all transactions for this client
  const txns = await getTransactionsByClient(id);
  for (const tx of txns) {
    if (tx.id) await db.delete('transactions', tx.id);
  }
}

// Transaction operations
export async function addTransaction(tx: Omit<Transaction, 'id'>): Promise<number> {
  const db = await getDB();
  return (await db.add('transactions', tx)) as number;
}

export async function getTransactionsByClient(clientId: number): Promise<Transaction[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('transactions', 'clientId', clientId);
  return all.sort((a, b) => a.date.localeCompare(b.date) || (a.id! - b.id!));
}

export async function getAllTransactions(): Promise<Transaction[]> {
  const db = await getDB();
  return db.getAll('transactions');
}

export async function updateTransaction(id: number, data: Partial<Transaction>): Promise<void> {
  const db = await getDB();
  const existing = await db.get('transactions', id);
  if (!existing) return;
  await db.put('transactions', { ...existing, ...data, id });
}

export async function deleteTransaction(id: number): Promise<void> {
  const db = await getDB();
  await db.delete('transactions', id);
}

export async function deleteAllTransactions(clientId: number): Promise<void> {
  const db = await getDB();
  const txns = await getTransactionsByClient(clientId);
  const tx = db.transaction('transactions', 'readwrite');
  for (const t of txns) {
    if (t.id) await tx.store.delete(t.id);
  }
  await tx.done;
}

// Settings
export async function saveSetting(key: string, value: string) {
  const db = await getDB();
  await db.put('settings', { key, value: encrypt(value) });
}

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDB();
  const row = await db.get('settings', key);
  if (!row) return null;
  return decrypt(row.value);
}
