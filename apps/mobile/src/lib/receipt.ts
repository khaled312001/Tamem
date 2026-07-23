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
  /** Money breakdown. All optional — a line is shown only when its value is set,
   *  so a receipt is never padded with rows that don't apply. */
  subtotal?: number | null;
  deliveryFee?: number | null;
  discount?: number | null;
  total?: number | null;
  notes?: string | null;
  driver?: { name: string; phone?: string | null } | null;
  /** Shipping specifics — shown only for a shipment. */
  shipping?: {
    speedAr?: string | null;
    sizeAr?: string | null;
    weightKg?: number | null;
    fragile?: boolean | null;
  } | null;
  items?: Array<{
    name: string;
    quantity: number;
    unitPrice?: number | null;
    merchantName?: string | null;
    /** Extras line under the item name (already priced into unitPrice). */
    extras?: string | null;
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

  const items = opts.items ?? [];
  const named = items.filter(
    (i) => typeof i.merchantName === 'string' && i.merchantName.length > 0,
  );
  const merchantSet = new Set(named.map((i) => i.merchantName as string));
  const isMulti = merchantSet.size > 1;

  // Group by merchant so the receipt reads store-by-store, each with its own
  // subtotal — the same shape as the cart and the dashboard.
  const groups = new Map<string, typeof items>();
  for (const it of items) {
    const key = isMulti ? (it.merchantName ?? '— غير محدد —') : '__single__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }

  const itemRow = (it: (typeof items)[number]): string => {
    const line = it.unitPrice != null ? Number(it.unitPrice) * it.quantity : null;
    return `<tr class="item">
      <td class="item-qty">${it.quantity}×</td>
      <td class="item-name">
        <div class="i-name">${ESC(it.name)}</div>
        ${it.extras ? `<div class="i-extras">+ ${ESC(it.extras)}</div>` : ''}
      </td>
      <td class="item-price">${line != null ? fmtMoney(line) : '—'}</td>
    </tr>`;
  };

  const itemsHtml = Array.from(groups.entries())
    .map(([merchant, list]) => {
      const sub = list.reduce(
        (s, it) => s + (it.unitPrice != null ? Number(it.unitPrice) * it.quantity : 0),
        0,
      );
      const header =
        isMulti && merchant !== '__single__'
          ? `<tr><td colspan="3" class="merchant-row"><div class="m-inner"><span class="m-name">🏪 ${ESC(merchant)}</span><span class="m-sub">${fmtMoney(sub)}</span></div></td></tr>`
          : '';
      return header + list.map(itemRow).join('');
    })
    .join('');

  const paymentBadge = (() => {
    if (opts.paymentStatus === 'PAID') return '<span class="badge ok">تم الدفع</span>';
    if (opts.paymentStatus === 'PENDING') return '<span class="badge pending">قيد التحصيل</span>';
    if (opts.paymentStatus === 'REFUNDED') return '<span class="badge refunded">مرتجع</span>';
    if (opts.paymentStatus === 'FAILED') return '<span class="badge fail">فشل</span>';
    return '';
  })();

  const money = (label: string, value: number, cls = ''): string =>
    `<div class="sum-row ${cls}"><span>${label}</span><span class="num">${fmtMoney(value)}</span></div>`;

  // Only render a breakdown line when its value is present, so the summary never
  // shows rows that don't apply to this order.
  const breakdown = [
    opts.subtotal != null ? money('المجموع الفرعي', Number(opts.subtotal)) : '',
    opts.deliveryFee != null ? money('رسوم التوصيل', Number(opts.deliveryFee)) : '',
    opts.discount != null && Number(opts.discount) > 0
      ? `<div class="sum-row discount"><span>الخصم</span><span class="num">- ${fmtMoney(Number(opts.discount))}</span></div>`
      : '',
  ]
    .filter(Boolean)
    .join('');

  const shippingHtml = (() => {
    const s = opts.shipping;
    if (!s) return '';
    const rows = [
      s.speedAr ? { k: 'سرعة الشحن', v: s.speedAr } : null,
      s.sizeAr ? { k: 'الحجم', v: s.sizeAr } : null,
      s.weightKg != null && Number(s.weightKg) > 0
        ? { k: 'الوزن', v: `${Number(s.weightKg)} كجم` }
        : null,
      s.fragile ? { k: 'المحتوى', v: 'قابل للكسر ⚠️' } : null,
    ].filter(Boolean) as { k: string; v: string }[];
    if (rows.length === 0) return '';
    return `<div class="section">
      <h3>📦 تفاصيل الشحنة</h3>
      <div class="info-grid">
        ${rows.map((r) => `<div class="row"><span class="k">${ESC(r.k)}</span><span class="v">${ESC(r.v)}</span></div>`).join('')}
      </div>
    </div>`;
  })();

  return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>إيصال طلب ${ESC(opts.orderNumber)}</title>
<style>
  /* System Arabic stack — no network font, so the PDF renders identically and
     instantly offline (the old Google-Fonts <link> could fail to load in the
     print webview and drop Arabic to an ugly fallback). */
  * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; margin: 0; padding: 0; }
  html { font-family: 'Segoe UI', 'Noto Sans Arabic', 'Geeza Pro', Tahoma, Arial, sans-serif; }
  body { color: #1f2430; background: #eef0f4; padding: 20px; -webkit-font-smoothing: antialiased; }
  .num { font-variant-numeric: tabular-nums; }

  .receipt { max-width: 640px; margin: 0 auto; background: #fff; border-radius: 20px; overflow: hidden; box-shadow: 0 18px 50px rgba(20,20,40,0.10); }

  /* ── Header ─────────────────────────────────────────────────── */
  .hero { position: relative; background: linear-gradient(135deg, #E0301E 0%, #C42820 55%, #A11F16 100%); color: #fff; padding: 26px 28px; overflow: hidden; }
  .hero::after { content: ''; position: absolute; top: -70px; left: -40px; width: 200px; height: 200px; border-radius: 50%; background: rgba(242,169,59,0.16); }
  .hero-top { position: relative; display: flex; align-items: center; gap: 14px; }
  .logo-wrap { width: 62px; height: 62px; border-radius: 16px; background: #fff; padding: 7px; box-shadow: 0 8px 18px rgba(0,0,0,0.22); flex-shrink: 0; }
  .logo-wrap img { width: 100%; height: 100%; object-fit: contain; border-radius: 10px; }
  .hero-brand .name { font-size: 26px; font-weight: 800; letter-spacing: 3px; line-height: 1.1; }
  .hero-brand .tag { font-size: 10px; letter-spacing: 5px; color: #F7C877; font-weight: 700; margin-top: 3px; }
  .hero-title { position: relative; margin-top: 18px; display: flex; justify-content: space-between; align-items: flex-end; }
  .hero-title .lbl { font-size: 12px; color: rgba(255,255,255,0.75); font-weight: 600; }
  .hero-title .onum { font-size: 22px; font-weight: 800; letter-spacing: 1px; direction: ltr; }
  .hero-title .date { font-size: 11px; color: rgba(255,255,255,0.8); font-weight: 600; text-align: left; }
  .hero-title .receipt-tag { font-size: 12px; font-weight: 700; background: rgba(255,255,255,0.16); border: 1px solid rgba(255,255,255,0.22); padding: 4px 12px; border-radius: 999px; }

  /* ── Status strip ──────────────────────────────────────────── */
  .status-strip { display: flex; align-items: center; justify-content: space-between; padding: 12px 28px; background: #FBF3E9; border-bottom: 1px solid #F0E2CE; font-size: 13px; }
  .status-strip .s-state { font-weight: 800; color: #A11F16; }

  /* ── Body ───────────────────────────────────────────────────── */
  .body { padding: 22px 28px 8px; }
  .section { margin-bottom: 18px; }
  .section h3 { font-size: 12px; color: #9aa0ad; letter-spacing: 1px; margin-bottom: 9px; font-weight: 800; }

  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; padding: 14px 16px; background: #f6f7f9; border-radius: 12px; }
  .info-grid .row { display: flex; flex-direction: column; }
  .info-grid .row .k { font-size: 10px; color: #9aa0ad; font-weight: 700; }
  .info-grid .row .v { font-weight: 700; font-size: 13.5px; color: #1f2430; margin-top: 3px; }

  .addr { background: #f6f7f9; padding: 13px 14px; border-radius: 12px; font-size: 13.5px; line-height: 1.7; border-inline-start: 4px solid #E0301E; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  @media (max-width: 460px) { .two { grid-template-columns: 1fr; } }

  /* ── Items ─────────────────────────────────────────────────── */
  table.items { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #eef0f3; border-radius: 12px; overflow: hidden; }
  table.items td { padding: 11px 14px; border-bottom: 1px solid #f3f4f6; font-size: 13.5px; vertical-align: top; }
  table.items tr:last-child td { border-bottom: none; }
  table.items td.item-qty { color: #E0301E; width: 42px; font-weight: 800; }
  table.items td.item-name .i-name { font-weight: 700; color: #1f2430; }
  table.items td.item-name .i-extras { font-size: 11.5px; color: #8a90a0; margin-top: 3px; }
  table.items td.item-price { font-weight: 800; color: #1f2430; width: 96px; text-align: left; direction: ltr; }
  /* flex lives on a DIV inside the td, not the td itself — display:flex on a
     table-cell renders unreliably (the name and subtotal collapsed together). */
  table.items td.merchant-row { background: #FBF3E9; padding: 9px 14px; }
  table.items td.merchant-row .m-inner { display: flex; justify-content: space-between; align-items: center; gap: 16px; font-weight: 800; color: #A11F16; font-size: 12.5px; }
  table.items td.merchant-row .m-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  table.items td.merchant-row .m-sub { direction: ltr; white-space: nowrap; flex-shrink: 0; }

  /* ── Summary ───────────────────────────────────────────────── */
  .summary { margin-top: 4px; padding: 16px 18px; background: #f6f7f9; border-radius: 14px; }
  .sum-row { display: flex; justify-content: space-between; align-items: center; padding: 5px 0; font-size: 13.5px; color: #5a6070; }
  .sum-row .num { direction: ltr; font-weight: 700; color: #1f2430; }
  .sum-row.discount .num { color: #1a9d5a; }
  .sum-grand { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding-top: 12px; border-top: 2px dashed #dcdfe6; }
  .sum-grand .g-lbl { font-size: 16px; font-weight: 900; color: #1f2430; }
  .sum-grand .g-val { font-size: 24px; font-weight: 900; color: #E0301E; direction: ltr; }
  .pay-line { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; font-size: 13px; color: #5a6070; }
  .pay-line .pv { font-weight: 800; color: #1f2430; }

  .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; margin-inline-start: 6px; }
  .badge.ok { background: #DCFCE7; color: #166534; }
  .badge.pending { background: #FEF3C7; color: #92400E; }
  .badge.refunded { background: #E0E7FF; color: #3730A3; }
  .badge.fail { background: #FECACA; color: #991B1B; }

  /* ── Driver ────────────────────────────────────────────────── */
  .driver { display: flex; align-items: center; gap: 12px; background: #f6f7f9; padding: 12px 14px; border-radius: 12px; }
  .driver .avatar { width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg, #E0301E, #C42820); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 18px; flex-shrink: 0; }
  .driver .d-name { font-weight: 800; font-size: 14px; }
  .driver .d-phone { font-size: 12.5px; color: #5a6070; direction: ltr; margin-top: 2px; }

  .notes { font-size: 13px; color: #5a6070; background: #FBF3E9; border: 1px dashed #E7C79A; border-radius: 12px; padding: 13px 14px; line-height: 1.7; }

  /* ── Footer ────────────────────────────────────────────────── */
  .stamp { text-align: center; margin: 22px 0 6px; padding: 16px; border: 2px dashed rgba(224,48,30,0.22); border-radius: 14px; }
  .stamp .thanks { color: #1f2430; font-weight: 800; font-size: 14px; }
  .stamp .moto { color: #E0301E; font-weight: 700; font-size: 12px; margin-top: 4px; letter-spacing: 1px; }
  footer { padding: 16px 28px 22px; text-align: center; color: #9aa0ad; font-size: 10px; background: #f6f7f9; }
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
    <div class="hero-top">
      <div class="logo-wrap"><img src="${TAMEM_LOGO_DATA_URI}" alt="Tamem" /></div>
      <div class="hero-brand">
        <div class="name">تَميم</div>
        <div class="tag">D E L I V E R Y</div>
      </div>
      <div style="margin-inline-start:auto"><span class="receipt-tag">إيصال طلب</span></div>
    </div>
    <div class="hero-title">
      <div>
        <div class="lbl">رقم الطلب</div>
        <div class="onum">#${ESC(opts.orderNumber)}</div>
      </div>
      <div>
        <div class="lbl">التاريخ</div>
        <div class="date">${ESC(dateStr)}</div>
      </div>
    </div>
  </div>

  ${
    opts.status
      ? `<div class="status-strip"><span>حالة الطلب</span><span class="s-state">${ESC(opts.status)}</span></div>`
      : ''
  }

  <div class="body">

    <div class="section">
      <h3>بيانات العميل</h3>
      <div class="info-grid">
        <div class="row"><span class="k">الاسم</span><span class="v">${ESC(opts.customerName)}</span></div>
        ${opts.customerPhone ? `<div class="row"><span class="k">الهاتف</span><span class="v" dir="ltr">${ESC(opts.customerPhone)}</span></div>` : ''}
        ${opts.serviceNameAr ? `<div class="row"><span class="k">الخدمة</span><span class="v">${ESC(opts.serviceNameAr)}</span></div>` : ''}
      </div>
    </div>

    ${
      opts.pickupAddress || opts.deliveryAddress
        ? `<div class="section">
      <h3>العناوين</h3>
      <div class="two">
        ${opts.pickupAddress ? `<div><div class="k" style="font-size:10px;color:#9aa0ad;font-weight:700;margin-bottom:5px">📍 الاستلام</div><div class="addr">${ESC(opts.pickupAddress)}</div></div>` : ''}
        ${opts.deliveryAddress ? `<div><div class="k" style="font-size:10px;color:#9aa0ad;font-weight:700;margin-bottom:5px">🏠 التوصيل</div><div class="addr">${ESC(opts.deliveryAddress)}</div></div>` : ''}
      </div>
    </div>`
        : ''
    }

    ${shippingHtml}

    ${
      items.length > 0
        ? `<div class="section">
      <h3>المنتجات${isMulti ? ` — من ${merchantSet.size} متاجر` : ''} (${items.length})</h3>
      <table class="items"><tbody>${itemsHtml}</tbody></table>
    </div>`
        : ''
    }

    <div class="summary">
      ${breakdown}
      <div class="sum-grand">
        <span class="g-lbl">الإجمالي الكلي</span>
        <span class="g-val">${fmtMoney(opts.total ?? null)}</span>
      </div>
      ${opts.paymentMethodAr ? `<div class="pay-line"><span>طريقة الدفع</span><span class="pv">${ESC(opts.paymentMethodAr)} ${paymentBadge}</span></div>` : ''}
    </div>

    ${
      opts.driver
        ? `<div class="section" style="margin-top:18px">
      <h3>السائق المعيّن</h3>
      <div class="driver">
        <div class="avatar">${ESC(opts.driver.name[0] ?? '?')}</div>
        <div>
          <div class="d-name">${ESC(opts.driver.name)}</div>
          ${opts.driver.phone ? `<div class="d-phone">${ESC(opts.driver.phone)}</div>` : ''}
        </div>
      </div>
    </div>`
        : ''
    }

    ${
      opts.notes
        ? `<div class="section">
      <h3>ملاحظات</h3>
      <div class="notes">${ESC(opts.notes)}</div>
    </div>`
        : ''
    }

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
