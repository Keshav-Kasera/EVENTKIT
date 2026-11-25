import { INDORE_LOCALITIES, haversineKm } from "@eventkit/shared";
import { MapPin, Navigation } from "lucide-react";

interface VendorPin {
  id: string;
  businessName: string;
  locality: string;
  vriScore: number;
  distanceKm?: number;
}

export function IndoreGeofenceMap({
  selectedLocality,
  onSelectLocality,
  vendors = [],
}: {
  selectedLocality: string;
  onSelectLocality: (loc: string) => void;
  vendors?: VendorPin[];
}) {
  const center =
    INDORE_LOCALITIES.find((l) => l.name === selectedLocality) ?? INDORE_LOCALITIES[0];

  // Normalize lat/lng into a clean 360x220 SVG viewport covering Indore metro
  const minLat = 22.62;
  const maxLat = 22.79;
  const minLng = 75.80;
  const maxLng = 75.93;

  const project = (lat: number, lng: number) => {
    const x = 30 + ((lng - minLng) / (maxLng - minLng)) * 300;
    const y = 195 - ((lat - minLat) / (maxLat - minLat)) * 170;
    return { x, y };
  };

  const centerPt = project(center.lat, center.lng);

  return (
    <div className="ek-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-sand/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Navigation className="h-4 w-4 text-saffron" />
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted">
              Indore Delivery Distance Map (Within 25 km)
            </p>
            <p className="text-sm font-semibold text-ink">
              Your Event Area: {center.name} (Click any dot on the map to check supplier distance)
            </p>
          </div>
        </div>
        <span className="rounded-md bg-surface px-2.5 py-1 font-mono text-xs font-semibold text-teal-dark border border-teal/20">
          {vendors.length} Verified Suppliers
        </span>
      </div>

      <div className="grid gap-0 lg:grid-cols-[1.35fr_1fr]">
        <div className="relative bg-[#FBF9F5] p-3">
          <svg viewBox="0 0 360 220" className="h-56 w-full select-none">
            <defs>
              <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
                <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#EAE4D7" strokeWidth="0.7" />
              </pattern>
            </defs>
            <rect width="360" height="220" fill="url(#grid)" rx="8" />

            {/* 25 km & 10 km Geofence Concentric Rings */}
            <circle
              cx={centerPt.x}
              cy={centerPt.y}
              r={110}
              fill="#0E6B62"
              fillOpacity="0.05"
              stroke="#0E6B62"
              strokeOpacity="0.35"
              strokeDasharray="4 3"
            />
            <circle
              cx={centerPt.x}
              cy={centerPt.y}
              r={52}
              fill="#C84B1E"
              fillOpacity="0.06"
              stroke="#C84B1E"
              strokeOpacity="0.35"
              strokeDasharray="2 2"
            />

            {/* Indore Locality Nodes */}
            {INDORE_LOCALITIES.map((loc) => {
              const pt = project(loc.lat, loc.lng);
              const isSelected = loc.name === center.name;
              const hasVendor = vendors.some((v) => v.locality === loc.name);

              return (
                <g
                  key={loc.name}
                  className="cursor-pointer"
                  onClick={() => onSelectLocality(loc.name)}
                >
                  {hasVendor && (
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={11}
                      fill="#0E6B62"
                      fillOpacity="0.18"
                    />
                  )}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isSelected ? 6 : hasVendor ? 5 : 3.5}
                    fill={isSelected ? "#C84B1E" : hasVendor ? "#0E6B62" : "#8B909B"}
                    stroke="#FFFFFF"
                    strokeWidth="1.5"
                  />
                  <text
                    x={pt.x + 8}
                    y={pt.y + 3}
                    fontSize="8.5"
                    fontWeight={isSelected ? "700" : "500"}
                    fill={isSelected ? "#A33A14" : "#3A3F47"}
                  >
                    {loc.name}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="border-t border-rule bg-surface p-3 lg:border-l lg:border-t-0">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            Supplier Distance From {center.name}
          </p>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {vendors.length === 0 ? (
              <p className="text-xs text-muted">No verified suppliers match your current filter.</p>
            ) : (
              vendors.map((v) => {
                const loc = INDORE_LOCALITIES.find((l) => l.name === v.locality);
                const km =
                  v.distanceKm ??
                  (loc ? haversineKm(center.lat, center.lng, loc.lat, loc.lng) : 0);
                return (
                  <div
                    key={v.id}
                    className="flex items-center justify-between rounded-lg border border-rule px-2.5 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{v.businessName}</p>
                      <p className="flex items-center gap-1 text-[11px] text-muted">
                        <MapPin className="h-3 w-3 text-saffron" />
                        {v.locality} • Trust {v.vriScore}/100
                      </p>
                    </div>
                    <span className="ml-2 shrink-0 rounded bg-sand px-2 py-0.5 font-mono text-[11px] font-semibold text-ink">
                      {km} km
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
