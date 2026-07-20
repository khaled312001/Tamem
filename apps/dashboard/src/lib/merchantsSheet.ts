/**
 * Merchants spreadsheet — template, export and import share one column list so
 * a file produced here always round-trips.
 *
 * Deliberately NOT included:
 *   - API Key. The token is stored encrypted and the API never returns it;
 *     exporting it would mean decrypting integration secrets into a file that
 *     gets emailed around. It is import-only (write, never read back).
 *   - Working hours. They live in their own per-day table with their own
 *     screen; flattening a week into one cell round-trips badly.
 *   - "Business type". No such field exists — a merchant has a Category.
 *
 * exceljs is loaded dynamically so its ~900KB only lands when an admin opens
 * export/import.
 */

import { parseCsv, toNum } from './productsSheet.js';

export { downloadBlob } from './productsSheet.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

type ColType = 'id' | 'text' | 'number' | 'int' | 'list' | 'url' | 'secret';

interface SheetColumn {
  key: string;
  header: string;
  width: number;
  type: ColType;
  /** Required when creating. Updates only validate what's present. */
  required: boolean;
  /** Only needed to create a new merchant, ignored on update. */
  createOnly?: boolean;
  example: string;
  help: string;
  values?: string[];
}

export const ID_COLUMN: SheetColumn = {
  key: 'id',
  header: 'Merchant ID',
  width: 28,
  type: 'id',
  required: false,
  example: '(يُملأ تلقائياً)',
  help: 'المعرّف الفريد للتاجر. لا تحذفه ولا تعدّله — النظام يستخدمه لتحديث التاجر الصحيح. الصفوف بدون معرّف تُنشأ كتجار جدد.',
};

export const COLUMNS: SheetColumn[] = [
  {
    key: 'storeNameAr',
    header: 'اسم المتجر بالعربية',
    width: 26,
    type: 'text',
    required: true,
    example: 'مطعم الأصيل',
    help: 'مطلوب. اسم المتجر كما يظهر للعميل.',
  },
  {
    key: 'storeName',
    header: 'اسم المتجر بالإنجليزية',
    width: 24,
    type: 'text',
    required: true,
    example: 'Al Aseel Restaurant',
    help: 'مطلوب.',
  },
  {
    key: 'category',
    header: 'التصنيف',
    width: 18,
    type: 'list',
    required: true,
    example: '(اختر من القائمة)',
    help: 'مطلوب. يجب أن يطابق اسم تصنيف موجود — اختر من القائمة المنسدلة.',
  },
  {
    key: 'ownerName',
    header: 'اسم المسؤول',
    width: 20,
    type: 'text',
    required: true,
    createOnly: true,
    example: 'أحمد محمد',
    help: 'مطلوب عند إضافة تاجر جديد. عند التحديث، اتركه فاضياً لو مش عايز تغيّره.',
  },
  {
    key: 'ownerPhone',
    header: 'هاتف المسؤول (الدخول)',
    width: 20,
    type: 'text',
    required: true,
    createOnly: true,
    example: '01012345678',
    help: 'مطلوب عند الإضافة — ده رقم دخول التاجر ولا يتكرر. مصري: 010/011/012/015.',
  },
  {
    key: 'storePhone',
    header: 'هاتف المتجر',
    width: 18,
    type: 'text',
    required: false,
    example: '01098765432',
    help: 'اختياري. الرقم المعلن للعملاء لو مختلف عن رقم المسؤول.',
  },
  {
    key: 'email',
    header: 'البريد الإلكتروني',
    width: 24,
    type: 'text',
    required: false,
    example: 'store@example.com',
    help: 'اختياري.',
  },
  {
    key: 'addressLine',
    header: 'العنوان',
    width: 34,
    type: 'text',
    required: true,
    example: 'شارع الجمهورية، أمام المستشفى',
    help: 'مطلوب. العنوان التفصيلي.',
  },
  {
    key: 'governorate',
    header: 'المحافظة',
    width: 14,
    type: 'text',
    required: true,
    example: 'قنا',
    help: 'مطلوب.',
  },
  {
    key: 'city',
    header: 'المدينة / المركز',
    width: 16,
    type: 'text',
    required: true,
    example: 'قفط',
    help: 'مطلوب.',
  },
  {
    key: 'lat',
    header: 'خط العرض',
    width: 14,
    type: 'number',
    required: true,
    example: '26.0195',
    help: 'مطلوب. رقم عشري — انسخه من خرائط جوجل. مصر تقريباً بين 22 و32.',
  },
  {
    key: 'lng',
    header: 'خط الطول',
    width: 14,
    type: 'number',
    required: true,
    example: '32.8145',
    help: 'مطلوب. رقم عشري. مصر تقريباً بين 24 و37.',
  },
  {
    key: 'status',
    header: 'الحالة',
    width: 12,
    type: 'list',
    required: true,
    example: 'active',
    values: ['active', 'inactive'],
    help: 'مطلوب. active = التاجر يقدر يشتغل، inactive = موقوف.',
  },
  {
    key: 'commissionPct',
    header: 'نسبة العمولة %',
    width: 14,
    type: 'number',
    required: false,
    example: '10',
    help: 'اختياري. رقم من 0 إلى 100.',
  },
  {
    key: 'logoUrl',
    header: 'رابط اللوجو',
    width: 34,
    type: 'url',
    required: false,
    example: 'https://example.com/logo.png',
    help: 'اختياري. رابط كامل يبدأ بـ https. للرفع من جهازك استخدم نموذج التاجر.',
  },
  {
    key: 'apiUrl',
    header: 'رابط API',
    width: 34,
    type: 'url',
    required: false,
    example: 'https://api.example.com/products',
    help: 'اختياري. رابط منتجات التاجر لو عنده تكامل.',
  },
  {
    key: 'description',
    header: 'وصف مختصر',
    width: 34,
    type: 'text',
    required: false,
    example: 'مطعم مأكولات شرقية',
    help: 'اختياري.',
  },
];

const columnsFor = (withId: boolean): SheetColumn[] => (withId ? [ID_COLUMN, ...COLUMNS] : COLUMNS);

/** Plain archive export — readable, and never carries a secret. */
const ARCHIVE_COLUMNS: { header: string; width: number; get: (m: Row) => unknown }[] = [
  { header: 'اسم المتجر', width: 26, get: (m) => m.storeNameAr ?? '' },
  { header: 'English', width: 24, get: (m) => m.storeName ?? '' },
  { header: 'التصنيف', width: 18, get: (m) => m.category?.nameAr ?? '' },
  { header: 'المسؤول', width: 20, get: (m) => m.user?.name ?? '' },
  { header: 'هاتف المسؤول', width: 18, get: (m) => m.user?.phone ?? '' },
  { header: 'هاتف المتجر', width: 18, get: (m) => m.phone ?? '' },
  { header: 'البريد الإلكتروني', width: 24, get: (m) => m.user?.email ?? '' },
  { header: 'العنوان', width: 34, get: (m) => m.addressLine ?? '' },
  { header: 'المحافظة', width: 14, get: (m) => m.governorate ?? '' },
  { header: 'المدينة', width: 14, get: (m) => m.city ?? '' },
  { header: 'عدد المنتجات', width: 14, get: (m) => Number(m._count?.products ?? 0) },
  { header: 'مرتبط API', width: 12, get: (m) => (m.apiConfig ? 'نعم' : 'لا') },
  { header: 'الحالة', width: 12, get: (m) => (m.user?.isActive ? 'نشط' : 'غير نشط') },
];

const HEADER_FILL = 'FF1F2937';
const REQUIRED_FILL = 'FFFDECEC';
const EXAMPLE_FILL = 'FFFFF7E6';
const ID_FILL = 'FFEEF2FF';
const SPARE_ROWS = 100;

type DataValidationRule = Record<string, unknown>;
/** exceljs exposes range validation at runtime but omits it from its types. */
function addValidation(ws: unknown, range: string, rule: DataValidationRule) {
  (
    ws as { dataValidations: { add: (r: string, v: DataValidationRule) => void } }
  ).dataValidations.add(range, rule);
}

function cellValue(m: Row, c: SheetColumn): unknown {
  switch (c.key) {
    case 'id':
      return m.id ?? '';
    case 'category':
      return m.category?.nameAr ?? '';
    case 'ownerName':
      return m.user?.name ?? '';
    case 'ownerPhone':
      return m.user?.phone ?? '';
    case 'email':
      return m.user?.email ?? '';
    case 'storePhone':
      return m.phone ?? '';
    case 'status':
      return m.user?.isActive ? 'active' : 'inactive';
    case 'lat':
    case 'lng':
      return m[c.key] == null ? '' : Number(m[c.key]);
    case 'commissionPct':
      return m.commissionPct == null ? '' : Number(m.commissionPct);
    case 'apiUrl':
      return m.apiConfig?.apiUrl ?? '';
    default:
      return m[c.key] ?? '';
  }
}

export type BuildOpts = {
  mode: 'blank' | 'example' | 'data';
  withId: boolean;
  merchants?: Row[];
  categoryNames: string[];
};

export async function buildMerchantWorkbook(opts: BuildOpts): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'تميم للتوصيل';

  const cols = columnsFor(opts.withId);
  const ws = wb.addWorksheet('التجار', {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
  });

  // Category names go on a hidden sheet — an inline dropdown list breaks the
  // moment a name contains a comma.
  const lists = wb.addWorksheet('Lists');
  lists.state = 'veryHidden';
  opts.categoryNames.forEach((n, i) => {
    lists.getCell(i + 1, 1).value = n;
  });

  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width }));

  const head = ws.getRow(1);
  head.height = 26;
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
    (opts.mode === 'data' ? (opts.merchants ?? []).length : opts.mode === 'example' ? 1 : 0) +
    1 +
    SPARE_ROWS;

  const dataRows: Row[] =
    opts.mode === 'data' ? (opts.merchants ?? []) : opts.mode === 'example' ? [null] : [];

  dataRows.forEach((m, ri) => {
    const row = ws.getRow(ri + 2);
    cols.forEach((c, ci) => {
      row.getCell(ci + 1).value =
        opts.mode === 'example'
          ? c.type === 'id'
            ? ''
            : c.key === 'category'
              ? (opts.categoryNames[0] ?? c.example)
              : c.example
          : (cellValue(m, c) as never);
    });
    if (opts.mode === 'example') {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXAMPLE_FILL } };
        cell.font = { italic: true, color: { argb: 'FF92400E' } };
      });
      const note = ws.getCell(ri + 2, cols.length + 1);
      note.value = '⬅ صف مثال توضيحي — احذفه قبل رفع الملف';
      note.font = { bold: true, color: { argb: 'FFB45309' } };
    }
  });

  cols.forEach((c, ci) => {
    if (!c.required) return;
    for (let r = 2; r <= lastRow; r++) {
      if (opts.mode === 'example' && r === 2) continue;
      ws.getCell(r, ci + 1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: REQUIRED_FILL },
      };
    }
  });

  const colLetter = (i: number) => ws.getColumn(i + 1).letter;
  cols.forEach((c, ci) => {
    const L = colLetter(ci);
    const range = `${L}2:${L}${lastRow}`;
    if (c.key === 'status') {
      addValidation(ws, range, {
        type: 'list',
        allowBlank: false,
        formulae: [`"${(c.values ?? []).join(',')}"`],
        showErrorMessage: true,
        errorStyle: 'error',
        errorTitle: 'قيمة غير مسموحة',
        error: 'اختر active أو inactive فقط.',
      });
    } else if (c.key === 'category' && opts.categoryNames.length) {
      addValidation(ws, range, {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$A$1:$A$${opts.categoryNames.length}`],
        showErrorMessage: true,
        errorStyle: 'error',
        errorTitle: 'تصنيف غير معروف',
        error: 'اختر تصنيفاً من القائمة المنسدلة.',
      });
    } else if (c.type === 'number' || c.type === 'int') {
      addValidation(ws, range, {
        type: c.type === 'int' ? 'whole' : 'decimal',
        operator: 'between',
        allowBlank: !c.required,
        // Wide enough for coordinates and a percentage alike; the import does
        // the precise range checks and reports them per row.
        formulae: [-180, 180],
        showErrorMessage: true,
        errorStyle: 'error',
        errorTitle: 'رقم غير صالح',
        error: 'أدخل رقماً — بدون نصوص.',
      });
    }
  });

  if (opts.withId) {
    for (let r = 1; r <= lastRow; r++) {
      for (let c = 1; c <= cols.length; c++) ws.getCell(r, c).protection = { locked: c === 1 };
      if (r > 1)
        ws.getCell(r, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ID_FILL } };
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

  buildInstructions(wb, cols, opts.withId);

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildInstructions(wb: any, cols: SheetColumn[], withId: boolean) {
  const ws = wb.addWorksheet('Instructions', { views: [{ rightToLeft: true }] });
  ws.columns = [
    { header: 'العمود', key: 'c', width: 26 },
    { header: 'مطلوب؟', key: 'r', width: 14 },
    { header: 'نوع البيانات', key: 't', width: 22 },
    { header: 'مثال', key: 'e', width: 30 },
    { header: 'ملاحظات', key: 'n', width: 74 },
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
    number: 'رقم',
    int: 'رقم صحيح',
    list: 'اختيار من قائمة',
    url: 'رابط https',
    secret: 'نص (لا يُصدَّر)',
  };

  cols.forEach((c) => {
    const row = ws.addRow({
      c: c.header,
      r: c.required ? (c.createOnly ? 'مطلوب للجديد' : 'مطلوب') : 'اختياري',
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
    'املأ بياناتك في شيت «التجار» ثم ارفع الملف من شاشة استيراد التجار.',
    'صف المثال (الملوّن) توضيحي فقط — احذفه قبل الرفع.',
    'الحقول المطلوبة ملوّنة بالأحمر الخفيف.',
    'الأعمدة وترتيبها متطابقة مع شاشة الاستيراد — لا تغيّر أسماء الأعمدة.',
    'مفتاح API لا يظهر في أي تصدير لأنه سر مشفّر. لتغييره استخدم شاشة ربط API للتاجر.',
    'مواعيد العمل لها شاشة خاصة بكل تاجر ولا تُستورد من هنا.',
    withId
      ? 'عمود Merchant ID مقفول: النظام يستخدمه لتحديث التاجر الصحيح. لو حذفته، الصف هيتعامل كتاجر جديد ويطلب اسم المسؤول ورقم هاتفه.'
      : 'هذا القالب لإضافة تجار جدد. لتحديث تجار موجودين استخدم «تصدير للتعديل وإعادة الاستيراد».',
  ];
  notes.forEach((t, i) => {
    const row = ws.addRow({ c: i === 0 ? 'تعليمات عامة' : '', n: t });
    row.getCell(1).font = { bold: true };
    row.getCell(5).alignment = { wrapText: true };
  });
}

export async function buildMerchantArchive(merchants: Row[]): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'تميم للتوصيل';
  const ws = wb.addWorksheet('التجار', {
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
  merchants.forEach((m) => ws.addRow(ARCHIVE_COLUMNS.map((c) => c.get(m))));
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ARCHIVE_COLUMNS.length } };
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// ── Reading ──

export interface ParsedRow {
  line: number;
  id?: string;
  data: Record<string, unknown>;
  /** Populated on create only — not part of the merchant patch. */
  createFields?: Record<string, unknown>;
  action: 'create' | 'update';
  errors: { column: string; message: string }[];
  raw: string[];
}

export interface ParsedSheet {
  headers: string[];
  rows: ParsedRow[];
  valid: ParsedRow[];
  invalid: ParsedRow[];
  fatal?: string;
}

export interface ReadCtx {
  /** nameAr (lowercased) → category id. */
  categoriesByName: Map<string, string>;
  knownIds: Set<string>;
}

async function readXlsx(file: File): Promise<string[][]> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.getWorksheet('التجار') ?? wb.worksheets[0];
  if (!ws) return [];
  const out: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let i = 1; i <= Math.max(row.cellCount, 1); i++) {
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

/** Egyptian mobile, normalised to +20… — the API rejects anything else. */
function normalisePhone(raw: string): string | null {
  const cleaned = raw.replace(/[\s\-()]/g, '');
  const m = /^(?:\+?20|0)?(1[0125]\d{8})$/.exec(cleaned);
  return m ? `+20${m[1]}` : null;
}

/** Only used when a new merchant arrives without one. Never exported. */
export function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export async function readMerchantsFile(file: File, ctx: ReadCtx): Promise<ParsedSheet> {
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
  const idx = (c: SheetColumn) => head.indexOf(c.header.toLowerCase());
  const idIdx = head.indexOf(ID_COLUMN.header.toLowerCase());

  const missing = COLUMNS.filter((c) => c.required && !c.createOnly && idx(c) < 0);
  if (missing.length) {
    return {
      headers: headRow,
      rows: [],
      valid: [],
      invalid: [],
      fatal: `الملف ناقص أعمدة مطلوبة: ${missing.map((c) => `«${c.header}»`).join('، ')}. نزّل القالب واستخدمه.`,
    };
  }

  const rows: ParsedRow[] = body.map((r, i) => {
    const line = i + 2;
    const errors: ParsedRow['errors'] = [];
    const data: Record<string, unknown> = {};
    const createFields: Record<string, unknown> = {};
    const cell = (c: SheetColumn) => {
      const j = idx(c);
      return j < 0 ? '' : (r[j] ?? '').trim();
    };

    const rawId = idIdx >= 0 ? (r[idIdx] ?? '').trim() : '';
    const id = rawId && ctx.knownIds.has(rawId) ? rawId : undefined;
    if (rawId && !id) {
      errors.push({
        column: ID_COLUMN.header,
        message: `المعرّف «${rawId}» غير موجود في النظام — سيُنشأ تاجر جديد بدلاً من التحديث.`,
      });
    }
    const isCreate = !id;

    for (const c of COLUMNS) {
      const v = cell(c);
      const needed = c.required && (isCreate || !c.createOnly);
      if (needed && !v) {
        errors.push({ column: c.header, message: `«${c.header}» مطلوب ومتروك فاضي.` });
        continue;
      }
      if (!v) continue;

      switch (c.key) {
        case 'category': {
          const found = ctx.categoriesByName.get(v.toLowerCase());
          if (!found)
            errors.push({
              column: c.header,
              message: `تصنيف غير معروف «${v}» — لازم يطابق تصنيفاً موجوداً.`,
            });
          else data.categoryId = found;
          break;
        }
        case 'status':
          data.isActive = ['active', 'نشط', '1', 'true'].includes(v.toLowerCase());
          break;
        case 'ownerPhone': {
          const ph = normalisePhone(v);
          if (!ph)
            errors.push({
              column: c.header,
              message: `رقم غير صالح «${v}» — لازم يكون موبايل مصري.`,
            });
          else if (isCreate) createFields.phone = ph;
          else data.ownerPhone = ph;
          break;
        }
        case 'storePhone': {
          const ph = normalisePhone(v);
          if (!ph) errors.push({ column: c.header, message: `رقم غير صالح «${v}».` });
          else data.storePhone = ph;
          break;
        }
        case 'ownerName':
          if (isCreate) createFields.ownerName = v;
          else data.ownerName = v;
          break;
        case 'lat':
        case 'lng': {
          const n = toNum(v);
          const [lo, hi] = c.key === 'lat' ? [-90, 90] : [-180, 180];
          if (!Number.isFinite(n)) errors.push({ column: c.header, message: `«${v}» ليس رقماً.` });
          else if (n < lo || n > hi)
            errors.push({
              column: c.header,
              message: `«${v}» خارج النطاق المسموح (${lo} إلى ${hi}).`,
            });
          else data[c.key] = n;
          break;
        }
        case 'commissionPct': {
          const n = toNum(v);
          if (!Number.isFinite(n) || n < 0 || n > 100)
            errors.push({ column: c.header, message: `«${v}» لازم يكون رقماً من 0 إلى 100.` });
          else data.commissionPct = n;
          break;
        }
        case 'apiUrl':
        case 'logoUrl':
          if (!/^https?:\/\//i.test(v))
            errors.push({ column: c.header, message: 'الرابط لازم يبدأ بـ http أو https.' });
          else if (c.key === 'logoUrl') data.logoUrl = v;
          else data.apiUrl = v;
          break;
        case 'email':
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v))
            errors.push({ column: c.header, message: `بريد غير صالح «${v}».` });
          else data.email = v;
          break;
        default:
          data[c.key] = v;
      }
    }

    // Creating an account needs a login; without one there is nothing to make.
    if (
      isCreate &&
      !createFields.phone &&
      !errors.some((e) => e.column === 'هاتف المسؤول (الدخول)')
    ) {
      errors.push({
        column: 'هاتف المسؤول (الدخول)',
        message: 'مطلوب لإنشاء حساب تاجر جديد.',
      });
    }

    return {
      line,
      ...(id ? { id } : {}),
      data,
      ...(isCreate ? { createFields } : {}),
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

export function buildMerchantErrorCsv(sheet: ParsedSheet): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['رقم الصف', 'العمود', 'المشكلة', ...sheet.headers].map(esc).join(',');
  const lines = sheet.invalid.flatMap((r) =>
    r.errors.map((e) => [r.line, e.column, e.message, ...r.raw].map(esc).join(',')),
  );
  return '﻿' + [head, ...lines].join('\n');
}
