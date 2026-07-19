/**
 * Orders export — turns the currently-selected order rows into a formatted
 * Excel sheet the admin can hand to accounting or archive.
 *
 * exceljs is imported dynamically so its ~900KB only loads when an admin
 * actually exports, not on every orders-page visit.
 */
import { ORDER_STATUS_AR } from '@tamem/types';

import { downloadBlob } from './productsSheet.js';
import { formatDateTime } from './format.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const COLUMNS: { header: string; width: number; get: (o: Row) => unknown }[] = [
  { header: 'رقم الطلب', width: 16, get: (o) => o.orderNumber ?? o.id ?? '' },
  { header: 'التاريخ', width: 20, get: (o) => formatDateTime(o.createdAt) },
  { header: 'الخدمة', width: 20, get: (o) => o.service?.nameAr ?? '' },
  {
    header: 'الحالة',
    width: 16,
    get: (o) => ORDER_STATUS_AR[o.status as keyof typeof ORDER_STATUS_AR] ?? o.status ?? '',
  },
  { header: 'العميل', width: 22, get: (o) => o.customer?.name ?? '' },
  { header: 'هاتف العميل', width: 16, get: (o) => o.customer?.phone ?? '' },
  { header: 'السائق', width: 20, get: (o) => o.assignedDriver?.name ?? '—' },
  { header: 'السعر المقدّر', width: 16, get: (o) => num(o.quotedPrice) },
  { header: 'السعر النهائي', width: 16, get: (o) => num(o.finalPrice) },
  {
    header: 'عدد المتاجر',
    width: 12,
    get: (o) => Number(o._count?.subOrders ?? o.subOrders?.length ?? 0),
  },
];

const HEADER_FILL = 'FF1F2937';
const MONEY_COLS = new Set(['السعر المقدّر', 'السعر النهائي']);

/** Build an .xlsx blob from the given order rows. */
async function buildOrdersWorkbook(orders: Row[]): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'تميم للتوصيل';
  const ws = wb.addWorksheet('الطلبات', {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
  });

  ws.columns = COLUMNS.map((c) => ({ header: c.header, width: c.width }));

  const head = ws.getRow(1);
  head.height = 24;
  head.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  orders.forEach((o) => {
    const row = ws.addRow(COLUMNS.map((c) => c.get(o)));
    COLUMNS.forEach((c, i) => {
      if (MONEY_COLS.has(c.header)) row.getCell(i + 1).numFmt = '#,##0.00 "ج.م"';
    });
  });

  // Totals row — quick sanity number for whoever opens the file.
  const totalQuoted = orders.reduce((s, o) => s + num(o.quotedPrice), 0);
  const totalFinal = orders.reduce((s, o) => s + num(o.finalPrice), 0);
  const totalRow = ws.addRow([
    'الإجمالي',
    '',
    '',
    '',
    '',
    '',
    `${orders.length} طلب`,
    totalQuoted,
    totalFinal,
    '',
  ]);
  totalRow.font = { bold: true };
  totalRow.getCell(8).numFmt = '#,##0.00 "ج.م"';
  totalRow.getCell(9).numFmt = '#,##0.00 "ج.م"';

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Export the given orders to a dated .xlsx and trigger the download.
 * `stamp` is passed in (not read from Date here) so the caller controls the
 * filename; falls back to a plain name when omitted.
 */
export async function exportOrders(orders: Row[], stamp?: string): Promise<void> {
  const blob = await buildOrdersWorkbook(orders);
  const name = stamp ? `orders-${stamp}.xlsx` : 'orders.xlsx';
  downloadBlob(blob, name);
}
