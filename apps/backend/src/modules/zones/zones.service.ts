import { prisma } from '../../db/prisma.js';

/**
 * Result of {@link getDeliveryPriceFor}.
 *
 * `source` records which row supplied the price so the dashboard / mobile
 * can surface a helpful tooltip ("سعر المنطقة" vs "سعر القرية"). When no
 * price is configured at either level we return `null` and the caller is
 * expected to refuse the order with a BadRequestError.
 */
export interface DeliveryPriceResult {
  price: number;
  source: 'AREA' | 'VILLAGE';
  cityId: string;
  villageId: string;
  areaId: string;
  cityName: string;
  villageName: string;
  areaName: string;
}

/**
 * Error codes returned from {@link getDeliveryPriceFor}. The controller
 * translates these into BadRequest responses with proper Arabic messages.
 */
export type DeliveryPriceError =
  | 'INVALID_HIERARCHY' // FK chain broken (area doesn't belong to village, etc.)
  | 'INACTIVE_ZONE' // a parent zone is soft-deleted
  | 'NO_PRICE_CONFIGURED'; // neither area nor village has a price

export interface DeliveryPriceFailure {
  error: DeliveryPriceError;
  cityName?: string;
  villageName?: string;
  areaName?: string;
}

/**
 * Resolves the delivery fee for an (areaId, villageId, cityId) tuple via
 * the 3-tier fallback: area.deliveryPrice → village.baseDeliveryPrice →
 * null. Validates the FK chain in one query so a tampered client can't
 * mix an area from village A with village B.
 *
 * Pure / side-effect-free; used both by /zones/quote-delivery (preview)
 * and by orders.customer.controller.ts (authoritative on order create).
 *
 * Returns `{ ok: true, value }` on success and `{ ok: false, error }` on
 * any of: bad FK chain, inactive zone in the chain, or no price set at
 * either tier. We deliberately do NOT throw — callers want to format the
 * error differently (BadRequest vs 404) and we keep the function pure.
 */
export async function getDeliveryPriceFor(input: {
  cityId: string;
  villageId: string;
  areaId: string;
}): Promise<
  | { ok: true; value: DeliveryPriceResult }
  | { ok: false; error: DeliveryPriceError; failure: DeliveryPriceFailure }
> {
  const { cityId, villageId, areaId } = input;

  // Load the area with its village + city in one round-trip so we can
  // validate the entire chain matches and grab names for the response.
  const area = await prisma.area.findUnique({
    where: { id: areaId },
    include: {
      village: {
        include: { city: true },
      },
    },
  });

  if (!area || area.villageId !== villageId || area.village.cityId !== cityId) {
    return {
      ok: false,
      error: 'INVALID_HIERARCHY',
      failure: { error: 'INVALID_HIERARCHY' },
    };
  }

  // Any soft-deleted zone in the chain → refuse. The customer shouldn't
  // be able to pick a hidden zone from the picker, but we double-check
  // server-side in case the row was archived between picker load and
  // order submit.
  if (!area.isActive || !area.village.isActive || !area.village.city.isActive) {
    return {
      ok: false,
      error: 'INACTIVE_ZONE',
      failure: {
        error: 'INACTIVE_ZONE',
        cityName: area.village.city.nameAr,
        villageName: area.village.nameAr,
        areaName: area.nameAr,
      },
    };
  }

  // Tier 1 — area override (most specific wins).
  if (area.deliveryPrice != null) {
    return {
      ok: true,
      value: {
        price: Number(area.deliveryPrice),
        source: 'AREA',
        cityId,
        villageId,
        areaId,
        cityName: area.village.city.nameAr,
        villageName: area.village.nameAr,
        areaName: area.nameAr,
      },
    };
  }

  // Tier 2 — village base price.
  if (area.village.baseDeliveryPrice != null) {
    return {
      ok: true,
      value: {
        price: Number(area.village.baseDeliveryPrice),
        source: 'VILLAGE',
        cityId,
        villageId,
        areaId,
        cityName: area.village.city.nameAr,
        villageName: area.village.nameAr,
        areaName: area.nameAr,
      },
    };
  }

  // Tier 3 — no price configured. Order create will refuse.
  return {
    ok: false,
    error: 'NO_PRICE_CONFIGURED',
    failure: {
      error: 'NO_PRICE_CONFIGURED',
      cityName: area.village.city.nameAr,
      villageName: area.village.nameAr,
      areaName: area.nameAr,
    },
  };
}
