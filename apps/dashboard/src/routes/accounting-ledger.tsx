/** «الحركات اليومية» and «المصروفات الثابتة والأقساط» tabs of the accounting page. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Loader2, Lock, Paperclip, Pencil, Plus, Power, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  downloadCsv,
  errMsg,
  ExportButtons,
  KIND_HINT,
  KIND_LABEL,
  KIND_TONE,
  METHOD_LABEL,
  money,
  monthEnd,
  MonthNav,
  monthLabel,
  Panel,
  PARTY_LABEL,
  uploadReceipt,
  type Entry,
  type Kind,
  type Meta,
  type Method,
} from '../components/accounting/kit.js';
import { Button } from '../components/ui/Button.js';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js';
import { Dialog } from '../components/ui/Dialog.js';
import { api } from '../lib/api.js';
import { cn } from '../lib/utils.js';
import { PrivateImage } from './shift-booking.js';

const inputCls = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm';
const KINDS: Kind[] = ['EXPENSE', 'INCOME', 'ADVANCE', 'WITHDRAWAL', 'CAPITAL'];

interface EntriesData {
  from: string;
  to: string;
  rows: Entry[];
  totals: Record<Kind, number>;
  truncated: boolean;
}

export function LedgerTab({ meta }: { meta: Meta }) {
  const qc = useQueryClient();
  const [from, setFrom] = useState(meta.thisMonth + '-01');
  // Through the month's end, so a cost dated later this month (an installment on the 30th) shows.
  const [to, setTo] = useState(monthEnd(meta.thisMonth));
  const [kind, setKind] = useState<'' | Kind>('');
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Entry | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Entry | null>(null);
  const params = {
    from,
    to,
    kind: kind || undefined,
    category: category || undefined,
    q: q.trim() || undefined,
  };
  const { data, isLoading, error } = useQuery({
    queryKey: ['acct', 'entries', params],
    queryFn: () =>
      api.raw.get('/admin/accounting/entries', { params }).then((r) => r.data.data as EntriesData),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.raw.delete(`/admin/accounting/entries/${id}`),
    onSuccess: () => {
      toast.success('اتمسحت الحركة');
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ['acct'] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const cats = kind
    ? meta.categories[kind]
    : [...new Set(KINDS.flatMap((k) => meta.categories[k]))];

  const csv = () =>
    downloadCsv(`حركات ${from} إلى ${to}`, [
      ['التاريخ', 'النوع', 'البند', 'المبلغ', 'طريقة الدفع', 'على مين', 'ملاحظة', 'سجّلها'],
      ...(data?.rows ?? []).map((r) => [
        r.entryDate,
        KIND_LABEL[r.kind],
        r.category,
        r.amount,
        METHOD_LABEL[r.method],
        r.partyName ?? '',
        r.note ?? '',
        r.createdByName ?? '',
      ]),
    ]);

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-end gap-2" data-print="hide">
          <label className="text-xs font-bold">
            من
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={cn(inputCls, 'mt-1 w-40')}
            />
          </label>
          <label className="text-xs font-bold">
            لحد
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={cn(inputCls, 'mt-1 w-40')}
            />
          </label>
          <label className="text-xs font-bold">
            النوع
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as '' | Kind);
                setCategory('');
              }}
              className={cn(inputCls, 'mt-1 w-36')}
            >
              <option value="">الكل</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold">
            البند
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={cn(inputCls, 'mt-1 w-44')}
            >
              <option value="">الكل</option>
              {cats.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1 text-xs font-bold">
            بحث
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ملاحظة، اسم، بند…"
              className={cn(inputCls, 'mt-1 min-w-40')}
            />
          </label>
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> حركة جديدة
          </Button>
          <ExportButtons onCsv={csv} />
        </div>
      </Panel>
      {data && (
        <div className="flex flex-wrap gap-2 text-xs">
          {KINDS.filter((k) => data.totals[k] > 0).map((k) => (
            <span key={k} className={cn('rounded-full border px-3 py-1 font-bold', KIND_TONE[k])}>
              {KIND_LABEL[k]}: {money(data.totals[k])}
            </span>
          ))}
        </div>
      )}
      <Panel>
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-brand-red" />
          </div>
        ) : error || !data ? (
          <p className="text-sm text-destructive">{errMsg(error)}</p>
        ) : data.rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">مفيش حركات في الفترة دي.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 text-start">التاريخ</th>
                  <th className="py-2 text-start">النوع</th>
                  <th className="py-2 text-start">البند</th>
                  <th className="py-2 text-start">على مين</th>
                  <th className="py-2 text-start">الطريقة</th>
                  <th className="py-2 text-start">المبلغ</th>
                  <th className="py-2 text-start">ملاحظة</th>
                  <th className="py-2" data-print="hide" />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 align-top">
                    <td className="py-2 tabular-nums">{r.entryDate.slice(5).replace('-', '/')}</td>
                    <td className="py-2">
                      <span
                        className={cn(
                          'rounded-full border px-2 py-0.5 text-xs font-bold',
                          KIND_TONE[r.kind],
                        )}
                      >
                        {KIND_LABEL[r.kind]}
                      </span>
                    </td>
                    <td className="py-2 font-bold">{r.category}</td>
                    <td className="py-2">{r.partyName ?? '—'}</td>
                    <td className="py-2 text-muted-foreground">{METHOD_LABEL[r.method]}</td>
                    <td className="py-2 font-black tabular-nums">{money(r.amount)}</td>
                    <td className="max-w-[16rem] py-2 text-muted-foreground">
                      {r.note}
                      {r.receipt && <ReceiptLink value={r.receipt} />}
                    </td>
                    <td className="py-2" data-print="hide">
                      {r.locked ? (
                        <span title="الفترة دي متقفلة" className="text-muted-foreground">
                          <Lock className="h-4 w-4" />
                        </span>
                      ) : (
                        <span className="flex gap-1.5">
                          <button
                            title="تعديل"
                            onClick={() => setEditing(r)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            title="مسح"
                            onClick={() => setDeleting(r)}
                            className="text-red-500"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.truncated && (
              <p className="mt-2 text-xs text-amber-700">ظاهر أول 3000 حركة بس. ضيّق الفترة.</p>
            )}
          </div>
        )}
      </Panel>
      {editing && (
        <EntryDialog
          meta={meta}
          entry={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="تمسح الحركة دي؟"
        message={
          deleting
            ? `${KIND_LABEL[deleting.kind]} · ${deleting.category} · ${money(deleting.amount)}`
            : ''
        }
        confirmLabel="امسح"
        loading={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting.id)}
      />
    </div>
  );
}

function ReceiptLink({ value }: { value: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="ms-1 inline-flex items-center gap-0.5 text-xs font-bold text-brand-red"
      >
        <Paperclip className="h-3 w-3" /> إيصال
      </button>
      {open && (
        <Dialog open onOpenChange={setOpen} title="الإيصال" size="lg">
          <ReceiptView value={value} />
        </Dialog>
      )}
    </>
  );
}

function ReceiptView({ value }: { value: string }) {
  if (value.endsWith('.pdf')) return <PrivatePdf refId={value} />;
  if (value.startsWith('private:'))
    return (
      <PrivateImage
        refId={value}
        alt="إيصال"
        className="max-h-[70vh] w-full rounded-lg object-contain"
      />
    );
  return <img src={value} alt="إيصال" className="max-h-[70vh] w-full rounded-lg object-contain" />;
}

function PrivatePdf({ refId }: { refId: string }) {
  const { data: src } = useQuery({
    queryKey: ['private-file', refId],
    queryFn: () =>
      api.raw
        .get('/admin/private-file', { params: { ref: refId }, responseType: 'blob' })
        .then((r) => URL.createObjectURL(r.data as Blob)),
    staleTime: Infinity,
  });
  if (!src) return <Loader2 className="mx-auto h-5 w-5 animate-spin" />;
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-bold text-brand-red"
    >
      <FileText className="h-4 w-4" /> افتح ملف الـ PDF
    </a>
  );
}

function EntryDialog({
  meta,
  entry,
  onClose,
}: {
  meta: Meta;
  entry: Entry | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<Kind>(entry?.kind ?? 'EXPENSE');
  const [category, setCategory] = useState(entry?.category ?? meta.categories.EXPENSE[0] ?? '');
  const [amount, setAmount] = useState(entry ? String(entry.amount) : '');
  const [date, setDate] = useState(entry?.entryDate ?? meta.today);
  const [method, setMethod] = useState<Method>(entry?.method ?? 'CASH');
  const [party, setParty] = useState(
    entry?.partyType && entry.partyId ? `${entry.partyType}:${entry.partyId}` : '',
  );
  const [note, setNote] = useState(entry?.note ?? '');
  const [receipt, setReceipt] = useState<string | null>(entry?.receipt ?? null);
  const [uploading, setUploading] = useState(false);

  // Who the entry can be for, by kind.
  const partyOptions = useMemo(() => {
    const active = meta.parties.filter((p) => p.isActive || `${p.type}:${p.id}` === party);
    const emp = active
      .filter((p) => p.type === 'EMPLOYEE')
      .map((p) => ({ v: `EMPLOYEE:${p.id}`, l: p.name, g: 'الموظفين' }));
    const partners = active
      .filter((p) => p.type !== 'EMPLOYEE')
      .map((p) => ({ v: `${p.type}:${p.id}`, l: p.name, g: 'الشركاء والمستثمرين' }));
    const drv = meta.drivers.map((d) => ({ v: `DRIVER:${d.id}`, l: d.name, g: 'المناديب' }));
    if (kind === 'ADVANCE') return [...emp, ...drv];
    if (kind === 'WITHDRAWAL' || kind === 'CAPITAL') return partners;
    if (kind === 'EXPENSE') return [...emp, ...drv];
    return [];
  }, [kind, meta, party]);
  const partyRequired = kind === 'ADVANCE' || kind === 'WITHDRAWAL' || kind === 'CAPITAL';

  const save = useMutation({
    mutationFn: () => {
      const [pt, pid] = party ? party.split(':') : [null, null];
      const body = {
        kind,
        category: category.trim(),
        amount: Number(amount),
        entryDate: date,
        method,
        partyType: pt,
        partyId: pid,
        note: note.trim(),
        receipt,
      };
      return entry
        ? api.raw.patch(`/admin/accounting/entries/${entry.id}`, body)
        : api.raw.post('/admin/accounting/entries', body);
    },
    onSuccess: () => {
      toast.success(entry ? 'اتعدلت الحركة' : 'اتسجلت الحركة');
      qc.invalidateQueries({ queryKey: ['acct'] });
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const pickKind = (k: Kind) => {
    setKind(k);
    setCategory(meta.categories[k][0] ?? '');
    setParty('');
  };
  const onFile = async (f?: File) => {
    if (!f) return;
    setUploading(true);
    try {
      setReceipt(await uploadReceipt(f));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setUploading(false);
    }
  };
  const valid = Number(amount) > 0 && !!date && (!partyRequired || !!party) && !uploading;

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={entry ? 'تعديل حركة' : 'حركة جديدة'}
      size="lg"
    >
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => (
            <button
              key={k}
              onClick={() => pickKind(k)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs font-bold',
                kind === k
                  ? KIND_TONE[k] + ' ring-2 ring-offset-1 ring-current'
                  : 'border-border bg-card',
              )}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{KIND_HINT[kind]}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="font-bold">
            المبلغ (ج.م)
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={cn(inputCls, 'mt-1 text-lg font-black')}
              dir="ltr"
            />
          </label>
          <label className="font-bold">
            التاريخ
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={cn(inputCls, 'mt-1')}
            />
          </label>
          <label className="font-bold">
            البند
            <input
              list="acct-cats"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="اختار أو اكتب بند جديد"
              className={cn(inputCls, 'mt-1')}
            />
            <datalist id="acct-cats">
              {meta.categories[kind].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="font-bold">
            طريقة الدفع
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as Method)}
              className={cn(inputCls, 'mt-1')}
            >
              {(Object.keys(METHOD_LABEL) as Method[]).map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
          {partyOptions.length > 0 && (
            <label className="font-bold sm:col-span-2">
              على مين{' '}
              {partyRequired ? (
                <span className="text-destructive">*</span>
              ) : (
                <span className="font-normal text-muted-foreground">(اختياري، للمرتبات مثلاً)</span>
              )}
              <select
                value={party}
                onChange={(e) => setParty(e.target.value)}
                className={cn(inputCls, 'mt-1')}
              >
                <option value="">{partyRequired ? 'اختار…' : 'مش على حد'}</option>
                {[...new Set(partyOptions.map((o) => o.g))].map((g) => (
                  <optgroup key={g} label={g}>
                    {partyOptions
                      .filter((o) => o.g === g)
                      .map((o) => (
                        <option key={o.v} value={o.v}>
                          {o.l}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
          )}
          {(kind === 'WITHDRAWAL' || kind === 'CAPITAL') && partyOptions.length === 0 && (
            <p className="text-xs text-amber-700 sm:col-span-2">
              ضيف الشركاء والمستثمرين الأول من تاب «الموظفين والشركاء».
            </p>
          )}
          <label className="font-bold sm:col-span-2">
            ملاحظة
            <input
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              placeholder="مثلاً: فاتورة كهربا أكتوبر"
              className={cn(inputCls, 'mt-1')}
            />
          </label>
          <div className="sm:col-span-2">
            <span className="font-bold">صورة الإيصال (اختياري)</span>
            <div className="mt-1 flex items-center gap-2">
              {receipt ? (
                <>
                  <span className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-xs font-bold">
                    <Paperclip className="h-3 w-3" /> إيصال مرفوع
                  </span>
                  <button onClick={() => setReceipt(null)} className="text-xs text-red-600">
                    <X className="inline h-3 w-3" /> شيله
                  </button>
                </>
              ) : (
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-bold hover:border-brand-red/50">
                  {uploading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Paperclip className="h-3 w-3" />
                  )}
                  ارفع صورة أو PDF
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => onFile(e.target.files?.[0])}
                  />
                </label>
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={() => save.mutate()} disabled={!valid || save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// ───────────────────────── Fixed costs & installments ─────────────────────────
interface Recurring {
  id: string;
  title: string;
  category: string;
  amount: number;
  dayOfMonth: number;
  method: Method;
  startMonth: string;
  endMonth: string | null;
  partyType: string | null;
  partyId: string | null;
  note: string | null;
  isActive: boolean;
  installment: { n: number; of: number; left: number } | null;
  status: 'DUE' | 'POSTED' | 'OFF';
  postedEntryId: string | null;
  postedAmount: number | null;
  dueDate: string;
}

export function RecurringTab({
  meta,
  month,
  onMonth,
}: {
  meta: Meta;
  month: string;
  onMonth: (v: string) => void;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Recurring | 'new' | null>(null);
  const [stopping, setStopping] = useState<Recurring | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['acct', 'recurring', month],
    queryFn: () =>
      api.raw
        .get('/admin/accounting/recurring', { params: { month } })
        .then((r) => r.data.data.items as Recurring[]),
  });
  const run = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['acct'] }),
    onError: (e) => toast.error(errMsg(e)),
  });
  const due = (data ?? []).filter((r) => r.status === 'DUE');
  const monthly = (data ?? [])
    .filter((r) => r.isActive && r.status !== 'OFF')
    .reduce((a, r) => a + r.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthNav value={month} onChange={onMonth} />
        <div className="flex gap-2">
          {due.length > 0 && (
            <Button
              variant="outline"
              disabled={run.isPending}
              onClick={() =>
                run.mutate(() =>
                  api.raw.post('/admin/accounting/recurring/post-due', { month }).then((r) => {
                    toast.success(`اتسجّل ${r.data.data.posted} بند`);
                  }),
                )
              }
            >
              سجّل كل المستحق ({due.length})
            </Button>
          )}
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> مصروف ثابت أو قسط
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        الإيجار، أقساط الموتوسيكلات، النت، المرتبات الثابتة… بتتكتب هنا مرة واحدة، وكل شهر تدوس
        «سجّل» فتنزل في الحركات بتاريخ استحقاقها. إجمالي الشهري:{' '}
        <b className="text-foreground">{money(monthly)}</b>
      </p>
      <Panel>
        {isLoading ? (
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-brand-red" />
        ) : !data?.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            لسه مفيش مصروفات ثابتة. ضيف الإيجار أو أول قسط.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {data.map((r) => (
              <div
                key={r.id}
                className={cn(
                  'flex flex-wrap items-center gap-3 py-3',
                  !r.isActive && 'opacity-50',
                )}
              >
                <div className="min-w-[12rem] flex-1">
                  <p className="font-black">
                    {r.title}
                    {!r.isActive && (
                      <span className="ms-2 text-xs font-bold text-muted-foreground">(متوقف)</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.category} · يوم {r.dayOfMonth} من كل شهر · {METHOD_LABEL[r.method]}
                    {r.endMonth
                      ? ` · من ${monthLabel(r.startMonth)} لحد ${monthLabel(r.endMonth)}`
                      : ''}
                  </p>
                  {r.installment && (
                    <div className="mt-1 flex items-center gap-2 text-xs">
                      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-brand-red/70"
                          style={{ width: `${(r.installment.n / r.installment.of) * 100}%` }}
                        />
                      </div>
                      قسط {r.installment.n} من {r.installment.of} · فاضل {r.installment.left}
                    </div>
                  )}
                </div>
                <span className="font-black tabular-nums">{money(r.amount)}</span>
                {r.status === 'POSTED' ? (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                    اتسجّل{' '}
                    {r.postedAmount !== null && r.postedAmount !== r.amount
                      ? `(${money(r.postedAmount)})`
                      : ''}
                  </span>
                ) : r.status === 'DUE' ? (
                  <Button
                    size="sm"
                    disabled={run.isPending}
                    onClick={() =>
                      run.mutate(() =>
                        api.raw
                          .post(`/admin/accounting/recurring/${r.id}/post`, { month })
                          .then(() =>
                            toast.success(
                              `اتسجّل ${r.title} بتاريخ ${r.dueDate.slice(5).replace('-', '/')}`,
                            ),
                          ),
                      )
                    }
                  >
                    سجّل لـ {monthLabel(month).split(' ')[0]}
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">مش مستحق الشهر ده</span>
                )}
                <span className="flex gap-1.5">
                  <button
                    title="تعديل"
                    onClick={() => setEditing(r)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  {r.isActive ? (
                    <button title="وقّفه" onClick={() => setStopping(r)} className="text-red-500">
                      <Power className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      title="شغّله تاني"
                      className="text-emerald-600"
                      onClick={() =>
                        run.mutate(() =>
                          api.raw.patch(`/admin/accounting/recurring/${r.id}`, { isActive: true }),
                        )
                      }
                    >
                      <Power className="h-4 w-4" />
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
      {editing && (
        <RecurringDialog
          meta={meta}
          item={editing === 'new' ? null : editing}
          month={month}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={!!stopping}
        onOpenChange={(o) => !o && setStopping(null)}
        title={`توقّف «${stopping?.title ?? ''}»؟`}
        message="الشهور اللي اتسجلت بتفضل في الحسابات زي ما هي، بس مش هيطلع مستحق تاني."
        confirmLabel="وقّفه"
        loading={run.isPending}
        onConfirm={() =>
          stopping &&
          run.mutate(() =>
            api.raw
              .delete(`/admin/accounting/recurring/${stopping.id}`)
              .then(() => setStopping(null)),
          )
        }
      />
    </div>
  );
}

function RecurringDialog({
  meta,
  item,
  month,
  onClose,
}: {
  meta: Meta;
  item: Recurring | null;
  month: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(item?.title ?? '');
  const [category, setCategory] = useState(item?.category ?? 'إيجارات');
  const [amount, setAmount] = useState(item ? String(item.amount) : '');
  const [day, setDay] = useState(String(item?.dayOfMonth ?? 1));
  const [method, setMethod] = useState<Method>(item?.method ?? 'CASH');
  const [start, setStart] = useState(item?.startMonth ?? month);
  const [installments, setInstallments] = useState(item?.endMonth ? 'yes' : 'no');
  const [months, setMonths] = useState(
    item?.installment ? String(item.installment.of) : item?.endMonth ? '' : '12',
  );
  const [employee, setEmployee] = useState(
    item?.partyType === 'EMPLOYEE' ? (item.partyId ?? '') : '',
  );
  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        title: title.trim(),
        category: category.trim(),
        amount: Number(amount),
        dayOfMonth: Number(day),
        method,
        startMonth: start,
        partyType: employee ? 'EMPLOYEE' : null,
        partyId: employee || null,
      };
      if (installments === 'yes') body.months = Number(months);
      else body.endMonth = null;
      return item
        ? api.raw.patch(`/admin/accounting/recurring/${item.id}`, body)
        : api.raw.post('/admin/accounting/recurring', body);
    },
    onSuccess: () => {
      toast.success('اتحفظ');
      qc.invalidateQueries({ queryKey: ['acct'] });
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const employees = meta.parties.filter(
    (p) => p.type === 'EMPLOYEE' && (p.isActive || p.id === employee),
  );
  const valid =
    title.trim() &&
    Number(amount) > 0 &&
    (installments === 'no' || (Number(months) >= 1 && Number(months) <= 120));
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={item ? 'تعديل مصروف ثابت' : 'مصروف ثابت أو قسط جديد'}
      size="lg"
    >
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <label className="font-bold sm:col-span-2">
          الاسم
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="مثلاً: إيجار المكتب، قسط موتوسيكل 3"
            className={cn(inputCls, 'mt-1')}
          />
        </label>
        <label className="font-bold">
          المبلغ كل شهر
          <input
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={cn(inputCls, 'mt-1 font-black')}
            dir="ltr"
          />
        </label>
        <label className="font-bold">
          البند
          <input
            list="acct-rec-cats"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={cn(inputCls, 'mt-1')}
          />
          <datalist id="acct-rec-cats">
            {meta.categories.EXPENSE.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="font-bold">
          بيستحق يوم كام في الشهر
          <input
            type="number"
            min={1}
            max={31}
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className={cn(inputCls, 'mt-1')}
            dir="ltr"
          />
        </label>
        <label className="font-bold">
          طريقة الدفع
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as Method)}
            className={cn(inputCls, 'mt-1')}
          >
            {(Object.keys(METHOD_LABEL) as Method[]).map((m) => (
              <option key={m} value={m}>
                {METHOD_LABEL[m]}
              </option>
            ))}
          </select>
        </label>
        <label className="font-bold">
          يبدأ من شهر
          <input
            type="month"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className={cn(inputCls, 'mt-1')}
          />
        </label>
        <div className="font-bold">
          المدة
          <div className="mt-1 flex gap-1.5">
            {(
              [
                ['no', 'مستمر (زي الإيجار)'],
                ['yes', 'أقساط لمدة محددة'],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                onClick={() => setInstallments(v)}
                className={cn(
                  'flex-1 rounded-lg border px-2 py-2 text-xs font-bold',
                  installments === v
                    ? 'border-brand-red bg-brand-red/5 text-brand-red'
                    : 'border-border',
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        {installments === 'yes' && (
          <label className="font-bold">
            عدد الأقساط (شهور)
            <input
              type="number"
              min={1}
              max={120}
              value={months}
              onChange={(e) => setMonths(e.target.value)}
              className={cn(inputCls, 'mt-1')}
              dir="ltr"
            />
          </label>
        )}
        {employees.length > 0 && (
          <label className="font-bold sm:col-span-2">
            مرتب موظف؟{' '}
            <span className="font-normal text-muted-foreground">
              (اختياري: يتحسب في مرتبه في التقفيل الشهري)
            </span>
            <select
              value={employee}
              onChange={(e) => setEmployee(e.target.value)}
              className={cn(inputCls, 'mt-1')}
            >
              <option value="">لأ</option>
              {employees.map((p) => (
                <option key={p.id} value={p.id}>
                  {PARTY_LABEL.EMPLOYEE}: {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={() => save.mutate()} disabled={!valid || save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
