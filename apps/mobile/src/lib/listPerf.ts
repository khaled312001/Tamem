/**
 * Windowing defaults for FlatLists.
 *
 * Without these a FlatList mounts far more rows than fit on screen and keeps
 * every row it has ever rendered mounted, so scrolling a long list gets
 * progressively heavier. OrdersScreen and NotificationsScreen already tuned
 * these by hand; this is the same set, named so the rest can share it.
 *
 * Spread it LAST so a list with unusual row heights can still override:
 *   <FlatList {...LIST_PERF} windowSize={11} ... />
 *
 * `removeClippedSubviews` is deliberately included: it's a real win on Android
 * for the card lists here. Do NOT use it for lists whose rows contain their own
 * horizontal scrollers or absolutely-positioned overflow — it can blank them.
 */
export const LIST_PERF = {
  initialNumToRender: 8,
  maxToRenderPerBatch: 8,
  windowSize: 7,
  removeClippedSubviews: true,
} as const;
