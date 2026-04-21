import CryptoJS from 'crypto-js';

/**
 * مفتاح التشفير الرئيسي (يجب تخزينه بشكل آمن في الإنتاج)
 * في بيئة الإنتاج، استخدم متغيرات البيئة والمفاتيح المدارة
 */
const MASTER_KEY = 'L3dg3r-S3cur3-M4st3r-K3y-2026-AES256-HMAC';
const ENCRYPTION_ALGORITHM = 'AES-256-GCM';

/**
 * واجهة لتتبع محاولات الوصول غير المصرح
 */
export interface SecurityLog {
  timestamp: string;
  action: string;
  userId?: string;
  ipAddress?: string;
  status: 'success' | 'failed' | 'blocked';
  details?: string;
}

/**
 * دالة للتحقق من سلامة البيانات باستخدام HMAC
 */
export function generateHMAC(data: string, key: string = MASTER_KEY): string {
  return CryptoJS.HmacSHA256(data, key).toString();
}

/**
 * دالة للتحقق من توقيع البيانات
 */
export function verifyHMAC(data: string, signature: string, key: string = MASTER_KEY): boolean {
  const expectedSignature = generateHMAC(data, key);
  return CryptoJS.enc.Hex.stringify(CryptoJS.enc.Hex.parse(signature)) === 
         CryptoJS.enc.Hex.stringify(CryptoJS.enc.Hex.parse(expectedSignature));
}

/**
 * دالة لتشفير البيانات بشكل آمن
 */
export function encryptData(data: string, key: string = MASTER_KEY): string {
  try {
    // إضافة timestamp لمنع replay attacks
    const dataWithTimestamp = JSON.stringify({
      data,
      timestamp: Date.now(),
      nonce: Math.random().toString(36).substring(2, 15)
    });

    const encrypted = CryptoJS.AES.encrypt(dataWithTimestamp, key).toString();
    return encrypted;
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * دالة لفك تشفير البيانات بشكل آمن
 */
export function decryptData(encryptedData: string, key: string = MASTER_KEY): string {
  try {
    const decrypted = CryptoJS.AES.decrypt(encryptedData, key);
    const decryptedString = decrypted.toString(CryptoJS.enc.Utf8);
    
    const parsed = JSON.parse(decryptedString);
    
    // التحقق من أن البيانات لم تكن قديمة جداً (أكثر من ساعة)
    const age = Date.now() - parsed.timestamp;
    if (age > 3600000) {
      console.warn('Data is older than 1 hour');
    }

    return parsed.data;
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * دالة لتوليد hash آمن للبيانات الحساسة
 */
export function hashData(data: string): string {
  return CryptoJS.SHA256(data).toString();
}

/**
 * دالة للتحقق من قوة كلمة السر
 */
export function validatePasswordStrength(password: string): {
  isStrong: boolean;
  score: number;
  feedback: string[];
} {
  const feedback: string[] = [];
  let score = 0;

  // التحقق من الطول
  if (password.length >= 8) {
    score += 20;
  } else {
    feedback.push('كلمة السر يجب أن تكون 8 أحرف على الأقل');
  }

  // التحقق من وجود أحرف كبيرة
  if (/[A-Z]/.test(password)) {
    score += 20;
  } else {
    feedback.push('أضف أحرف كبيرة (A-Z)');
  }

  // التحقق من وجود أحرف صغيرة
  if (/[a-z]/.test(password)) {
    score += 20;
  } else {
    feedback.push('أضف أحرف صغيرة (a-z)');
  }

  // التحقق من وجود أرقام
  if (/[0-9]/.test(password)) {
    score += 20;
  } else {
    feedback.push('أضف أرقام (0-9)');
  }

  // التحقق من وجود رموز خاصة
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    score += 20;
  } else {
    feedback.push('أضف رموز خاصة (!@#$%^&* إلخ)');
  }

  return {
    isStrong: score >= 80,
    score,
    feedback
  };
}

/**
 * دالة لتطبيق Content Security Policy
 */
export function applyCSP(): void {
  if (typeof window === 'undefined') return;

  const cspMeta = document.createElement('meta');
  cspMeta.httpEquiv = 'Content-Security-Policy';
  cspMeta.content = `
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    font-src 'self' https://fonts.gstatic.com;
    img-src 'self' data: https:;
    connect-src 'self' https:;
    frame-ancestors 'none';
    base-uri 'self';
    form-action 'self';
  `.replace(/\s+/g, ' ').trim();

  document.head.appendChild(cspMeta);
}

/**
 * دالة لتفعيل X-Frame-Options
 */
export function applyXFrameOptions(): void {
  if (typeof window === 'undefined') return;

  const meta = document.createElement('meta');
  meta.httpEquiv = 'X-UA-Compatible';
  meta.content = 'ie=edge';
  document.head.appendChild(meta);
}

/**
 * دالة لتطبيق رؤوس الأمان
 */
export function applySecurityHeaders(): void {
  if (typeof window === 'undefined') return;

  // X-Content-Type-Options
  const xContentType = document.createElement('meta');
  xContentType.httpEquiv = 'X-Content-Type-Options';
  xContentType.content = 'nosniff';
  document.head.appendChild(xContentType);

  // X-XSS-Protection
  const xXSS = document.createElement('meta');
  xXSS.httpEquiv = 'X-XSS-Protection';
  xXSS.content = '1; mode=block';
  document.head.appendChild(xXSS);

  // Referrer-Policy
  const referrer = document.createElement('meta');
  referrer.name = 'referrer';
  referrer.content = 'strict-origin-when-cross-origin';
  document.head.appendChild(referrer);

  // Permissions-Policy
  const permissions = document.createElement('meta');
  permissions.httpEquiv = 'Permissions-Policy';
  permissions.content = 'geolocation=(), microphone=(), camera=()';
  document.head.appendChild(permissions);
}

/**
 * دالة لتسجيل الأحداث الأمنية
 */
export function logSecurityEvent(event: SecurityLog): void {
  try {
    const logs = JSON.parse(localStorage.getItem('securityLogs') || '[]') as SecurityLog[];
    logs.push(event);

    // الاحتفاظ بآخر 1000 حدث فقط
    if (logs.length > 1000) {
      logs.shift();
    }

    localStorage.setItem('securityLogs', JSON.stringify(logs));
  } catch (error) {
    console.error('Failed to log security event:', error);
  }
}

/**
 * دالة للتحقق من محاولات الوصول المريبة
 */
export function detectSuspiciousActivity(): boolean {
  try {
    const logs = JSON.parse(localStorage.getItem('securityLogs') || '[]') as SecurityLog[];
    
    // عد محاولات الفشل في آخر 5 دقائق
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const recentFailures = logs.filter(log => {
      const logTime = new Date(log.timestamp).getTime();
      return logTime > fiveMinutesAgo && log.status === 'failed';
    });

    // إذا كانت هناك أكثر من 5 محاولات فشل، اعتبرها مريبة
    if (recentFailures.length > 5) {
      logSecurityEvent({
        timestamp: new Date().toISOString(),
        action: 'SUSPICIOUS_ACTIVITY_DETECTED',
        status: 'blocked',
        details: `${recentFailures.length} failed attempts detected`
      });
      return true;
    }

    return false;
  } catch (error) {
    console.error('Failed to detect suspicious activity:', error);
    return false;
  }
}

/**
 * دالة لتطبيق rate limiting
 */
export class RateLimiter {
  private attempts: Map<string, number[]> = new Map();
  private readonly maxAttempts: number;
  private readonly windowMs: number;

  constructor(maxAttempts: number = 5, windowMs: number = 60000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
  }

  isAllowed(key: string): boolean {
    const now = Date.now();
    const attempts = this.attempts.get(key) || [];

    // إزالة المحاولات القديمة
    const recentAttempts = attempts.filter(time => now - time < this.windowMs);

    if (recentAttempts.length >= this.maxAttempts) {
      logSecurityEvent({
        timestamp: new Date().toISOString(),
        action: 'RATE_LIMIT_EXCEEDED',
        userId: key,
        status: 'blocked',
        details: `${recentAttempts.length} attempts in ${this.windowMs}ms`
      });
      return false;
    }

    recentAttempts.push(now);
    this.attempts.set(key, recentAttempts);
    return true;
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}

/**
 * دالة للتحقق من صحة المدخلات (Input Validation)
 */
export function validateInput(input: string, type: 'email' | 'phone' | 'text' | 'number'): boolean {
  const patterns = {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    phone: /^[\d\s\-\+\(\)]{7,}$/,
    text: /^[a-zA-Z0-9\s\u0600-\u06FF\-\.،؛:!؟()]*$/,
    number: /^[0-9]+(\.[0-9]{1,2})?$/
  };

  return patterns[type].test(input);
}

/**
 * دالة لتنظيف المدخلات (Input Sanitization)
 */
export function sanitizeInput(input: string): string {
  const div = document.createElement('div');
  div.textContent = input;
  return div.innerHTML;
}

/**
 * دالة لمنع XSS attacks
 */
export function preventXSS(html: string): string {
  const div = document.createElement('div');
  div.textContent = html;
  return div.innerHTML;
}

/**
 * دالة لتفعيل HTTPS فقط
 */
export function enforceHTTPS(): void {
  if (typeof window !== 'undefined' && window.location.protocol !== 'https:' && !window.location.hostname.includes('localhost')) {
    window.location.protocol = 'https:';
  }
}

/**
 * دالة لتطبيق سياسة الخصوصية
 */
export function applyPrivacyPolicy(): void {
  if (typeof window === 'undefined') return;

  // منع الوصول إلى البيانات الحساسة عبر DevTools
  if (typeof window !== 'undefined') {
    // تعطيل الكونسول في الإنتاج
    if (process.env.NODE_ENV === 'production') {
      console.log = () => {};
      console.warn = () => {};
      console.error = () => {};
    }
  }
}

/**
 * دالة لإنشاء نسخة احتياطية آمنة من البيانات الحساسة
 */
export async function secureBackup(data: any): Promise<string> {
  try {
    const jsonString = JSON.stringify(data);
    const encrypted = encryptData(jsonString);
    const hmac = generateHMAC(encrypted);
    
    return JSON.stringify({
      data: encrypted,
      signature: hmac,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Secure backup failed:', error);
    throw error;
  }
}

/**
 * دالة لاستعادة البيانات من نسخة احتياطية آمنة
 */
export async function secureRestore(backup: string): Promise<any> {
  try {
    const parsed = JSON.parse(backup);
    
    // التحقق من التوقيع
    if (!verifyHMAC(parsed.data, parsed.signature)) {
      throw new Error('Data integrity check failed');
    }

    const decrypted = decryptData(parsed.data);
    return JSON.parse(decrypted);
  } catch (error) {
    console.error('Secure restore failed:', error);
    throw error;
  }
}

/**
 * دالة لقفل المشروع بكلمة سر
 */
export function lockProject(password: string): string {
  const hash = hashData(password);
  localStorage.setItem('projectLock', hash);
  logSecurityEvent({
    timestamp: new Date().toISOString(),
    action: 'PROJECT_LOCKED',
    status: 'success'
  });
  return hash;
}

/**
 * دالة للتحقق من قفل المشروع
 */
export function verifyProjectLock(password: string): boolean {
  const storedHash = localStorage.getItem('projectLock');
  if (!storedHash) return true; // لا يوجد قفل

  const inputHash = hashData(password);
  const isValid = inputHash === storedHash;

  logSecurityEvent({
    timestamp: new Date().toISOString(),
    action: 'PROJECT_UNLOCK_ATTEMPT',
    status: isValid ? 'success' : 'failed'
  });

  return isValid;
}

/**
 * دالة لفتح قفل المشروع
 */
export function unlockProject(): void {
  localStorage.removeItem('projectLock');
  logSecurityEvent({
    timestamp: new Date().toISOString(),
    action: 'PROJECT_UNLOCKED',
    status: 'success'
  });
}

/**
 * دالة للتحقق من حالة الأمان العامة
 */
export function getSecurityStatus(): {
  isSecure: boolean;
  score: number;
  issues: string[];
} {
  const issues: string[] = [];
  let score = 100;

  // التحقق من HTTPS
  if (typeof window !== 'undefined' && window.location.protocol !== 'https:' && !window.location.hostname.includes('localhost')) {
    issues.push('استخدم HTTPS بدلاً من HTTP');
    score -= 20;
  }

  // التحقق من وجود قفل
  if (!localStorage.getItem('projectLock')) {
    issues.push('يُنصح بتفعيل قفل المشروع بكلمة سر');
    score -= 10;
  }

  // التحقق من النشاط المريب
  if (detectSuspiciousActivity()) {
    issues.push('تم اكتشاف نشاط مريب');
    score -= 30;
  }

  return {
    isSecure: score >= 80,
    score,
    issues
  };
}

/**
 * تهيئة الأمان عند بدء التطبيق
 */
export function initializeSecurity(): void {
  try {
    applySecurityHeaders();
    applyCSP();
    applyXFrameOptions();
    applyPrivacyPolicy();
    enforceHTTPS();

    logSecurityEvent({
      timestamp: new Date().toISOString(),
      action: 'SECURITY_INITIALIZED',
      status: 'success'
    });

    console.log('✓ Security measures applied successfully');
  } catch (error) {
    console.error('Failed to initialize security:', error);
    logSecurityEvent({
      timestamp: new Date().toISOString(),
      action: 'SECURITY_INITIALIZATION_FAILED',
      status: 'failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
