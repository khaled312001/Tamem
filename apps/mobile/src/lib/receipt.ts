/**
 * Professional order receipt — generated as a styled HTML document, then
 * either rendered as PDF (native) or printed/saved (web).
 *
 * Why HTML+expo-print:
 *   - Same source of truth for native & web (one template).
 *   - Real PDF output that users can keep, forward, or print — same
 *     vibe as Talabat/Mrsool email receipts.
 *   - Tamem logo + brand colors + Arabic-first RTL layout.
 */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { TAMEM_LOGO_DATA_URI } from './logoData';

export interface ReceiptOpts {
  orderNumber: string;
  customerName: string;
  customerPhone?: string | null;
  serviceNameAr?: string | null;
  status?: string | null;
  createdAt: string | Date;
  deliveryAddress?: string | null;
  pickupAddress?: string | null;
  paymentMethodAr?: string | null;
  paymentStatus?: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | null;
  total?: number | null;
  notes?: string | null;
  driver?: { name: string; phone?: string | null } | null;
  items?: Array<{
    name: string;
    quantity: number;
    unitPrice?: number | null;
    merchantName?: string | null;
  }>;
}

const ESC = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const fmtMoney = (n: number | null | undefined): string =>
  n == null ? '—' : `${Number(n).toLocaleString('ar-EG')} ج.م`;

function buildHtml(opts: ReceiptOpts): string {
  const date = opts.createdAt instanceof Date ? opts.createdAt : new Date(opts.createdAt);
  const dateStr = date.toLocaleString('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Group items by merchant when multiple merchants are present so the
  // receipt mirrors the dashboard "سلة متعددة المتاجر" layout.
  const items = opts.items ?? [];
  const merchantSet = new Set(
    items
      .map((i) => i.merchantName)
      .filter((x): x is string => typeof x === 'string' && x.length > 0),
  );
  const isMulti = merchantSet.size > 1;
  const groups = new Map<string, typeof items>();
  if (isMulti) {
    for (const it of items) {
      const key = it.merchantName ?? '— غير محدد —';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(it);
    }
  } else {
    groups.set('__single__', items);
  }

  const itemsHtml = Array.from(groups.entries())
    .map(([merchant, list]) => {
      const header =
        isMulti && merchant !== '__single__'
          ? `<tr><td colspan="3" class="merchant-row">🏪 ${ESC(merchant)}</td></tr>`
          : '';
      const rows = list
        .map((it) => {
          const line = it.unitPrice != null ? Number(it.unitPrice) * it.quantity : null;
          return `<tr class="item">
            <td class="item-name">${ESC(it.name)}</td>
            <td class="item-qty">×${it.quantity}</td>
            <td class="item-price">${line != null ? fmtMoney(line) : '—'}</td>
          </tr>`;
        })
        .join('');
      return header + rows;
    })
    .join('');

  const paymentBadge = (() => {
    if (opts.paymentStatus === 'PAID') return '<span class="badge ok">تم الدفع</span>';
    if (opts.paymentStatus === 'PENDING') return '<span class="badge pending">قيد التحصيل</span>';
    if (opts.paymentStatus === 'REFUNDED') return '<span class="badge refunded">مرتجع</span>';
    if (opts.paymentStatus === 'FAILED') return '<span class="badge fail">فشل</span>';
    return '';
  })();

  return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>إيصال طلب ${ESC(opts.orderNumber)}</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  body { font-family: 'Cairo', -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif; margin: 0; padding: 24px; color: #1A1A1A; background: linear-gradient(180deg, #FAFAFA 0%, #FFF 100%); }
  .receipt { max-width: 680px; margin: 0 auto; background: #fff; border-radius: 24px; box-shadow: 0 24px 60px rgba(0,0,0,0.08); overflow: hidden; }

  /* ── Hero ───────────────────────────────────────────────────── */
  .hero { position: relative; background: linear-gradient(135deg, #E0301E 0%, #C42820 60%, #8B1A12 100%); color: #fff; padding: 32px 28px 24px; text-align: center; overflow: hidden; }
  .hero::before { content: ''; position: absolute; top: -60px; right: -60px; width: 200px; height: 200px; border-radius: 50%; background: rgba(242,169,59,0.18); }
  .hero::after { content: ''; position: absolute; bottom: -80px; left: -50px; width: 220px; height: 220px; border-radius: 50%; background: rgba(255,255,255,0.06); }
  .logo-wrap { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 96px; height: 96px; border-radius: 50%; background: #fff; padding: 10px; box-shadow: 0 14px 28px rgba(0,0,0,0.25); margin-bottom: 14px; }
  .logo-wrap img { width: 100%; height: 100%; object-fit: contain; border-radius: 50%; }
  .logo-ring { position: absolute; inset: -8px; border-radius: 50%; border: 1.5px solid rgba(242,169,59,0.55); }
  .brand { position: relative; font-size: 36px; font-weight: 900; letter-spacing: 8px; }
  .tagline-row { position: relative; display: inline-flex; align-items: center; gap: 10px; margin-top: 6px; }
  .tagline-line { width: 30px; height: 1.5px; background: rgba(242,169,59,0.6); }
  .tagline { color: #F2A93B; font-size: 10px; letter-spacing: 6px; font-weight: 700; }
  .receipt-title { position: relative; margin-top: 20px; display: inline-block; padding: 6px 18px; border-radius: 999px; background: rgba(255,255,255,0.14); border: 1px solid rgba(255,255,255,0.2); font-size: 13px; letter-spacing: 2px; font-weight: 700; }

  /* ── Body ───────────────────────────────────────────────────── */
  .body { padding: 28px; }

  .order-meta { display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; background: linear-gradient(135deg, #FFF7EE 0%, #fff 60%); border: 1px solid #F2A93B22; border-radius: 14px; margin-bottom: 22px; }
  .order-meta .label { color: #888; font-size: 11px; font-weight: 700; }
  .order-meta .value { font-weight: 800; font-size: 18px; font-family: 'JetBrains Mono', 'Consolas', monospace; color: #1a1a1a; margin-top: 2px; }
  .order-meta .value.date { font-size: 12px; font-family: inherit; font-weight: 700; color: #444; }

  .section { margin-bottom: 18px; }
  .section h3 { font-size: 12px; color: #999; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 10px; font-weight: 800; display: flex; align-items: center; gap: 6px; }

  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 16px; background: #fafafa; border-radius: 12px; border: 1px solid #f0f0f0; }
  .info-grid .row { display: flex; flex-direction: column; }
  .info-grid .row .k { font-size: 10px; color: #999; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
  .info-grid .row .v { font-weight: 700; font-size: 14px; color: #1a1a1a; margin-top: 4px; }

  .addr { background: #fafafa; padding: 14px; border-radius: 12px; font-size: 14px; line-height: 1.7; border-right: 4px solid #E0301E; }

  /* ── Items table ───────────────────────────────────────────── */
  table.items { width: 100%; border-collapse: collapse; margin-top: 4px; background: #fff; border: 1px solid #f0f0f0; border-radius: 12px; overflow: hidden; }
  table.items td { padding: 12px 14px; border-bottom: 1px solid #f5f5f5; font-size: 14px; }
  table.items tr:last-child td { border-bottom: none; }
  table.items td.item-name { font-weight: 700; }
  table.items td.item-qty { color: #888; width: 56px; text-align: center; font-weight: 700; }
  table.items td.item-price { font-weight: 800; color: #E0301E; width: 110px; text-align: left; direction: ltr; }
  table.items td.merchant-row { background: linear-gradient(90deg, rgba(224,48,30,0.10), transparent); font-weight: 800; padding: 10px 14px; color: #E0301E; font-size: 13px; }

  /* ── Total card ────────────────────────────────────────────── */
  .total-card { background: linear-gradient(135deg, #FFF7EE 0%, #fff 60%); border: 1px solid #F2A93B33; border-radius: 16px; padding: 20px; margin-top: 22px; box-shadow: 0 8px 16px rgba(242,169,59,0.08); }
  .total-row { display: flex; justify-content: space-between; align-items: baseline; padding: 6px 0; font-size: 14px; color: #444; }
  .total-row.grand { padding-top: 14px; border-top: 2px dashed #F2A93B55; margin-top: 6px; }
  .total-row.grand .label { font-size: 17px; font-weight: 900; color: #1a1a1a; }
  .total-row.grand .value { font-size: 26px; font-weight: 900; color: #E0301E; }

  .badge { display: inline-block; padding: 3px 12px; border-radius: 999px; font-size: 11px; font-weight: 800; margin-inline-start: 8px; }
  .badge.ok { background: #DCFCE7; color: #166534; }
  .badge.pending { background: #FEF3C7; color: #92400E; }
  .badge.refunded { background: #E0E7FF; color: #3730A3; }
  .badge.fail { background: #FECACA; color: #991B1B; }

  /* ── Driver card ───────────────────────────────────────────── */
  .driver { display: flex; align-items: center; gap: 14px; background: linear-gradient(135deg, #fafafa 0%, #fff 60%); padding: 14px; border-radius: 14px; border: 1px solid #f0f0f0; }
  .driver .avatar { width: 50px; height: 50px; border-radius: 50%; background: linear-gradient(135deg, #E0301E, #C42820); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 20px; box-shadow: 0 6px 12px rgba(224,48,30,0.25); }
  .driver .info { flex: 1; }
  .driver .info .label-mini { font-size: 10px; color: #999; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
  .driver .info .name { font-weight: 800; font-size: 15px; margin-top: 2px; }
  .driver .info .phone { font-size: 13px; color: #555; direction: ltr; margin-top: 2px; }

  .notes { font-size: 13px; color: #555; background: #FFF7EE; border: 1px dashed #F2A93B; border-radius: 12px; padding: 14px; line-height: 1.7; }

  /* ── Footer ────────────────────────────────────────────────── */
  .stamp { text-align: center; margin-top: 22px; padding: 16px; border: 2px dashed #E0301E33; border-radius: 14px; background: linear-gradient(135deg, rgba(224,48,30,0.03), transparent); }
  .stamp .thanks { color: #1a1a1a; font-weight: 800; font-size: 14px; }
  .stamp .moto { color: #E0301E; font-weight: 700; font-size: 12px; margin-top: 4px; letter-spacing: 1px; }

  footer { margin-top: 18px; padding: 16px 28px 24px; text-align: center; color: #999; font-size: 10px; background: #fafafa; }
  footer .brand-line { color: #E0301E; font-weight: 800; letter-spacing: 2px; margin-top: 4px; font-size: 11px; }

  @media print {
    body { padding: 0; background: #fff; }
    .receipt { box-shadow: none; border-radius: 0; max-width: none; }
  }
</style>
</head>
<body>
<div class="receipt">

  <div class="hero">
    <div class="logo-wrap">
      <div class="logo-ring"></div>
      <img src="${TAMEM_LOGO_DATA_URI}" alt="Tamem" />
    </div>
    <div class="brand">TAMEM</div>
    <div class="tagline-row">
      <span class="tagline-line"></span>
      <span class="tagline">D E L I V E R Y</span>
      <span class="tagline-line"></span>
    </div>
    <div class="receipt-title">إيصال طلب</div>
  </div>

  <div class="body">

    <div class="order-meta">
      <div>
        <div class="label">رقم الطلب</div>
        <div class="value">#${ESC(opts.orderNumber)}</div>
      </div>
      <div style="text-align:left">
        <div class="label">تاريخ الطلب</div>
        <div class="value date">${ESC(dateStr)}</div>
      </div>
    </div>

    <div class="section">
      <h3>👤 بيانات العميل</h3>
      <div class="info-grid">
        <div class="row"><span class="k">الاسم</span><span class="v">${ESC(opts.customerName)}</span></div>
        ${opts.customerPhone ? `<div class="row"><span class="k">الهاتف</span><span class="v" dir="ltr">${ESC(opts.customerPhone)}</span></div>` : ''}
        ${opts.serviceNameAr ? `<div class="row"><span class="k">الخدمة</span><span class="v">${ESC(opts.serviceNameAr)}</span></div>` : ''}
        ${opts.status ? `<div class="row"><span class="k">الحالة</span><span class="v">${ESC(opts.status)}</span></div>` : ''}
      </div>
    </div>

    ${
      opts.driver
        ? `<div class="section">
      <h3>🚚 السائق المعيّن</h3>
      <div class="driver">
        <div class="avatar">${ESC(opts.driver.name[0] ?? '?')}</div>
        <div class="info">
          <div class="label-mini">اسم السائق</div>
          <div class="name">${ESC(opts.driver.name)}</div>
          ${opts.driver.phone ? `<div class="phone">${ESC(opts.driver.phone)}</div>` : ''}
        </div>
      </div>
    </div>`
        : ''
    }

    ${
      opts.pickupAddress
        ? `<div class="section">
      <h3>📍 عنوان الاستلام</h3>
      <div class="addr">${ESC(opts.pickupAddress)}</div>
    </div>`
        : ''
    }

    ${
      opts.deliveryAddress
        ? `<div class="section">
      <h3>🏠 عنوان التوصيل</h3>
      <div class="addr">${ESC(opts.deliveryAddress)}</div>
    </div>`
        : ''
    }

    ${
      items.length > 0
        ? `<div class="section">
      <h3>🛒 المنتجات${isMulti ? ` — من ${merchantSet.size} متاجر` : ''} (${items.length})</h3>
      <table class="items">
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
    </div>`
        : ''
    }

    ${
      opts.notes
        ? `<div class="section">
      <h3>📝 ملاحظات</h3>
      <div class="notes">${ESC(opts.notes)}</div>
    </div>`
        : ''
    }

    <div class="total-card">
      ${opts.paymentMethodAr ? `<div class="total-row"><span class="label">طريقة الدفع</span><span class="value" style="font-weight:700;color:#1a1a1a">${ESC(opts.paymentMethodAr)} ${paymentBadge}</span></div>` : ''}
      <div class="total-row grand">
        <span class="label">الإجمالي</span>
        <span class="value">${fmtMoney(opts.total ?? null)}</span>
      </div>
    </div>

    <div class="stamp">
      <div class="thanks">شكراً لاختيارك تَميم 🙏</div>
      <div class="moto">التوصيل لعبتنا 🛵</div>
    </div>

  </div>

  <footer>
    تَميم للتوصيل — إيصال إلكتروني رسمي
    <div class="brand-line">TAMEM • DELIVERY</div>
  </footer>

</div>
</body>
</html>`;
}

/**
 * Generate the receipt and share/save it.
 *   - iOS/Android: creates a PDF via expo-print, then opens the system
 *     share sheet (save to Files, send via WhatsApp, AirDrop, etc.)
 *   - Web: opens the styled receipt in a new tab and triggers print
 *     (the browser can "save as PDF" from the print dialog).
 */
export async function shareReceipt(opts: ReceiptOpts): Promise<void> {
  const html = buildHtml(opts);

  if (Platform.OS === 'web') {
    // Open the receipt as a real Blob URL. window.open('') + document.write
    // doesn't work reliably (some browsers leave the tab blank because
    // the URL is "about:blank" and document.write races the load). A
    // blob:// URL navigates to actual HTML content immediately.
    if (typeof window !== 'undefined') {
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank');
      if (!w) {
        // Popup blocked — fall back to navigating the current tab so the
        // receipt still shows up. The user can hit print from there.
        window.location.href = url;
        return;
      }
      // Wait for the new tab to finish loading the blob, then trigger
      // print. Release the object URL afterwards so we don't leak it.
      const t = setTimeout(() => {
        try {
          w.focus();
          w.print();
        } catch {
          /* user may need to print manually */
        }
        // Keep the URL alive for a minute so re-prints still work,
        // then release it.
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }, 600);
      void t;
    }
    return;
  }

  // Native: generate PDF + open share sheet.
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'إيصال الطلب',
      UTI: 'com.adobe.pdf',
    });
  }
}
