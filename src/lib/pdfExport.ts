import type { Client, Transaction } from './db';

// تخزين مؤقت للمكتبات المستوردة لتحسين الأداء
let html2pdfModule: any = null;
let isLoadingModule = false;

async function getHtml2PdfModule() {
  if (html2pdfModule) return html2pdfModule;
  
  if (isLoadingModule) {
    while (!html2pdfModule && isLoadingModule) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return html2pdfModule;
  }

  isLoadingModule = true;
  try {
    const module = await import('html2pdf.js');
    html2pdfModule = (module as any).default || (module as any);
    return html2pdfModule;
  } finally {
    isLoadingModule = false;
  }
}

/**
 * دالة لتنسيق الأرقام بالإنجليزية
 */
function formatNumberEn(num: number): string {
  return num.toLocaleString('en-US');
}

export async function exportLedgerPDF(
  client: Client,
  transactions: (Transaction & { balance: number })[],
  totalDebit: number,
  totalCredit: number,
  netBalance: number
): Promise<Blob> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('PDF generation must run on the client side.'));
  }

  // ترتيب المعاملات: الأقدم فوق والأحدث تحت
  const sortedTxns = [...transactions].reverse();
  
  // جلب بيانات المؤسسة من الإعدادات (localStorage)
  const shopName = localStorage.getItem('shopName') || 'مؤسسة دفتر الحسابات الآمن';
  const shopPhone = localStorage.getItem('shopPhone') || '';
  const shopAddress = localStorage.getItem('shopAddress') || '';

  // جلب شعار التطبيق
  let logoBase64 = '';
  try {
    const logoResponse = await fetch('/pwa-512x512.png');
    const logoBlob = await logoResponse.blob();
    const reader = new FileReader();
    logoBase64 = await new Promise((resolve) => {
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(logoBlob);
    });
  } catch (e) {
    console.warn('Failed to load logo');
  }

  const html = generatePDFHTML(client, sortedTxns, totalDebit, totalCredit, netBalance, shopName, shopPhone, shopAddress, logoBase64);

  const container = document.createElement('div');
  container.innerHTML = html;
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.visibility = 'hidden';
  document.body.appendChild(container);

  try {
    const element = container.querySelector('#pdf-content') as HTMLElement;
    const html2pdf = await getHtml2PdfModule();

    const blob: Blob = await html2pdf()
      .set({
        margin: [8, 8, 8, 8],
        filename: `كشف_حساب_${client.name}_${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { 
          scale: 2,
          useCORS: true, 
          letterRendering: true,
          backgroundColor: '#ffffff',
          logging: false,
          allowTaint: true
        },
        jsPDF: { 
          unit: 'mm', 
          format: 'a4', 
          orientation: 'portrait',
          compress: true
        },
      })
      .from(element)
      .output('blob'); 

    return blob;
  } finally {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
}

function generatePDFHTML(
  client: Client,
  sortedTxns: (Transaction & { balance: number })[],
  totalDebit: number,
  totalCredit: number,
  netBalance: number,
  shopName: string,
  shopPhone: string,
  shopAddress: string,
  logoBase64: string = ''
): string {
  // استخدام أرقام إنجليزية للتاريخ والأرقام
  const exportDate = new Date().toLocaleDateString('en-US');
  
  const tableRows = sortedTxns
    .map((tx, i) => `
      <tr style="background: ${i % 2 === 0 ? '#faf5eb' : '#ffffff'};">
        <td style="padding: 8px 8px; text-align: center; border-bottom: 1px solid #e5ddd0;">${tx.date}</td>
        <td style="padding: 8px 8px; text-align: center; border-bottom: 1px solid #e5ddd0; color: ${tx.type === 'debit' ? '#b91c1c' : '#15803d'}; font-weight: bold;">
          ${formatNumberEn(tx.amount)} ${tx.type === 'debit' ? '(-)' : '(+)'}
        </td>
        <td style="padding: 8px 8px; text-align: right; border-bottom: 1px solid #e5ddd0; max-width: 150px; word-wrap: break-word;">${tx.details}</td>
        <td style="padding: 8px 8px; text-align: center; border-bottom: 1px solid #e5ddd0; font-weight: 600;">${formatNumberEn(tx.balance)}</td>
      </tr>
    `)
    .join('');

  return `
    <div id="pdf-content" style="direction: rtl; font-family: 'Segoe UI', Tahoma, sans-serif; padding: 30px; width: 210mm; background: white; color: #3c2814;">
      
      <!-- ترويسة المؤسسة مع الشعار -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 3px solid #4a341c; padding-bottom: 15px;">
        <div style="flex: 1;">
          <h1 style="margin: 0; font-size: 24px; color: #4a341c; font-weight: 800;">${shopName}</h1>
          <div style="margin-top: 8px; font-size: 13px; color: #666;">
            ${shopPhone ? `<div style="margin-bottom: 4px;">📞 الهاتف: <span style="direction: ltr; display: inline-block;">${shopPhone}</span></div>` : ''}
            ${shopAddress ? `<div>📍 العنوان: ${shopAddress}</div>` : ''}
          </div>
        </div>
        <div style="text-align: center; flex: 1; display: flex; flex-direction: column; align-items: center;">
          ${logoBase64 ? `<img src="${logoBase64}" style="width: 80px; height: 80px; margin-bottom: 10px; border-radius: 8px;" />` : ''}
          <div style="font-size: 18px; font-weight: bold; color: #4a341c;">كشف حساب عميل</div>
          <div style="margin-top: 8px; font-size: 13px; color: #666;">تاريخ التصدير: ${exportDate}</div>
        </div>
      </div>
      
      <!-- معلومات العميل -->
      <div style="background: #fdfbf7; padding: 15px; border-radius: 8px; border: 1px solid #e5ddd0; margin-bottom: 20px;">
        <div style="font-size: 16px; font-weight: bold; color: #4a341c; margin-bottom: 8px;">بيانات العميل:</div>
        <div style="font-size: 15px; margin-bottom: 4px;">الاسم: <strong>${client.name}</strong></div>
        ${client.phone ? `<div style="font-size: 14px; margin-bottom: 4px;">الهاتف: <span style="direction: ltr; display: inline-block;">${client.phone}</span></div>` : ''}
        <div style="font-size: 14px; margin-bottom: 4px;">تاريخ الإنشاء: <span style="direction: ltr; display: inline-block;">${client.createdAt ? new Date(client.createdAt).toLocaleDateString('en-US') : 'N/A'}</span></div>
        ${client.category ? `<div style="font-size: 14px;">التصنيف: <strong>${client.category}</strong></div>` : ''}
      </div>
      
      <!-- ملخص الأرصدة -->
      <div style="display: flex; gap: 15px; margin-bottom: 25px;">
        <div style="flex:1; background: #fee2e2; padding: 15px; border-radius: 10px; text-align: center; border: 1px solid #fca5a5;">
          <div style="font-size: 12px; color: #b91c1c; font-weight: 700; margin-bottom: 5px;">إجمالي عليه</div>
          <div style="font-size: 20px; font-weight: 800; color: #b91c1c;">${formatNumberEn(totalDebit)}</div>
        </div>
        <div style="flex:1; background: #dcfce7; padding: 15px; border-radius: 10px; text-align: center; border: 1px solid #86efac;">
          <div style="font-size: 12px; color: #15803d; font-weight: 700; margin-bottom: 5px;">إجمالي له</div>
          <div style="font-size: 20px; font-weight: 800; color: #15803d;">${formatNumberEn(totalCredit)}</div>
        </div>
        <div style="flex:1; background: #fef3c7; padding: 15px; border-radius: 10px; text-align: center; border: 1px solid #fde047;">
          <div style="font-size: 12px; color: #92400e; font-weight: 700; margin-bottom: 5px;">الرصيد النهائي</div>
          <div style="font-size: 20px; font-weight: 800; color: #92400e;">${formatNumberEn(Math.abs(netBalance))} ${netBalance >= 0 ? 'عليه' : 'له'}</div>
        </div>
      </div>
      
      <!-- جدول المعاملات -->
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; border: 1px solid #4a341c;">
        <thead>
          <tr style="background: #4a341c; color: #f5eee1;">
            <th style="padding: 12px 8px; text-align: center; font-weight: bold; border-right: 1px solid #634d35; width: 100px;">التاريخ</th>
            <th style="padding: 12px 8px; text-align: center; font-weight: bold; border-right: 1px solid #634d35; width: 120px;">المبلغ</th>
            <th style="padding: 12px 8px; text-align: right; font-weight: bold; border-right: 1px solid #634d35;">التفاصيل والبيان</th>
            <th style="padding: 12px 8px; text-align: center; font-weight: bold; width: 120px;">الرصيد</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
      
      <!-- تذييل الصفحة -->
      <div style="margin-top: 40px; padding-top: 15px; border-top: 1px dashed #4a341c; text-align: center;">
        <p style="font-size: 12px; color: #4a341c; font-weight: 600; margin: 0;">
          شكراً لتعاملكم معنا - تم إصدار هذا الكشف آلياً بواسطة تطبيق دفتر الحسابات
        </p>
        <div style="margin-top: 10px; font-size: 10px; color: #888;">
          يُعتبر هذا الكشف صحيحاً ما لم يتم الاعتراض عليه خلال 3 أيام من تاريخ استلامه
        </div>
      </div>
    </div>
  `;
}
