/**
 * Compute a human-friendly ETA window from straight-line distance. Used on
 * merchant cards and tracking screens — better than the hard-coded
 * "20-40 دقيقة" string the merchant detail page used to ship.
 *
 * Assumptions: 25 km/h average urban speed including handoff. Adds 8 minutes
 * for preparation. Output is rounded to 5-minute buckets.
 */

const PREP_MINUTES = 8;
const AVG_KMH = 25;

function bucket(min: number): number {
  return Math.max(5, Math.ceil(min / 5) * 5);
}

export function etaMinutes(distanceKm: number): { min: number; max: number } {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return { min: 25, max: 40 };
  const ride = (distanceKm / AVG_KMH) * 60;
  const base = PREP_MINUTES + ride;
  const min = bucket(base * 0.9);
  const max = bucket(base * 1.3);
  return { min, max: Math.max(max, min + 5) };
}

export function formatEta(distanceKm: number | null | undefined): string {
  if (distanceKm === null || distanceKm === undefined) return '٢٥-٤٠ دقيقة';
  const { min, max } = etaMinutes(distanceKm);
  return `${min}-${max} دقيقة`;
}

/** Haversine distance in km. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function formatDistance(km: number | null | undefined): string {
  if (km === null || km === undefined || !Number.isFinite(km)) return '';
  if (km < 1) return `${Math.round(km * 1000)} م`;
  return `${km.toFixed(1)} كم`;
}

/** Relative-time formatter — "منذ 5 دقائق" / "أمس" / "قبل أسبوع". */
export function formatRelative(date: string | Date | number): string {
  const t =
    typeof date === 'string' || typeof date === 'number'
      ? new Date(date).getTime()
      : date.getTime();
  const seconds = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (seconds < 60) return 'الآن';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'أمس';
  if (days < 7) return `منذ ${days} أيام`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `منذ ${weeks} أسبوع`;
  const months = Math.floor(days / 30);
  if (months < 12) return `منذ ${months} شهر`;
  return new Date(t).toLocaleDateString('ar-EG');
}
