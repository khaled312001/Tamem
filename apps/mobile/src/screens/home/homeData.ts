/**
 * Shared home-screen contracts.
 *
 * These types and constants used to live as private consts inside HomeScreen.
 * They were lifted here — unchanged — so HomeV2 can reuse the exact same
 * definitions instead of duplicating them. HomeScreen imports them from here
 * now, so there is still exactly ONE definition of each.
 */
import type { OrderStatus } from '@tamem/types';

export interface Offer {
  id: string;
  title: string;
  titleAr: string;
  imageUrl?: string;
  code?: string | null;
  termsAr?: string | null;
}

export interface Merchant {
  id: string;
  storeNameAr: string;
  rating?: number | null;
  isOpen: boolean;
  /// `id` is returned by /merchants (merchantShape builds the nested object);
  /// it's what lets the categories row count stores without another request.
  category?: { id?: string; nameAr: string };
  /// Server-computed openness — preferred over the raw isOpen toggle.
  /// `message` is human copy like "يفتح غداً 10ص"; showing it instead of a bare
  /// "مغلق" keeps a closed store useful rather than a dead end.
  openness?: { isOpenNow: boolean; message: string | null; nextOpenAt?: string | null };
  /// Only present when the merchant list was queried with lat/lng.
  distanceKm?: number;
  /// Customer-visible product count (excludes hidden/unavailable rows).
  productCount?: number;
  /// Server-decided (30-day window) so the rule lives in one place.
  isNew?: boolean;
  /// Optional presentation fields. The list endpoint returns them for merchants
  /// that have them set; every consumer must treat each as absent-by-default.
  logoUrl?: string | null;
  coverUrl?: string | null;
  deliveryFee?: number | string | null;
  etaMinutes?: number | null;
  hasOffers?: boolean | null;
}

export interface ActiveOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  category: string;
  finalPrice?: number | null;
  quotedPrice?: number | null;
  service?: { nameAr: string };
}

/** Product card on the home rails. Shape matches GET /products. */
export interface HomeProduct {
  id: string;
  nameAr: string;
  price: number | string;
  /** Set when the merchant discounted this item. */
  salePrice?: number | string | null;
  /** Percentage discount, an alternative knob to salePrice. */
  discount?: number | string | null;
  /** Optional expiry for a timed offer — drives the countdown on deal cards. */
  saleEndsAt?: string | null;
  imageUrl?: string | null;
  merchant?: { id: string; storeNameAr: string };
}

/** Category tile on the home grid. Shape matches GET /categories. */
export interface HomeCategory {
  id: string;
  name: string;
  nameAr: string;
  iconUrl?: string | null;
  sortOrder: number;
}

export interface SavedAddress {
  id: string;
  label: string;
  address: string;
  isDefault: boolean;
}

/** Server-driven home configuration. Every field can be null → use defaults. */
export interface HomeConfig {
  heroGreeting: string | null;
  heroSubtitle: string | null;
  heroGradient: string[] | null;
  trustStripTitle: string | null;
  trustStripSubtitle: string | null;
  promoBannerCouponId: string | null;
  promoBannerTitle: string | null;
  promoBannerCode: string | null;
  promoCoupon: {
    id: string;
    code: string;
    type: 'PERCENTAGE' | 'FLAT';
    value: string;
    description: string | null;
  } | null;
  visibleServiceKeys: string[] | null;
  featuredMerchantIds: string[] | null;
  featuredOfferIds: string[] | null;
  /** Admin-curated products for the "الأكثر طلباً" rail. */
  featuredProductIds: string[] | null;
  showPromoBanner: boolean;
  showTrustStrip: boolean;
  /** Admin-defined order + visibility (+ title override) for the home sections.
   *  null → the built-in default order below. */
  sectionLayout: HomeSectionConfig[] | null;
}

/** The reorderable/hideable sections of the home screen. Keep in sync with the
 *  dashboard's home-settings "ترتيب الأقسام" tab (it can't import this file). */
export type HomeSectionKey =
  | 'services'
  | 'offersSlider'
  | 'categories'
  | 'productSections'
  | 'featuredProducts'
  | 'deals'
  | 'popularStores'
  | 'nearbyStores'
  | 'promoCards'
  | 'trustStrip'
  | 'quickActions';

export interface HomeSectionConfig {
  key: HomeSectionKey;
  visible: boolean;
  /** Optional title override — only honoured by the titled rails. */
  title?: string | null;
}

/**
 * Built-in order + default titles. This IS the current home order, so an empty
 * `sectionLayout` reproduces today's screen exactly. `title` is only meaningful
 * for the two product rails; the other sections carry their own headers.
 */
export const DEFAULT_HOME_SECTIONS: { key: HomeSectionKey; defaultTitle?: string }[] = [
  { key: 'services' },
  { key: 'offersSlider' },
  { key: 'categories' },
  { key: 'productSections' },
  { key: 'featuredProducts', defaultTitle: 'الأكثر طلباً' },
  { key: 'deals', defaultTitle: 'عروض اليوم' },
  { key: 'popularStores' },
  { key: 'nearbyStores' },
  { key: 'promoCards' },
  { key: 'trustStrip' },
  { key: 'quickActions' },
];

/**
 * Merge the admin's saved layout over the built-in order. Honours order,
 * visibility and title for configured keys, drops unknown keys, and APPENDS any
 * built-in section the saved layout predates — so shipping a new home section
 * never requires the admin to re-save, it just shows up at the end.
 */
export function resolveHomeSections(
  layout: HomeSectionConfig[] | null | undefined,
): { key: HomeSectionKey; visible: boolean; title?: string }[] {
  const defaults = DEFAULT_HOME_SECTIONS;
  const titleOf = (k: HomeSectionKey) => defaults.find((s) => s.key === k)?.defaultTitle;
  if (!Array.isArray(layout) || layout.length === 0) {
    return defaults.map((s) => ({ key: s.key, visible: true, title: s.defaultTitle }));
  }
  const known = new Set(defaults.map((s) => s.key));
  const seen = new Set<HomeSectionKey>();
  const out: { key: HomeSectionKey; visible: boolean; title?: string }[] = [];
  for (const item of layout) {
    if (!item || !known.has(item.key) || seen.has(item.key)) continue;
    seen.add(item.key);
    out.push({
      key: item.key,
      visible: item.visible !== false,
      title: (item.title && item.title.trim()) || titleOf(item.key),
    });
  }
  for (const s of defaults) {
    if (!seen.has(s.key)) out.push({ key: s.key, visible: true, title: s.defaultTitle });
  }
  return out;
}

/** Statuses that mean "this order is still in flight" → show the active card. */
export const ACTIVE_STATUSES: OrderStatus[] = [
  'NEW',
  'UNDER_REVIEW',
  'PRICED',
  'AWAITING_CUSTOMER_APPROVAL',
  'ACCEPTED',
  'DRIVER_ASSIGNED',
  'PICKED_UP',
  'IN_ROUTE',
];

/** Fallback when the backend hasn't returned a real code on the offer. */
export const FALLBACK_PROMO_CODE = 'TAMEM20';

export type ServiceKey = 'delivery' | 'shipping' | 'merchant';
export type ServiceRoute = 'DeliveryServices' | 'ShippingFlow' | 'MerchantFlow';

/** Short, card-friendly copy for the three headline service cards. */
export const SERVICE_CARD_COPY: Record<ServiceKey, { title: string; subtitle: string }> = {
  delivery: { title: 'دليفري', subtitle: 'داخل المدينة' },
  shipping: { title: 'شحن', subtitle: 'بين المناطق' },
  merchant: { title: 'تاجر', subtitle: 'طلبات جملة' },
};

/**
 * Per-service palette for the V2 cards. Tints only — the route/key/order still
 * come from the SERVICES list the old screen already owns.
 */
/**
 * Illustration per service card. `require` is resolved at bundle time, so these
 * must be static — a computed path would break the release build.
 *
 * The sources are ~1024px; these are downscaled to 300px (full-res originals
 * kept in assets/_originals/). They render in a ~90px box, and shipping the
 * originals would have added 5.7 MB to the app for three thumbnails.
 */
/* eslint-disable @typescript-eslint/no-var-requires */
export const SERVICE_IMAGE: Record<ServiceKey, number> = {
  delivery: require('../../assets/home/service-delivery.jpeg'),
  shipping: require('../../assets/home/service-shipping.jpeg'),
  merchant: require('../../assets/home/service-merchant.jpeg'),
};

// Unified orange/logo palette across the three service cards (per request),
// with slightly different warm tints so the row still has gentle variety.
export const SERVICE_THEME: Record<ServiceKey, { bg: string; fg: string }> = {
  delivery: { bg: '#FFF3E6', fg: '#EC7A2C' },
  shipping: { bg: '#FFF4E8', fg: '#E0781E' },
  merchant: { bg: '#FFF6EC', fg: '#EC7A2C' },
};
