import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, LayoutList, Loader2, Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button.js';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js';
import { Dialog } from '../components/ui/Dialog.js';
import { Field, Input } from '../components/ui/Input.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { EmptyState, TableSkeleton } from '../components/ui/Skeleton.js';
import { ErrorState } from '../components/ui/States.js';
import { api } from '../lib/api.js';
import { uploadFile } from '../lib/uploadFile.js';
import { formatCount } from '../lib/format.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

/**
 * Global in-store sections (بيتزا / كريب / مشويات …) surfaced on the app home as
 * a cross-merchant taxonomy with artwork. A section here decorates a NAME — the
 * same Product.categoryName the rest of the app filters by — so a section links
 * to a product simply by sharing its name, and renaming one cascades to every
 * product tagged with it (handled server-side).
 */
export function ProductSectionsPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [confirmDel, setConfirmDel] = useState<Row | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'product-sections'],
    queryFn: () => api.adminListProductSections(),
  });
  const items = ((data as Row[] | undefined) ?? []).slice();

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'product-sections'] });

  const updateMut = useMutation({
    mutationFn: ({ id, data: d }: { id: string; data: unknown }) =>
      api.adminUpdateProductSection(id, d),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.adminDeleteProductSection(id),
    onSuccess: () => {
      toast.success('تم حذف القسم — المنتجات لم تتأثر');
      setConfirmDel(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="أقسام المنتجات"
        subtitle={`${formatCount(items.length)} قسم — تظهر في الصفحة الرئيسية بالتطبيق، والضغط عليها يعرض المنتج من كل المتاجر`}
        icon={LayoutList}
        actions={
          <Button size="md" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" />
            إضافة قسم
          </Button>
        }
      />

      {isLoading ? (
        <div className="bg-card rounded-xl border border-border p-6">
          <TableSkeleton rows={6} cols={5} />
        </div>
      ) : isError ? (
        <div className="bg-card rounded-xl border border-border">
          <ErrorState onRetry={() => refetch()} />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-card rounded-xl border border-border">
          <EmptyState
            icon={<LayoutList className="w-10 h-10" />}
            title="لا توجد أقسام"
            description="أضف أول قسم (مثل: بيتزا) ليظهر في الصفحة الرئيسية."
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4" />
                إضافة قسم
              </Button>
            }
          />
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border text-muted-foreground">
                <tr className="text-right">
                  <th className="px-3 py-3 font-bold">القسم</th>
                  <th className="px-3 py-3 font-bold">المنتجات</th>
                  <th className="px-3 py-3 font-bold">الترتيب</th>
                  <th className="px-3 py-3 font-bold">الحالة</th>
                  <th className="px-3 py-3 w-24" />
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr
                    key={c.id}
                    className={`border-b border-border/50 hover:bg-muted/30 ${c.isActive ? '' : 'opacity-60'}`}
                  >
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        {c.imageUrl ? (
                          <img
                            src={c.imageUrl}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="w-9 h-9 rounded-lg object-cover border border-border"
                          />
                        ) : (
                          <span className="w-9 h-9 rounded-lg bg-muted grid place-items-center text-muted-foreground/50">
                            <LayoutList className="w-4 h-4" />
                          </span>
                        )}
                        <span className="font-bold text-foreground">{c.nameAr}</span>
                        {!c.imageUrl && (
                          <span className="text-[10px] text-amber-600 bg-amber-50 rounded px-1.5 py-0.5">
                            بدون صورة
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1 text-xs">
                        <Package className="w-3.5 h-3.5 text-muted-foreground" />
                        {formatCount(Number(c.productCount) || 0)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        defaultValue={Number(c.sortOrder) || 0}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== (Number(c.sortOrder) || 0))
                            updateMut.mutate({ id: c.id, data: { sortOrder: v } });
                        }}
                        className="w-16 px-2 py-1 rounded border border-input bg-popover text-sm text-center"
                        dir="ltr"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <ActiveToggle
                        on={!!c.isActive}
                        onChange={() =>
                          updateMut.mutate({ id: c.id, data: { isActive: !c.isActive } })
                        }
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          type="button"
                          onClick={() => setEditing(c)}
                          aria-label="تعديل"
                          title="تعديل"
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDel(c)}
                          aria-label="حذف"
                          title="حذف"
                          className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground leading-5">
        القسم يظهر في الصفحة الرئيسية فقط لما يكون <b>مُفعّلاً</b> و<b>له منتجات</b> و<b>له صورة</b>
        . القسم المعطّل يختفي من التطبيق لكن المنتجات تفضل شغالة. تغيير اسم القسم بيغيّر التصنيف على
        كل منتجاته تلقائياً.
      </p>

      {createOpen && <SectionFormDialog mode="create" onClose={() => setCreateOpen(false)} />}
      {editing && (
        <SectionFormDialog mode="edit" section={editing} onClose={() => setEditing(null)} />
      )}
      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={(o) => !o && setConfirmDel(null)}
        title="حذف القسم"
        message={
          !confirmDel
            ? ''
            : `سيتم حذف قسم «${confirmDel.nameAr}» من الصفحة الرئيسية. المنتجات المرتبطة به لن تتأثر، لكنها لن تظهر تحت هذا القسم في الهوم.`
        }
        loading={deleteMut.isPending}
        onConfirm={() => confirmDel && deleteMut.mutate(confirmDel.id)}
      />
    </div>
  );
}

/** Same logical-offset switch used across the dashboard. */
function ActiveToggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onChange}
      title={on ? 'ظاهر — اضغط للإخفاء' : 'مخفي — اضغط للإظهار'}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40 focus-visible:ring-offset-2 ${
        on ? 'bg-green-500 hover:bg-green-600' : 'bg-zinc-300 hover:bg-zinc-400'
      }`}
    >
      <span
        className={`absolute top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-[inset-inline-start] duration-200 ${
          on ? 'start-[22px]' : 'start-0.5'
        }`}
      />
    </button>
  );
}

function SectionFormDialog({
  mode,
  section,
  onClose,
}: {
  mode: 'create' | 'edit';
  section?: Row;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [nameAr, setNameAr] = useState(String(section?.nameAr ?? ''));
  const [imageUrl, setImageUrl] = useState(String(section?.imageUrl ?? ''));
  const [sortOrder, setSortOrder] = useState(String(Number(section?.sortOrder) || 0));

  const save = useMutation({
    mutationFn: () => {
      const base = {
        nameAr: nameAr.trim(),
        sortOrder: Number(sortOrder) || 0,
        imageUrl: imageUrl.trim() || null,
      };
      return mode === 'create'
        ? api.adminCreateProductSection({ ...base, isActive: true })
        : api.adminUpdateProductSection(String(section?.id), base);
    },
    onSuccess: () => {
      toast.success(mode === 'create' ? 'تم إضافة القسم' : 'تم حفظ التعديلات');
      qc.invalidateQueries({ queryKey: ['admin', 'product-sections'] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const invalid = !nameAr.trim();

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={mode === 'create' ? 'إضافة قسم' : 'تعديل القسم'}
      size="md"
    >
      <div className="space-y-4">
        <Field
          label="اسم القسم"
          required
          hint="لازم يطابق تصنيف المنتجات — مثال: بيتزا، كريب، مشويات"
        >
          <Input
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
            placeholder="مثال: بيتزا"
          />
        </Field>

        {mode === 'edit' && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 leading-5">
            تغيير الاسم هيغيّر تصنيف كل المنتجات المرتبطة بالقسم ده تلقائياً عشان يفضلوا مربوطين
            بيه.
          </p>
        )}

        <SectionImageField value={imageUrl} onChange={setImageUrl} />

        <Field label="الترتيب" hint="الأقل يظهر أولاً في الصفحة الرئيسية">
          <Input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            dir="ltr"
          />
        </Field>

        <div className="flex items-center gap-2 pt-1">
          <Button onClick={() => save.mutate()} disabled={invalid || save.isPending}>
            {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            حفظ
          </Button>
          <Button variant="ghost" onClick={onClose} className="ms-auto">
            إلغاء
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** Square section artwork, uploaded through the same POST /uploads the rest of
 *  the dashboard uses. Shown in a square tile on the home, so a square crop. */
function SectionImageField({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <Field label="صورة القسم" hint="مربعة يفضّل 400×400 — تظهر في الصفحة الرئيسية للتطبيق">
      <div className="flex items-center gap-3">
        <label className="relative w-24 h-24 shrink-0 rounded-xl border-2 border-dashed border-border overflow-hidden flex items-center justify-center cursor-pointer bg-muted/30 hover:border-brand-red/60 transition">
          {value ? (
            <img src={value} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-1 text-muted-foreground">
              <ImagePlus className="w-5 h-5" />
              <span className="text-[10px]">اضغط للرفع</span>
            </div>
          )}
          {busy && (
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-brand-red" />
            </div>
          )}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setBusy(true);
              try {
                const r = await uploadFile(file);
                onChange(r.url);
              } catch (err) {
                toast.error((err as Error).message || 'فشل رفع الصورة');
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>

        <div className="flex-1 min-w-0 space-y-1">
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="أو الصق رابط صورة…"
            dir="ltr"
          />
          {!!value && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="text-xs text-red-600 hover:underline"
            >
              إزالة الصورة
            </button>
          )}
        </div>
      </div>
    </Field>
  );
}
