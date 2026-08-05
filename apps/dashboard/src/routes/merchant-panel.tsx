import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  ClipboardList,
  FileSpreadsheet,
  Check,
  Edit3,
  FolderTree,
  ImagePlus,
  LayoutGrid,
  List,
  Loader2,
  Package,
  PackageX,
  Plus,
  Search,
  Settings2,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { ProductOptionsPanel } from '../components/ProductOptionsPanel.js';
import { MerchantImportDialog, MerchantRequestsTab } from './merchant-extras.js';
import { Button } from '../components/ui/Button.js';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js';
import { Dialog } from '../components/ui/Dialog.js';
import { Field, Input, Textarea } from '../components/ui/Input.js';
import { EmptyState, TableSkeleton } from '../components/ui/Skeleton.js';
import { StatCard } from '../components/ui/StatCard.js';
import { ErrorState } from '../components/ui/States.js';
import { api } from '../lib/api.js';
import { formatCount, formatMoney } from '../lib/format.js';
import { TONE } from '../lib/statusRegistry.js';
import { uploadFile } from '../lib/uploadFile.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

type StatusFilter = 'all' | 'available' | 'disabled';
type ViewMode = 'table' | 'grid';
const MAX_IMAGES = 5;

function toImageList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .slice(0, MAX_IMAGES);
}

function firstImage(p: Row): string | null {
  if (typeof p.imageUrl === 'string' && p.imageUrl) return p.imageUrl;
  const list = toImageList(p.imageUrls);
  return list[0] ?? null;
}

/** UTC ISO → the value a datetime-local input expects, in the viewer's zone. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── Multi-Image Uploader Field ───
function MultiImageUploader({
  imageUrls,
  onChange,
}: {
  imageUrls: string[];
  onChange: (urls: string[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const pick = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = MAX_IMAGES - imageUrls.length;
    if (remaining <= 0) {
      toast.error(`الحد الأقصى ${MAX_IMAGES} صور لكل منتج`);
      return;
    }
    const picked = Array.from(files).slice(0, remaining);
    setUploading(true);
    try {
      const results = await Promise.all(picked.map((f) => uploadFile(f)));
      onChange([...imageUrls, ...results.map((r) => r.url)]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل رفع الصورة');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = (idx: number) => {
    onChange(imageUrls.filter((_, i) => i !== idx));
  };

  return (
    <Field label="صور المنتج" hint={`حتى ${MAX_IMAGES} صور للمنتج`}>
      <div className="flex flex-wrap items-center gap-3">
        {imageUrls.map((url, idx) => (
          <div
            key={url + idx}
            className="relative w-16 h-16 rounded-xl border border-border overflow-hidden group shrink-0"
          >
            <img src={url} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => remove(idx)}
              className="absolute top-1 right-1 p-1 bg-red-600/90 text-white rounded-full opacity-0 group-hover:opacity-100 transition shadow"
              title="حذف الصورة"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        {imageUrls.length < MAX_IMAGES && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => void pick(e.target.files)}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="w-16 h-16 rounded-xl border border-dashed border-border bg-muted/30 hover:bg-muted/60 flex flex-col items-center justify-center gap-1 text-muted-foreground transition shrink-0"
            >
              {uploading ? (
                <Loader2 className="w-5 h-5 animate-spin text-brand-red" />
              ) : (
                <>
                  <ImagePlus className="w-5 h-5" />
                  <span className="text-[10px] font-bold">إضافة</span>
                </>
              )}
            </button>
          </>
        )}
      </div>
    </Field>
  );
}

// ─── Product Form Dialog ───
function ProductFormDialog({
  product,
  merchantId,
  categories,
  onClose,
  onSaved,
}: {
  product: Row | null;
  merchantId: string;
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!product;
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'basic' | 'pricing' | 'options'>('basic');

  const [nameAr, setNameAr] = useState(product?.nameAr ?? '');
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [price, setPrice] = useState<string>(product ? String(Number(product.price)) : '');
  const [salePrice, setSalePrice] = useState<string>(
    product?.salePrice ? String(Number(product.salePrice)) : '',
  );
  const [categoryName, setCategoryName] = useState(product?.categoryName ?? '');
  const [unit, setUnit] = useState(product?.unit ?? '');
  // stock / sku / barcode are deliberately NOT exposed to merchants — they add
  // noise to the form for a catalogue that is not stock-tracked. Existing values
  // are left untouched because the update only sends fields that changed.
  // Same offer knobs the admin deals page exposes: a percentage discount and an
  // optional expiry, after which the price reverts on its own (no cron).
  const [discount, setDiscount] = useState<string>(
    product?.discount ? String(Number(product.discount)) : '',
  );
  const [timed, setTimed] = useState(!!product?.saleEndsAt);
  const [endsAt, setEndsAt] = useState<string>(
    product?.saleEndsAt ? toLocalInput(String(product.saleEndsAt)) : '',
  );
  const [isAvailable, setIsAvailable] = useState(product?.isAvailable ?? true);
  // Create-mode only: {nameAr, price} pairs that travel with the request.
  const [newVariants, setNewVariants] = useState<{ nameAr: string; price: string }[]>([]);
  const [newAddons, setNewAddons] = useState<{ nameAr: string; price: string }[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>(() => {
    if (!product) return [];
    if (product.imageUrl && !product.imageUrls?.length) return [product.imageUrl];
    return toImageList(product.imageUrls);
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data: Record<string, unknown> = {
        nameAr: nameAr.trim(),
        name: name.trim() || nameAr.trim(),
        description: description.trim() || undefined,
        price: Number(price),
        isAvailable,
        imageUrl: imageUrls[0] ?? undefined,
        imageUrls: imageUrls.length ? imageUrls : undefined,
        unit: unit.trim() || undefined,
        categoryName: categoryName.trim() || undefined,
      };
      if (salePrice.trim()) data.salePrice = Number(salePrice);
      else data.salePrice = null;
      data.discount = discount.trim() ? Number(discount) : 0;
      // Null clears the expiry, so an offer can be made permanent again.
      data.saleEndsAt = timed && endsAt ? new Date(endsAt).toISOString() : null;

      if (!isEdit) {
        const pack = (rows: { nameAr: string; price: string }[]) =>
          rows
            .filter((r) => r.nameAr.trim())
            .map((r) => ({ nameAr: r.nameAr.trim(), price: Number(r.price) || 0 }));
        const v = pack(newVariants);
        const a = pack(newAddons);
        if (v.length) data.variants = v;
        if (a.length) data.addons = a;
      }

      if (isEdit) {
        await api.merchantUpdateProduct(product.id, data);
        toast.success('تم تعديل المنتج بنجاح');
      } else {
        await api.merchantCreateProduct(data);
        toast.success('تم إضافة المنتج بنجاح');
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'حدث خطأ في حفظ البيانات');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={isEdit ? `تعديل: ${product.nameAr}` : 'إضافة منتج جديد'}
      size="lg"
    >
      {/* Tabs */}
      <div className="flex border-b border-border mb-4 text-sm font-bold">
        <button
          type="button"
          onClick={() => setTab('basic')}
          className={`px-4 py-2 border-b-2 transition ${
            tab === 'basic'
              ? 'border-brand-red text-brand-red'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          البيانات الأساسية
        </button>
        <button
          type="button"
          onClick={() => setTab('pricing')}
          className={`px-4 py-2 border-b-2 transition ${
            tab === 'pricing'
              ? 'border-brand-red text-brand-red'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          السعر والمخزون
        </button>
        {
          <button
            type="button"
            onClick={() => setTab('options')}
            className={`px-4 py-2 border-b-2 transition flex items-center gap-1.5 ${
              tab === 'options'
                ? 'border-brand-red text-brand-red'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Settings2 className="w-4 h-4" />
            الأحجام والإضافات
          </button>
        }
      </div>

      <form onSubmit={submit} className="space-y-4">
        {tab === 'basic' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="اسم المنتج بالعربي" required>
              <Input
                required
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                placeholder="مثال: بيتزا فراخ"
              />
            </Field>

            <Field label="اسم المنتج بالإنجليزي">
              <Input
                dir="ltr"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Chicken Pizza"
              />
            </Field>

            <Field label="القسم / التصنيف">
              <input
                list="category-suggestions"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="اختر أو اكتب قسم جديد..."
                className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:border-brand-red focus:ring-2 focus:ring-brand-red/20 outline-none transition text-sm"
              />
              <datalist id="category-suggestions">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>

            <Field label="الوحدة" hint="مثال: قطعة، كيلو، وجبة">
              <Input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="مثال: وجبة"
              />
            </Field>

            <div className="col-span-full">
              <Field label="وصف المنتج">
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="وصف تفصيلي للمكونات أو طريقة التقديم..."
                />
              </Field>
            </div>

            <div className="col-span-full">
              <MultiImageUploader imageUrls={imageUrls} onChange={setImageUrls} />
            </div>

            <div className="col-span-full flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsAvailable(!isAvailable)}
                className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${
                  isAvailable ? 'bg-emerald-500' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200 ${
                    isAvailable ? 'right-0.5' : 'right-[calc(100%-20px-2px)]'
                  }`}
                />
              </button>
              <span className="text-sm font-bold text-foreground">
                {isAvailable ? 'المنتج متاح للطلب' : 'المنتج غير متاح حالياً'}
              </span>
            </div>
          </div>
        )}

        {tab === 'pricing' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="السعر الأساسي (جنيه)" required>
              <Input
                required
                type="number"
                step="0.01"
                min="0"
                dir="ltr"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
              />
            </Field>

            <Field label="سعر الخصم (اختياري)" hint="يظهر كعرض خاص بشطب السعر الأصلي">
              <Input
                type="number"
                step="0.01"
                min="0"
                dir="ltr"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                placeholder="اتركه فارغاً إذا لا يوجد خصم"
              />
            </Field>

            <Field label="نسبة الخصم %" hint="بديل لسعر الخصم — يُحسب من السعر الأساسي">
              <Input
                type="number"
                min="0"
                max="99"
                dir="ltr"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                placeholder="0"
              />
              {Number(discount) > 0 && Number(price) > 0 && (
                <p className="text-xs text-emerald-600 font-bold mt-1">
                  السعر بعد الخصم: {formatMoney(Number(price) * (1 - Number(discount) / 100))}
                </p>
              )}
            </Field>

            <div className="md:col-span-2 rounded-xl border border-border p-3 bg-muted/30">
              <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={timed}
                  onChange={(e) => setTimed(e.target.checked)}
                  className="w-4 h-4 accent-brand-red"
                />
                عرض لفترة محدودة (عرض اليوم)
              </label>
              {timed && (
                <div className="mt-2">
                  <Input
                    type="datetime-local"
                    dir="ltr"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    بعد انتهاء الوقت يرجع السعر الأصلي تلقائياً ويختفي المنتج من «عروض اليوم».
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'options' && isEdit && (
          <div className="pt-2">
            <ProductOptionsPanel
              productId={product.id}
              merchantId={merchantId}
              basePrice={Number(price) || 0}
            />
          </div>
        )}

        {/* On a NEW product there is no id yet to hang variants off, so options
            are collected by name here and created once the request is approved. */}
        {tab === 'options' && !isEdit && (
          <div className="pt-2 space-y-4">
            <PairEditor
              title="الأحجام / المقاسات"
              hint="سعر الحجم بيحل محل السعر الأساسي (مش بيتضاف عليه)."
              placeholder="مثال: وسط"
              rows={newVariants}
              onChange={setNewVariants}
            />
            <PairEditor
              title="الإضافات"
              hint="سعر الإضافة بيتضاف على سعر المنتج."
              placeholder="مثال: جبنة زيادة"
              rows={newAddons}
              onChange={setNewAddons}
            />
          </div>
        )}

        {tab !== 'options' && (
          <div className="flex justify-end gap-2 pt-4 border-t border-border mt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              إلغاء
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  جاري الحفظ...
                </span>
              ) : isEdit ? (
                'حفظ التعديلات'
              ) : (
                'إضافة المنتج'
              )}
            </Button>
          </div>
        )}
      </form>
    </Dialog>
  );
}

// ─── Main Merchant Panel ───
export function MerchantPanelPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'products' | 'categories' | 'requests'>('products');
  const [importOpen, setImportOpen] = useState(false);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [confirmDel, setConfirmDel] = useState<Row | null>(null);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [addCatOpen, setAddCatOpen] = useState(false);
  const [newCatInput, setNewCatInput] = useState('');

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch Merchant Me info
  const { data: profileData } = useQuery({
    queryKey: ['merchant', 'me'],
    queryFn: () => api.merchantMe(),
    staleTime: 60_000,
  });
  const merchantProfile = profileData as Row;
  const merchantId = merchantProfile?.id ?? '';
  // Capability switches come from the server; the UI only hides what the API
  // would refuse anyway, so this is convenience and never the real boundary.
  const perms: Record<string, boolean> = merchantProfile?.permissions ?? {
    'products.create': true,
    'products.update': true,
    'products.delete': true,
    'products.import': true,
    'sections.manage': true,
    autoApprove: false,
  };
  const pendingRequests = Number(merchantProfile?.stats?.pendingRequests ?? 0);

  // Query params for products list
  const queryParams = useMemo(() => {
    const p: Record<string, unknown> = { page, pageSize };
    if (debouncedSearch.trim()) p.search = debouncedSearch.trim();
    if (statusFilter === 'available') p.isAvailable = true;
    if (statusFilter === 'disabled') p.isAvailable = false;
    if (selectedCategory) p.categoryName = selectedCategory;
    return p;
  }, [page, pageSize, debouncedSearch, statusFilter, selectedCategory]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['merchant', 'products', queryParams],
    queryFn: () => api.merchantListProducts(queryParams),
    enabled: !!merchantId,
  });

  // The server already applied every filter, including the section — the page
  // it returns IS what should be drawn.
  const items = (data?.items as Row[]) ?? [];

  const total = data?.pagination?.total ?? 0;
  const stats = merchantProfile?.stats ?? {};

  // Sections come from their own endpoint, which groups over the whole
  // catalogue. Deriving them from the current page instead only ever showed the
  // sections that happened to appear in the first 20 products.
  const { data: categoryRows } = useQuery({
    queryKey: ['merchant', 'categories'],
    queryFn: () => api.merchantListCategories(),
    enabled: !!merchantId,
    staleTime: 60_000,
  });
  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>();
    (categoryRows ?? []).forEach((c) => m.set(c.categoryName, Number(c.productCount) || 0));
    return m;
  }, [categoryRows]);
  const categoriesList = useMemo(() => {
    // A section the merchant just created has no products yet, so the server
    // cannot know about it — keep it in the list until a product lands in it.
    const set = new Set<string>(categoryCounts.keys());
    customCategories.forEach((c) => set.add(c));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [categoryCounts, customCategories]);

  // Mutations
  const toggleMut = useMutation({
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      api.merchantUpdateProduct(id, { isAvailable }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['merchant', 'products'] });
      qc.invalidateQueries({ queryKey: ['merchant', 'me'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.merchantDeleteProduct(id),
    onSuccess: () => {
      toast.success('تم حذف المنتج بنجاح');
      setConfirmDel(null);
      qc.invalidateQueries({ queryKey: ['merchant', 'products'] });
      qc.invalidateQueries({ queryKey: ['merchant', 'me'] });
      qc.invalidateQueries({ queryKey: ['merchant', 'categories'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const onSaved = () => {
    qc.invalidateQueries({ queryKey: ['merchant', 'products'] });
    qc.invalidateQueries({ queryKey: ['merchant', 'me'] });
    // A saved product can introduce (or empty out) a section.
    qc.invalidateQueries({ queryKey: ['merchant', 'categories'] });
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Box} tone="red" value={stats.productsCount ?? 0} label="إجمالي المنتجات" />
        <StatCard
          icon={FolderTree}
          tone="blue"
          value={categoriesList.length}
          label="الأقسام والتصنيفات"
        />
        <StatCard icon={Package} tone="green" value={stats.todayOrders ?? 0} label="طلبات اليوم" />
        <StatCard
          icon={PackageX}
          tone="amber"
          value={formatMoney(stats.todayRevenue ?? 0)}
          label="إيرادات اليوم"
        />
      </div>

      {/* Main Tabs Header */}
      <div className="bg-card rounded-2xl border border-border p-2 flex items-center justify-between">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('products')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
              activeTab === 'products'
                ? 'bg-brand-red text-white shadow-md'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Box className="w-4 h-4" />
            إدارة المنتجات ({total})
          </button>
          <button
            onClick={() => setActiveTab('categories')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
              activeTab === 'categories'
                ? 'bg-brand-red text-white shadow-md'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <FolderTree className="w-4 h-4" />
            الأقسام والتصنيفات ({categoriesList.length})
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
              activeTab === 'requests'
                ? 'bg-brand-red text-white shadow-md'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            طلباتي
            {pendingRequests > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[11px] bg-amber-400 text-amber-950">
                {pendingRequests}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {perms['products.import'] && (
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <FileSpreadsheet className="w-4 h-4" />
              رفع من ملف
            </Button>
          )}
          {perms['products.create'] && (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="w-4 h-4" />
              إضافة منتج جديد
            </Button>
          )}
        </div>
      </div>

      {/* Everything a merchant saves waits for the admin unless this store has
          been trusted with auto-approve. Saying so up front avoids "I saved it
          but nothing changed". */}
      {!perms.autoApprove && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-start gap-2">
          <ClipboardList className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            أي إضافة أو تعديل أو حذف بتتبعت للإدارة للمراجعة الأول، وبتظهر في التطبيق بعد الموافقة.
            تقدر تتابع حالتها من تبويب <strong>طلباتي</strong>.
          </span>
        </div>
      )}

      {/* TAB 1: PRODUCTS */}
      {activeTab === 'products' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="bg-card rounded-2xl border border-border p-4 shadow-sm">
            <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
              {/* Search */}
              <div className="relative w-full md:w-80">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ابحث في اسم أو وصف المنتج..."
                  className="w-full pl-4 pr-10 py-2 rounded-xl border border-input bg-background text-sm focus:border-brand-red focus:ring-2 focus:ring-brand-red/20 outline-none transition"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute left-3 top-1/2 -translate-y-1/2"
                  >
                    <XCircle className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-2 items-center w-full md:w-auto">
                {/* Category Filter */}
                {categoriesList.length > 0 && (
                  <select
                    value={selectedCategory}
                    onChange={(e) => {
                      setSelectedCategory(e.target.value);
                      setPage(1);
                    }}
                    className="px-3 py-2 rounded-xl border border-input bg-background text-xs font-bold text-foreground focus:border-brand-red outline-none"
                  >
                    <option value="">كل الأقسام</option>
                    {categoriesList.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                )}

                {/* Status Filter */}
                <div className="flex bg-muted rounded-xl p-1 text-xs font-bold">
                  {(['all', 'available', 'disabled'] as const).map((key) => (
                    <button
                      key={key}
                      onClick={() => {
                        setStatusFilter(key);
                        setPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-lg transition ${
                        statusFilter === key
                          ? 'bg-card text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {key === 'all' ? 'الكل' : key === 'available' ? 'متاح' : 'غير متاح'}
                    </button>
                  ))}
                </div>

                {/* View toggle */}
                <div className="inline-flex rounded-xl border border-border overflow-hidden">
                  <button
                    onClick={() => setViewMode('table')}
                    className={`p-2 transition ${
                      viewMode === 'table'
                        ? 'bg-brand-red text-white'
                        : 'bg-card text-muted-foreground'
                    }`}
                    title="عرض جدول"
                  >
                    <List className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-2 transition ${
                      viewMode === 'grid'
                        ? 'bg-brand-red text-white'
                        : 'bg-card text-muted-foreground'
                    }`}
                    title="عرض بطاقات"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="p-8">
                <TableSkeleton rows={6} cols={5} />
              </div>
            ) : isError ? (
              <ErrorState onRetry={() => refetch()} />
            ) : items.length === 0 ? (
              <EmptyState
                icon={<Box className="w-10 h-10" />}
                title="لا توجد منتجات"
                description={
                  debouncedSearch || statusFilter !== 'all' || selectedCategory
                    ? 'لا توجد نتائج مطابقة لخيارات البحث.'
                    : 'قم بإنشاء أول منتج في متجرك الآن.'
                }
                action={
                  <Button
                    onClick={() => {
                      setEditing(null);
                      setFormOpen(true);
                    }}
                  >
                    <Plus className="w-4 h-4" />
                    إضافة منتج
                  </Button>
                }
              />
            ) : viewMode === 'table' ? (
              <>
                {/* Phones get cards — a 6-column table forces a sideways scroll
                  and shrinks the tap targets to nothing. */}
                <ul className="md:hidden divide-y divide-border">
                  {items.map((p: Row) => {
                    const img = firstImage(p);
                    const onSale = p.salePrice && Number(p.salePrice) > 0;
                    return (
                      <li key={p.id} className="p-3 flex gap-3">
                        {img ? (
                          <img
                            src={img}
                            alt={p.nameAr}
                            className="w-16 h-16 rounded-xl object-cover border border-border shrink-0"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-xl bg-muted grid place-items-center border border-border text-muted-foreground shrink-0">
                            <Box className="w-6 h-6" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-foreground leading-tight break-words">
                            {p.nameAr}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                            {p.categoryName && (
                              <span
                                className={`inline-flex px-2 py-0.5 rounded-full font-bold ${TONE.zinc.badge}`}
                              >
                                {p.categoryName}
                              </span>
                            )}
                            <span className="font-bold text-foreground">
                              {onSale ? (
                                <>
                                  <span className="text-emerald-600">
                                    {formatMoney(Number(p.salePrice))}
                                  </span>{' '}
                                  <span className="text-muted-foreground line-through font-normal">
                                    {formatMoney(Number(p.price))}
                                  </span>
                                </>
                              ) : (
                                formatMoney(Number(p.price))
                              )}
                            </span>
                            <span className="text-muted-foreground">
                              {p.stock !== null && p.stock !== undefined
                                ? `مخزون: ${formatCount(p.stock)}`
                                : 'مخزون: غير محدود'}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              onClick={() =>
                                toggleMut.mutate({ id: p.id, isAvailable: !p.isAvailable })
                              }
                              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition ${
                                p.isAvailable ? TONE.green.badge : TONE.red.badge
                              }`}
                            >
                              {p.isAvailable ? (
                                <Check className="w-3 h-3" />
                              ) : (
                                <X className="w-3 h-3" />
                              )}
                              {p.isAvailable ? 'متاح' : 'غير متاح'}
                            </button>
                            <button
                              onClick={() => {
                                setEditing(p);
                                setFormOpen(true);
                              }}
                              className="ms-auto p-2 rounded-lg hover:bg-muted text-blue-600 transition"
                              aria-label="تعديل"
                            >
                              <Edit3 className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => setConfirmDel(p)}
                              className="p-2 rounded-lg hover:bg-red-50 text-red-500 transition"
                              aria-label="حذف"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b border-border text-muted-foreground">
                      <tr className="text-right">
                        <th className="px-4 py-3 font-bold">المنتج</th>
                        <th className="px-4 py-3 font-bold">القسم</th>
                        <th className="px-4 py-3 font-bold">السعر</th>
                        <th className="px-4 py-3 font-bold">المخزون</th>
                        <th className="px-4 py-3 font-bold text-center">الحالة</th>
                        <th className="px-4 py-3 font-bold text-center">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {items.map((p: Row) => {
                        const img = firstImage(p);
                        return (
                          <tr key={p.id} className="hover:bg-muted/40 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                {img ? (
                                  <img
                                    src={img}
                                    alt={p.nameAr}
                                    className="w-12 h-12 rounded-xl object-cover border border-border"
                                  />
                                ) : (
                                  <div className="w-12 h-12 rounded-xl bg-muted grid place-items-center border border-border text-muted-foreground">
                                    <Box className="w-6 h-6" />
                                  </div>
                                )}
                                <div>
                                  <p className="font-bold text-foreground">{p.nameAr}</p>
                                  {p.name && p.name !== p.nameAr && (
                                    <p
                                      className="text-xs text-muted-foreground font-mono"
                                      dir="ltr"
                                    >
                                      {p.name}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {p.categoryName ? (
                                <span
                                  className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold ${TONE.zinc.badge}`}
                                >
                                  {p.categoryName}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/50">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-bold">
                              {p.salePrice && Number(p.salePrice) > 0 ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-emerald-600">
                                    {formatMoney(Number(p.salePrice))}
                                  </span>
                                  <span className="text-xs text-muted-foreground line-through font-normal">
                                    {formatMoney(Number(p.price))}
                                  </span>
                                </div>
                              ) : (
                                <span>{formatMoney(Number(p.price))}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs">
                              {p.stock !== null && p.stock !== undefined ? (
                                <span className="font-bold text-foreground">
                                  {formatCount(p.stock)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">غير محدود</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() =>
                                  toggleMut.mutate({ id: p.id, isAvailable: !p.isAvailable })
                                }
                                className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold transition ${
                                  p.isAvailable ? TONE.green.badge : TONE.red.badge
                                }`}
                              >
                                {p.isAvailable ? (
                                  <Check className="w-3 h-3" />
                                ) : (
                                  <X className="w-3 h-3" />
                                )}
                                {p.isAvailable ? 'متاح' : 'غير متاح'}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => {
                                    setEditing(p);
                                    setFormOpen(true);
                                  }}
                                  className="p-2 rounded-lg hover:bg-muted text-blue-600 transition"
                                  title="تعديل المنتج والأوبشنز"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setConfirmDel(p)}
                                  className="p-2 rounded-lg hover:bg-red-50 text-red-500 transition"
                                  title="حذف"
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
              </>
            ) : (
              /* Grid view */
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {items.map((p: Row) => {
                  const img = firstImage(p);
                  return (
                    <div
                      key={p.id}
                      className="bg-card rounded-2xl border border-border p-4 flex flex-col justify-between hover:shadow-md transition"
                    >
                      <div>
                        <div className="relative aspect-video rounded-xl overflow-hidden bg-muted border border-border mb-3">
                          {img ? (
                            <img src={img} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full grid place-items-center text-muted-foreground">
                              <Box className="w-8 h-8" />
                            </div>
                          )}
                          <span
                            className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              p.isAvailable ? TONE.green.badge : TONE.red.badge
                            }`}
                          >
                            {p.isAvailable ? 'متاح' : 'غير متاح'}
                          </span>
                        </div>
                        <h3 className="font-bold text-foreground text-sm mb-1">{p.nameAr}</h3>
                        {p.categoryName && (
                          <span className="text-[11px] text-muted-foreground block mb-2">
                            {p.categoryName}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                        <div className="font-bold text-sm">
                          {p.salePrice && Number(p.salePrice) > 0 ? (
                            <span className="text-emerald-600">
                              {formatMoney(Number(p.salePrice))}
                            </span>
                          ) : (
                            <span>{formatMoney(Number(p.price))}</span>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => {
                              setEditing(p);
                              setFormOpen(true);
                            }}
                            className="p-1.5 rounded-lg hover:bg-muted text-blue-600"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setConfirmDel(p)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: CATEGORIES & SECTIONS */}
      {activeTab === 'categories' && (
        <div className="space-y-4">
          <div className="bg-card rounded-2xl border border-border p-4 shadow-sm flex items-center justify-between">
            <h3 className="font-bold text-foreground text-sm">
              أقسام وتصنيفات المتجر ({categoriesList.length})
            </h3>
            <Button onClick={() => setAddCatOpen(true)}>
              <Plus className="w-4 h-4" />
              إضافة قسم جديد
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {categoriesList.map((catName) => {
              const count = categoryCounts.get(catName) ?? 0;
              return (
                <div
                  key={catName}
                  className="bg-card rounded-2xl border border-border p-5 flex items-center justify-between hover:shadow-md transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-brand-red/10 text-brand-red flex items-center justify-center font-bold">
                      <FolderTree className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground text-base">{catName}</h3>
                      <p className="text-xs text-muted-foreground font-medium">
                        {count} منتجات في هذا القسم
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedCategory(catName);
                      setPage(1);
                      setActiveTab('products');
                    }}
                  >
                    عرض المنتجات
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Section Dialog */}
      {addCatOpen && (
        <Dialog
          open
          onOpenChange={(o) => !o && setAddCatOpen(false)}
          title="إضافة قسم جديد"
          description="أدخل اسم القسم الجديد لإضافة منتجات تحته"
          size="sm"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const name = newCatInput.trim();
              if (!name) return;
              if (!customCategories.includes(name)) {
                setCustomCategories((prev) => [...prev, name]);
              }
              toast.success(`تم إضافة القسم "${name}" بنجاح`);
              setNewCatInput('');
              setAddCatOpen(false);
            }}
            className="space-y-4"
          >
            <Field label="اسم القسم الجديد" required>
              <Input
                required
                value={newCatInput}
                onChange={(e) => setNewCatInput(e.target.value)}
                placeholder="مثال: مشويات، حلويات، عصائر..."
              />
            </Field>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="outline" onClick={() => setAddCatOpen(false)}>
                إلغاء
              </Button>
              <Button type="submit">إضافة القسم</Button>
            </div>
          </form>
        </Dialog>
      )}

      {/* TAB 3: MY REQUESTS — status of everything waiting on the admin. */}
      {activeTab === 'requests' && <MerchantRequestsTab />}

      {/* Bulk upload — same sheet format the admin uses. */}
      {importOpen && (
        <MerchantImportDialog
          merchantId={merchantId}
          storeName={merchantProfile?.storeNameAr ?? merchantProfile?.storeName ?? 'متجري'}
          onClose={() => setImportOpen(false)}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ['merchant', 'requests'] });
            qc.invalidateQueries({ queryKey: ['merchant', 'me'] });
          }}
        />
      )}

      {/* Edit/Create Modal */}
      {formOpen && (
        <ProductFormDialog
          product={editing}
          merchantId={merchantId}
          categories={categoriesList}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSaved={onSaved}
        />
      )}

      {/* Confirm Delete */}
      {confirmDel && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setConfirmDel(null)}
          title="حذف المنتج"
          message={`هل أنت متأكد من حذف المنتج "${confirmDel.nameAr}"؟`}
          confirmLabel="نعم، احذف"
          tone="danger"
          onConfirm={() => deleteMut.mutate(confirmDel.id)}
        />
      )}
    </div>
  );
}

/**
 * A tiny {name, price} list editor used for a NEW product's sizes and extras.
 *
 * The edit path uses ProductOptionsPanel, which talks to the options endpoint by
 * product id. A product being created has no id yet, so here the pairs are just
 * collected by name and sent with the request; the server creates them once an
 * admin approves it.
 */
function PairEditor({
  title,
  hint,
  placeholder,
  rows,
  onChange,
}: {
  title: string;
  hint: string;
  placeholder: string;
  rows: { nameAr: string; price: string }[];
  onChange: (rows: { nameAr: string; price: string }[]) => void;
}) {
  const set = (i: number, patch: Partial<{ nameAr: string; price: string }>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div className="rounded-xl border border-border p-3 space-y-2">
      <div>
        <p className="text-sm font-black text-brand-dark">{title}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>

      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground py-1">لا يوجد — اضغط «إضافة» لو محتاج.</p>
      )}

      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={r.nameAr}
            onChange={(e) => set(i, { nameAr: e.target.value })}
            placeholder={placeholder}
            className="flex-1"
          />
          <Input
            type="number"
            min="0"
            step="0.01"
            dir="ltr"
            value={r.price}
            onChange={(e) => set(i, { price: e.target.value })}
            placeholder="السعر"
            className="w-28"
          />
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
            className="p-2 rounded-lg hover:bg-red-50 text-red-500 transition"
            aria-label="حذف"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}

      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => onChange([...rows, { nameAr: '', price: '' }])}
      >
        <Plus className="w-4 h-4" />
        إضافة
      </Button>
    </div>
  );
}
