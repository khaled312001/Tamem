/**
 * «من» — the store, restaurant or place the driver picks the order up from.
 *
 * Agents typed this by hand for months, and the top restaurant alone came in
 * six spellings («الاسكندراني», «اسكندرانى», «من مطعم الاسكندراني»…). So the
 * box offers the most-used places as one-tap chips and matches what is typed
 * against registered stores and against what was typed before — but anything
 * may still be written for a place we have never seen.
 *
 * The list comes from GET /admin/places/suggest (spellings already merged on
 * the server with the same placeKey() as below).
 */
import { useQuery } from '@tanstack/react-query';
import { MapPin, Plus, Store } from 'lucide-react';
import { useMemo, useState } from 'react';

import { api } from '../lib/api.js';
import { cn } from '../lib/utils.js';

import { SearchInput } from './ui/Input.js';

export interface PlaceSuggestion {
  kind: 'merchant' | 'place';
  /** MerchantProfile id — only for a registered store. */
  id?: string;
  name: string;
  city?: string | null;
  /** Orders picked up there over the last 90 days. */
  count: number;
}

/**
 * A place name reduced to what identifies it. MIRRORS placeKey() in
 * apps/backend/dist-bundle/api.php — keep the two equal.
 */
export function placeKey(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/[ً-ٰٟـ]/g, '');
  s = s
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي');
  s = s.replace(/[^\p{L}\p{N}]+/gu, ' ');
  const noise = new Set([
    'من',
    'مطعم',
    'مطاعم',
    'صيدليه',
    'صدليه',
    'محل',
    'محلات',
    'كافيه',
    'كافي',
    'مخبز',
    'فرن',
    'سوبر',
    'ماركت',
    'سوبرماركت',
    'هايبر',
    'د',
    'دكتور',
    'دكتوره',
  ]);
  const out: string[] = [];
  for (let w of s.trim().split(/\s+/)) {
    if (!w || noise.has(w)) continue;
    if (w.length > 4 && w.startsWith('عال')) w = w.slice(3);
    else if (w.length > 3 && w.startsWith('ال')) w = w.slice(2);
    if (w.length < 2) continue;
    out.push(w);
  }
  return out.join(' ');
}

export function usePlaceSuggestions() {
  return useQuery({
    queryKey: ['places', 'suggest'],
    queryFn: () =>
      api.raw
        .get('/admin/places/suggest')
        .then((r) => (r.data?.data?.items ?? []) as PlaceSuggestion[]),
    staleTime: 10 * 60_000,
  });
}

/** «مطعم الحسن والحسين ( كرم الحناوي )» reads as one chip, not a sentence. */
const short = (n: string) => n.replace(/\s*\(.*?\)\s*/g, ' ').trim() || n;

export function PlacePicker({
  value,
  onChange,
  onPick,
  chosen = [],
  placeholder = 'اكتب اسم المحل أو المطعم… أو اختار من تحت',
  freeTextLabel,
  chips = 8,
}: {
  value: string;
  onChange: (text: string) => void;
  onPick: (s: PlaceSuggestion) => void;
  /** Keys (placeKey) of places already on the order — their chips show as picked. */
  chosen?: string[];
  placeholder?: string;
  /** When set, the dropdown ends with a row that picks the typed text as an unregistered place. */
  freeTextLabel?: (text: string) => string;
  chips?: number;
}) {
  const { data: all = [], isLoading } = usePlaceSuggestions();
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);

  const q = value.trim();
  const qk = placeKey(q);
  const matches = useMemo(() => {
    if (!q) return [];
    const ql = q.toLowerCase();
    return all
      .filter((s) => {
        const k = placeKey(s.name);
        return (qk !== '' && k.includes(qk)) || s.name.toLowerCase().includes(ql);
      })
      .slice(0, 8);
  }, [all, q, qk]);
  const exact = matches.some((s) => placeKey(s.name) === qk && qk !== '');
  const rows: PlaceSuggestion[] = [
    ...matches,
    ...(freeTextLabel && q && !exact ? [{ kind: 'place' as const, name: q, count: 0 }] : []),
  ];
  const picked = new Set(chosen);

  const pick = (s: PlaceSuggestion) => {
    onPick(s);
    setOpen(false);
    setHi(0);
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <MapPin className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-muted-foreground pointer-events-none" />
        <SearchInput
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setHi(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (!open || rows.length === 0) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHi((h) => Math.min(rows.length - 1, h + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHi((h) => Math.max(0, h - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const r = rows[hi];
              if (r) pick(r);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          className="ps-9"
        />
        {open && rows.length > 0 && (
          <div
            className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border border-border bg-white shadow-lg divide-y divide-border"
            // Keep focus in the box: a click on a row must not blur it first.
            onMouseDown={(e) => e.preventDefault()}
          >
            {rows.map((s, i) => {
              const isFree = i >= matches.length;
              return (
                <button
                  key={`${s.kind}:${s.id ?? s.name}:${i}`}
                  type="button"
                  onMouseEnter={() => setHi(i)}
                  onClick={() => pick(s)}
                  className={cn(
                    'w-full text-start px-3 py-2 text-sm flex items-center gap-2',
                    i === hi ? 'bg-muted/60' : 'hover:bg-muted/40',
                  )}
                >
                  {isFree ? (
                    <Plus className="w-4 h-4 text-brand-red shrink-0" />
                  ) : s.kind === 'merchant' ? (
                    <Store className="w-4 h-4 text-brand-red shrink-0" />
                  ) : (
                    <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                  <span className="flex-1 min-w-0 truncate font-bold">
                    {isFree ? freeTextLabel!(s.name) : s.name}
                  </span>
                  {!isFree && (
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {s.kind === 'merchant'
                        ? `متجر مسجّل${s.city ? ` · ${s.city}` : ''}`
                        : 'اتكتب قبل كده'}
                      {s.count > 0 ? ` · ${s.count} طلب` : ''}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!isLoading && all.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-muted-foreground">الأكثر طلبًا:</span>
          {all.slice(0, chips).map((s) => {
            const on = picked.has(placeKey(s.name)) || (s.id ? picked.has(s.id) : false);
            return (
              <button
                key={`${s.kind}:${s.id ?? s.name}`}
                type="button"
                onClick={() => pick(s)}
                title={`${s.name} — ${s.count} طلب في آخر ٣ شهور`}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold transition',
                  on
                    ? 'border-brand-red bg-brand-red/5 text-brand-red'
                    : 'border-border bg-card hover:border-brand-red/50',
                )}
              >
                {s.kind === 'merchant' ? (
                  <Store className="w-3 h-3" />
                ) : (
                  <MapPin className="w-3 h-3" />
                )}
                {short(s.name)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
