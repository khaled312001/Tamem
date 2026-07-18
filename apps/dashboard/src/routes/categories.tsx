import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GripVertical, Loader2, Pencil, Plus, Store, Tag, Trash2 } from 'lucide-react';
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
import { formatCount } from '../lib/format.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

/** Merchants point at a category by a required FK, so the count decides whether
 *  a delete can really remove it. Live returns bare rows without `_count`. */
function merchantCount(c: Row): number | null {
  const n = c?._count?.merchants;
  return typeof n === 'number' ? n : null;
}

/** The API wants a URL-safe slug as the primary key, not a generated id. */
function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

export function CategoriesPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [confirmDel, setConfirmDel] = useState<Row | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: () => api.adminListCategories(),
  });
  const items = ((data as Row[] | undefined) ?? []).slice().sort((a, b) => {
    const s = (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);
    return s !== 0 ? s : String(a.nameAr ?? '').localeCompare(String(b.nameAr ?? ''), 'ar');
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'categories'] });
    // The merchant form's picker reads the same list.
    qc.invalidateQueries({ queryKey: ['categories'] });
  };

  const updateMut = useMutation({
    mutationFn: ({ id, data: d }: { id: string; data: unknown }) => api.adminUpdateCategory(id, d),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.adminDeleteCategory(id),
    onSuccess: (_r, id) => {
      const used = (merchantCount(confirmDel) ?? 0) > 0;
      toast.success(used ? 'تم إخفاء التصنيف — التجار المرتبطون لم يتأثروا' : 'تم حذف التصنيف');
      setConfirmDel(null);
      void id;
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const used = merchantCount(confirmDel);

  return (
    <div className="space-y-4">
      <PageHeader
        title="التصنيفات"
        subtitle={`${formatCount(items.length)} تصنيف — تظهر في اختيار تصنيف المتجر وفي التطبيق`}
        icon={Tag}
        actions={
          <Button size="md" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" />
            إضافة تصنيف
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
            icon={<Tag className="w-10 h-10" />}
            title="لا توجد تصنيفات"
            description="أضف أول تصنيف ليظهر في اختيار تصنيف المتجر."
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4" />
                إضافة تصنيف
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
                  <th className="px-3 py-3 w-10" />
                  <th className="px-3 py-3 font-bold">التصنيف</th>
                  <th className="px-3 py-3 font-bold">الكود</th>
                  <th className="px-3 py-3 font-bold">التجار</th>
                  <th className="px-3 py-3 font-bold">الترتيب</th>
                  <th className="px-3 py-3 font-bold">الحالة</th>
                  <th className="px-3 py-3 w-24" />
                </tr>
              </thead>
              <tbody>
                {items.map((c) => {
                  const n = merchantCount(c);
                  return (
                    <tr
                      key={c.id}
                      className={`border-b border-border/50 hover:bg-muted/30 ${c.isActive ? '' : 'opacity-60'}`}
                    >
                      <td className="px-3 py-3 text-muted-foreground/40">
                        <GripVertical className="w-4 h-4" />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          {c.iconUrl ? (
                            <img
                              src={c.iconUrl}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              className="w-8 h-8 rounded-lg object-cover border border-border"
                            />
                          ) : (
                            <span className="w-8 h-8 rounded-lg bg-muted grid place-items-center text-muted-foreground/50">
                              <Tag className="w-4 h-4" />
                            </span>
                          )}
                          <div>
                            <div className="font-bold text-foreground">{c.nameAr}</div>
                            <div className="text-xs text-muted-foreground" dir="ltr">
                              {c.name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <code className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {c.id}
                        </code>
                      </td>
                      <td className="px-3 py-3">
                        {n === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs">
                            <Store className="w-3.5 h-3.5 text-muted-foreground" />
                            {formatCount(n)}
                          </span>
                        )}
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
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground leading-5">
        التصنيف المعطّل يختفي من اختيار تصنيف المتجر ومن التطبيق، لكن التجار المرتبطين به يفضلوا
        شغالين.
      </p>

      {createOpen && <CategoryFormDialog mode="create" onClose={() => setCreateOpen(false)} />}
      {editing && (
        <CategoryFormDialog mode="edit" category={editing} onClose={() => setEditing(null)} />
      )}
      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={(o) => !o && setConfirmDel(null)}
        title={used && used > 0 ? 'إخفاء التصنيف' : 'حذف التصنيف'}
        message={
          !confirmDel
            ? ''
            : used && used > 0
              ? `«${confirmDel.nameAr}» مرتبط بـ ${formatCount(used)} تاجر، فمينفعش يتحذف نهائياً. هيتم إخفاؤه من القوائم والتطبيق، والتجار هيفضلوا زي ما هم.`
              : `سيتم حذف «${confirmDel.nameAr}» نهائياً. لا يمكن التراجع.`
        }
        loading={deleteMut.isPending}
        onConfirm={() => confirmDel && deleteMut.mutate(confirmDel.id)}
      />
    </div>
  );
}

/** Same logical-offset switch as the products screen (translate-x escapes its
 *  track under dir="rtl"). */
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

function CategoryFormDialog({
  mode,
  category,
  onClose,
}: {
  mode: 'create' | 'edit';
  category?: Row;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [nameAr, setNameAr] = useState(String(category?.nameAr ?? ''));
  const [name, setName] = useState(String(category?.name ?? ''));
  const [id, setId] = useState(String(category?.id ?? ''));
  const [iconUrl, setIconUrl] = useState(String(category?.iconUrl ?? ''));
  const [sortOrder, setSortOrder] = useState(String(Number(category?.sortOrder) || 0));
  const [touchedId, setTouchedId] = useState(false);

  const save = useMutation({
    mutationFn: () => {
      const base = {
        name: name.trim(),
        nameAr: nameAr.trim(),
        sortOrder: Number(sortOrder) || 0,
        ...(iconUrl.trim() ? { iconUrl: iconUrl.trim() } : {}),
      };
      return mode === 'create'
        ? api.adminCreateCategory({ ...base, id: id.trim(), isActive: true })
        : api.adminUpdateCategory(String(category?.id), base);
    },
    onSuccess: () => {
      toast.success(mode === 'create' ? 'تم إضافة التصنيف' : 'تم حفظ التعديلات');
      qc.invalidateQueries({ queryKey: ['admin', 'categories'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const idBad = mode === 'create' && !/^[a-z0-9-]{2,60}$/.test(id.trim());
  const invalid = !nameAr.trim() || !name.trim() || idBad;

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={mode === 'create' ? 'إضافة تصنيف' : 'تعديل التصنيف'}
      size="md"
    >
      <div className="space-y-4">
        <Field label="الاسم بالعربية" required>
          <Input
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
            placeholder="مثال: مطاعم"
          />
        </Field>
        <Field label="الاسم بالإنجليزية" required hint="يُستخدم لتوليد الكود">
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (mode === 'create' && !touchedId) setId(slugify(e.target.value));
            }}
            placeholder="Restaurants"
            dir="ltr"
          />
        </Field>
        {mode === 'create' && (
          <Field
            label="الكود"
            required
            hint="حروف إنجليزية صغيرة وأرقام وشرطات فقط. لا يمكن تغييره بعد الحفظ."
            error={id && idBad ? 'الكود غير صالح — مثال: home-supplies' : undefined}
          >
            <Input
              value={id}
              onChange={(e) => {
                setTouchedId(true);
                setId(slugify(e.target.value));
              }}
              placeholder="restaurants"
              dir="ltr"
            />
          </Field>
        )}
        {mode === 'edit' && (
          <p className="text-xs text-muted-foreground">
            الكود: <code className="bg-muted px-1.5 py-0.5 rounded">{category?.id}</code> — ثابت ولا
            يمكن تغييره.
          </p>
        )}
        <Field label="رابط الأيقونة (اختياري)">
          <Input
            value={iconUrl}
            onChange={(e) => setIconUrl(e.target.value)}
            placeholder="https://…"
            dir="ltr"
          />
        </Field>
        <Field label="الترتيب" hint="الأقل يظهر أولاً">
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
