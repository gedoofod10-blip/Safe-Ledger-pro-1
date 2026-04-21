import { toast } from 'sonner';
import type { Client, Transaction } from './db';

/**
 * معرّف تطبيق Google (يجب تحديثه بمعرّف التطبيق الفعلي)
 * في بيئة الإنتاج، استخدم متغيرات البيئة
 */
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || '';
const GOOGLE_API_KEY = process.env.REACT_APP_GOOGLE_API_KEY || '';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

/**
 * واجهة لتخزين معلومات الملف على Google Drive
 */
export interface DriveFileInfo {
  fileId: string;
  fileName: string;
  uploadDate: string;
  size: number;
  webViewLink: string;
}

/**
 * دالة لتحميل مكتبة Google API
 */
async function loadGoogleAPI(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).gapi) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      (window as any).gapi.load('client:auth2', () => {
        resolve();
      });
    };
    script.onerror = () => reject(new Error('Failed to load Google API'));
    document.head.appendChild(script);
  });
}

/**
 * دالة لتهيئة Google Drive API
 */
export async function initializeGoogleDrive(): Promise<void> {
  try {
    if (!GOOGLE_CLIENT_ID) {
      console.warn('Google Client ID not configured');
      return;
    }

    await loadGoogleAPI();

    const gapi = (window as any).gapi;
    await gapi.client.init({
      apiKey: GOOGLE_API_KEY,
      clientId: GOOGLE_CLIENT_ID,
      scope: SCOPES,
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
    });

    console.log('✓ Google Drive API initialized');
  } catch (error) {
    console.error('Failed to initialize Google Drive:', error);
    toast.error('فشل تحميل Google Drive');
  }
}

/**
 * دالة للتحقق من حالة المصادقة
 */
export async function isGoogleDriveAuthenticated(): Promise<boolean> {
  try {
    const gapi = (window as any).gapi;
    if (!gapi || !gapi.auth2) return false;

    const auth2 = gapi.auth2.getAuthInstance();
    return auth2 ? auth2.isSignedIn.get() : false;
  } catch (error) {
    console.error('Authentication check failed:', error);
    return false;
  }
}

/**
 * دالة لتسجيل الدخول إلى Google
 */
export async function signInToGoogle(): Promise<void> {
  try {
    const gapi = (window as any).gapi;
    if (!gapi || !gapi.auth2) {
      throw new Error('Google API not initialized');
    }

    const auth2 = gapi.auth2.getAuthInstance();
    await auth2.signIn();
    toast.success('✓ تم تسجيل الدخول إلى Google بنجاح');
  } catch (error) {
    console.error('Sign in failed:', error);
    toast.error('فشل تسجيل الدخول إلى Google');
    throw error;
  }
}

/**
 * دالة لتسجيل الخروج من Google
 */
export async function signOutFromGoogle(): Promise<void> {
  try {
    const gapi = (window as any).gapi;
    if (!gapi || !gapi.auth2) return;

    const auth2 = gapi.auth2.getAuthInstance();
    await auth2.signOut();
    toast.success('✓ تم تسجيل الخروج من Google');
  } catch (error) {
    console.error('Sign out failed:', error);
  }
}

/**
 * دالة لتصدير البيانات إلى Google Drive كملف JSON
 */
export async function exportToGoogleDrive(
  client: Client,
  transactions: (Transaction & { balance: number })[],
  totalDebit: number,
  totalCredit: number,
  netBalance: number,
  fileName?: string
): Promise<DriveFileInfo | null> {
  try {
    // التحقق من المصادقة
    const isAuthenticated = await isGoogleDriveAuthenticated();
    if (!isAuthenticated) {
      await signInToGoogle();
    }

    const gapi = (window as any).gapi;
    const data = {
      client,
      transactions,
      totalDebit,
      totalCredit,
      netBalance,
      exportDate: new Date().toISOString(),
      version: '2.0'
    };

    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const file = new File([blob], fileName || `كشف_حساب_${client.name}_${new Date().toISOString().split('T')[0]}.json`, {
      type: 'application/json'
    });

    // إنشاء الملف على Google Drive
    const fileMetadata = {
      name: file.name,
      mimeType: 'application/json',
      description: `كشف حساب - ${client.name} - تم التصدير من تطبيق دفتر الحسابات`,
      parents: ['root'] // يمكن تغييره لمجلد محدد
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' }));
    form.append('file', file);

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,size,createdTime', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().id_token}`
      },
      body: form
    });

    if (!response.ok) {
      throw new Error('Failed to upload file to Google Drive');
    }

    const uploadedFile = await response.json();
    toast.success('✓ تم تصدير البيانات إلى Google Drive بنجاح');

    return {
      fileId: uploadedFile.id,
      fileName: uploadedFile.name,
      uploadDate: uploadedFile.createdTime,
      size: uploadedFile.size,
      webViewLink: uploadedFile.webViewLink
    };
  } catch (error) {
    console.error('Export to Google Drive failed:', error);
    toast.error('فشل تصدير البيانات إلى Google Drive');
    return null;
  }
}

/**
 * دالة لتصدير النسخة الاحتياطية إلى Google Drive
 */
export async function exportBackupToGoogleDrive(
  backupData: any,
  fileName?: string
): Promise<DriveFileInfo | null> {
  try {
    const isAuthenticated = await isGoogleDriveAuthenticated();
    if (!isAuthenticated) {
      await signInToGoogle();
    }

    const gapi = (window as any).gapi;
    const jsonString = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const file = new File([blob], fileName || `Ledger-Backup-${new Date().toISOString().split('T')[0]}.json`, {
      type: 'application/json'
    });

    const fileMetadata = {
      name: file.name,
      mimeType: 'application/json',
      description: 'نسخة احتياطية من تطبيق دفتر الحسابات',
      parents: ['root']
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' }));
    form.append('file', file);

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,size,createdTime', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().id_token}`
      },
      body: form
    });

    if (!response.ok) {
      throw new Error('Failed to upload backup to Google Drive');
    }

    const uploadedFile = await response.json();
    toast.success('✓ تم حفظ النسخة الاحتياطية على Google Drive');

    return {
      fileId: uploadedFile.id,
      fileName: uploadedFile.name,
      uploadDate: uploadedFile.createdTime,
      size: uploadedFile.size,
      webViewLink: uploadedFile.webViewLink
    };
  } catch (error) {
    console.error('Backup export to Google Drive failed:', error);
    toast.error('فشل حفظ النسخة الاحتياطية على Google Drive');
    return null;
  }
}

/**
 * دالة لاسترجاع ملف من Google Drive
 */
export async function importFromGoogleDrive(fileId: string): Promise<any> {
  try {
    const isAuthenticated = await isGoogleDriveAuthenticated();
    if (!isAuthenticated) {
      await signInToGoogle();
    }

    const gapi = (window as any).gapi;
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: {
        'Authorization': `Bearer ${gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().id_token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to download file from Google Drive');
    }

    const data = await response.json();
    toast.success('✓ تم استرجاع البيانات من Google Drive');
    return data;
  } catch (error) {
    console.error('Import from Google Drive failed:', error);
    toast.error('فشل استرجاع البيانات من Google Drive');
    return null;
  }
}

/**
 * دالة لقائمة الملفات على Google Drive
 */
export async function listGoogleDriveFiles(): Promise<DriveFileInfo[]> {
  try {
    const isAuthenticated = await isGoogleDriveAuthenticated();
    if (!isAuthenticated) {
      await signInToGoogle();
    }

    const gapi = (window as any).gapi;
    const response = await gapi.client.drive.files.list({
      pageSize: 10,
      fields: 'files(id,name,webViewLink,size,createdTime)',
      q: "name contains 'كشف' or name contains 'Ledger' or name contains 'Backup'",
      orderBy: 'createdTime desc'
    });

    const files: DriveFileInfo[] = response.result.files.map((file: any) => ({
      fileId: file.id,
      fileName: file.name,
      uploadDate: file.createdTime,
      size: file.size,
      webViewLink: file.webViewLink
    }));

    return files;
  } catch (error) {
    console.error('Failed to list Google Drive files:', error);
    toast.error('فشل جلب قائمة الملفات من Google Drive');
    return [];
  }
}

/**
 * دالة لحذف ملف من Google Drive
 */
export async function deleteGoogleDriveFile(fileId: string): Promise<boolean> {
  try {
    const isAuthenticated = await isGoogleDriveAuthenticated();
    if (!isAuthenticated) {
      await signInToGoogle();
    }

    const gapi = (window as any).gapi;
    await gapi.client.drive.files.delete({
      fileId: fileId
    });

    toast.success('✓ تم حذف الملف من Google Drive');
    return true;
  } catch (error) {
    console.error('Failed to delete file from Google Drive:', error);
    toast.error('فشل حذف الملف من Google Drive');
    return false;
  }
}

/**
 * دالة لمشاركة ملف على Google Drive
 */
export async function shareGoogleDriveFile(
  fileId: string,
  email?: string,
  role: 'reader' | 'commenter' | 'writer' = 'reader'
): Promise<boolean> {
  try {
    const isAuthenticated = await isGoogleDriveAuthenticated();
    if (!isAuthenticated) {
      await signInToGoogle();
    }

    const gapi = (window as any).gapi;

    if (email) {
      // مشاركة مع بريد إلكتروني محدد
      await gapi.client.drive.permissions.create({
        fileId: fileId,
        resource: {
          type: 'user',
          role: role,
          emailAddress: email
        }
      });
    } else {
      // جعل الملف متاحاً للجميع
      await gapi.client.drive.permissions.create({
        fileId: fileId,
        resource: {
          type: 'anyone',
          role: 'reader'
        }
      });
    }

    toast.success('✓ تم مشاركة الملف بنجاح');
    return true;
  } catch (error) {
    console.error('Failed to share file:', error);
    toast.error('فشل مشاركة الملف');
    return false;
  }
}

/**
 * دالة لإنشاء مجلد على Google Drive
 */
export async function createGoogleDriveFolder(folderName: string): Promise<string | null> {
  try {
    const isAuthenticated = await isGoogleDriveAuthenticated();
    if (!isAuthenticated) {
      await signInToGoogle();
    }

    const gapi = (window as any).gapi;
    const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder'
    };

    const response = await gapi.client.drive.files.create({
      resource: fileMetadata,
      fields: 'id'
    });

    toast.success(`✓ تم إنشاء المجلد "${folderName}"`);
    return response.result.id;
  } catch (error) {
    console.error('Failed to create folder:', error);
    toast.error('فشل إنشاء المجلد');
    return null;
  }
}

/**
 * دالة للحصول على معلومات مستخدم Google
 */
export async function getGoogleUserInfo(): Promise<any> {
  try {
    const gapi = (window as any).gapi;
    if (!gapi || !gapi.auth2) return null;

    const auth2 = gapi.auth2.getAuthInstance();
    if (!auth2.isSignedIn.get()) return null;

    const profile = auth2.currentUser.get().getBasicProfile();
    return {
      id: profile.getId(),
      name: profile.getName(),
      email: profile.getEmail(),
      imageUrl: profile.getImageUrl()
    };
  } catch (error) {
    console.error('Failed to get user info:', error);
    return null;
  }
}

/**
 * دالة لتفعيل المشاركة التلقائية إلى Google Drive
 */
export async function enableAutoBackupToGoogleDrive(
  enabled: boolean,
  intervalMinutes: number = 60
): Promise<void> {
  try {
    localStorage.setItem('autoBackupGoogleDrive', JSON.stringify({
      enabled,
      interval: intervalMinutes,
      lastBackup: new Date().toISOString()
    }));

    if (enabled) {
      toast.success(`✓ تم تفعيل النسخ الاحتياطي التلقائي كل ${intervalMinutes} دقيقة`);
    } else {
      toast.success('✓ تم تعطيل النسخ الاحتياطي التلقائي');
    }
  } catch (error) {
    console.error('Failed to enable auto backup:', error);
    toast.error('فشل تفعيل النسخ الاحتياطي التلقائي');
  }
}

/**
 * دالة للتحقق من حالة النسخ الاحتياطي التلقائي
 */
export function getAutoBackupStatus(): {
  enabled: boolean;
  interval: number;
  lastBackup: string;
} {
  try {
    const stored = localStorage.getItem('autoBackupGoogleDrive');
    if (!stored) {
      return { enabled: false, interval: 60, lastBackup: '' };
    }
    return JSON.parse(stored);
  } catch (error) {
    return { enabled: false, interval: 60, lastBackup: '' };
  }
}
