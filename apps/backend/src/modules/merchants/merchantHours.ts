/**
 * Merchant business-hours helpers.
 *
 * The customer can only order from a merchant when:
 *   1. manualStatus = OPEN (admin/merchant hasn't paused), AND
 *   2. there's a BusinessHours window covering the merchant's local
 *      "now" (or no rows at all = always-open legacy mode)
 *
 * We keep the logic here (not inline in createOrder) so the mobile can call
 * the same predicate through an endpoint and stay in sync with the server.
 */
import type { MerchantBusinessHours, MerchantProfile } from '@prisma/client';

import { prisma } from '../../db/prisma.js';

export type MerchantStatus = 'OPEN' | 'CLOSED' | 'TEMPORARILY_CLOSED';

export interface MerchantOpenness {
  /** Final "can the customer order right now?" verdict. */
  isOpenNow: boolean;
  /** Reason the merchant is closed, when isOpenNow=false. */
  reason: 'MANUAL_CLOSED' | 'MANUAL_TEMP_CLOSED' | 'OUT_OF_HOURS' | null;
  /** ISO datetime of the next opening — null when always-open or permanently closed. */
  nextOpenAt: string | null;
  /** Human-friendly Arabic message, ready to render in mobile. */
  message: string | null;
}

const AR_WEEKDAY = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/** "10:30" from 10 hours + 30 minutes, with leading zeros. */
function fmtTime(min: number): string {
  const normalized = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  const period = h >= 12 ? 'م' : 'ص';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${m.toString().padStart(2, '0')} ${period}`;
}

/**
 * Compute the current local date/time in the merchant's timezone.
 * Uses Intl with the given IANA zone — handles DST and any offset shift
 * without bringing in a heavy date library.
 */
function nowInTz(timezone: string): { dayOfWeek: number; minutesIntoDay: number; localDate: Date } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dayOfWeek = weekdayMap[get('weekday')] ?? 0;
  const hour = Number(get('hour'));
  const minute = Number(get('minute'));
  const minutesIntoDay = hour * 60 + minute;
  const localDate = new Date(
    `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:00`,
  );
  return { dayOfWeek, minutesIntoDay, localDate };
}

/**
 * Decide whether a merchant is currently open, given its manual status,
 * timezone, and weekly hours. Returns the verdict plus next-opening info
 * so the mobile UI can show "يفتح غداً ١٠ صباحاً" instead of just "مغلق".
 */
export function isMerchantOpenNow(
  merchant: Pick<MerchantProfile, 'manualStatus' | 'timezone'>,
  hours: MerchantBusinessHours[],
): MerchantOpenness {
  // Manual overrides win over any schedule.
  if (merchant.manualStatus === 'CLOSED') {
    return {
      isOpenNow: false,
      reason: 'MANUAL_CLOSED',
      nextOpenAt: null,
      message: 'المتجر مغلق حالياً',
    };
  }
  if (merchant.manualStatus === 'TEMPORARILY_CLOSED') {
    return {
      isOpenNow: false,
      reason: 'MANUAL_TEMP_CLOSED',
      nextOpenAt: null,
      message: 'المتجر مغلق مؤقتاً، حاول لاحقاً',
    };
  }

  // No hours configured at all → backwards-compat "always open" mode.
  if (hours.length === 0) {
    return { isOpenNow: true, reason: null, nextOpenAt: null, message: null };
  }

  const tz = merchant.timezone || 'Africa/Cairo';
  const { dayOfWeek, minutesIntoDay, localDate } = nowInTz(tz);

  // Find any window covering "now" on the current day.
  const todayWindows = hours.filter((h) => h.dayOfWeek === dayOfWeek && !h.isClosed);
  for (const w of todayWindows) {
    if (minutesIntoDay >= w.openMin && minutesIntoDay < w.closeMin) {
      return { isOpenNow: true, reason: null, nextOpenAt: null, message: null };
    }
  }

  // Closed right now — find the next opening up to 7 days ahead.
  const next = findNextOpening(hours, dayOfWeek, minutesIntoDay, localDate);
  return {
    isOpenNow: false,
    reason: 'OUT_OF_HOURS',
    nextOpenAt: next?.iso ?? null,
    message: next?.message ?? 'المتجر مغلق حالياً',
  };
}

/**
 * Find the next moment the merchant opens. Returns null when no opening
 * exists in the next 7 days (effectively shut for the week).
 */
function findNextOpening(
  hours: MerchantBusinessHours[],
  todayDow: number,
  nowMin: number,
  localNow: Date,
): { iso: string; message: string } | null {
  // Look at today's later windows first, then the next 7 days.
  for (let offset = 0; offset < 7; offset++) {
    const dow = (todayDow + offset) % 7;
    const dayHours = hours
      .filter((h) => h.dayOfWeek === dow && !h.isClosed)
      .sort((a, b) => a.openMin - b.openMin);
    for (const w of dayHours) {
      if (offset === 0 && w.openMin <= nowMin) continue;
      const when = new Date(localNow);
      when.setDate(when.getDate() + offset);
      when.setHours(0, 0, 0, 0);
      when.setMinutes(w.openMin);
      const dayLabel = offset === 0 ? 'اليوم' : offset === 1 ? 'غداً' : `يوم ${AR_WEEKDAY[dow]}`;
      return {
        iso: when.toISOString(),
        message: `يفتح ${dayLabel} الساعة ${fmtTime(w.openMin)}`,
      };
    }
  }
  return null;
}

/** Fetch + compute openness in a single call — used by createOrder guard. */
export async function getMerchantOpenness(merchantId: string): Promise<MerchantOpenness | null> {
  const merchant = await prisma.merchantProfile.findUnique({
    where: { id: merchantId },
    select: { manualStatus: true, timezone: true },
  });
  if (!merchant) return null;
  const hours = await prisma.merchantBusinessHours.findMany({
    where: { merchantId },
  });
  return isMerchantOpenNow(merchant, hours);
}
