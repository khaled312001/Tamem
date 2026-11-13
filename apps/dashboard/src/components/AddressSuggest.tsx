/**
 * «إلى» — where the order goes, on the two manual-order screens.
 *
 * Agents type the same addresses all day. The box offers what was typed
 * before: the caller's own addresses (saved ones, then the ones on their past
 * orders) as one-tap chips once the screen knows who is calling, and, while
 * typing, matches from every address used at least twice in the last six
 * months. Picking one also hands back its zone, so the manual order can set
 * the city / village / area in the same tap. Anything may still be typed.
 *
 * The list comes from GET /admin/addresses/suggest (spellings merged on the
 * server with the same placeKey() as below).
 */
import { useQuery } from '@tanstack/react-query';
import { History, Home, MapPin } from 'lucide-react';
import { useMemo, useState, type KeyboardEvent } from 'react';

import { api } from '../lib/api.js';
import { cn } from '../lib/utils.js';

import { placeKey } from './PlacePicker.js';
import { Input, Textarea } from './ui/Input.js';

export interface AddressSuggestion {
  address: string;
  /** The customer's own name for it («البيت»), for a saved address. */
  label?: string | null;
  /** True for a saved address, false for one only seen on an order. */
  saved?: boolean;
  /** How many orders went there (common list only). */
  count?: number;
  cityId?: string | null;
  villageId?: string | null;
  areaId?: string | null;
  /** «قفط المدينة — الحي الشرقي», empty when the address has no zone. */
  zone?: string;
}

interface SuggestResponse {
  common: AddressSuggestion[];
  customer: AddressSuggestion[];
}

export function useAddressSuggestions(customerId: string | null) {
  return useQuery({
    queryKey: ['addresses', 'suggest', customerId ?? ''],
    queryFn: () =>
      api.raw
        .get('/admin/addresses/suggest', { params: customerId ? { customerId } : {} })
        .then((r) => (r.data?.data ?? { common: [], customer: [] }) as SuggestResponse),
    staleTime: 5 * 60_000,
  });
}

export function AddressSuggest({
  value,
  onChange,
  onPick,
  customerId,
  multiline = false,
  placeholder,
}: {
  value: string;
  onChange: (text: string) => void;
  onPick: (s: AddressSuggestion) => void;
  /** Set once the caller is matched; their own addresses then show as chips. */
  customerId: string | null;
  multiline?: boolean;
  placeholder?: string;
}) {
  const { data } = useAddressSuggestions(customerId);
  const mine = data?.customer ?? [];
  const common = data?.common ?? [];
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);

  const q = value.trim();
  const qk = placeKey(q);
  const matches = useMemo(() => {
    if (q.length < 2) return [];
    const ql = q.toLowerCase();
    const hit = (s: AddressSuggestion) => {
      const k = placeKey(s.address);
      return (qk !== '' && k.includes(qk)) || s.address.toLowerCase().includes(ql);
    };
    const seen = new Set<string>();
    const out: AddressSuggestion[] = [];
    for (const s of [...mine.filter(hit), ...common.filter(hit)]) {
      const k = placeKey(s.address);
      // Already exactly what is in the box: nothing to suggest.
      if (seen.has(k) || k === qk) continue;
      seen.add(k);
      out.push(s);
      if (out.length >= 8) break;
    }
    return out;
  }, [mine, common, q, qk]);

  const pick = (s: AddressSuggestion) => {
    onPick(s);
    setOpen(false);
    setHi(0);
  };

  const inputProps = {
    value,
    onChange: (e: { target: { value: string } }) => {
      onChange(e.target.value);
      setOpen(true);
      setHi(0);
    },
    onFocus: () => setOpen(true),
    onBlur: () => setOpen(false),
    onKeyDown: (e: KeyboardEvent) => {
      if (!open || matches.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHi((h) => Math.min(matches.length - 1, h + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHi((h) => Math.max(0, h - 1));
      } else if (e.key === 'Enter') {
        const r = matches[hi];
        if (r) {
          e.preventDefault();
          pick(r);
        }
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    },
    placeholder,
  };

  return (
    <div className="space-y-2">
      {mine.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-muted-foreground">عناوين العميل:</span>
          {mine.map((s) => {
            const on = placeKey(s.address) === qk && qk !== '';
            return (
              <button
                key={s.address}
                type="button"
                onClick={() => pick(s)}
                title={[s.address, s.zone].filter(Boolean).join(' — ')}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold transition max-w-[16rem]',
                  on
                    ? 'border-brand-red bg-brand-red text-white'
                    : 'border-border bg-card hover:border-brand-red/50',
                )}
              >
                {s.saved ? (
                  <Home className="w-3 h-3 shrink-0" />
                ) : (
                  <History className="w-3 h-3 shrink-0" />
                )}
                <span className="truncate">{s.label ? `${s.label}: ${s.address}` : s.address}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="relative">
        {multiline ? <Textarea rows={2} {...inputProps} /> : <Input {...inputProps} />}
        {open && matches.length > 0 && (
          <div
            className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border border-border bg-white shadow-lg divide-y divide-border"
            // Keep focus in the box: a click on a row must not blur it first.
            onMouseDown={(e) => e.preventDefault()}
          >
            {matches.map((s, i) => (
              <button
                key={`${s.address}:${i}`}
                type="button"
                onMouseEnter={() => setHi(i)}
                onClick={() => pick(s)}
                className={cn(
                  'w-full text-start px-3 py-2 text-sm flex items-center gap-2',
                  i === hi ? 'bg-muted/60' : 'hover:bg-muted/40',
                )}
              >
                {s.saved !== undefined ? (
                  <Home className="w-4 h-4 text-brand-red shrink-0" />
                ) : (
                  <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <span className="flex-1 min-w-0">
                  <span className="block truncate font-bold">{s.address}</span>
                  {s.zone ? (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {s.zone}
                    </span>
                  ) : null}
                </span>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {s.saved !== undefined
                    ? 'من عناوين العميل'
                    : `اتكتب قبل كده${s.count ? ` · ${s.count} طلب` : ''}`}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
