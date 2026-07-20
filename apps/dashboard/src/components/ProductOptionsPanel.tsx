/**
 * Sizes ("أحجام") and add-ons ("إضافات") for one product.
 *
 * Why this exists: without it the admin had to duplicate a product per size —
 * "بيتزا فراخ صغير", "بيتزا فراخ وسط", "بيتزا فراخ كبير" — three rows, three
 * images, three stock counts, and a store page full of near-identical cards.
 *
 * Two different storage shapes sit behind this one panel:
 *
 *  - Sizes live on the PRODUCT (`ProductVariant`). A size's price REPLACES the
 *    base price, it does not add to it — that's what the hint text says and
 *    what the server does when it prices the order.
 *  - Add-ons live on the MERCHANT (`MerchantAddon`) and are LINKED to products
 *    (`ProductAddonLink`). So "موتزريلا +10" is typed once and ticked on every
 *    pizza. Editing its price updates it everywhere at once.
 *
 * That second point is also the trap: the link table is ON DELETE CASCADE, so
 * saving the merchant's add-on list must carry existing ids through untouched
 * (the server updates rows that still have an id rather than delete+reinsert).
 * The inline "add-on" creator here always sends the FULL list back for that
 * reason — never just the new row.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { api } from '../lib/api.js';
import { Button } from './ui/Button.js';
import { Field, Input } from './ui/Input.js';

interface VariantRow {
  /** Local-only key; the server reassigns ids on every save. */
  key: string;
  nameAr: string;
  price: string;
  isActive: boolean;
}

interface MerchantAddon {
  id: string;
  nameAr: string;
  price: number;
  sortOrder?: number;
  isActive?: boolean;
}

interface OptionsResponse {
  merchantId: string;
  variants: { id: string; nameAr: string; price: number; isActive: boolean }[];
  merchantAddons: MerchantAddon[];
  linkedAddonIds: string[];
}

let seq = 0;
const nextKey = () => `v${++seq}`;

interface Props {
  productId: string;
  merchantId: string;
  /** Base price, shown as the fallback when no sizes are defined. */
  basePrice: number;
  /**
   * The parent dialog saves the product and the options together. It stores the
   * callback we hand it here and awaits it after the product PATCH succeeds.
   */
  registerSave: (fn: () => Promise<void>) => void;
}

export function ProductOptionsPanel({ productId, merchantId, basePrice, registerSave }: Props) {
  const qc = useQueryClient();

  const optionsQuery = {
    queryKey: ['admin', 'product-options', productId],
    queryFn: () => api.adminGetProductOptions(productId) as Promise<OptionsResponse>,
  };
  const { data, isLoading, error } = useQuery(optionsQuery);

  const [variants, setVariants] = useState<VariantRow[] | null>(null);
  const [linked, setLinked] = useState<string[] | null>(null);

  // Seed local state ONCE, when the first fetch lands.
  //
  // Two reasons it must not re-seed on every `data` change: null vs [] is how
  // we tell "not loaded yet" from "admin deleted every size" (the second must
  // still save, as an empty list), and adding an add-on refetches this query —
  // re-seeding there would silently discard sizes the admin had just typed.
  useEffect(() => {
    if (!data || variants !== null) return;
    setVariants(
      data.variants.map((v) => ({
        key: nextKey(),
        nameAr: v.nameAr,
        price: String(v.price),
        isActive: v.isActive,
      })),
    );
    setLinked(data.linkedAddonIds);
  }, [data, variants]);

  const merchantAddons = data?.merchantAddons ?? [];

  // Registered with the parent on every render so it always calls the closure
  // that can see the current state, not the one from first mount.
  registerSave(async () => {
    if (variants === null || linked === null) return; // never loaded → nothing to save
    await api.adminSaveProductOptions(productId, {
      variants: variants
        .filter((v) => v.nameAr.trim() !== '')
        .map((v) => ({
          nameAr: v.nameAr.trim(),
          price: Number(v.price) || 0,
          isActive: v.isActive,
        })),
      linkedAddonIds: linked,
    });
    qc.invalidateQueries({ queryKey: ['admin', 'product-options', productId] });
  });

  const addonMut = useMutation({
    mutationFn: async (next: MerchantAddon[]) => api.adminSaveMerchantAddons(merchantId, next),
    onError: (e: Error) => toast.error(e.message),
  });

  const [newAddon, setNewAddon] = useState({ nameAr: '', price: '' });

  const addAddon = async () => {
    const nameAr = newAddon.nameAr.trim();
    if (!nameAr) return;
    const price = Number(newAddon.price) || 0;
    // Full list, existing ids intact — see the file header.
    await addonMut.mutateAsync([
      ...merchantAddons.map((a) => ({ id: a.id, nameAr: a.nameAr, price: a.price })),
      { id: '', nameAr, price },
    ]);
    setNewAddon({ nameAr: '', price: '' });

    // The server mints the id, so re-read to learn it, then tick it on this
    // product — you added it from inside a pizza, you meant it for this pizza.
    const fresh = await qc.fetchQuery({ ...optionsQuery, staleTime: 0 });
    const created = fresh.merchantAddons.find((a) => a.nameAr === nameAr);
    if (created) setLinked((cur) => [...(cur ?? []), created.id]);
    toast.success(`تمت إضافة "${nameAr}" لإضافات المتجر`);
  };

  const removeAddon = async (id: string) => {
    await addonMut.mutateAsync(
      merchantAddons
        .filter((a) => a.id !== id)
        .map((a) => ({ id: a.id, nameAr: a.nameAr, price: a.price })),
    );
    await qc.fetchQuery({ ...optionsQuery, staleTime: 0 });
    setLinked((cur) => (cur ?? []).filter((x) => x !== id));
  };

  const priceRange = useMemo(() => {
    const active = (variants ?? []).filter((v) => v.nameAr.trim() && v.isActive);
    if (active.length === 0) return null;
    const nums = active.map((v) => Number(v.price) || 0);
    const lo = Math.min(...nums);
    const hi = Math.max(...nums);
    return lo === hi ? `${lo}` : `${lo} — ${hi}`;
  }, [variants]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="w-4 h-4 animate-spin" />
        جاري تحميل الأحجام والإضافات...
      </div>
    );
  }
  if (error) {
    return <p className="text-sm text-destructive py-2">تعذّر تحميل الأحجام والإضافات</p>;
  }

  return (
    <div className="space-y-4 rounded-lg border border-input bg-muted/30 p-3">
      {/* ---------- Sizes ---------- */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-sm font-bold">الأحجام</h4>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setVariants([
                ...(variants ?? []),
                { key: nextKey(), nameAr: '', price: String(basePrice || ''), isActive: true },
              ])
            }
          >
            <Plus className="w-4 h-4" />
            حجم
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mb-2">
          سعر الحجم <strong>يحل محل</strong> سعر المنتج ولا يُضاف إليه. لو سِبت القائمة فاضية،
          المنتج هيتباع بسعره العادي ({basePrice || 0}).
          {priceRange && ` — العميل هيشوف: ${priceRange}`}
        </p>

        {(variants ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground italic">لا توجد أحجام — منتج بسعر واحد.</p>
        ) : (
          <div className="space-y-2">
            {(variants ?? []).map((v, i) => (
              <div key={v.key} className="flex items-center gap-2">
                <Input
                  value={v.nameAr}
                  placeholder="صغير / وسط / كبير"
                  onChange={(e) => {
                    const next = [...(variants ?? [])];
                    next[i] = { ...v, nameAr: e.target.value };
                    setVariants(next);
                  }}
                  className="flex-1"
                />
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={v.price}
                  placeholder="السعر"
                  onChange={(e) => {
                    const next = [...(variants ?? [])];
                    next[i] = { ...v, price: e.target.value };
                    setVariants(next);
                  }}
                  className="w-28"
                />
                <label
                  className="flex items-center gap-1 text-xs whitespace-nowrap"
                  title="اقفل الحجم مؤقتاً من غير ما تمسحه"
                >
                  <input
                    type="checkbox"
                    checked={v.isActive}
                    onChange={(e) => {
                      const next = [...(variants ?? [])];
                      next[i] = { ...v, isActive: e.target.checked };
                      setVariants(next);
                    }}
                  />
                  متاح
                </label>
                <button
                  type="button"
                  aria-label="حذف الحجم"
                  className="p-1.5 rounded-md text-destructive hover:bg-destructive/10"
                  onClick={() => setVariants((variants ?? []).filter((x) => x.key !== v.key))}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---------- Add-ons ---------- */}
      <div className="border-t border-input pt-3">
        <h4 className="text-sm font-bold mb-1">الإضافات المتاحة لهذا المنتج</h4>
        <p className="text-xs text-muted-foreground mb-2">
          الإضافات مشتركة على مستوى المتجر — اكتب "موتزريلا" مرة واحدة وعلّم عليها في كل البيتزا.
          سعر الإضافة <strong>يُضاف</strong> فوق السعر.
        </p>

        {merchantAddons.length === 0 ? (
          <p className="text-xs text-muted-foreground italic mb-2">
            المتجر ده لسه مالوش إضافات — ضيف أول واحدة من تحت.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {merchantAddons.map((a) => {
              const on = (linked ?? []).includes(a.id);
              return (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-1 rounded-md border border-input bg-white px-2 py-1.5"
                >
                  <label className="flex items-center gap-2 text-sm cursor-pointer flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) =>
                        setLinked(
                          e.target.checked
                            ? [...(linked ?? []), a.id]
                            : (linked ?? []).filter((x) => x !== a.id),
                        )
                      }
                    />
                    <span className="truncate">{a.nameAr}</span>
                    <span className="text-xs text-muted-foreground shrink-0">+{a.price}</span>
                  </label>
                  <button
                    type="button"
                    aria-label={`حذف ${a.nameAr} من المتجر`}
                    title="حذف من إضافات المتجر كلها"
                    className="p-1 rounded text-muted-foreground hover:text-destructive"
                    onClick={() => void removeAddon(a.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <Field label="إضافة صنف جديد لإضافات المتجر">
          <div className="flex items-center gap-2">
            <Input
              value={newAddon.nameAr}
              placeholder="موتزريلا / كولا / مياه"
              onChange={(e) => setNewAddon({ ...newAddon, nameAr: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void addAddon();
                }
              }}
              className="flex-1"
            />
            <Input
              type="number"
              min={0}
              step="0.01"
              value={newAddon.price}
              placeholder="السعر"
              onChange={(e) => setNewAddon({ ...newAddon, price: e.target.value })}
              className="w-28"
            />
            <Button
              variant="outline"
              size="md"
              onClick={() => void addAddon()}
              disabled={!newAddon.nameAr.trim() || addonMut.isPending}
            >
              {addonMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'أضف'}
            </Button>
          </div>
        </Field>
      </div>
    </div>
  );
}
