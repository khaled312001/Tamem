/**
 * MapPicker — click the map or search by place name to set lat/lng.
 *
 * Implementation note: we use plain Leaflet (not react-leaflet) because
 * react-leaflet's internal Context.Consumer trips a "render2 is not a function"
 * error on this codebase under React 18 + dev-mode strict effects. Vanilla
 * Leaflet sidesteps the React context issue completely.
 *
 *   - Tile layer: OpenStreetMap (free, no API key required)
 *   - Geocoding: Nominatim (free, rate-limited)
 *   - Reverse-geocoding runs on each pin drop so the address field auto-fills.
 */
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, MapPin, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

// Patch the default marker icons once — Leaflet's bundled images don't resolve
// through Vite without help. Pointing at the CDN keeps the picker self-contained.
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

const QIFT_CENTER: [number, number] = [26.0297, 32.8146];

export interface MapPickerValue {
  lat: number;
  lng: number;
  address?: string;
}

interface MapPickerProps {
  lat?: number;
  lng?: number;
  onChange: (value: MapPickerValue) => void;
  height?: number;
  initialQuery?: string;
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

export function MapPicker({ lat, lng, onChange, height = 320, initialQuery }: MapPickerProps) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  // Keep the latest onChange in a ref so the map's click handler always sees
  // it without forcing a map re-init when the parent re-renders.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const [query, setQuery] = useState(initialQuery ?? '');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ────── Initialize map once on mount ──────
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    const startLat = lat ?? QIFT_CENTER[0];
    const startLng = lng ?? QIFT_CENTER[1];

    const map = L.map(mapDivRef.current, {
      center: [startLat, startLng],
      zoom: lat && lng ? 16 : 13,
      scrollWheelZoom: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{y}/{x}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    if (lat !== undefined && lng !== undefined) {
      markerRef.current = L.marker([lat, lng]).addTo(map);
    }

    map.on('click', async (e: L.LeafletMouseEvent) => {
      const la = e.latlng.lat;
      const ln = e.latlng.lng;
      if (markerRef.current) markerRef.current.setLatLng([la, ln]);
      else markerRef.current = L.marker([la, ln]).addTo(map);
      const address = await reverseGeocode(la, ln);
      if (address) setQuery(address);
      onChangeRef.current({ lat: la, lng: ln, address });
    });

    mapRef.current = map;

    // Cleanup: tear down on unmount so subsequent dialog opens don't leak
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ────── Reflect external lat/lng changes onto the marker ──────
  useEffect(() => {
    if (!mapRef.current) return;
    if (lat !== undefined && lng !== undefined) {
      if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
      else markerRef.current = L.marker([lat, lng]).addTo(mapRef.current);
      mapRef.current.flyTo([lat, lng], Math.max(mapRef.current.getZoom(), 15), { duration: 0.6 });
    }
  }, [lat, lng]);

  // ────── Search-as-you-type via Nominatim (debounced, polite to free API) ──────
  useEffect(() => {
    if (!query.trim() || query.trim().length < 3) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=eg&accept-language=ar&q=${encodeURIComponent(query)}`,
          { headers: { 'User-Agent': 'Tamem Delivery Dashboard' } },
        );
        if (res.ok) {
          const data = (await res.json()) as NominatimResult[];
          setResults(data);
          setShowResults(true);
        }
      } catch {
        // ignore — leave empty
      } finally {
        setSearching(false);
      }
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const reverseGeocode = async (la: number, ln: number): Promise<string | undefined> => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&accept-language=ar&lat=${la}&lon=${ln}`,
        { headers: { 'User-Agent': 'Tamem Delivery Dashboard' } },
      );
      if (res.ok) {
        const data = (await res.json()) as { display_name?: string };
        return data.display_name;
      }
    } catch {
      // ignore
    }
    return undefined;
  };

  const pickResult = (r: NominatimResult) => {
    const la = Number(r.lat);
    const ln = Number(r.lon);
    setQuery(r.display_name);
    setShowResults(false);
    onChangeRef.current({ lat: la, lng: ln, address: r.display_name });
  };

  return (
    <div className="space-y-2">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          placeholder="ابحث باسم المكان أو الشارع... (مثال: ميدان قفط)"
          className="w-full pr-9 pl-9 py-2.5 rounded-lg border border-input bg-white text-sm outline-none focus:ring-2 focus:ring-brand-red/20"
        />
        {searching && (
          <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
        )}

        {showResults && results.length > 0 && (
          <div className="absolute z-[1000] top-full mt-1 left-0 right-0 bg-white rounded-lg border border-border shadow-lg max-h-72 overflow-y-auto">
            {results.map((r, i) => (
              <button
                key={`${r.lat}-${r.lon}-${i}`}
                type="button"
                onClick={() => pickResult(r)}
                className="w-full text-right px-3 py-2 hover:bg-muted/50 text-sm border-b border-border/50 last:border-0 flex items-start gap-2"
              >
                <MapPin className="w-4 h-4 text-brand-red mt-0.5 shrink-0" />
                <span className="line-clamp-2">{r.display_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Map container — Leaflet renders into this div imperatively */}
      <div
        ref={mapDivRef}
        className="rounded-lg overflow-hidden border border-border"
        style={{ height }}
      />

      {/* Coordinate readout */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div>
          <MapPin className="w-3 h-3 inline -mt-0.5 ml-1 text-brand-red" />
          اضغط على الخريطة لتحديد الموقع، أو ابحث بالاسم
        </div>
        {lat !== undefined && lng !== undefined && (
          <div className="font-mono" dir="ltr">
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </div>
        )}
      </div>
    </div>
  );
}
