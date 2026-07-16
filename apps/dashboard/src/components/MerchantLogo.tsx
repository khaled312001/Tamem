import { useState } from 'react';

const SIZES = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-lg',
  xl: 'w-20 h-20 text-2xl',
} as const;

/** Stable per-merchant colour so the same store keeps the same avatar tint
 *  everywhere it appears, instead of flickering between renders. */
const TINTS = [
  'bg-brand-orange',
  'bg-blue-500',
  'bg-emerald-500',
  'bg-purple-500',
  'bg-rose-500',
  'bg-amber-500',
  'bg-teal-500',
  'bg-indigo-500',
];

function tintFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length] as string;
}

/**
 * The merchant's logo, with an initial-letter avatar when there isn't one.
 * A broken logoUrl falls back to the same avatar rather than showing the
 * browser's broken-image glyph.
 */
export function MerchantLogo({
  merchant,
  size = 'md',
  className = '',
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  merchant: any;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const name = String(merchant?.storeNameAr ?? merchant?.storeName ?? '');
  const url = merchant?.logoUrl;
  const box = `${SIZES[size]} rounded-xl shrink-0 overflow-hidden ${className}`;

  if (url && !broken) {
    return (
      <img
        src={url}
        alt=""
        onError={() => setBroken(true)}
        className={`${box} object-cover border border-border bg-white`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`${box} grid place-items-center font-black text-white ${tintFor(String(merchant?.id ?? name))}`}
    >
      {name.trim()[0] ?? '؟'}
    </span>
  );
}
