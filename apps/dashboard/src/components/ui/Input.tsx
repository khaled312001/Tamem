import { forwardRef, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

import { cn } from '../../lib/utils.js';

const INPUT_CLASS =
  'w-full px-3 py-2 rounded-lg border border-input bg-white focus:border-brand-red focus:ring-2 focus:ring-brand-red/20 outline-none transition text-sm';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(INPUT_CLASS, className)} {...rest} />;
  },
);

/**
 * A search / filter box the browser's password manager cannot fill.
 *
 * Chrome kept typing the admin's saved login email into list searches — on
 * load, or the moment anything on the page was clicked — which silently
 * filtered the table down to nothing. `autocomplete="off"` does not stop it:
 * Chrome ignores that for saved credentials, and `type="search"` alone did not
 * either. What every browser and password-manager extension does respect is
 * `readOnly`, so the box is read-only except while the user is actually in it.
 *
 * `bare` keeps the caller's className as-is, for boxes styled from scratch.
 */
export const SearchInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { bare?: boolean }
>(function SearchInput(
  { className, bare, readOnly, onPointerDown, onFocus, onBlur, ...rest },
  ref,
) {
  const [armed, setArmed] = useState(false);
  return (
    <input
      ref={ref}
      type="search"
      name="list-search"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      data-lpignore="true"
      data-1p-ignore=""
      data-bwignore=""
      data-form-type="other"
      {...rest}
      readOnly={readOnly || !armed}
      // pointerdown comes before focus, so a tap on a phone opens the keyboard.
      onPointerDown={(e) => {
        setArmed(true);
        onPointerDown?.(e);
      }}
      onFocus={(e) => {
        setArmed(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setArmed(false);
        onBlur?.(e);
      }}
      className={bare ? className : cn(INPUT_CLASS, className)}
    />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full px-3 py-2 rounded-lg border border-input bg-white focus:border-brand-red focus:ring-2 focus:ring-brand-red/20 outline-none transition text-sm',
        className,
      )}
      {...rest}
    />
  );
});

export interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}

export function Field({ label, htmlFor, hint, error, required, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-bold">
        {label}
        {required && <span className="text-destructive mr-1">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
