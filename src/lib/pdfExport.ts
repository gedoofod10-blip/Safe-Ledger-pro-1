import type { Client, Transaction } from '@/lib/db';

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
  
  // سحب البيانات من الإعدادات مباشرة
  const shopName = localStorage.getItem('shopName') || 'مؤسسة دفتر الحسابات';
  const shopPhone = localStorage.getItem('shopPhone') || '';
  const shopAddress = localStorage.getItem('shopAddress') || '';
  let logoBase64 = localStorage.getItem('shopLogo') || '';

  // استخدام أيقونة التطبيق كبديل إذا لم يوجد شعار
  if (!logoBase64) {
    try {
      const logoResponse = await fetch('/pwa-512x512.png');
      const logoBlob = await logoResponse.blob();
      const reader = new FileReader();
      logoBase64 = await new Promise((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(logoBlob);
      });
    } catch (e) {
      console.warn('Failed to load fallback logo');
    }
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
        // زيادة الهوامش لتجنب القص العشوائي (Top, Left, Bottom, Right)
        margin: [15, 10, 15, 10], 
        filename: `كشف_حساب_${client.name}_${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg', quality: 1 }, 
        // السر هنا: منع قص الأسطر ونقلها كاملة للصفحة الجديدة
        pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '.avoid-break'] },
        html2canvas: { 
          scale: 2,
          useCORS: true, 
          backgroundColor: '#ffffff',
          logging: false,
          allowTaint: true,
          windowWidth: 800 // تثبيت العرض لضمان عدم تشوه الجداول
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
  const exportDate = new Date().toLocaleDateString('en-US');
  
  const tableRows = sortedTxns
    .map((tx, i) => `
      <tr style="background: ${i % 2 === 0 ? '#fcf9f2' : '#ffffff'}; page-break-inside: avoid; break-inside: avoid;">
        <td style="padding: 12px 10px; text-align: center; border-bottom: 1px solid #e5ddd0; font-size: 13px; font-weight: bold;">${tx.date}</td>
        <td style="padding: 12px 10px; text-align: center; border-bottom: 1px solid #e5ddd0; color: ${tx.type === 'debit' ? '#dc2626' : '#16a34a'}; font-weight: bold; font-size: 14px;">
          ${formatNumberEn(tx.amount)} ${tx.type === 'debit' ? '(-)' : '(+)'}
        </td>
        <td style="padding: 12px 10px; text-align: right; border-bottom: 1px solid #e5ddd0; line-height: 1.6; font-size: 13px; font-weight: bold;">${tx.details}</td>
        <td style="padding: 12px 10px; text-align: center; border-bottom: 1px solid #e5ddd0; font-weight: bold; font-size: 14px;">${formatNumberEn(Math.abs(tx.balance))}</td>
      </tr>
    `)
    .join('');

  return `
    <div id="pdf-content" style="direction: rtl; font-family: 'Arial', 'Tahoma', sans-serif; padding: 10px; width: 190mm; margin: 0 auto; background: white; color: #2d1a0d; box-sizing: border-box;">
      
      <div class="avoid-break" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 3px solid #4a341c; padding-bottom: 20px; page-break-inside: avoid; break-inside: avoid;">
        
        <div style="flex: 1; padding-top: 10px;">
          <h1 style="margin: 0 0 15px 0; font-size: 26px; color: #4a341c; font-weight: bold;">${shopName}</h1>
          <div style="font-size: 14px; color: #444; font-weight: bold; line-height: 1.8;">
            ${shopPhone ? `<div>📞 الهاتف: <span style="direction: ltr; display: inline-block; font-weight: bold; color: #222;">${shopPhone}</span></div>` : ''}
            ${shopAddress ? `<div>📍 العنوان: <span style="color: #222;">${shopAddress}</span></div>` : ''}
          </div>
        </div>
        
        <div style="text-align: left; flex: 1; display: flex; flex-direction: column; align-items: flex-end;">
          ${logoBase64 ? `
            <img src="${logoBase64}" style="width: 140px; height: 140px; margin-bottom: 15px; border-radius: 10px; object-fit: contain; border: 1px solid #f0f0f0; padding: 5px;" />
          ` : ''}
          <div style="font-size: 20px; font-weight: bold; color: #4a341c; margin-bottom: 5px;">كشف حساب (${client.name})</div>
          <div style="font-size: 12px; color: #777; font-weight: bold;">تاريخ الإصدار: ${exportDate}</div>
        </div>
      </div>
      
      <div class="avoid-break" style="display: flex; gap: 20px; margin-bottom: 30px; page-break-inside: avoid; break-inside: avoid;">
        <div style="flex: 1; background: #fff1f2; padding: 20px 15px; border-radius: 10px; text-align: center; border: 1px solid #fecdd3;">
          <div style="font-size: 13px; color: #be123c; font-weight: bold; margin-bottom: 8px;">إجمالي عليه</div>
          <div style="font-size: 22px; font-weight: bold; color: #be123c;">${formatNumberEn(totalDebit)}</div>
        </div>
        
        <div style="flex: 1; background: #f0fdf4; padding: 20px 15px; border-radius: 10px; text-align: center; border: 1px solid #bbf7d0;">
          <div style="font-size: 13px; color: #15803d; font-weight: bold; margin-bottom: 8px;">إجمالي له</div>
          <div style="font-size: 22px; font-weight: bold; color: #15803d;">${formatNumberEn(totalCredit)}</div>
        </div>
        
        <div style="flex: 1; background: #fffbeb; padding: 20px 15px; border-radius: 10px; text-align: center; border: 1px solid #fde68a;">
          <div style="font-size: 13px; color: #b45309; font-weight: bold; margin-bottom: 8px;">الرصيد النهائي</div>
          <div style="font-size: 22px; font-weight: bold; color: #b45309;">
            ${formatNumberEn(Math.abs(netBalance))} <span style="font-size: 16px; font-weight: bold;">${netBalance >= 0 ? 'عليه' : 'له'}</span>
          </div>
        </div>
      </div>
      
      <table style="width: 100%; border-collapse: collapse; font-size: 14px; border: 1px solid #4a341c; border-radius: 4px; overflow: hidden; table-layout: fixed;">
        <thead style="display: table-header-group; page-break-inside: avoid; break-inside: avoid;">
          <tr style="background: #4a341c; color: #fdfbf7;">
            <th style="padding: 14px 10px; text-align: center; font-weight: bold; border-right: 1px solid #5f4528; width: 100px;">التاريخ</th>
            <th style="padding: 14px 10px; text-align: center; font-weight: bold; border-right: 1px solid #5f4528; width: 130px;">المبلغ</th>
            <th style="padding: 14px 10px; text-align: right; font-weight: bold; border-right: 1px solid #5f4528;">التفاصيل والبيان</th>
            <th style="padding: 14px 10px; text-align: center; font-weight: bold; width: 130px;">الرصيد</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
      
      <div class="avoid-break" style="margin-top: 40px; padding-top: 15px; border-top: 1px solid #e5ddd0; text-align: center; page-break-inside: avoid; break-inside: avoid;">
        <p style="font-size: 13px; color: #666; font-weight: bold; margin: 0;">
          شكراً لتعاملكم معنا - تم إصدار هذا الكشف آلياً بواسطة تطبيق دفتر الحسابات
        </p>
      </div>
      
    </div>
  `;
}
