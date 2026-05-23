import { cn } from '../lib/utils.js';

interface LogoProps {
  className?: string;
  variant?: 'full' | 'icon';
}

/**
 * Tamem brand logo. Use 'full' on landing/login/marketing surfaces,
 * 'icon' (square) for compact spots like sidebar header.
 */
export function Logo({ className, variant = 'full' }: LogoProps) {
  if (variant === 'icon') {
    return (
      <div
        className={cn(
          'inline-flex items-center justify-center rounded-lg overflow-hidden bg-white',
          className,
        )}
      >
        <img src="/logo.png" alt="تميم" className="w-full h-full object-contain" />
      </div>
    );
  }
  return <img src="/logo.png" alt="تميم للتوصيل" className={cn('object-contain', className)} />;
}
