/**
 * PhoneInput — Egyptian phone entry with a locked "+2" prefix chip.
 *
 * The visible input holds the local part exactly as the user types it
 * (e.g. "01010254819"). The parent always receives the canonical E.164
 * form ("+201010254819"), so upstream code doesn't have to think about
 * the country code.
 *
 * Why we keep local state instead of deriving from `value` every render:
 * every keystroke would round-trip through the parent, which normalises
 * `+2` + `stripLeadingZero` — that clobbered the visible leading zero
 * mid-typing and made digits appear to be typed twice.
 */
import { forwardRef, useEffect, useRef, useState } from 'react';

interface PhoneInputProps {
  value: string;
  onChange: (fullPhone: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  autoFocus?: boolean;
  className?: string;
}

// Turn a parent-supplied value into the local part shown in the input:
//   "+201010254819" → "01010254819"
//   "201010254819"  → "01010254819"
//   "01010254819"   → "01010254819"
//   "1010254819"    → "01010254819"  (Egyptians write the leading 0)
function toLocal(v: string): string {
  const d = (v ?? '').replace(/[^\d]/g, '');
  if (d.startsWith('20') && d.length >= 11) return '0' + d.slice(2);
  if (d.length === 10 && d.startsWith('1')) return '0' + d;
  return d;
}

// Turn what's currently in the input into the canonical +20 form.
function toE164(local: string): string {
  const digits = local.replace(/[^\d]/g, '').replace(/^0+/, '');
  return digits ? `+20${digits}` : '';
}

export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(function PhoneInput(
  { value, onChange, placeholder = '01010254819', disabled, required, id, autoFocus, className },
  ref,
) {
  const [local, setLocal] = useState<string>(() => toLocal(value));
  const lastSent = useRef<string>(toE164(local));

  // Sync ONE-WAY from parent when it changes for a different reason than our
  // own onChange (e.g. form reset, prefilled edit). Compare against what we
  // last sent so the parent normalising us doesn't wipe the visible zero.
  useEffect(() => {
    if (value !== lastSent.current) {
      setLocal(toLocal(value));
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Cap to 11 digits so a slip of the finger can't produce a 12-digit
    // number that then re-normalises weirdly.
    const raw = e.target.value.replace(/[^\d]/g, '').slice(0, 11);
    setLocal(raw);
    const e164 = toE164(raw);
    lastSent.current = e164;
    onChange(e164);
  };

  return (
    // Force the wrapper into LTR so the "+2" chip lands on the LEFT of the
    // input regardless of the surrounding RTL page direction.
    <div
      dir="ltr"
      className={`flex items-stretch rounded-lg border border-input focus-within:border-brand-red focus-within:ring-2 focus-within:ring-brand-red/20 overflow-hidden transition ${
        disabled ? 'opacity-60' : ''
      } ${className ?? ''}`}
    >
      <span
        aria-hidden
        className="grid place-items-center px-3 bg-muted text-brand-dark font-bold text-sm border-r border-input select-none"
      >
        +2
      </span>
      <input
        ref={ref}
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="off"
        dir="ltr"
        maxLength={11}
        placeholder={placeholder}
        value={local}
        onChange={handleChange}
        disabled={disabled}
        required={required}
        autoFocus={autoFocus}
        className="flex-1 px-3 py-2.5 outline-none bg-transparent text-brand-dark placeholder:text-muted-foreground"
      />
    </div>
  );
});
