/**
 * Accountant-facing Excel export for the revenue report.
 *
 * Four sheets rather than one dump, because an accountant reconciles in this
 * order: the totals, then who is owed what, then how the money came in, then
 * the line-by-line evidence.
 *
 *   ملخص           — the period's totals, one figure per row
 *   حسب التاجر     — payable per merchant (what you actually pay out)
 *   حسب طريقة الدفع — cash vs wallet vs gateway
 *   تفاصيل الطلبات  — every order, frozen header + filters + totals row
 *
 * exceljs is imported dynamically so its ~900KB only loads on export.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const HEADER_FILL = 'FF1F2937';
const BRAND = 'FFE11D2A';
const MUTED_FILL = 'FFF3F4F6';
const WARN_FILL = 'FFFFF7E6';

const MONEY = '#,##0.00';
const DATE_FMT = 'yyyy-mm-dd hh:mm';

const PAYMENT_AR: Record<string, string> = {
  CASH: 'كاش',
  VODAFONE_CASH: 'فودافون كاش',
  INSTAPAY: 'إنستاباي',
  WALLET: 'محفظة',
};

const STATUS_AR: Record<string, string> = {
  COMPLETED: 'مكتمل',
  DELIVERED: 'تم التوصيل',
};

/** The report shows Cairo time; the API sends naive-UTC, so read it as UTC. */
function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const hasTz = /[Zz]$|[+-]\d\d:?\d\d$/.test(iso);
  const d = new Date(
    hasTz
      ? iso
      : iso
          .trim()
          .replace(' ', 'T')
          .replace(/\.\d+$/, '') + 'Z',
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function styleHeader(row: any, cols: number) {
  row.height = 24;
  for (let i = 1; i <= cols; i++) {
    const c = row.getCell(i);
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = { bottom: { style: 'thin', color: { argb: 'FF111827' } } };
  }
}

export interface RevenueExportOpts {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  /** Shown on the summary sheet so a printed copy carries its own filters. */
  meta: {
    periodLabel: string;
    merchantName?: string;
    paymentLabel?: string;
    commissionMode: string;
  };
}

export async function buildRevenueWorkbook({ data, meta }: RevenueExportOpts): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'تميم للتوصيل';
  wb.created = new Date();

  const from = toDate(data.range?.from);
  const to = toDate(data.range?.to);
  const generated = toDate(data.generatedAt) ?? new Date();
  const s = data.summary ?? {};
  const showCommission = Number(s.totalCommission ?? 0) > 0;

  // ── 1. ملخص ──
  const sum = wb.addWorksheet('ملخص', { views: [{ rightToLeft: true, showGridLines: false }] });
  sum.columns = [{ width: 34 }, { width: 22 }, { width: 40 }];

  // Merge first, then write: setting the value before merging leaves the text
  // duplicated across the cells the merge swallows.
  sum.mergeCells('A1:C1');
  const title = sum.getCell('A1');
  title.value = 'تَميم للتوصيل — التقرير المحاسبي للإيرادات';
  title.font = { bold: true, size: 16, color: { argb: BRAND } };
  title.alignment = { vertical: 'middle' };
  sum.getRow(1).height = 30;

  const rows: [string, unknown, string?][] = [
    ['الفترة', meta.periodLabel],
    ['من', from ?? '—'],
    ['إلى', to ?? '—'],
    ['التاجر', meta.merchantName ?? 'كل التجار'],
    ['طريقة الدفع', meta.paymentLabel ?? 'كل الطرق'],
    ['احتساب العمولة', meta.commissionMode],
    ['تاريخ التقرير', generated],
    ['', ''],
    ['عدد الطلبات', Number(s.ordersCount ?? 0)],
    ['إجمالي المبيعات', Number(s.totalSales ?? 0), 'اللي دفعه العملاء'],
    ['قيمة البضاعة', Number(s.totalOrderValue ?? 0), 'المسجّل فقط'],
    ['رسوم التوصيل', Number(s.totalDeliveryFees ?? 0)],
    ['الخصومات', Number(s.totalDiscounts ?? 0)],
    ['استخدام المحفظة', Number(s.totalWalletUsed ?? 0)],
    ['عمولة التطبيق', Number(s.totalCommission ?? 0), showCommission ? '' : 'العمولة غير محتسبة'],
    ['مستحقات التجار', Number(s.totalMerchantPayouts ?? 0), 'الواجب دفعه للتجار'],
    ['صافي إيرادات تَميم', Number(s.totalTamemNet ?? 0), 'العمولة + التوصيل'],
    ['صافي الإيراد', Number(s.totalNetRevenue ?? 0), 'المبيعات − الخصومات − المحفظة'],
  ];

  let r = 3;
  for (const [label, value, note] of rows) {
    if (label === '') {
      r++;
      continue;
    }
    const row = sum.getRow(r);
    row.getCell(1).value = label;
    row.getCell(1).font = { bold: true };
    row.getCell(2).value = value as never;
    if (typeof value === 'number')
      row.getCell(2).numFmt = label === 'عدد الطلبات' ? '#,##0' : MONEY;
    if (value instanceof Date) row.getCell(2).numFmt = DATE_FMT;
    if (note) {
      row.getCell(3).value = note;
      row.getCell(3).font = { size: 9, color: { argb: 'FF6B7280' }, italic: true };
    }
    if (label === 'مستحقات التجار' || label === 'صافي إيرادات تَميم') {
      for (let i = 1; i <= 3; i++)
        row.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MUTED_FILL } };
      row.getCell(2).font = { bold: true, size: 12 };
    }
    r++;
  }

  // Money the report cannot attribute is stated, never folded into a total —
  // an accountant has to see the hole rather than a number that looks whole.
  const unattributed = Number(s.unattributedOrders ?? 0);
  if (unattributed > 0) {
    r++;
    const w = sum.getRow(r);
    w.getCell(1).value = '⚠️ طلبات بدون تاجر';
    w.getCell(2).value = unattributed;
    w.getCell(3).value =
      `بقيمة ${Number(s.unattributedAmount ?? 0).toLocaleString('ar-EG')} ج.م — غير منسوبة لأي تاجر`;
    for (let i = 1; i <= 3; i++) {
      w.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WARN_FILL } };
      w.getCell(i).font = { bold: i === 1, color: { argb: 'FF92400E' } };
    }
  }

  // ── 2. حسب التاجر ──
  const mSheet = wb.addWorksheet('حسب التاجر', {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
  });
  mSheet.columns = [
    { header: 'التاجر', width: 32 },
    { header: 'عدد الطلبات', width: 14 },
    { header: 'المبيعات', width: 16 },
    { header: 'العمولة', width: 14 },
    { header: 'المستحق للتاجر', width: 18 },
  ];
  styleHeader(mSheet.getRow(1), 5);
  for (const m of (data.byMerchant ?? []) as Row[]) {
    const row = mSheet.addRow([
      m.merchantName,
      Number(m.ordersCount ?? 0),
      Number(m.sales ?? 0),
      Number(m.commission ?? 0),
      Number(m.payout ?? 0),
    ]);
    [3, 4, 5].forEach((i) => (row.getCell(i).numFmt = MONEY));
    if (!m.merchantId) {
      row.eachCell((c: Row) => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WARN_FILL } };
        c.font = { color: { argb: 'FF92400E' } };
      });
    }
  }
  const mTotal = mSheet.addRow([
    'الإجمالي',
    { formula: `SUM(B2:B${mSheet.rowCount})` },
    { formula: `SUM(C2:C${mSheet.rowCount})` },
    { formula: `SUM(D2:D${mSheet.rowCount})` },
    { formula: `SUM(E2:E${mSheet.rowCount})` },
  ]);
  mTotal.eachCell((c: Row, i: number) => {
    c.font = { bold: true };
    c.border = { top: { style: 'double', color: { argb: HEADER_FILL } } };
    if (i >= 3) c.numFmt = MONEY;
  });
  mSheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 5 } };

  // ── 3. حسب طريقة الدفع ──
  const pSheet = wb.addWorksheet('حسب طريقة الدفع', {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
  });
  pSheet.columns = [
    { header: 'طريقة الدفع', width: 22 },
    { header: 'عدد الطلبات', width: 14 },
    { header: 'المبيعات', width: 18 },
  ];
  styleHeader(pSheet.getRow(1), 3);
  for (const p of (data.byPaymentMethod ?? []) as Row[]) {
    const row = pSheet.addRow([
      PAYMENT_AR[p.paymentMethod] ?? p.paymentMethod,
      Number(p.ordersCount ?? 0),
      Number(p.sales ?? 0),
    ]);
    row.getCell(3).numFmt = MONEY;
  }
  const pTotal = pSheet.addRow([
    'الإجمالي',
    { formula: `SUM(B2:B${pSheet.rowCount})` },
    { formula: `SUM(C2:C${pSheet.rowCount})` },
  ]);
  pTotal.eachCell((c: Row, i: number) => {
    c.font = { bold: true };
    c.border = { top: { style: 'double', color: { argb: HEADER_FILL } } };
    if (i === 3) c.numFmt = MONEY;
  });

  // ── 4. تفاصيل الطلبات ──
  const dSheet = wb.addWorksheet('تفاصيل الطلبات', {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
  });
  dSheet.columns = [
    { header: 'رقم الطلب', width: 18 },
    { header: 'التاريخ', width: 18 },
    { header: 'العميل', width: 22 },
    { header: 'الهاتف', width: 16 },
    { header: 'التاجر', width: 28 },
    { header: 'الخدمة', width: 16 },
    { header: 'الحالة', width: 12 },
    { header: 'الدفع', width: 14 },
    { header: 'قيمة البضاعة', width: 14 },
    { header: 'التوصيل', width: 12 },
    { header: 'الخصم', width: 12 },
    { header: 'المحفظة', width: 12 },
    { header: 'الإجمالي', width: 14 },
    { header: 'العمولة', width: 12 },
    { header: 'المستحق للتاجر', width: 16 },
    { header: 'مقدّرة؟', width: 10 },
  ];
  styleHeader(dSheet.getRow(1), 16);

  for (const row of (data.rows ?? []) as Row[]) {
    const d = dSheet.addRow([
      row.orderNumber,
      toDate(row.completedAt) ?? '—',
      row.customerName ?? '—',
      row.customerPhone ?? '',
      row.merchantName ?? 'بدون تاجر',
      row.serviceNameAr ?? '',
      STATUS_AR[row.status] ?? row.status,
      PAYMENT_AR[row.paymentMethod] ?? row.paymentMethod,
      // null means "never recorded" — distinct from a real zero, so it stays
      // empty rather than becoming a 0 the accountant would trust.
      row.merchantSubtotal ?? null,
      row.deliveryFee ?? null,
      Number(row.discountAmount ?? 0),
      Number(row.walletUsed ?? 0),
      Number(row.finalPrice ?? 0),
      Number(row.platformCommission ?? 0),
      row.merchantPayout ?? null,
      row.estimated ? 'نعم' : '',
    ]);
    d.getCell(2).numFmt = DATE_FMT;
    [9, 10, 11, 12, 13, 14, 15].forEach((i) => (d.getCell(i).numFmt = MONEY));
    d.getCell(4).alignment = { horizontal: 'left' };
    if (row.estimated) {
      d.getCell(16).font = { color: { argb: 'FF92400E' }, bold: true };
      d.getCell(16).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WARN_FILL } };
    }
  }

  const last = dSheet.rowCount;
  const tRow = dSheet.addRow([
    'الإجمالي',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    { formula: `SUM(I2:I${last})` },
    { formula: `SUM(J2:J${last})` },
    { formula: `SUM(K2:K${last})` },
    { formula: `SUM(L2:L${last})` },
    { formula: `SUM(M2:M${last})` },
    { formula: `SUM(N2:N${last})` },
    { formula: `SUM(O2:O${last})` },
    '',
  ]);
  tRow.eachCell((c: Row, i: number) => {
    c.font = { bold: true };
    c.border = { top: { style: 'double', color: { argb: HEADER_FILL } } };
    if (i >= 9 && i <= 15) c.numFmt = MONEY;
  });
  dSheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 16 } };

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
