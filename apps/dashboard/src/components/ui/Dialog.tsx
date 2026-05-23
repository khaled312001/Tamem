import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../../lib/utils.js';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizes = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  size = 'md',
}: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" />
        <DialogPrimitive.Content
          className={cn(
            'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[95vw] bg-white rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto',
            sizes[size],
          )}
        >
          {(title || description) && (
            <div className="mb-4">
              {title && (
                <DialogPrimitive.Title className="text-lg font-black text-brand-dark">
                  {title}
                </DialogPrimitive.Title>
              )}
              {description && (
                <DialogPrimitive.Description className="text-sm text-muted-foreground mt-1">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
          )}
          {children}
          <DialogPrimitive.Close className="absolute top-4 end-4 p-1 rounded-md hover:bg-muted">
            <X className="w-4 h-4" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export interface DrawerProps extends DialogProps {
  side?: 'start' | 'end';
}

export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  side = 'end',
}: DrawerProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" />
        <DialogPrimitive.Content
          className={cn(
            'fixed top-0 bottom-0 z-50 w-full max-w-2xl bg-white shadow-2xl overflow-y-auto',
            side === 'end' ? 'right-0' : 'left-0',
          )}
        >
          <div className="sticky top-0 bg-white border-b border-border px-6 py-4 flex items-start justify-between">
            <div>
              {title && (
                <DialogPrimitive.Title className="text-lg font-black text-brand-dark">
                  {title}
                </DialogPrimitive.Title>
              )}
              {description && (
                <DialogPrimitive.Description className="text-sm text-muted-foreground mt-1">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close className="p-1 rounded-md hover:bg-muted">
              <X className="w-5 h-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="p-6">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
