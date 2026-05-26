/**
 * OrdersMap — bird's-eye view of all currently-active orders with their
 * delivery destinations + the live position of any assigned drivers. Used by
 * /orders to give the admin a spatial overview when they want it.
 *
 * - Tiles: OpenStreetMap (free, no key)
 * - Driver markers update live via the `driver:location` socket event so the
 *   blue dot follows the actual GPS push from the driver's phone.
 * - Click any marker -> opens the order detail page.
 *
 * Like MapPicker we use vanilla Leaflet (not react-leaflet) to avoid the
 * react-context "render2 is not a function" crash under React 18 strict mode.
 */
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { connectSocket } from '../lib/socket.js';

// Patch default marker icons once so they resolve through Vite's bundler.
const ORDER_ICON = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = ORDER_ICON;

const QIFT_CENTER: [number, number] = [26.0297, 32.8146];

// Inline data-URI for a small red truck SVG icon — used for driver markers.
function driverDivIcon(): L.DivIcon {
  return L.divIcon({
    html: `<div style="
      background:#E0301E;color:#fff;border-radius:999px;
      width:32px;height:32px;display:flex;align-items:center;justify-content:center;
      font-size:14px;font-weight:900;box-shadow:0 0 0 3px #fff,0 4px 12px rgba(224,48,30,0.4);
      ">🚚</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    className: '',
  });
}

export interface OrdersMapOrder {
  id: string;
  orderNumber: string;
  status: string;
  customer?: { name?: string | null } | null;
  deliveryLat?: string | number | null;
  deliveryLng?: string | number | null;
  deliveryAddress?: string | null;
  assignedDriver?: {
    id: string;
    name?: string | null;
    driverProfile?: {
      currentLat?: string | number | null;
      currentLng?: string | number | null;
      vehicleType?: string | null;
    } | null;
  } | null;
}

interface OrdersMapProps {
  orders: OrdersMapOrder[];
  height?: number;
}

export function OrdersMap({ orders, height = 420 }: OrdersMapProps) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const orderMarkersRef = useRef<L.Marker[]>([]);
  const driverMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const navigate = useNavigate();

  // Group orders by driver so we can render one truck-marker per driver
  // even if they're carrying multiple orders.
  const { destinations, driversInitial } = useMemo(() => {
    const dest: OrdersMapOrder[] = [];
    const drv: Map<
      string,
      { lat: number; lng: number; name: string; orderIds: string[]; vehicle?: string }
    > = new Map();
    for (const o of orders) {
      const dLat = numOrNull(o.deliveryLat);
      const dLng = numOrNull(o.deliveryLng);
      if (dLat !== null && dLng !== null) dest.push(o);

      const driver = o.assignedDriver;
      const cLat = numOrNull(driver?.driverProfile?.currentLat);
      const cLng = numOrNull(driver?.driverProfile?.currentLng);
      if (driver && cLat !== null && cLng !== null) {
        const cur = drv.get(driver.id);
        if (cur) {
          cur.orderIds.push(o.id);
        } else {
          drv.set(driver.id, {
            lat: cLat,
            lng: cLng,
            name: driver.name ?? 'سائق',
            orderIds: [o.id],
            vehicle: driver.driverProfile?.vehicleType ?? undefined,
          });
        }
      }
    }
    return { destinations: dest, driversInitial: drv };
  }, [orders]);

  // ── One-time map init ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    const map = L.map(mapDivRef.current).setView(QIFT_CENTER, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      orderMarkersRef.current = [];
      driverMarkersRef.current.clear();
    };
  }, []);

  // ── Rebuild markers when the orders prop changes ────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear existing
    orderMarkersRef.current.forEach((m) => m.remove());
    orderMarkersRef.current = [];
    driverMarkersRef.current.forEach((m) => m.remove());
    driverMarkersRef.current.clear();

    const points: L.LatLngExpression[] = [];

    for (const o of destinations) {
      const lat = numOrNull(o.deliveryLat)!;
      const lng = numOrNull(o.deliveryLng)!;
      points.push([lat, lng]);
      const marker = L.marker([lat, lng]).addTo(map);
      const popup = `
        <div style="font-family:Tajawal,sans-serif;min-width:160px;direction:rtl">
          <div style="font-weight:900;font-size:13px;color:#E0301E;margin-bottom:4px">${escapeHtml(o.orderNumber)}</div>
          <div style="font-size:12px">${escapeHtml(o.customer?.name ?? '')}</div>
          <div style="font-size:11px;color:#666;margin-top:2px">${escapeHtml(o.status)}</div>
          ${o.deliveryAddress ? `<div style="font-size:11px;color:#666;margin-top:4px">${escapeHtml(o.deliveryAddress)}</div>` : ''}
          <div style="margin-top:6px">
            <a href="/orders/${o.id}" data-order-id="${o.id}" style="color:#E0301E;font-weight:700;font-size:12px">فتح التفاصيل ←</a>
          </div>
        </div>`;
      marker.bindPopup(popup);
      marker.on('popupopen', (ev) => {
        const el = ev.popup.getElement();
        const link = el?.querySelector('a[data-order-id]') as HTMLAnchorElement | null;
        if (link) {
          link.addEventListener(
            'click',
            (e) => {
              e.preventDefault();
              navigate(`/orders/${o.id}`);
            },
            { once: true },
          );
        }
      });
      orderMarkersRef.current.push(marker);
    }

    // Drivers
    driversInitial.forEach((d, driverId) => {
      const marker = L.marker([d.lat, d.lng], { icon: driverDivIcon() }).addTo(map);
      marker.bindPopup(
        `<div style="font-family:Tajawal,sans-serif;direction:rtl">
          <div style="font-weight:900;color:#E0301E">🚚 ${escapeHtml(d.name)}</div>
          ${d.vehicle ? `<div style="font-size:11px;color:#666">${escapeHtml(d.vehicle)}</div>` : ''}
          <div style="font-size:11px;color:#666;margin-top:4px">${d.orderIds.length} طلب جارٍ</div>
        </div>`,
      );
      driverMarkersRef.current.set(driverId, marker);
      points.push([d.lat, d.lng]);
    });

    // Fit map to all points if we have any
    if (points.length > 0) {
      try {
        const bounds = L.latLngBounds(points);
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      } catch {
        /* single-point degenerate case — leave at default zoom */
      }
    }
  }, [destinations, driversInitial, navigate]);

  // ── Live driver location via socket ─────────────────────────────────────
  useEffect(() => {
    const socket = connectSocket();
    const onLoc = (msg: { driverId: string; lat: number; lng: number }) => {
      const marker = driverMarkersRef.current.get(msg.driverId);
      if (marker) {
        marker.setLatLng([msg.lat, msg.lng]);
      } else if (mapRef.current) {
        // New driver appeared while map was open — drop a marker
        const m = L.marker([msg.lat, msg.lng], { icon: driverDivIcon() }).addTo(mapRef.current);
        driverMarkersRef.current.set(msg.driverId, m);
      }
    };
    socket.on('driver:location', onLoc);
    return () => {
      socket.off('driver:location', onLoc);
    };
  }, []);

  return (
    <div
      ref={mapDivRef}
      style={{ height, borderRadius: 12, overflow: 'hidden', border: '1px solid #f0e4da' }}
    />
  );
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
