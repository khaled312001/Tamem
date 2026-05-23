import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { cn } from '../../lib/utils.js';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

const variantClasses: Record<Variant, string> = {
  primary: 'bg-brand-red text-white hover:bg-brand-red/90 disabled:opacity-50',
  secondary: 'bg-muted text-foreground hover:bg-muted/80',
  ghost: 'bg-transparent hover:bg-muted',
  danger: 'bg-destructive text-white hover:bg-destructive/90',
  outline: 'border border-border bg-white hover:bg-muted',
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-md',
  md: 'px-4 py-2 text-sm rounded-lg',
  lg: 'px-5 py-3 text-base rounded-lg',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'font-bold inline-flex items-center justify-center gap-2 transition disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...rest}
    />
  );
});
