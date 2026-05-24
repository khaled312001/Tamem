import { create } from 'zustand';

export type NotifKind = 'order:new' | 'order:status' | 'alert:new' | 'payment:new';

export interface InboxItem {
  id: string;
  kind: NotifKind;
  title: string;
  body: string;
  link?: string;
  refId?: string;
  at: number;
  read: boolean;
}

interface NotificationsState {
  items: InboxItem[];
  unreadCount: number;
  push: (item: Omit<InboxItem, 'id' | 'at' | 'read'>) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  clear: () => void;
}

const MAX_ITEMS = 50;

export const useNotifications = create<NotificationsState>((set) => ({
  items: [],
  unreadCount: 0,
  push: (partial) => {
    set((s) => {
      const item: InboxItem = {
        ...partial,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        at: Date.now(),
        read: false,
      };
      const items = [item, ...s.items].slice(0, MAX_ITEMS);
      return { items, unreadCount: s.unreadCount + 1 };
    });
  },
  markAllRead: () =>
    set((s) => ({
      items: s.items.map((i) => ({ ...i, read: true })),
      unreadCount: 0,
    })),
  remove: (id) =>
    set((s) => {
      const it = s.items.find((x) => x.id === id);
      return {
        items: s.items.filter((x) => x.id !== id),
        unreadCount: Math.max(0, s.unreadCount - (it && !it.read ? 1 : 0)),
      };
    }),
  clear: () => set({ items: [], unreadCount: 0 }),
}));
