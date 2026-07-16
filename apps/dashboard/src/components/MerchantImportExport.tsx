import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Archive,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  FileUp,
  HelpCircle,
  Loader2,
  Upload,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { api } from '../lib/api.js';
import { formatCount } from '../lib/format.js';
import type { ParsedSheet } from '../lib/merchantsSheet.js';
import {
  buildMerchantArchive,
  buildMerchantErrorCsv,
  buildMerchantWorkbook,
  downloadBlob,
  generatePassword,
  readMerchantsFile,
} from '../lib/merchantsSheet.js';
import type { Tone } from '../lib/statusRegistry.js';
import { TONE } from '../lib/statusRegistry.js';
import { Button } from './ui/Button.js';
import { Dialog } from './ui/Dialog.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

/** Created accounts each need a login; the admin has to be able to hand it over. */
interface NewCredential {
  name: string;
  phone: string;
  password: string;
}

export function MerchantExportDialog({
  merchants,
  categoryNames,
  onClose,
}: {
  merchants: Row[];
  categoryNames: string[];
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'archive' | 'reimport'>('archive');
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      if (mode === 'archive') {
        downloadBlob(await buildMerchantArchive(merchants), 'تميم-التجار.xlsx');
      } else {
        downloadBlob(
          await buildMerchantWorkbook({ mode: 'data', withId: true, merchants, categoryNames }),
          'تميم-التجار-للتعديل.xlsx',
        );
      }
      toast.success(`تم تصدير ${formatCount(merchants.length)} تاجر`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل التصدير');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="تصدير التجار"
      description="اختر طريقة استخدام الملف بعد تنزيله."
      size="lg"
    >
      <div className="space-y-3">
        <Choice
          checked={mode === 'archive'}
          onSelect={() => setMode('archive')}
          icon={<Archive className="w-5 h-5" />}
          title="تصدير عادي للاحتفاظ بالبيانات"
          desc="للمراجعة أو الأرشفة. أعمدة واضحة للقراءة بدون حقول تقنية."
        />
        <Choice
          checked={mode === 'reimport'}
          onSelect={() => setMode('reimport')}
          icon={<FileUp className="w-5 h-5" />}
          title="تصدير للتعديل وإعادة الاستيراد"
          desc="نزّل التجار، عدّلهم في Excel، ثم ارفع الملف مرة أخرى لتحديث نفس التجار."
        />

        {mode === 'reimport' && (
          <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 leading-5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              سيتم تضمين المعرّف الفريد لكل تاجر لضمان تحديث نفس التاجر عند إعادة الاستيراد.
              <b> لا تقم بحذف أو تعديل هذا العمود.</b> (العمود مقفول داخل الملف.)
            </span>
          </div>
        )}

        <div className="flex gap-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground leading-5">
          <FileSpreadsheet className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <b className="text-foreground">مفتاح API لا يظهر في أي تصدير</b> — هو سر مشفّر داخل
            النظام ولا يُقرأ حتى من اللوحة. لتغييره استخدم شاشة ربط API. ومواعيد العمل لها شاشة خاصة
            بكل تاجر.
          </span>
        </div>

        <button
          type="button"
          onClick={() => setHelp((h) => !h)}
          className="inline-flex items-center gap-1 text-xs font-bold text-brand-red hover:underline"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          ما الفرق بين النوعين؟
        </button>
        {help && (
          <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground leading-6 space-y-1">
            <div>
              • <b className="text-foreground">التصدير العادي</b> مناسب للحفظ والمراجعة — لا يُستخدم
              لتحديث البيانات.
            </div>
            <div>
              • <b className="text-foreground">التصدير المتوافق مع الاستيراد</b> مناسب للتعديل
              الجماعي، وأعمدته مطابقة تماماً لشاشة الاستيراد.
            </div>
          </div>
        )}

        <div className="rounded-lg bg-muted/40 p-3 text-sm">
          هيتم تصدير <b>{formatCount(merchants.length)}</b> تاجر (حسب الفلاتر الحالية).
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button onClick={() => void run()} disabled={busy || !merchants.length}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            تنزيل الملف
          </Button>
          <Button variant="ghost" onClick={onClose} className="ms-auto">
            إلغاء
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function Choice({
  checked,
  onSelect,
  icon,
  title,
  desc,
}: {
  checked: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={`w-full text-start flex gap-3 rounded-xl border p-3 transition ${
        checked
          ? 'border-brand-red bg-brand-red/5 ring-1 ring-brand-red/30'
          : 'border-border hover:bg-muted/40'
      }`}
    >
      <span
        className={`grid place-items-center w-9 h-9 rounded-lg shrink-0 ${
          checked ? 'bg-brand-red text-white' : 'bg-muted text-muted-foreground'
        }`}
      >
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-bold text-sm">{title}</span>
        <span className="block text-xs text-muted-foreground mt-0.5 leading-5">{desc}</span>
      </span>
      <span
        className={`mt-1 w-4 h-4 rounded-full border-2 shrink-0 ${
          checked ? 'border-brand-red bg-brand-red' : 'border-input'
        }`}
      />
    </button>
  );
}

export function MerchantImportDialog({
  merchants,
  categories,
  onClose,
}: {
  merchants: Row[];
  categories: Row[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [fileName, setFileName] = useState('');
  const [reading, setReading] = useState(false);
  const [busyTpl, setBusyTpl] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{
    created: number;
    updated: number;
    fail: string[];
    creds: NewCredential[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cancelRef = useRef(false);

  const categoryNames = useMemo(
    () => categories.map((c) => String(c.nameAr ?? '')).filter(Boolean),
    [categories],
  );

  // Ids are matched against every merchant, not the filtered page — an export
  // taken under one filter must still be recognised under another.
  const { data: knownIds, isLoading: idsLoading } = useQuery({
    queryKey: ['admin', 'merchants', 'known-ids'],
    queryFn: async () => {
      const ids = new Set<string>();
      for (let page = 1; page <= 50; page++) {
        const r = await api.adminListMerchants({ page, pageSize: 100 });
        (r.items as Row[]).forEach((m) => ids.add(String(m.id)));
        if (!r.items.length || page >= (r.pagination?.totalPages ?? 1)) break;
      }
      return ids;
    },
    staleTime: 300_000,
    refetchInterval: false,
  });

  const template = async (mode: 'blank' | 'example' | 'data') => {
    setBusyTpl(true);
    try {
      downloadBlob(
        await buildMerchantWorkbook({
          mode,
          withId: mode === 'data',
          merchants,
          categoryNames,
        }),
        mode === 'data'
          ? 'تميم-التجار-للتعديل.xlsx'
          : mode === 'example'
            ? 'تميم-قالب-تجار-مع-مثال.xlsx'
            : 'تميم-قالب-تجار-فارغ.xlsx',
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل تجهيز القالب');
    } finally {
      setBusyTpl(false);
    }
  };

  const readFile = async (f: File | undefined) => {
    if (!f) return;
    // Without the id set every row would look new and re-importing an edited
    // export would duplicate the whole merchant list.
    if (!knownIds) {
      toast.error('لم يتم تحميل قائمة التجار بعد — انتظر لحظة وحاول مرة أخرى.');
      return;
    }
    setFileName(f.name);
    setResult(null);
    setSheet(null);
    setReading(true);
    try {
      setSheet(
        await readMerchantsFile(f, {
          categoriesByName: new Map(
            categories.map((c) => [String(c.nameAr ?? '').toLowerCase(), String(c.id)]),
          ),
          knownIds,
        }),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشلت قراءة الملف');
    } finally {
      setReading(false);
    }
  };

  const run = useMutation({
    mutationFn: async () => {
      const valid = sheet?.valid ?? [];
      const fail: string[] = [];
      const creds: NewCredential[] = [];
      let created = 0;
      let updated = 0;

      for (const [i, r] of valid.entries()) {
        if (cancelRef.current) break;
        setProgress({ done: i, total: valid.length });
        const name = String(r.data.storeNameAr ?? '');
        try {
          if (r.action === 'update' && r.id) {
            const { apiUrl: _apiUrl, email: _email, ...patch } = r.data;
            await api.adminUpdateMerchant(r.id, patch);
            updated++;
          } else {
            const cf = r.createFields ?? {};
            // Generated when the sheet leaves it blank: an account with no
            // password can't be created, and putting one in a shared file is
            // worse than handing it over once here.
            const password = String(cf.password ?? '') || generatePassword();
            const { apiUrl: _apiUrl, email: _email, ...rest } = r.data;
            await api.adminCreateMerchant({
              ...rest,
              ownerName: cf.ownerName,
              phone: cf.phone,
              password,
            });
            creds.push({
              name,
              phone: String(cf.phone ?? ''),
              password: cf.password ? '(كما في الملف)' : password,
            });
            created++;
          }
        } catch (e) {
          fail.push(`صف ${r.line} (${name}): ${e instanceof Error ? e.message : 'فشل'}`);
        }
      }
      setProgress({ done: valid.length, total: valid.length });
      return { created, updated, fail, creds };
    },
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ['admin', 'merchants'] });
      if (r.created || r.updated)
        toast.success(`تم إنشاء ${formatCount(r.created)} وتحديث ${formatCount(r.updated)}`);
      if (r.fail.length) toast.error(`فشل ${formatCount(r.fail.length)} صف`);
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => {
      cancelRef.current = false;
    },
  });

  const creates = sheet?.valid.filter((r) => r.action === 'create').length ?? 0;
  const updates = sheet?.valid.filter((r) => r.action === 'update').length ?? 0;
  const canRun = !!sheet?.valid.length && !run.isPending && !result;

  const copyCreds = (creds: NewCredential[]) => {
    const text = creds.map((c) => `${c.name}\t${c.phone}\t${c.password}`).join('\n');
    void navigator.clipboard?.writeText(text).then(
      () => toast.success('تم نسخ البيانات'),
      () => toast.error('تعذّر النسخ'),
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="استيراد التجار"
      description="نزّل قالباً جاهزاً، املأ بياناتك، ثم ارفع الملف."
      size="xl"
    >
      <div className="space-y-4">
        <div>
          <div className="text-sm font-bold mb-2">١. نزّل قالباً</div>
          <div className="grid md:grid-cols-3 gap-2">
            <TplBtn
              busy={busyTpl}
              onClick={() => void template('blank')}
              icon={<FileSpreadsheet className="w-4 h-4" />}
              title="قالب فارغ"
              desc="لإضافة تجار جدد من البداية."
            />
            <TplBtn
              busy={busyTpl}
              onClick={() => void template('example')}
              icon={<FileText className="w-4 h-4" />}
              title="قالب مع مثال"
              desc="يحتوي صفاً نموذجياً يوضح طريقة الإدخال."
            />
            <TplBtn
              busy={busyTpl}
              onClick={() => void template('data')}
              icon={<FileUp className="w-4 h-4" />}
              title="التجار الحاليون للتعديل"
              desc={`${formatCount(merchants.length)} تاجر مع المعرّف الفريد.`}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2 leading-5">
            حمّل نموذجاً جاهزاً يحتوي على الأعمدة المطلوبة ومثالاً توضيحياً، ثم املأ بياناتك وارفع
            الملف. كل قالب فيه شيت «Instructions» بشرح كل عمود.
          </p>
        </div>

        <div>
          <div className="text-sm font-bold mb-2">٢. ارفع الملف</div>
          <div className="rounded-lg border border-dashed border-border p-4 text-center space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv,text/csv"
              className="hidden"
              onChange={(e) => void readFile(e.target.files?.[0])}
            />
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={idsLoading || reading}
            >
              {reading || idsLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              اختر ملف Excel أو CSV
            </Button>
            <p className="text-xs text-muted-foreground">{fileName || 'لم يتم اختيار ملف بعد.'}</p>
          </div>
        </div>

        {sheet?.fatal && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {sheet.fatal}
          </div>
        )}

        {sheet && !sheet.fatal && !result && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Tile tone="green" label="تجار جدد" value={creates} />
              <Tile tone="blue" label="تحديث لموجود" value={updates} />
              <Tile tone="red" label="صفوف بها أخطاء" value={sheet.invalid.length} />
            </div>

            {creates > 0 && (
              <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 leading-5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  هيتم إنشاء <b>{formatCount(creates)}</b> حساب تاجر جديد. أي صف بدون كلمة مرور
                  هيتولّدله واحدة قوية، وهتظهرلك بعد الاستيراد <b>مرة واحدة</b> عشان تسلّمها للتاجر.
                </span>
              </div>
            )}

            {sheet.invalid.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-destructive">
                    الصفوف دي هتتخطى — صحّحها وارفع الملف تاني:
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      downloadBlob(
                        new Blob([buildMerchantErrorCsv(sheet)], {
                          type: 'text/csv;charset=utf-8',
                        }),
                        'تميم-أخطاء-استيراد-التجار.csv',
                      )
                    }
                    className="text-xs font-bold text-brand-red hover:underline inline-flex items-center gap-1 shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    تنزيل ملف الأخطاء
                  </button>
                </div>
                <div className="max-h-32 overflow-y-auto text-xs space-y-0.5">
                  {sheet.invalid.slice(0, 25).map((r) =>
                    r.errors.map((e, i) => (
                      <div key={`${r.line}-${i}`}>
                        <b>صف {formatCount(r.line)}</b> — <b>{e.column}</b>: {e.message}
                      </div>
                    )),
                  )}
                </div>
              </div>
            )}

            {sheet.valid.length > 0 && (
              <div>
                <div className="text-xs font-bold mb-1">
                  معاينة أول {Math.min(5, sheet.valid.length)} صفوف:
                </div>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr className="text-right">
                        <th className="px-2 py-1.5 font-bold">الإجراء</th>
                        <th className="px-2 py-1.5 font-bold">المتجر</th>
                        <th className="px-2 py-1.5 font-bold">المحافظة</th>
                        <th className="px-2 py-1.5 font-bold">الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sheet.valid.slice(0, 5).map((r) => (
                        <tr key={r.line} className="border-t border-border/50">
                          <td className="px-2 py-1.5">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                r.action === 'create' ? TONE.green.badge : TONE.blue.badge
                              }`}
                            >
                              {r.action === 'create' ? 'جديد' : 'تحديث'}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 font-bold">
                            {String(r.data.storeNameAr ?? '')}
                          </td>
                          <td className="px-2 py-1.5">{String(r.data.governorate ?? '—')}</td>
                          <td className="px-2 py-1.5">{r.data.isActive ? 'نشط' : 'غير نشط'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {run.isPending && progress && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold">
                جارٍ الاستيراد… {formatCount(progress.done)} / {formatCount(progress.total)}
              </span>
              <button
                type="button"
                onClick={() => {
                  cancelRef.current = true;
                }}
                className="font-bold text-brand-red hover:underline"
              >
                إلغاء العملية
              </button>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-brand-red transition-[width] duration-200"
                style={{
                  width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`,
                }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              الصفوف اللي خلصت اتحفظت بالفعل — الإلغاء بيوقف الباقي بس.
            </p>
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border p-3 text-sm space-y-1">
              <div className="font-bold text-green-700">
                ✓ تم إنشاء {formatCount(result.created)} تاجر وتحديث {formatCount(result.updated)}.
              </div>
              {result.fail.length > 0 && (
                <div className="text-xs text-destructive space-y-0.5 max-h-32 overflow-y-auto">
                  <div className="font-bold">فشل {formatCount(result.fail.length)}:</div>
                  {result.fail.slice(0, 20).map((f) => (
                    <div key={f}>• {f}</div>
                  ))}
                </div>
              )}
            </div>

            {result.creds.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-amber-900">
                    بيانات دخول التجار الجدد — تظهر مرة واحدة فقط:
                  </span>
                  <button
                    type="button"
                    onClick={() => copyCreds(result.creds)}
                    className="text-xs font-bold text-brand-red hover:underline inline-flex items-center gap-1 shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    نسخ الكل
                  </button>
                </div>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-amber-200 bg-white">
                  <table className="w-full text-xs">
                    <thead className="bg-amber-100/60 text-amber-900">
                      <tr className="text-right">
                        <th className="px-2 py-1.5 font-bold">المتجر</th>
                        <th className="px-2 py-1.5 font-bold">رقم الدخول</th>
                        <th className="px-2 py-1.5 font-bold">كلمة المرور</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.creds.map((c, i) => (
                        <tr key={i} className="border-t border-amber-100">
                          <td className="px-2 py-1.5 font-bold">{c.name}</td>
                          <td className="px-2 py-1.5 font-mono" dir="ltr">
                            {c.phone}
                          </td>
                          <td className="px-2 py-1.5 font-mono" dir="ltr">
                            {c.password}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-amber-900 leading-4">
                  انسخها دلوقتي — مش هتقدر تشوفها تاني بعد ما تقفل النافذة، والنظام بيخزّنها مشفّرة.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          {!result && (
            <Button onClick={() => run.mutate()} disabled={!canRun}>
              {run.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {run.isPending
                ? 'جارٍ الاستيراد…'
                : `استيراد ${sheet?.valid.length ? formatCount(sheet.valid.length) + ' صف' : ''}`}
            </Button>
          )}
          <Button variant={result ? 'primary' : 'ghost'} onClick={onClose} className="ms-auto">
            {result ? 'تم' : 'إلغاء'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function TplBtn({
  busy,
  onClick,
  icon,
  title,
  desc,
}: {
  busy: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="text-start rounded-lg border border-border p-2.5 hover:bg-muted/40 hover:border-brand-red/40 transition disabled:opacity-60"
    >
      <span className="inline-flex items-center gap-1.5 font-bold text-sm text-brand-dark">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
        {title}
      </span>
      <span className="block text-[11px] text-muted-foreground mt-0.5 leading-4">{desc}</span>
    </button>
  );
}

function Tile({ tone, label, value }: { tone: Tone; label: string; value: number }) {
  return (
    <div className={`rounded-lg p-2.5 ${TONE[tone].soft}`}>
      <div className="text-lg font-black">{formatCount(value)}</div>
      <div className="text-[11px] font-bold opacity-80">{label}</div>
    </div>
  );
}
