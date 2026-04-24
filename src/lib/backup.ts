import { getAllClients, getAllTransactions, getSetting, type Client, type Transaction, encrypt, decrypt } from './db';
import { openDB } from 'idb';
import { toast } from 'sonner';

const DB_NAME = 'LedgerDB';
const DB_VERSION = 2;
const DAILY_BACKUP_KEY = 'lastDailyBackupDate';
const AUTO_BACKUP_KEY = 'autoBackupData';

/**
 * إنشاء نسخة احتياطية شاملة
 */
async function generateComprehensiveBackup(): Promise<string> {
  try {
    const [clients, transactions] = await Promise.all([
      getAllClients(),
      getAllTransactions()
    ]);

    const customCategories = JSON.parse(localStorage.getItem('customCategories') || '["عام", "عملاء", "موردين"]');
    const appSettings = JSON.parse(localStorage.getItem('appSettings') || '{}');

    const backupData = {
      version: '3.1',
      appVersion: '2.0.0',
      exportDate: new Date().toISOString(),
      exportDateFormatted: new Date().toLocaleDateString('en-US'),
      exportTime: new Date().toLocaleTimeString('en-US'),
      
      clients,
      transactions,
      customCategories,
      appSettings,
      
      institution: {
        name: appSettings.shopName || 'مؤسسة دفتر الحسابات الآمن',
        phone: appSettings.shopPhone || '',
        address: appSettings.shopAddress || ''
      },
      
      statistics: {
        totalClients: clients.length,
        totalTransactions: transactions.length,
        totalBalance: transactions.reduce((sum, tx) => {
          return tx.type === 'debit' ? sum + tx.amount : sum - tx.amount;
        }, 0),
        backupSize: 'generated',
        backupType: 'comprehensive'
      }
    };

    let finalData = JSON.stringify(backupData, null, 2);
    
    if (typeof encrypt === 'function') {
      try {
        finalData = encrypt(finalData);
      } catch (e) {
        console.warn('Encryption failed, using unencrypted backup');
      }
    }

    return finalData;
  } catch (error) {
    console.error('Backup generation failed:', error);
    throw error;
  }
}

/**
 * مشاركة النسخة الاحتياطية كملف "حقيقي" يقبله جوجل درايف وواتساب
 */
export async function shareBackup(): Promise<void> {
  try {
    const finalData = await generateComprehensiveBackup();
    const fileName = `Ledger-Backup-${new Date().toISOString().split('T')[0]}.json`;
    
    // السر هنا: استخدام text/plain يجعل الواتساب ودرايف يعاملونه كملف مرفق (Document) حقيقي
    const file = new File([finalData], fileName, { type: 'text/plain' });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'نسخة احتياطية - دفتر الحسابات',
          text: 'ملف النسخة الاحتياطية لتطبيق دفتر الحسابات الآمن'
        });
        toast.success('✓ تم فتح قائمة المشاركة');
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.error('Share failed:', error);
          await downloadBackup(); // Fallback
        }
      }
    } else {
      await downloadBackup(); // Fallback
    }
  } catch (error) {
    toast.error('فشل في إنشاء أو مشاركة النسخة الاحتياطية');
  }
}

/**
 * تنزيل النسخة الاحتياطية مباشرة للجهاز
 */
export async function downloadBackup(): Promise<void> {
  try {
    const finalData = await generateComprehensiveBackup();
    const fileName = `Ledger-Backup-${new Date().toISOString().split('T')[0]}.json`;
    
    const blob = new Blob([finalData], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);
    
    toast.success('✓ تم حفظ النسخة في ملفات الجهاز');
  } catch (e) {
    toast.error('فشل تنزيل النسخة الاحتياطية');
  }
}

export async function exportBackup() {
  return shareBackup();
}

/**
 * استيراد النسخة الاحتياطية بسلاسة
 */
export async function importBackup(file: File): Promise<{ 
  clients: number; 
  transactions: number;
  categories: number;
  success: boolean;
}> {
  try {
    const text = await file.text();
    let decrypted = text;

    if (typeof decrypt === 'function') {
      try {
        decrypted = decrypt(text);
      } catch (e) {
        decrypted = text;
      }
    }

    const data = JSON.parse(decrypted);

    if (!data.clients || !Array.isArray(data.clients)) {
      throw new Error('صيغة النسخة الاحتياطية غير صحيحة');
    }

    const db = await openDB(DB_NAME, DB_VERSION);
    const tx = db.transaction(['clients', 'transactions', 'settings'], 'readwrite');

    await Promise.all([
      tx.objectStore('clients').clear(),
      tx.objectStore('transactions').clear()
    ]);

    for (const client of (data.clients || [])) {
      await tx.objectStore('clients').put(client);
    }

    for (const transaction of (data.transactions || [])) {
      await tx.objectStore('transactions').put(transaction);
    }

    await tx.done;

    if (data.customCategories && Array.isArray(data.customCategories)) {
      localStorage.setItem('customCategories', JSON.stringify(data.customCategories));
    }

    if (data.appSettings && typeof data.appSettings === 'object') {
      const currentSettings = JSON.parse(localStorage.getItem('appSettings') || '{}');
      const mergedSettings = { ...currentSettings, ...data.appSettings };
      localStorage.setItem('appSettings', JSON.stringify(mergedSettings));
    }

    return {
      clients: data.clients?.length || 0,
      transactions: data.transactions?.length || 0,
      categories: data.customCategories?.length || 0,
      success: true
    };
  } catch (error) {
    console.error('Import failed:', error);
    throw new Error('فشل استعادة النسخة');
  }
}

export async function validateBackupFile(file: File): Promise<boolean> {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    return Array.isArray(data.clients) && Array.isArray(data.transactions);
  } catch {
    return false;
  }
}

export async function performDailyBackup(): Promise<void> {
  try {
    const appSettings = JSON.parse(localStorage.getItem('appSettings') || '{}');
    if (!appSettings.dailyBackup) return;

    const lastBackupDate = localStorage.getItem(DAILY_BACKUP_KEY);
    const today = new Date().toISOString().split('T')[0];

    if (lastBackupDate === today) return;

    const backupData = await generateComprehensiveBackup();
    
    try {
      localStorage.setItem(AUTO_BACKUP_KEY, backupData);
      localStorage.setItem(DAILY_BACKUP_KEY, today);
    } catch (e) {
      localStorage.removeItem(AUTO_BACKUP_KEY);
      try {
        localStorage.setItem(AUTO_BACKUP_KEY, backupData);
        localStorage.setItem(DAILY_BACKUP_KEY, today);
      } catch (e2) {
        console.warn('Daily backup failed to save due to size limits');
      }
    }
  } catch (error) {
    console.error('Daily backup failed:', error);
  }
}

export async function getLastDailyBackup(): Promise<string | null> {
  try {
    return localStorage.getItem(AUTO_BACKUP_KEY);
  } catch (error) {
    return null;
  }
}

export function clearDailyBackup(): void {
  try {
    localStorage.removeItem(AUTO_BACKUP_KEY);
    localStorage.removeItem(DAILY_BACKUP_KEY);
  } catch (error) {
    console.error('Failed to clear daily backup');
  }
}
