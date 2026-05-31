/**
 * Tiny pub-sub Toast queue. `showToast({...})` from anywhere; a single
 * <ToastHost /> mounted near the navigation root renders the active toast.
 *
 * Now a real FIFO queue — back-to-back errors used to overwrite each other
 * (e.g. upload failure followed by submit failure surfaced only the second).
 * We keep up to 4 in the queue, dedupe identical titles within ~1s, and
 * surface them one after the other.
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
const queue: ToastRecord[] = [];
let active: ToastRecord | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const recentTitles: Map<string, number> = new Map();

const MAX_QUEUE = 4;
const DEDUPE_WINDOW_MS = 1000;

function emit(): void {
  listeners.forEach((fn) => fn(active));
}

function scheduleAdvance(): void {
  if (timer) clearTimeout(timer);
  if (!active) return;
  timer = setTimeout(() => advance(), active.durationMs);
}

function advance(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  active = queue.shift() ?? null;
  emit();
  if (active) scheduleAdvance();
}

export function showToast(input: ToastInput): void {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const last = recentTitles.get(input.title);
  if (last && now - last < DEDUPE_WINDOW_MS) return;
  recentTitles.set(input.title, now);

  const toast: ToastRecord = {
    id: nextId++,
    title: input.title,
    message: input.message,
    tone: input.tone ?? 'success',
    durationMs: input.durationMs ?? 3200,
  };

  if (!active) {
    active = toast;
    emit();
    scheduleAdvance();
    return;
  }
  if (queue.length < MAX_QUEUE) queue.push(toast);
}

export function dismissToast(): void {
  advance();
}

export function subscribeToast(fn: (t: ToastRecord | null) => void): () => void {
  listeners.add(fn);
  fn(active);
  return () => listeners.delete(fn);
}
