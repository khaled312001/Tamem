/**
 * Tiny pub-sub Toast queue. `showToast({...})` from anywhere; a single
 * <ToastHost /> mounted near the navigation root renders the active toast.
 *
 * Why not Alert.alert? On RN-Web, Alert.alert maps to window.alert which is
 * synchronous, modal, and breaks layout — the user has to dismiss before the
 * page is interactive again. Toast keeps the flow uninterrupted.
 */
export type ToastTone = 'success' | 'error' | 'info';

export interface ToastInput {
  title: string;
  message?: string;
  tone?: ToastTone;
  durationMs?: number;
}

export interface ToastRecord extends Required<Omit<ToastInput, 'message'>> {
  id: number;
  message?: string;
}

let nextId = 1;
const listeners = new Set<(t: ToastRecord | null) => void>();
let active: ToastRecord | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export function showToast(input: ToastInput): void {
  const toast: ToastRecord = {
    id: nextId++,
    title: input.title,
    message: input.message,
    tone: input.tone ?? 'success',
    durationMs: input.durationMs ?? 3200,
  };
  if (timer) clearTimeout(timer);
  active = toast;
  listeners.forEach((fn) => fn(toast));
  timer = setTimeout(() => dismissToast(), toast.durationMs);
}

export function dismissToast(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  active = null;
  listeners.forEach((fn) => fn(null));
}

export function subscribeToast(fn: (t: ToastRecord | null) => void): () => void {
  listeners.add(fn);
  fn(active);
  return () => listeners.delete(fn);
}
