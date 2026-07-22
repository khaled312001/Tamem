/**
 * Products spreadsheet — the single source of truth for the columns shared by
 * template download, data export and import. Export and import read the same
 * COLUMNS array, so a file produced here always round-trips: the order and the
 * header text can never drift apart.
 *
 * exceljs is ~900KB, so every entry point here loads it dynamically — the cost
 * is paid only when an admin actually opens export/import.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

export type ColType = 'id' | 'text' | 'number' | 'int' | 'list' | 'url';

export interface SheetColumn {
  /** Product field name. */
  key: string;
  header: string;
  width: number;
  type: ColType;
  required: boolean;
  example: string;
  /** Shown in the header comment + the Instructions sheet. */
  help: string;
  values?: string[];
}

/** The ID column exists only in a re-import-compatible export. */
export const ID_COLUMN: SheetColumn = {
  key: 'id',
  header: 'Product ID',
  width: 28,
  type: 'id',
  required: false,
  example: '(يُملأ تلقائياً)',
  help: 'المعرّف الفريد للمنتج. لا تحذفه ولا تعدّله — النظام يستخدمه لتحديث المنتج الصحيح. الصفوف بدون معرّف تُنشأ كمنتجات جديدة.',
};

export const COLUMNS: SheetColumn[] = [
  {
    key: 'nameAr',
    header: 'الاسم بالعربية',
    width: 30,
    type: 'text',
    required: true,
    example: 'شاي ليبتون أخضر',
    help: 'مطلوب. اسم المنتج كما يظهر للعميل.',
  },
  {
    key: 'name',
    header: 'الاسم بالإنجليزية',
    width: 26,
    type: 'text',
    required: false,
    example: 'Lipton Green Tea',
    help: 'اختياري. لو فاضي يتم استخدام الاسم العربي.',
  },
  {
    key: 'sku',
    header: 'كود المنتج (SKU)',
    width: 18,
    type: 'text',
    required: false,
    example: 'TEA-01',
    help: 'اختياري. لا يتكرر لدى نفس التاجر.',
  },
  {
    key: 'barcode',
    header: 'الباركود',
    width: 18,
    type: 'text',
    required: false,
    example: '6221031492016',
    help: 'اختياري. أرقام فقط عادةً.',
  },
  {
    key: 'merchant',
    header: 'التاجر',
    width: 28,
    type: 'list',
    required: true,
    // Replaced with a real store name when the workbook is built, so the
    // sample row is valid as-is rather than erroring on upload.
    example: '(اختر من القائمة)',
    help: 'مطلوب. يجب أن يطابق اسم تاجر موجود بالضبط — اختر من القائمة المنسدلة. لو تُرك فاضياً يُستخدم التاجر المحدد في شاشة الاستيراد.',
  },
  {
    key: 'categoryName',
    header: 'التصنيف',
    width: 18,
    type: 'text',
    required: false,
    example: 'مشروبات',
    help: 'اختياري. نص حر — لا يلزم أن يطابق قائمة.',
  },
  {
    key: 'price',
    header: 'السعر',
    width: 12,
    type: 'number',
    required: true,
    example: '25',
    help: 'مطلوب. أرقام موجبة فقط (بالجنيه). بدون رموز عملة.',
  },
  {
    key: 'salePrice',
    header: 'سعر الخصم',
    width: 12,
    type: 'number',
    required: false,
    example: '20',
    help: 'اختياري. أرقام موجبة، ويجب أن يكون أقل من السعر.',
  },
  {
    key: 'stock',
    header: 'المخزون',
    width: 10,
    type: 'int',
    required: false,
    example: '100',
    help: 'اختياري. أرقام صحيحة فقط. اتركه فاضياً لو غير محدد.',
  },
  {
    key: 'isAvailable',
    header: 'الحالة',
    width: 12,
    type: 'list',
    required: true,
    example: 'active',
    values: ['active', 'inactive'],
    help: 'مطلوب. active = متاح للعملاء، inactive = مخفي.',
  },
  {
    key: 'description',
    header: 'وصف مختصر',
    width: 36,
    type: 'text',
    required: false,
    example: 'شاي أخضر طبيعي 100 جرام',
    help: 'اختياري. حتى 2000 حرف.',
  },
  {
    key: 'imageUrl',
    header: 'رابط الصورة',
    width: 40,
    type: 'url',
    required: false,
    example: 'https://example.com/tea.jpg',
    help: 'اختياري. رابط كامل يبدأ بـ https. لرفع صور من جهازك استخدم نموذج المنتج داخل اللوحة.',
  },
];

export const columnsFor = (withId: boolean): SheetColumn[] =>
  withId ? [ID_COLUMN, ...COLUMNS] : COLUMNS;

/** Columns for the plain "keep a copy" export — readable, no internal fields. */
const ARCHIVE_COLUMNS: { header: string; width: number; get: (p: Row) => unknown }[] = [
  { header: 'الاسم بالعربية', width: 30, get: (p) => p.nameAr ?? '' },
  { header: 'الاسم بالإنجليزية', width: 26, get: (p) => p.name ?? '' },
  { header: 'كود المنتج (SKU)', width: 18, get: (p) => p.sku ?? '' },
  { header: 'الباركود', width: 18, get: (p) => p.barcode ?? '' },
  { header: 'التاجر', width: 28, get: (p) => p.merchant?.storeNameAr ?? '' },
  { header: 'التصنيف', width: 18, get: (p) => p.categoryName ?? '' },
  { header: 'السعر', width: 12, get: (p) => num(p.price) },
  { header: 'سعر الخصم', width: 12, get: (p) => (p.salePrice == null ? '' : num(p.salePrice)) },
  { header: 'المخزون', width: 10, get: (p) => (p.stock == null ? '' : Number(p.stock)) },
  { header: 'الحالة', width: 12, get: (p) => (p.isAvailable ? 'متاح' : 'معطّل') },
  {
    header: 'المقاسات',
    width: 34,
    get: (p) =>
      Array.isArray(p.variants) && p.variants.length
        ? p.variants.map((v: Row) => `${v.nameAr}=${num(v.price)}`).join(' | ')
        : '',
  },
  {
    header: 'الإضافات',
    width: 34,
    get: (p) =>
      Array.isArray(p.addons) && p.addons.length
        ? p.addons.map((a: Row) => `${a.nameAr}=${num(a.price)}`).join(' | ')
        : '',
  },
  { header: 'وصف مختصر', width: 36, get: (p) => p.description ?? '' },
];

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * exceljs applies validation to a whole range via `worksheet.dataValidations`,
 * which exists at runtime but is missing from its published types (the typed
 * path is per-cell, which would mean thousands of cell objects per file).
 */
type DataValidationRule = Record<string, unknown>;
function addValidation(ws: unknown, range: string, rule: DataValidationRule) {
  (
    ws as { dataValidations: { add: (r: string, v: DataValidationRule) => void } }
  ).dataValidations.add(range, rule);
}

const HEADER_FILL = 'FF1F2937';
const REQUIRED_FILL = 'FFFDECEC';
const EXAMPLE_FILL = 'FFFFF7E6';
const ID_FILL = 'FFEEF2FF';
/** Blank rows kept below the data so the admin can append new products and
 *  still get the dropdowns + validation. Styling a row materialises it, so
 *  this is deliberately modest rather than "the whole sheet". */
const SPARE_ROWS = 100;

/** Value written into a data cell for a given column. */
function cellValue(p: Row, c: SheetColumn): unknown {
  switch (c.key) {
    case 'id':
      return p.id ?? '';
    case 'merchant':
      return p.merchant?.storeNameAr ?? '';
    case 'price':
      return num(p.price);
    case 'salePrice':
      return p.salePrice == null ? '' : num(p.salePrice);
    case 'stock':
      return p.stock == null ? '' : Number(p.stock);
    case 'isAvailable':
      return p.isAvailable ? 'active' : 'inactive';
    default:
      return p[c.key] ?? '';
  }
}

export type BuildOpts = {
  /** 'blank' = headers only, 'example' = headers + one sample row, 'data' = real products. */
  mode: 'blank' | 'example' | 'data';
  /** Include the locked Product ID column (re-import-compatible export). */
  withId: boolean;
  products?: Row[];
  merchantNames: string[];
};

/**
 * Import-compatible workbook: styled header with per-column comments, a
 * dropdown for merchant + status, numeric validation on price/stock, the ID
 * column locked against editing, and an Instructions sheet.
 */
export async function buildImportWorkbook(opts: BuildOpts): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'تميم للتوصيل';

  const cols = columnsFor(opts.withId);
  const ws = wb.addWorksheet('المنتجات', {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
  });

  // Merchant names live on a hidden sheet: an inline dropdown list breaks as
  // soon as a store name contains a comma.
  const lists = wb.addWorksheet('Lists');
  lists.state = 'veryHidden';
  opts.merchantNames.forEach((n, i) => {
    lists.getCell(i + 1, 1).value = n;
  });

  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width }));

  const head = ws.getRow(1);
  head.height = 24;
  cols.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.note = {
      texts: [{ text: `${c.header}\n${c.required ? '(مطلوب) ' : '(اختياري) '}${c.help}` }],
    };
  });

  const lastRow =
    (opts.mode === 'data' ? (opts.products ?? []).length : opts.mode === 'example' ? 1 : 0) +
    1 +
    SPARE_ROWS;

  const dataRows: Row[] =
    opts.mode === 'data' ? (opts.products ?? []) : opts.mode === 'example' ? [null] : [];

  dataRows.forEach((p, ri) => {
    const row = ws.getRow(ri + 2);
    cols.forEach((c, ci) => {
      row.getCell(ci + 1).value =
        opts.mode === 'example'
          ? c.type === 'id'
            ? ''
            : c.key === 'merchant'
              ? (opts.merchantNames[0] ?? c.example)
              : c.example
          : (cellValue(p, c) as never);
    });
    if (opts.mode === 'example') {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXAMPLE_FILL } };
        cell.font = { italic: true, color: { argb: 'FF92400E' } };
      });
      ws.getCell(ri + 2, cols.length + 1).value = '⬅ صف مثال توضيحي — احذفه قبل رفع الملف';
      ws.getCell(ri + 2, cols.length + 1).font = { bold: true, color: { argb: 'FFB45309' } };
    }
  });

  // Tint required columns so a blank one is visible at a glance.
  cols.forEach((c, ci) => {
    if (!c.required) return;
    for (let r = 2; r <= lastRow; r++) {
      const cell = ws.getCell(r, ci + 1);
      if (opts.mode === 'example' && r === 2) continue;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REQUIRED_FILL } };
    }
  });

  const colLetter = (i: number) => ws.getColumn(i + 1).letter;

  cols.forEach((c, ci) => {
    const L = colLetter(ci);
    const range = `${L}2:${L}${lastRow}`;
    if (c.key === 'isAvailable') {
      addValidation(ws, range, {
        type: 'list',
        allowBlank: false,
        formulae: [`"${(c.values ?? []).join(',')}"`],
        showErrorMessage: true,
        errorStyle: 'error',
        errorTitle: 'قيمة غير مسموحة',
        error: 'اختر active أو inactive فقط.',
      });
    } else if (c.key === 'merchant' && opts.merchantNames.length) {
      addValidation(ws, range, {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$A$1:$A$${opts.merchantNames.length}`],
        showErrorMessage: true,
        errorStyle: 'error',
        errorTitle: 'تاجر غير معروف',
        error: 'اختر اسم تاجر من القائمة المنسدلة.',
      });
    } else if (c.type === 'number' || c.type === 'int') {
      addValidation(ws, range, {
        type: c.type === 'int' ? 'whole' : 'decimal',
        operator: 'greaterThanOrEqual',
        allowBlank: !c.required,
        formulae: [0],
        showErrorMessage: true,
        errorStyle: 'error',
        errorTitle: 'رقم غير صالح',
        error:
          c.type === 'int'
            ? 'المخزون لازم يكون رقم صحيح موجب — بدون نصوص.'
            : 'السعر لازم يكون رقم موجب — بدون نصوص أو رموز عملة.',
      });
    }
  });

  // Everything is editable except the ID column, which Excel itself must
  // refuse to edit — a stale/typo'd ID silently creates duplicates on import.
  if (opts.withId) {
    for (let r = 1; r <= lastRow; r++) {
      for (let c = 1; c <= cols.length; c++) {
        ws.getCell(r, c).protection = { locked: c === 1 };
      }
      const idCell = ws.getCell(r, 1);
      if (r > 1) idCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ID_FILL } };
    }
    await ws.protect('', {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatCells: true,
      formatColumns: true,
      formatRows: true,
      insertRows: true,
      deleteRows: true,
      sort: true,
      autoFilter: true,
    });
  }

  buildInstructionsSheet(wb, cols, opts.withId);

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function buildInstructionsSheet(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wb: any,
  cols: SheetColumn[],
  withId: boolean,
) {
  const ws = wb.addWorksheet('Instructions', { views: [{ rightToLeft: true }] });
  ws.columns = [
    { header: 'العمود', key: 'c', width: 24 },
    { header: 'مطلوب؟', key: 'r', width: 12 },
    { header: 'نوع البيانات', key: 't', width: 22 },
    { header: 'مثال', key: 'e', width: 28 },
    { header: 'ملاحظات', key: 'n', width: 70 },
  ];
  const head = ws.getRow(1);
  head.height = 22;
  head.eachCell((cell: Row) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  const typeLabel: Record<ColType, string> = {
    id: 'نص (تلقائي — لا يُعدّل)',
    text: 'نص',
    number: 'رقم موجب',
    int: 'رقم صحيح',
    list: 'اختيار من قائمة',
    url: 'رابط https',
  };

  cols.forEach((c) => {
    const row = ws.addRow({
      c: c.header,
      r: c.required ? 'مطلوب' : 'اختياري',
      t: c.values ? `قائمة: ${c.values.join(' / ')}` : typeLabel[c.type],
      e: c.example,
      n: c.help,
    });
    row.alignment = { wrapText: true, vertical: 'top' };
    if (c.required) {
      row.getCell(2).font = { bold: true, color: { argb: 'FFB91C1C' } };
      row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REQUIRED_FILL } };
    }
  });

  ws.addRow({});
  const notes = [
    'املأ بياناتك في شيت «المنتجات» ثم ارفع الملف من شاشة الاستيراد في لوحة التحكم.',
    'صف المثال (الملوّن) توضيحي فقط — احذفه قبل الرفع.',
    'الحقول المطلوبة ملوّنة بالأحمر الخفيف — لا تتركها فاضية.',
    'الأعمدة وترتيبها متطابقة مع شاشة الاستيراد — لا تغيّر أسماء الأعمدة ولا ترتيبها.',
    withId
      ? 'عمود Product ID مقفول ومحمي: النظام يستخدمه لتحديث المنتج الصحيح. لو حذفته أو غيّرته، الصف هيتعامل معه كمنتج جديد.'
      : 'هذا القالب لإضافة منتجات جديدة. لتحديث منتجات موجودة، استخدم «تصدير المنتجات الحالية للتعديل» من شاشة التصدير.',
  ];
  notes.forEach((t, i) => {
    const row = ws.addRow({ c: i === 0 ? 'تعليمات عامة' : '', n: t });
    row.getCell(1).font = { bold: true };
    row.getCell(5).alignment = { wrapText: true };
  });
}

/** Plain archive export — readable columns, no internal fields. */
export async function buildArchiveWorkbook(products: Row[]): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'تميم للتوصيل';
  const ws = wb.addWorksheet('المنتجات', {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
  });
  ws.columns = ARCHIVE_COLUMNS.map((c) => ({ header: c.header, width: c.width }));
  const head = ws.getRow(1);
  head.height = 22;
  head.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  products.forEach((p) => ws.addRow(ARCHIVE_COLUMNS.map((c) => c.get(p))));
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ARCHIVE_COLUMNS.length } };
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// ── Reading ──

export interface ParsedRow {
  line: number;
  /** Present + known → update; otherwise create. */
  id?: string;
  merchantId?: string;
  merchantName?: string;
  data: Record<string, unknown>;
  action: 'create' | 'update';
  errors: { column: string; message: string }[];
  raw: string[];
}

export interface ParsedSheet {
  headers: string[];
  rows: ParsedRow[];
  valid: ParsedRow[];
  invalid: ParsedRow[];
  /** Fatal problem — nothing can be imported. */
  fatal?: string;
}

/** Excel writes "1,200" and Arabic keyboards produce ٠-٩ — accept both. */
export function toNum(raw: string): number {
  const s = String(raw)
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[,٬\s]/g, '');
  return s === '' ? NaN : Number(s);
}

/**
 * Minimal RFC-4180 reader. The delimiter is sniffed from the header line
 * because Excel writes `;` under an Arabic locale and `,` under an English one.
 */
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, '');
  const nl = s.indexOf('\n');
  const head = nl === -1 ? s : s.slice(0, nl + 1);
  const delim = head.split(';').length - 1 > head.split(',').length - 1 ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

async function readXlsx(file: File): Promise<string[][]> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.getWorksheet('المنتجات') ?? wb.worksheets[0];
  if (!ws) return [];
  const out: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    const n = Math.max(row.cellCount, 1);
    for (let i = 1; i <= n; i++) {
      const v = row.getCell(i).value;
      let s = '';
      if (v == null) s = '';
      else if (typeof v === 'object' && 'text' in (v as object))
        s = String((v as { text: unknown }).text ?? '');
      else if (typeof v === 'object' && 'result' in (v as object))
        s = String((v as { result: unknown }).result ?? '');
      else if (typeof v === 'object' && 'richText' in (v as object))
        s = ((v as { richText: { text: string }[] }).richText ?? []).map((t) => t.text).join('');
      else s = String(v);
      cells.push(s.trim());
    }
    out.push(cells);
  });
  return out.filter((r) => r.some((c) => c !== ''));
}

export interface ReadCtx {
  /** storeNameAr (lowercased+trimmed) → merchant id. */
  merchantsByName: Map<string, string>;
  /** Ids that exist right now — an unknown id means the row creates instead. */
  knownIds: Set<string>;
  /** Used when a row leaves the merchant cell empty. */
  defaultMerchantId: string;
  defaultMerchantName: string;
}

/**
 * Read + validate an import file. Every problem is attached to its row and
 * column rather than aborting, so the admin gets one complete report and an
 * error file they can fix and re-upload.
 */
export async function readProductsFile(file: File, ctx: ReadCtx): Promise<ParsedSheet> {
  let table: string[][];
  try {
    table = /\.xlsx?$/i.test(file.name) ? await readXlsx(file) : parseCsv(await file.text());
  } catch {
    return {
      headers: [],
      rows: [],
      valid: [],
      invalid: [],
      fatal: 'تعذّرت قراءة الملف. تأكد أنه Excel (.xlsx) أو CSV بترميز UTF-8.',
    };
  }

  const [headRow, ...body] = table;
  if (!headRow) return { headers: [], rows: [], valid: [], invalid: [], fatal: 'الملف فاضي.' };
  if (!body.length)
    return {
      headers: headRow,
      rows: [],
      valid: [],
      invalid: [],
      fatal: 'الملف فيه صف العناوين فقط — مفيش بيانات.',
    };

  const head = headRow.map((h) => h.trim().toLowerCase());
  const findCol = (c: SheetColumn) => head.indexOf(c.header.toLowerCase());
  const idIdx = head.indexOf(ID_COLUMN.header.toLowerCase());

  const missingRequired = COLUMNS.filter(
    (c) => c.required && c.key !== 'merchant' && findCol(c) < 0,
  );
  if (missingRequired.length) {
    return {
      headers: headRow,
      rows: [],
      valid: [],
      invalid: [],
      fatal: `الملف ناقص أعمدة مطلوبة: ${missingRequired.map((c) => `«${c.header}»`).join('، ')}. نزّل القالب واستخدمه.`,
    };
  }

  const rows: ParsedRow[] = body.map((r, i) => {
    const line = i + 2;
    const errors: ParsedRow['errors'] = [];
    const data: Record<string, unknown> = {};
    const cell = (c: SheetColumn) => {
      const idx = findCol(c);
      return idx < 0 ? '' : (r[idx] ?? '').trim();
    };

    const rawId = idIdx >= 0 ? (r[idIdx] ?? '').trim() : '';
    const id = rawId && ctx.knownIds.has(rawId) ? rawId : undefined;
    if (rawId && !id) {
      errors.push({
        column: ID_COLUMN.header,
        message: `المعرّف «${rawId}» غير موجود في النظام — سيُنشأ منتج جديد بدلاً من التحديث.`,
      });
    }

    // merchant
    const mName = cell(COLUMNS.find((c) => c.key === 'merchant')!);
    let merchantId = ctx.defaultMerchantId;
    let merchantName = ctx.defaultMerchantName;
    if (mName) {
      const found = ctx.merchantsByName.get(mName.toLowerCase());
      if (found) {
        merchantId = found;
        merchantName = mName;
      } else {
        errors.push({
          column: 'التاجر',
          message: `تاجر غير معروف «${mName}» — لازم يطابق اسم تاجر موجود.`,
        });
      }
    } else if (!merchantId) {
      errors.push({
        column: 'التاجر',
        message: 'التاجر فاضي — اختر تاجراً افتراضياً أو املأ العمود.',
      });
    }

    for (const c of COLUMNS) {
      if (c.key === 'merchant') continue;
      const v = cell(c);
      if (c.required && !v && c.key !== 'isAvailable') {
        errors.push({ column: c.header, message: `«${c.header}» مطلوب ومتروك فاضي.` });
        continue;
      }
      if (!v) continue;

      if (c.type === 'number' || c.type === 'int') {
        const n = toNum(v);
        if (!Number.isFinite(n)) {
          errors.push({ column: c.header, message: `«${v}» ليس رقماً.` });
          continue;
        }
        if (n < 0) {
          errors.push({ column: c.header, message: `«${c.header}» لا يقبل قيمة سالبة.` });
          continue;
        }
        if (c.type === 'int' && !Number.isInteger(n)) {
          errors.push({ column: c.header, message: `«${c.header}» لازم يكون رقماً صحيحاً.` });
          continue;
        }
        data[c.key] = n;
      } else if (c.type === 'list') {
        const low = v.toLowerCase();
        if (c.key === 'isAvailable') {
          if (['active', 'متاح', '1', 'true', 'نعم'].includes(low)) data.isAvailable = true;
          else if (['inactive', 'معطّل', 'معطل', '0', 'false', 'لا'].includes(low))
            data.isAvailable = false;
          else
            errors.push({
              column: c.header,
              message: `«${v}» غير مسموح — استخدم active أو inactive.`,
            });
        }
      } else if (c.type === 'url') {
        if (!/^https?:\/\//i.test(v))
          errors.push({ column: c.header, message: 'الرابط لازم يبدأ بـ http أو https.' });
        else data[c.key] = v;
      } else {
        data[c.key] = v;
      }
    }

    if (
      data.salePrice != null &&
      data.price != null &&
      Number(data.salePrice) >= Number(data.price)
    ) {
      errors.push({ column: 'سعر الخصم', message: 'سعر الخصم لازم يكون أقل من السعر.' });
    }
    if (!data.name) data.name = data.nameAr;
    if (data.isAvailable === undefined && !id) data.isAvailable = true;

    return {
      line,
      ...(id ? { id } : {}),
      merchantId,
      merchantName,
      data,
      action: id ? 'update' : 'create',
      errors,
      raw: r,
    };
  });

  return {
    headers: headRow,
    rows,
    valid: rows.filter((r) => r.errors.length === 0),
    invalid: rows.filter((r) => r.errors.length > 0),
  };
}

/** Error report the admin can fix and re-upload. */
export function buildErrorCsv(sheet: ParsedSheet): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['رقم الصف', 'العمود', 'المشكلة', ...sheet.headers].map(esc).join(',');
  const lines = sheet.invalid.flatMap((r) =>
    r.errors.map((e) => [r.line, e.column, e.message, ...r.raw].map(esc).join(',')),
  );
  return '﻿' + [head, ...lines].join('\n');
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  // Chrome ignores a click on a detached anchor, and revoking the object URL
  // in the same tick aborts the transfer before it starts.
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
