import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  GripVertical,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '../components/ui/Badge.js';
import { Button } from '../components/ui/Button.js';
import { Dialog } from '../components/ui/Dialog.js';
import { Field, Input, Textarea } from '../components/ui/Input.js';
import { EmptyState, TableSkeleton } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';
import { uploadFile } from '../lib/uploadFile.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const MAX_IMAGES = 5;

/**
 * Coerce whatever `imageUrls` shape the API returned (legacy JSON, null,
 * already-array) into a clean string[] capped at MAX_IMAGES. The list view
 * + the form both read through here so a corrupt row can't blow up the UI.
 */
function toImageList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .slice(0, MAX_IMAGES);
}

export function ProductsPage() {
  const qc = useQueryClient();
  const [merchantFilter, setMerchantFilter] = useState('');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: merchants } = useQuery({
    queryKey: ['admin', 'merchants', 'all'],
    queryFn: () => api.adminListMerchants({ pageSize: 100 }),
  });

  // The merchant currently selected in the filter — when set, the admin can
  // manage that merchant's menu-image mode (upload a menu photo instead of
  // entering products one by one) right here on the products page.
  const selectedMerchant = (merchants?.items as Row[] | undefined)?.find(
    (m) => m.id === merchantFilter,
  );

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'products', merchantFilter, search],
    queryFn: () =>
      api.adminListProducts({
        pageSize: 100,
        ...(merchantFilter ? { merchantId: merchantFilter } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
      }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data: d }: { id: string; data: unknown }) => api.adminUpdateProduct(id, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const bulkMut = useMutation({
    mutationFn: ({ ids, isAvailable }: { ids: string[]; isAvailable: boolean }) =>
      api.adminBulkProductAvailability(ids, isAvailable),
    onSuccess: () => {
      toast.success('تم التحديث');
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.adminDeleteProduct(id),
    onSuccess: () => {
      toast.success('تم حذف المنتج');
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) await api.adminDeleteProduct(id);
    },
    onSuccess: () => {
      toast.success('تم حذف المنتجات المحددة');
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleSel = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-brand-dark">المنتجات</h1>
          <p className="text-sm text-muted-foreground mt-1">{data?.pagination.total ?? 0} منتج</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          منتج
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-border p-4 flex flex-wrap items-center gap-3">
        <label className="text-sm font-bold">التاجر:</label>
        <select
          value={merchantFilter}
          onChange={(e) => setMerchantFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-input bg-white text-sm min-w-[180px]"
        >
          <option value="">جميع التجار</option>
          {(merchants?.items as Row[] | undefined)?.map((m) => (
            <option key={m.id} value={m.id}>
              {m.storeNameAr}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث باسم المنتج…"
          className="px-3 py-2 rounded-lg border border-input bg-white text-sm flex-1 min-w-[160px]"
        />
        {selected.size > 0 && (
          <div className="ms-auto flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkMut.mutate({ ids: Array.from(selected), isAvailable: true })}
            >
              تفعيل ({selected.size})
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkMut.mutate({ ids: Array.from(selected), isAvailable: false })}
            >
              تعطيل ({selected.size})
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive border-destructive/40 hover:bg-destructive/10"
              disabled={bulkDeleteMut.isPending}
              onClick={() => {
                if (window.confirm(`حذف ${selected.size} منتج نهائياً؟`))
                  bulkDeleteMut.mutate(Array.from(selected));
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              حذف ({selected.size})
            </Button>
          </div>
        )}
      </div>

      {selectedMerchant && (
        <MerchantMenuPanel key={selectedMerchant.id} merchant={selectedMerchant} />
      )}

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <TableSkeleton rows={6} cols={5} />
          </div>
        ) : !data?.items.length ? (
          <EmptyState icon={<Box className="w-10 h-10" />} title="لا توجد منتجات" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr className="text-right">
                  <th className="px-3 py-3 w-8" />
                  <th className="px-3 py-3 font-bold">المنتج</th>
                  <th className="px-3 py-3 font-bold">التاجر</th>
                  <th className="px-3 py-3 font-bold">السعر</th>
                  <th className="px-3 py-3 font-bold">متاح</th>
                  <th className="px-3 py-3 font-bold">المخزون</th>
                  <th className="px-3 py-3 w-12" />
                </tr>
              </thead>
              <tbody>
                {(data.items as Row[]).map((p) => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggleSel(p.id)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{p.nameAr}</div>
                      <div className="text-xs text-muted-foreground">{p.name}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">{p.merchant?.storeNameAr ?? '—'}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        defaultValue={Number(p.price)}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== Number(p.price))
                            updateMut.mutate({ id: p.id, data: { price: v } });
                        }}
                        className="w-24 px-2 py-1 rounded border border-input bg-white text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <label className="inline-flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={p.isAvailable}
                          onChange={(e) =>
                            updateMut.mutate({
                              id: p.id,
                              data: { isAvailable: e.target.checked },
                            })
                          }
                        />
                      </label>
                    </td>
                    <td className="px-3 py-2">
                      {p.stock !== null ? <Badge>{p.stock}</Badge> : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditing(p)}
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                          aria-label="تعديل"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`حذف المنتج "${p.nameAr}"؟`)) deleteMut.mutate(p.id);
                          }}
                          disabled={deleteMut.isPending}
                          className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive disabled:opacity-50"
                          aria-label="حذف"
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
        )}
      </div>

      {createOpen && (
        <ProductFormDialog
          mode="create"
          merchants={(merchants?.items as Row[]) ?? []}
          onClose={() => setCreateOpen(false)}
        />
      )}
      {editing && (
        <ProductFormDialog
          mode="edit"
          product={editing}
          merchants={(merchants?.items as Row[]) ?? []}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/**
 * Menu-image mode, surfaced on the products page. When a merchant is selected
 * in the filter, the admin can upload photo(s) of that merchant's paper menu
 * instead of entering products one by one. Saves to the merchant's menuImages.
 */
function MerchantMenuPanel({ merchant }: { merchant: Row }) {
  const qc = useQueryClient();
  const [images, setImages] = useState<string[]>(() => toImageList(merchant.menuImages));
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const save = useMutation({
    mutationFn: (next: string[]) => api.adminUpdateMerchant(merchant.id, { menuImages: next }),
    onSuccess: () => {
      toast.success('تم حفظ منيو المتجر');
      qc.invalidateQueries({ queryKey: ['admin', 'merchants'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const commit = (next: string[]) => {
    setImages(next);
    save.mutate(next);
  };

  const pick = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = 8 - images.length;
    if (remaining <= 0) {
      toast.error('الحد الأقصى 8 صور');
      return;
    }
    const picked = Array.from(files).slice(0, remaining);
    setUploading(true);
    try {
      const results = await Promise.all(picked.map((f) => uploadFile(f)));
      commit([...images, ...results.map((r) => r.url)]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل رفع الصورة');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const hasMenu = images.length > 0;

  return (
    <div
      className={`rounded-xl border p-4 md:p-5 ${
        hasMenu ? 'border-brand-red/30 bg-brand-red/5' : 'border-dashed border-border bg-muted/20'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="grid place-items-center w-10 h-10 rounded-xl bg-brand-red/10 text-brand-red shrink-0">
          <ImageIcon className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-brand-dark">منيو المتجر — {merchant.storeNameAr}</div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-5">
            {hasMenu
              ? 'هذا التاجر يعرض صورة منيو للعميل ويطلب منها مباشرة. (أي منتجات فردية بالأسفل تظهر كمان.)'
              : 'للتجار اللي بيبعتوا صورة منيو بدل إدخال منتج-منتج. ارفع صور المنيو هنا، أو استخدم الجدول بالأسفل لإضافة منتجات فردية.'}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-3">
        {images.map((url, idx) => (
          <div
            key={`${url}-${idx}`}
            className="relative w-24 h-24 rounded-lg overflow-hidden border border-border group bg-white"
          >
            <img src={url} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => commit(images.filter((_, i) => i !== idx))}
              disabled={save.isPending}
              className="absolute top-1 end-1 p-1 rounded-md bg-white/90 text-destructive opacity-0 group-hover:opacity-100 transition shadow disabled:opacity-50"
              aria-label="حذف"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {images.length < 8 && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || save.isPending}
            className="w-24 h-24 rounded-lg border-2 border-dashed border-border grid place-items-center text-muted-foreground hover:border-brand-red hover:text-brand-red transition disabled:opacity-60"
          >
            {uploading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <span className="flex flex-col items-center gap-1">
                <ImagePlus className="w-5 h-5" />
                <span className="text-[10px] font-bold">رفع منيو</span>
              </span>
            )}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => void pick(e.target.files)}
        />
      </div>

      {save.isPending && (
        <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" /> جارٍ الحفظ…
        </div>
      )}
    </div>
  );
}

interface ProductFormState {
  merchantId: string;
  name: string;
  nameAr: string;
  description: string;
  price: number;
  unit: string;
  sku: string;
  discount: string; // kept as string so the field can be empty
  availableFrom: string;
  availableTo: string;
  imageUrls: string[];
  isAvailable: boolean;
}

function initialFromProduct(product: Row | undefined, merchants: Row[]): ProductFormState {
  if (!product) {
    return {
      merchantId: merchants[0]?.id ?? '',
      name: '',
      nameAr: '',
      description: '',
      price: 0,
      unit: '',
      sku: '',
      discount: '',
      availableFrom: '',
      availableTo: '',
      imageUrls: [],
      isAvailable: true,
    };
  }
  // Legacy rows may only have `imageUrl` (singular). Hoist it into the gallery
  // so the admin can drag/reorder it like any other image.
  const gallery = toImageList(product.imageUrls);
  if (gallery.length === 0 && typeof product.imageUrl === 'string' && product.imageUrl) {
    gallery.push(product.imageUrl);
  }
  return {
    merchantId: product.merchantId ?? merchants[0]?.id ?? '',
    name: product.name ?? '',
    nameAr: product.nameAr ?? '',
    description: product.description ?? '',
    price: Number(product.price ?? 0),
    unit: product.unit ?? '',
    sku: product.sku ?? '',
    discount: product.discount == null ? '' : String(product.discount),
    availableFrom: product.availableFrom ?? '',
    availableTo: product.availableTo ?? '',
    imageUrls: gallery,
    isAvailable: product.isAvailable ?? true,
  };
}

interface ProductFormDialogProps {
  mode: 'create' | 'edit';
  product?: Row;
  merchants: Row[];
  onClose: () => void;
}

function ProductFormDialog({ mode, product, merchants, onClose }: ProductFormDialogProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState<ProductFormState>(() => initialFromProduct(product, merchants));

  // Submit-time payload: strip empty optionals so the backend treats them as
  // "not set" instead of validating them as malformed strings.
  const payload = useMemo(() => {
    const out: Record<string, unknown> = {
      merchantId: form.merchantId,
      name: form.name.trim(),
      nameAr: form.nameAr.trim(),
      price: Number(form.price) || 0,
      isAvailable: form.isAvailable,
      imageUrls: form.imageUrls,
      // First image becomes the legacy `imageUrl` so older surfaces (cart
      // thumbnails, mobile detail screen) keep rendering without a migration.
      imageUrl: form.imageUrls[0],
    };
    if (form.description.trim()) out.description = form.description.trim();
    if (form.unit.trim()) out.unit = form.unit.trim();
    if (form.sku.trim()) out.sku = form.sku.trim();
    if (form.discount !== '') {
      const n = Number(form.discount);
      if (Number.isFinite(n)) out.discount = n;
    }
    if (form.availableFrom) out.availableFrom = form.availableFrom;
    if (form.availableTo) out.availableTo = form.availableTo;
    return out;
  }, [form]);

  const mut = useMutation({
    mutationFn: async () => {
      if (mode === 'create') return api.adminCreateProduct(payload);
      // Don't send merchantId on edit — backend update schema strips it anyway,
      // but being explicit avoids confusing 400s if the schema ever changes.
      const { merchantId: _omit, ...patch } = payload;
      void _omit;
      return api.adminUpdateProduct(product!.id, patch);
    },
    onSuccess: () => {
      toast.success(mode === 'create' ? 'تم إنشاء المنتج' : 'تم حفظ التغييرات');
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Soft client-side guard: prevent saving a window where end < start so the
  // admin gets immediate feedback instead of a confused 400 from Prisma.
  const windowError = useMemo(() => {
    if (form.availableFrom && form.availableTo && form.availableTo <= form.availableFrom) {
      return 'وقت النهاية يجب أن يكون بعد وقت البداية';
    }
    return null;
  }, [form.availableFrom, form.availableTo]);

  const discountNum = form.discount === '' ? 0 : Number(form.discount);
  const afterDiscount =
    Number.isFinite(discountNum) && discountNum > 0
      ? Number(form.price) * (1 - discountNum / 100)
      : null;

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={mode === 'create' ? 'منتج جديد' : 'تعديل المنتج'}
      size="lg"
    >
      <div className="space-y-3">
        <Field label="التاجر" required>
          <select
            value={form.merchantId}
            onChange={(e) => setForm({ ...form, merchantId: e.target.value })}
            disabled={mode === 'edit'}
            className="w-full px-3 py-2 rounded-lg border border-input bg-white text-sm disabled:bg-muted"
          >
            {merchants.map((m) => (
              <option key={m.id} value={m.id}>
                {m.storeNameAr}
              </option>
            ))}
          </select>
        </Field>

        <ImageGalleryField
          value={form.imageUrls}
          onChange={(imageUrls) => setForm({ ...form, imageUrls })}
        />

        <Field label="الاسم (ع)" required>
          <Input
            value={form.nameAr}
            onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
          />
        </Field>
        <Field label="الاسم (En)" required>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            dir="ltr"
          />
        </Field>
        <Field label="الوصف">
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            placeholder="مكونات، حجم العبوة، تفاصيل إضافية..."
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="السعر" required>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
            />
          </Field>
          <Field label="الوحدة">
            <Input
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              placeholder="كيلو / علبة / حبة..."
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="نسبة الخصم %"
            hint={
              afterDiscount !== null
                ? `بعد الخصم: ${afterDiscount.toFixed(2)}`
                : 'اختياري — من 0 إلى 90'
            }
          >
            <Input
              type="number"
              min={0}
              max={90}
              step="1"
              value={form.discount}
              onChange={(e) => setForm({ ...form, discount: e.target.value })}
              placeholder="0"
            />
          </Field>
          <Field label="SKU" hint="اختياري — يستخدم للمزامنة مع API التاجر">
            <Input
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              dir="ltr"
              placeholder="مثال: MILK-1L"
            />
          </Field>
        </div>

        <Field
          label="ساعات الإتاحة (يومياً)"
          hint="اتركها فارغة لتكون متاح دائماً"
          error={windowError ?? undefined}
        >
          <div className="grid grid-cols-2 gap-3">
            <Input
              type="time"
              value={form.availableFrom}
              onChange={(e) => setForm({ ...form, availableFrom: e.target.value })}
              aria-label="من"
            />
            <Input
              type="time"
              value={form.availableTo}
              onChange={(e) => setForm({ ...form, availableTo: e.target.value })}
              aria-label="إلى"
            />
          </div>
        </Field>

        <label className="flex items-center gap-2 text-sm font-bold pt-1">
          <input
            type="checkbox"
            checked={form.isAvailable}
            onChange={(e) => setForm({ ...form, isAvailable: e.target.checked })}
          />
          متاح للطلب
        </label>
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" size="md" onClick={onClose}>
          إلغاء
        </Button>
        <Button
          onClick={() => mut.mutate()}
          disabled={
            mut.isPending || !!windowError || !form.merchantId || !form.nameAr || !form.name
          }
        >
          {mode === 'create' ? 'إضافة' : 'حفظ'}
        </Button>
      </div>
    </Dialog>
  );
}

/**
 * Up to MAX_IMAGES image URLs with upload + reorder + remove. Reorder uses the
 * native HTML5 drag-and-drop API with a small grip handle so the row itself
 * stays clickable for image preview.
 */
function ImageGalleryField({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const dragIndex = useRef<number | null>(null);
  const [uploading, setUploading] = useState(false);

  const handlePick = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = MAX_IMAGES - value.length;
    if (remaining <= 0) {
      toast.error(`الحد الأقصى ${MAX_IMAGES} صور`);
      return;
    }
    const picked = Array.from(files).slice(0, remaining);
    setUploading(true);
    try {
      const results = await Promise.all(picked.map((f) => uploadFile(f)));
      onChange([...value, ...results.map((r) => r.url)]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل رفع الصورة');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= value.length) return;
    const next = value.slice();
    const [item] = next.splice(from, 1);
    if (item === undefined) return;
    next.splice(to, 0, item);
    onChange(next);
  };

  return (
    <Field
      label={`الصور (حتى ${MAX_IMAGES})`}
      hint="أول صورة هي الصورة الرئيسية. اسحب المقبض لإعادة الترتيب."
    >
      <div className="space-y-2">
        {value.length > 0 && (
          <ul className="space-y-2">
            {value.map((url, idx) => (
              <li
                key={`${url}-${idx}`}
                draggable
                onDragStart={() => {
                  dragIndex.current = idx;
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = dragIndex.current;
                  dragIndex.current = null;
                  if (from !== null) move(from, idx);
                }}
                className="flex items-center gap-2 p-2 rounded-lg border border-border bg-white"
              >
                <button
                  type="button"
                  className="p-1 text-muted-foreground cursor-grab active:cursor-grabbing"
                  aria-label="إعادة ترتيب"
                  // Mouse-down on the handle is enough; HTML5 drag is started
                  // by the parent <li draggable> being grabbed from this child.
                >
                  <GripVertical className="w-4 h-4" />
                </button>
                <img
                  src={url}
                  alt=""
                  className="w-12 h-12 object-cover rounded-md border border-border"
                />
                <div className="flex-1 min-w-0 text-xs text-muted-foreground truncate" dir="ltr">
                  {url}
                </div>
                {idx === 0 && <Badge variant="success">رئيسية</Badge>}
                <button
                  type="button"
                  onClick={() => onChange(value.filter((_, i) => i !== idx))}
                  className="p-1.5 rounded-md text-destructive hover:bg-destructive/10"
                  aria-label="حذف الصورة"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => void handlePick(e.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading || value.length >= MAX_IMAGES}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ImagePlus className="w-4 h-4" />
            )}
            {uploading ? 'جارٍ الرفع...' : 'رفع صورة'}
          </Button>
          <span className="text-xs text-muted-foreground">
            {value.length}/{MAX_IMAGES}
          </span>
        </div>
      </div>
    </Field>
  );
}
