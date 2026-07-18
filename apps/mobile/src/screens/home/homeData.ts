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
  category?: { nameAr: string };
  /// Server-computed openness — preferred over the raw isOpen toggle.
  openness?: { isOpenNow: boolean; message: string | null };
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
  showPromoBanner: boolean;
  showTrustStrip: boolean;
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
export const SERVICE_THEME: Record<ServiceKey, { bg: string; fg: string }> = {
  delivery: { bg: '#FFF1F0', fg: '#E0301E' },
  shipping: { bg: '#FFF4E8', fg: '#EC7A2C' },
  merchant: { bg: '#FFF8DF', fg: '#D49316' },
};
