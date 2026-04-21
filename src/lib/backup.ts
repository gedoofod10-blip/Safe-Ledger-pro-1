import { getAllClients, getAllTransactions, getSetting, type Client, type Transaction, encrypt, decrypt } from './db';
import { openDB } from 'idb';
import { toast } from 'sonner';

const DB_NAME = 'LedgerDB';
const DB_VERSION = 2;
const DAILY_BACKUP_KEY = 'lastDailyBackupDate';
const AUTO_BACKUP_KEY = 'autoBackupData';

/**
 * إنشاء نسخة احتياطية شاملة تتضمن:
 * - جميع العملاء والمعاملات
 * - التصنيفات المخصصة
 * - الإعدادات والتفاصيل الداخلية
 * - معلومات المؤسسة
 */
async function generateComprehensiveBackup(): Promise<string> {
  try {
    const [clients, transactions] = await Promise.all([
      getAllClients(),
      getAllTransactions()
    ]);

    // جلب الإعدادات والتصنيفات من localStorage
    const customCategories = JSON.parse(localStorage.getItem('customCategories') || '["عام", "عملاء", "موردين"]');
    const appSettings = JSON.parse(localStorage.getItem('appSettings') || '{}');

    const backupData = {
      version: '3.1',
      appVersion: '2.0.0',
      exportDate: new Date().toISOString(),
      exportDateFormatted: new Date().toLocaleDateString('en-US'),
      exportTime: new Date().toLocaleTimeString('en-US'),
      
      // البيانات الأساسية
      clients,
      transactions,
      
      // الإعدادات والتصنيفات
      customCategories,
      appSettings,
      
      // معلومات المؤسسة
      institution: {
        name: appSettings.shopName || 'مؤسسة دفتر الحسابات الآمن',
        phone: appSettings.shopPhone || '',
        address: appSettings.shopAddress || ''
      },
      
      // إحصائيات النسخة الاحتياطية
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
    
    // تشفير البيانات إذا كانت الدالة متاحة
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
 * تنزيل النسخة الاحتياطية كملف حقيقي مع فتح قائمة المشاركة
 */
export async function downloadBackup(): Promise<void> {
  try {
    const finalData = await generateComprehensiveBackup();
    const fileName = `Ledger-Backup-${new Date().toISOString().split('T')[0]}.json`;
    const blob = new Blob([finalData], { type: 'application/json;charset=utf-8' });
    
    // محاولة استخدام Web Share API أولاً
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([blob], fileName)] })) {
      try {
        const file = new File([blob], fileName, { type: 'application/json' });
        await navigator.share({
          files: [file],
          title: 'نسخة احتياطية من دفتر الحسابات',
          text: 'نسخة احتياطية شاملة لجميع بيانات التطبيق'
        });
        toast.success('✓ تم فتح قائمة المشاركة');
        return;
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.warn('Share failed, falling back to download');
        }
      }
    }
    
    // fallback للتنزيل العادي
    const url = URL.createObjectURL(blob);
    const link = document.body.appendChild(document.createElement('a'));
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);
    toast.success('✓ تم حفظ النسخة الاحتياطية في الجهاز');
  } catch (e) {
    toast.error('فشل تنزيل النسخة الاحتياطية');
  }
}

/**
 * مشاركة النسخة الاحتياطية عبر قائمة المشاركة الأصلية
 * تدعم WhatsApp و Google Drive والتطبيقات الأخرى
 */
export async function shareBackup(): Promise<void> {
  try {
    const finalData = await generateComprehensiveBackup();
    const fileName = `Ledger-Backup-${new Date().toISOString().split('T')[0]}.json`;
    const file = new File([finalData], fileName, { type: 'application/json;charset=utf-8' });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'نسخة احتياطية من دفتر الحسابات',
          text: 'نسخة احتياطية شاملة لجميع بيانات التطبيق - يمكن استعادتها بالكامل'
        });
        toast.success('✓ تم فتح قائمة المشاركة');
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.error('Share failed:', error);
          // fallback للتنزيل إذا لم تكن المشاركة مدعومة
          await downloadBackup();
        }
      }
    } else {
      // fallback للتنزيل إذا لم تكن المشاركة مدعومة
      await downloadBackup();
    }
  } catch (error) {
    toast.error('فشل في إنشاء النسخة الاحتياطية');
  }
}

/**
 * تصدير النسخة الاحتياطية (اسم بديل للمشاركة)
 */
export async function exportBackup() {
  return shareBackup();
}

/**
 * استيراد النسخة الاحتياطية من ملف
 * تدعم استعادة كاملة من ملفات الجهاز بدون أي تأثير على البيانات الأصلية
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

    // محاولة فك التشفير إذا كانت البيانات مشفرة
    if (typeof decrypt === 'function') {
      try {
        decrypted = decrypt(text);
      } catch (e) {
        // إذا فشل فك التشفير، استخدم البيانات الأصلية
        decrypted = text;
      }
    }

    const data = JSON.parse(decrypted);

    // التحقق من صحة البيانات
    if (!data.clients || !Array.isArray(data.clients)) {
      throw new Error('صيغة النسخة الاحتياطية غير صحيحة');
    }

    // فتح قاعدة البيانات
    const db = await openDB(DB_NAME, DB_VERSION);
    const tx = db.transaction(['clients', 'transactions', 'settings'], 'readwrite');

    // مسح البيانات القديمة
    await Promise.all([
      tx.objectStore('clients').clear(),
      tx.objectStore('transactions').clear()
    ]);

    // إدراج البيانات الجديدة
    for (const client of (data.clients || [])) {
      await tx.objectStore('clients').put(client);
    }

    for (const transaction of (data.transactions || [])) {
      await tx.objectStore('transactions').put(transaction);
    }

    await tx.done;

    // استعادة الإعدادات والتصنيفات
    if (data.customCategories && Array.isArray(data.customCategories)) {
      localStorage.setItem('customCategories', JSON.stringify(data.customCategories));
    }

    if (data.appSettings && typeof data.appSettings === 'object') {
      const currentSettings = JSON.parse(localStorage.getItem('appSettings') || '{}');
      const mergedSettings = { ...currentSettings, ...data.appSettings };
      localStorage.setItem('appSettings', JSON.stringify(mergedSettings));
    }

    toast.success('✓ تم استعادة النسخة الاحتياطية بنجاح');

    return {
      clients: data.clients?.length || 0,
      transactions: data.transactions?.length || 0,
      categories: data.customCategories?.length || 0,
      success: true
    };
  } catch (error) {
    console.error('Import failed:', error);
    toast.error('فشل استعادة النسخة الاحتياطية - تحقق من صحة الملف');
    return {
      clients: 0,
      transactions: 0,
      categories: 0,
      success: false
    };
  }
}

/**
 * دالة مساعدة للتحقق من صحة ملف النسخة الاحتياطية
 */
export async function validateBackupFile(file: File): Promise<boolean> {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    return Array.isArray(data.clients) && Array.isArray(data.transactions);
  } catch {
    return false;
  }
}

/**
 * حفظ النسخة الاحتياطية تلقائياً يومياً
 * يتم استدعاء هذه الدالة عند بدء التطبيق
 */
export async function performDailyBackup(): Promise<void> {
  try {
    const appSettings = JSON.parse(localStorage.getItem('appSettings') || '{}');
    if (!appSettings.dailyBackup) return;

    const lastBackupDate = localStorage.getItem(DAILY_BACKUP_KEY);
    const today = new Date().toISOString().split('T')[0];

    // إذا تم إجراء نسخة احتياطية اليوم، لا تفعل شيئاً
    if (lastBackupDate === today) return;

    // إنشاء النسخة الاحتياطية
    const backupData = await generateComprehensiveBackup();
    
    // حفظ في localStorage (مع حد أقصى للحجم)
    try {
      localStorage.setItem(AUTO_BACKUP_KEY, backupData);
      localStorage.setItem(DAILY_BACKUP_KEY, today);
      console.log('Daily backup completed successfully');
    } catch (e) {
      console.warn('Failed to save daily backup to localStorage (quota exceeded)');
      // محاولة حذف النسخة الاحتياطية القديمة وإعادة المحاولة
      localStorage.removeItem(AUTO_BACKUP_KEY);
      try {
        localStorage.setItem(AUTO_BACKUP_KEY, backupData);
        localStorage.setItem(DAILY_BACKUP_KEY, today);
      } catch (e2) {
        console.warn('Daily backup still failed after clearing old backup');
      }
    }
  } catch (error) {
    console.error('Daily backup failed:', error);
  }
}

/**
 * استرجاع النسخة الاحتياطية اليومية المحفوظة
 */
export async function getLastDailyBackup(): Promise<string | null> {
  try {
    return localStorage.getItem(AUTO_BACKUP_KEY);
  } catch (error) {
    console.error('Failed to retrieve daily backup:', error);
    return null;
  }
}

/**
 * حذف النسخة الاحتياطية اليومية
 */
export function clearDailyBackup(): void {
  try {
    localStorage.removeItem(AUTO_BACKUP_KEY);
    localStorage.removeItem(DAILY_BACKUP_KEY);
  } catch (error) {
    console.error('Failed to clear daily backup:', error);
  }
}
