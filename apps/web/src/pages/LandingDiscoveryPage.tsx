import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardList,
  EyeOff,
  Filter,
  LocateFixed,
  Lock,
  Minus,
  Plus,
  QrCode,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Trash2,
  Truck,
  UserCheck,
  X,
} from "lucide-react";
import { INDORE_LOCALITIES } from "@eventkit/shared";
import { apiFetch, formatINR } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { StatusBadge } from "../components/StatusBadge";
import { IndoreGeofenceMap } from "../components/IndoreGeofenceMap";
import { HelpTooltip } from "../components/HelpTooltip";

interface Category {
  id: string;
  slug: string;
  name: string;
  description: string;
}

interface ListingItem {
  id: string;
  skuCode: string;
  itemName: string;
  description?: string;
  categoryId?: string;
  categoryName: string;
  unitType: string;
  baseRatePerDay: number;
  totalPhysicalStock: number;
  availability: {
    allocatableCapacity: number;
    remainingAllocatable: number;
    utilizationPct: number;
    status: string;
    isStale: boolean;
  };
}

interface PublicVendor {
  id: string;
  businessName: string;
  locality: string;
  city: string;
  distanceKm: number;
  withinGeofence25Km: boolean;
  vriScore: number;
  safetyBufferPct: number;
  reviewCount: number;
  avgRating: number | null;
  matchedCount?: number;
  totalTrayCount?: number;
  estimatedDailyTotal?: number;
  matchedLineDetails?: Array<{
    requestedQuery: string;
    requestedQty: number;
    matchedItemName: string;
    baseRatePerDay: number;
    allocatableCapacity: number;
    stockEnough: boolean;
  }>;
  maskedContact: {
    phone: string;
    email: string;
    warehouseAddress: string;
  };
  listings: ListingItem[];
}

interface TrayItem {
  id: string;
  query: string;
  categorySlug?: string;
  categoryId?: string;
  unitType: "PER_PIECE" | "PER_SQFT" | "PER_SET";
  quantity: number;
}

const PRESET_EQUIPMENT: Array<{
  label: string;
  query: string;
  categorySlug: string;
  unitType: "PER_PIECE" | "PER_SQFT" | "PER_SET";
  defaultQty: number;
}> = [
  { label: "Tent / Canopy (Sq.Ft)", query: "Canopy", categorySlug: "tentage-furniture", unitType: "PER_SQFT", defaultQty: 1000 },
  { label: "Gadda & Pillows (Set)", query: "Gadda Pillow", categorySlug: "tentage-furniture", unitType: "PER_SET", defaultQty: 50 },
  { label: "Banquet Chairs", query: "Chair", categorySlug: "tentage-furniture", unitType: "PER_PIECE", defaultQty: 200 },
  { label: "Buffet Chafing Dishes", query: "Chafing Dish", categorySlug: "catering-equipment", unitType: "PER_PIECE", defaultQty: 25 },
  { label: "PA Sound & Mics", query: "Line-Array Sound", categorySlug: "lighting-audio", unitType: "PER_SET", defaultQty: 2 },
  { label: "Modular Stage & Truss", query: "Stage Truss", categorySlug: "decor-staging", unitType: "PER_SET", defaultQty: 1 },
];

export function LandingDiscoveryPage() {
  const { user, demoLogin } = useAuth();
  const navigate = useNavigate();
  const trayRef = useRef<HTMLElement | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [vendors, setVendors] = useState<PublicVendor[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedLocality, setSelectedLocality] = useState<string>(INDORE_LOCALITIES[0].name);
  const [liveCoords, setLiveCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"idle" | "locating" | "active" | "denied">("idle");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // Interactive Requirement Selection Tray + Get Started Popup
  const [showGetStarted, setShowGetStarted] = useState(false);
  const [trayItems, setTrayItems] = useState<TrayItem[]>([
    { id: "preset-chair", query: "Chair", categorySlug: "tentage-furniture", unitType: "PER_PIECE", quantity: 200 },
    { id: "preset-gadda", query: "Gadda Pillow", categorySlug: "tentage-furniture", unitType: "PER_SET", quantity: 50 },
  ]);
  const [customItemName, setCustomItemName] = useState("");
  const [customItemQty, setCustomItemQty] = useState(50);
  const [trayApplied, setTrayApplied] = useState(false);

  function detectLiveLocation() {
    if (!("geolocation" in navigator)) {
      setGpsStatus("denied");
      return;
    }
    setGpsStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLiveCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsStatus("active");
      },
      () => setGpsStatus("denied"),
      { enableHighAccuracy: false, timeout: 7000, maximumAge: 120000 }
    );
  }

  useEffect(() => {
    apiFetch<{ categories: Category[] }>("/catalog/categories")
      .then((res) => setCategories(res.categories))
      .catch(() => {});
    detectLiveLocation();
  }, []);

  useEffect(() => {
    if (trayApplied) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedCategory) params.set("categoryId", selectedCategory);
    if (selectedLocality) params.set("locality", selectedLocality);
    if (liveCoords) {
      params.set("lat", String(liveCoords.lat));
      params.set("lng", String(liveCoords.lng));
    }
    if (searchQuery.trim()) params.set("q", searchQuery.trim());

    apiFetch<{
      vendors: PublicVendor[];
      locationMeta?: { mode: string; nearestLocality: string };
    }>(`/catalog/vendors?${params.toString()}`)
      .then((res) => {
        setVendors(res.vendors);
        if (res.locationMeta?.mode === "LIVE_GPS" && res.locationMeta.nearestLocality) {
          setSelectedLocality(res.locationMeta.nearestLocality);
        }
      })
      .finally(() => setLoading(false));
  }, [selectedCategory, selectedLocality, liveCoords, searchQuery, trayApplied]);

  async function applyTrayFilter() {
    if (trayItems.length === 0) {
      setTrayApplied(false);
      return;
    }
    setLoading(true);
    setTrayApplied(true);
    try {
      const payloadItems = trayItems.map((it) => {
        const cat = categories.find((c) => c.slug === it.categorySlug);
        return {
          query: it.query,
          categoryId: it.categoryId || cat?.id,
          quantity: it.quantity,
        };
      });
      const res = await apiFetch<{ vendors: PublicVendor[] }>("/catalog/match-tray", {
        method: "POST",
        body: JSON.stringify({
          items: payloadItems,
          locality: selectedLocality,
          lat: liveCoords?.lat,
          lng: liveCoords?.lng,
        }),
      });
      setVendors(res.vendors);
    } finally {
      setLoading(false);
    }
  }

  function addPresetToTray(preset: (typeof PRESET_EQUIPMENT)[number]) {
    setTrayApplied(false);
    setTrayItems((prev) => {
      const existing = prev.find((p) => p.query.toLowerCase() === preset.query.toLowerCase());
      if (existing) {
        return prev.map((p) =>
          p.id === existing.id ? { ...p, quantity: p.quantity + preset.defaultQty } : p
        );
      }
      return [
        ...prev,
        {
          id: `${preset.query}-${Date.now()}`,
          query: preset.query,
          categorySlug: preset.categorySlug,
          unitType: preset.unitType,
          quantity: preset.defaultQty,
        },
      ];
    });
  }

  function addSkuToTray(sku: ListingItem) {
    setTrayApplied(false);
    setTrayItems((prev) => {
      const existing = prev.find((p) => p.query.toLowerCase() === sku.itemName.toLowerCase());
      if (existing) return prev;
      return [
        ...prev,
        {
          id: sku.id,
          query: sku.itemName,
          categoryId: sku.categoryId,
          unitType: (sku.unitType as TrayItem["unitType"]) || "PER_PIECE",
          quantity: sku.unitType === "PER_SQFT" ? 500 : 50,
        },
      ];
    });
    trayRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function publishTrayAsRfq() {
    const mapped = trayItems.map((it) => {
      const cat =
        categories.find((c) => c.id === it.categoryId) ||
        categories.find((c) => c.slug === it.categorySlug) ||
        categories[0];
      return {
        categoryId: cat?.id || "",
        itemName: it.query,
        unitType: it.unitType,
        requestedQuantity: it.quantity,
      };
    });
    localStorage.setItem("eventkit_draft_tray", JSON.stringify(mapped));

    if (user?.role === "ORGANIZER") {
      navigate("/organizer?tab=create");
      return;
    }
    if (!user) {
      await demoLogin("ORGANIZER");
      navigate("/organizer?tab=create");
      return;
    }
    navigate("/auth");
  }

  async function handleQuickRole(persona: string, path: string) {
    await demoLogin(persona);
    navigate(path);
  }

  return (
    <div className="space-y-8">
      {/* Warm Plain-English Hero */}
      <section className="ek-card relative overflow-hidden bg-surface p-6 sm:p-10">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.9fr] lg:items-center">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-saffron/30 bg-saffron-soft px-3 py-1 text-xs font-semibold text-saffron-dark">
              <ShieldCheck className="h-3.5 w-3.5" />
              New to Indore or Planning an Event? Verified Local Rental Network
            </div>

            <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-5xl sm:leading-[1.08]">
              Rent tents, gadda-pillows, catering &amp; sound with{" "}
              <span className="text-saffron">zero hidden charges</span>.
            </h1>

            <p className="max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
              Whether you are an interior designer, wedding planner, or host who just shifted to a
              new city—stop guessing local tent-house prices over phone calls. Select the items and
              quantities you need, see nearby verified suppliers, and compare{" "}
              <strong>Equipment Rent</strong>, <strong>Truck Cost</strong>, and{" "}
              <strong>Setup Labor</strong> side-by-side.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button onClick={() => setShowGetStarted(true)} className="ek-btn-primary">
                Get Started (Guided Tour)
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => trayRef.current?.scrollIntoView({ behavior: "smooth" })}
                className="ek-btn-teal"
              >
                <ShoppingBag className="h-4 w-4" /> Select Items &amp; Find Suppliers
              </button>
              <Link to="/auth" className="ek-btn-secondary">
                Supplier Sign Up
              </Link>
            </div>
          </div>

          {/* 4-Step Visual Protection Card */}
          <div className="rounded-xl border border-rule bg-canvas p-5 space-y-3">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">
              How EventKit Protects Your Event
            </p>
            {[
              {
                icon: Truck,
                title: "1. Clear 3-Part Price Breakdown",
                desc: "Rent, Truck Delivery, and Setup Labor shown separately—no surprise event-day bills.",
              },
              {
                icon: Lock,
                title: "2. 24-Hour Hold Prevents Double-Booking",
                desc: "Items stay reserved for 24h while the supplier confirms warehouse stock.",
              },
              {
                icon: EyeOff,
                title: "3. Phone Numbers Stay Private Until Confirmed",
                desc: "No spam calls—numbers and godown addresses unlock only after confirmation.",
              },
              {
                icon: QrCode,
                title: "4. QR Code Check-In at Delivery & Return",
                desc: "Scan & verify item counts together so missing or damaged item disputes stay fair.",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="flex items-start gap-3 rounded-lg border border-rule bg-surface p-3"
                >
                  <div className="mt-0.5 rounded-md bg-saffron-soft p-1.5 text-saffron-dark">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-ink">{item.title}</p>
                    <p className="text-xs text-muted">{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Scroll-Down Narrative: WHY EVENTKIT EXISTS (The Real-World Necessity) */}
      <section className="ek-card overflow-hidden p-6 sm:p-8 space-y-5">
        <div className="max-w-3xl">
          <p className="font-mono text-xs font-bold uppercase tracking-wider text-saffron-dark">
            Why EventKit Is Needed
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold text-ink">
            Imagine settling into Indore as a new designer or event host—without a single local
            contact.
          </h2>
          <p className="mt-2 text-sm text-muted leading-relaxed">
            In Tier-1 and Tier-2 cities across India, 90% of tent houses, gadda-bedding yards, and
            catering godowns have zero online inventory. One wrong phone booking can leave 300
            guests without chairs or hit you with double labor charges.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 space-y-2.5">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-800">
              <AlertTriangle className="h-4 w-4" /> Without EventKit (Offline Chaos)
            </p>
            <ul className="space-y-1.5 text-xs text-red-950/90">
              <li>• Calling 15 random numbers from directories without knowing stock availability.</li>
              <li>• Verbal lump-sum quotes that hide truck freight &amp; setup crew charges until delivery.</li>
              <li>• Paper-register walk-ins cause suppliers to double-book your event dates.</li>
              <li>• Unverified damage claims (&ldquo;10 chairs missing!&rdquo;) after the event ends.</li>
            </ul>
          </div>

          <div className="rounded-xl border border-teal/30 bg-teal-soft/50 p-4 space-y-2.5">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-teal-dark">
              <CheckCircle2 className="h-4 w-4" /> With EventKit (Structured &amp; Verified)
            </p>
            <ul className="space-y-1.5 text-xs text-teal-950">
              <li>• Select your needed equipment &amp; quantities once—auto-matches verified nearby yards.</li>
              <li>• Compare side-by-side bids splitting Equipment Rent, Freight, and Labor clearly.</li>
              <li>• 10% offline buffer + 24-hour Soft-Hold stops last-minute double-booking surprises.</li>
              <li>• QR-signed Delivery &amp; Return manifests give fair, photo-backed proof for both sides.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* INTERACTIVE EQUIPMENT SELECTION TRAY (Pick Items + Quantities -> Filter & Publish!) */}
      <section ref={trayRef} className="ek-card border-saffron/30 bg-surface p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-rule pb-4">
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-wider text-saffron-dark flex items-center gap-1.5">
              <ClipboardList className="h-3.5 w-3.5" /> Interactive Requirement Builder
            </p>
            <h2 className="font-display text-2xl font-bold text-ink">
              Select What You Need to Rent &amp; Find Matching Suppliers
            </h2>
            <p className="text-xs text-muted">
              Pick items (tents, gadda &amp; pillows, chairs, sound, catering) and set quantities,
              then click <strong>Apply &amp; Find Matching Suppliers</strong> or publish directly to
              receive competitive quotes.
            </p>
          </div>
          {trayApplied && (
            <button
              type="button"
              onClick={() => setTrayApplied(false)}
              className="ek-btn-secondary py-1.5 text-xs"
            >
              Show All Suppliers Again
            </button>
          )}
        </div>

        {/* Quick Preset Equipment Chips */}
        <div>
          <p className="mb-2 text-xs font-semibold text-muted">
            Quick Add Common Event Items (Click to add to your tray):
          </p>
          <div className="flex flex-wrap gap-2">
            {PRESET_EQUIPMENT.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => addPresetToTray(preset)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rule bg-canvas px-3 py-2 text-xs font-semibold text-ink transition hover:border-saffron hover:bg-saffron-soft"
              >
                <Plus className="h-3.5 w-3.5 text-saffron" />
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Selected Requirement Tray Items */}
        <div className="grid gap-5 lg:grid-cols-[1.4fr_0.9fr]">
          <div className="space-y-2.5">
            {trayItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-rule bg-canvas/50 p-6 text-center text-xs text-muted">
                Your equipment list is empty. Click any quick button above or &ldquo;+ Add to My
                List&rdquo; on a supplier item below.
              </div>
            ) : (
              trayItems.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rule bg-canvas/70 px-3.5 py-2.5"
                >
                  <div>
                    <p className="text-sm font-semibold text-ink">{item.query}</p>
                    <p className="font-mono text-[11px] text-muted">
                      Unit: {item.unitType.replace("PER_", "")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setTrayApplied(false);
                        setTrayItems((prev) =>
                          prev.map((p) =>
                            p.id === item.id
                              ? { ...p, quantity: Math.max(1, p.quantity - 10) }
                              : p
                          )
                        );
                      }}
                      className="rounded border border-rule bg-surface p-1.5 hover:bg-sand"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => {
                        setTrayApplied(false);
                        const val = Math.max(1, Number(e.target.value) || 1);
                        setTrayItems((prev) =>
                          prev.map((p) => (p.id === item.id ? { ...p, quantity: val } : p))
                        );
                      }}
                      className="ek-input w-20 py-1 text-center font-mono text-xs font-bold"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setTrayApplied(false);
                        setTrayItems((prev) =>
                          prev.map((p) =>
                            p.id === item.id ? { ...p, quantity: p.quantity + 10 } : p
                          )
                        );
                      }}
                      className="rounded border border-rule bg-surface p-1.5 hover:bg-sand"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTrayApplied(false);
                        setTrayItems((prev) => prev.filter((p) => p.id !== item.id));
                      }}
                      className="rounded border border-rule bg-surface p-1.5 text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}

            {/* Add Custom Item Row */}
            <div className="flex flex-wrap gap-2 pt-1">
              <input
                type="text"
                value={customItemName}
                onChange={(e) => setCustomItemName(e.target.value)}
                placeholder="Or type custom item (e.g., VIP Sofa, Copper Handi, Mist Fan)..."
                className="ek-input flex-1 py-2 text-xs"
              />
              <input
                type="number"
                min={1}
                value={customItemQty}
                onChange={(e) => setCustomItemQty(Number(e.target.value) || 1)}
                className="ek-input w-20 py-2 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => {
                  if (!customItemName.trim()) return;
                  setTrayApplied(false);
                  setTrayItems((prev) => [
                    ...prev,
                    {
                      id: `custom-${Date.now()}`,
                      query: customItemName.trim(),
                      categorySlug: "tentage-furniture",
                      unitType: "PER_PIECE",
                      quantity: customItemQty,
                    },
                  ]);
                  setCustomItemName("");
                }}
                className="ek-btn-secondary py-2 text-xs"
              >
                + Add Custom
              </button>
            </div>
          </div>

          {/* Tray Action Box */}
          <div className="flex flex-col justify-between rounded-xl border border-rule bg-canvas p-4 space-y-3">
            <div>
              <p className="font-mono text-xs font-bold uppercase text-muted">
                Your Selection Tray ({trayItems.length} Items)
              </p>
              <p className="mt-1 text-xs text-muted">
                Filter the verified Indore catalog below to see who carries your exact quantities,
                or publish your list so interested vendors send itemized quotes!
              </p>
            </div>
            <div className="space-y-2">
              <button
                type="button"
                disabled={trayItems.length === 0}
                onClick={applyTrayFilter}
                className="ek-btn-teal w-full"
              >
                <Search className="h-4 w-4" /> Apply &amp; Find Matching Suppliers
              </button>
              <button
                type="button"
                disabled={trayItems.length === 0}
                onClick={publishTrayAsRfq}
                className="ek-btn-primary w-full"
              >
                <Sparkles className="h-4 w-4" /> Publish List &amp; Receive Vendor Quotes
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Indore 25km Geofence Radar */}
      <IndoreGeofenceMap
        selectedLocality={selectedLocality}
        onSelectLocality={(loc) => {
          setTrayApplied(false);
          setLiveCoords(null);
          setGpsStatus("idle");
          setSelectedLocality(loc);
        }}
        vendors={vendors}
      />

      {/* Search & Filter Toolbar */}
      <section className="space-y-4">
        <div className="ek-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setTrayApplied(false);
                setSearchQuery(e.target.value);
              }}
              placeholder="Search chairs, gadda, tent canopy, buffet dishes, sound speakers..."
              className="ek-input pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={detectLiveLocation}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                gpsStatus === "active"
                  ? "border-teal/40 bg-teal-soft text-teal-dark"
                  : "border-rule bg-surface text-ink hover:bg-sand"
              }`}
              title="Use your device GPS to sort suppliers nearest to you"
            >
              <LocateFixed className="h-3.5 w-3.5 text-saffron" />
              {gpsStatus === "locating"
                ? "Detecting GPS..."
                : gpsStatus === "active"
                ? "Live GPS Active (Nearest First)"
                : "Use My Live Location"}
            </button>
            <Filter className="h-3.5 w-3.5 text-muted" />
            <select
              value={selectedCategory}
              onChange={(e) => {
                setTrayApplied(false);
                setSelectedCategory(e.target.value);
              }}
              className="ek-input w-auto py-2 text-xs font-medium"
            >
              <option value="">All 4 Equipment Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={selectedLocality}
              onChange={(e) => {
                setTrayApplied(false);
                setLiveCoords(null);
                setGpsStatus("idle");
                setSelectedLocality(e.target.value);
              }}
              className="ek-input w-auto py-2 text-xs font-medium"
            >
              {INDORE_LOCALITIES.map((l) => (
                <option key={l.name} value={l.name}>
                  Event Area: {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Verified Supplier Catalog Feed */}
        {loading ? (
          <div className="ek-card p-10 text-center text-sm text-muted">
            Matching verified Indore suppliers to your selection...
          </div>
        ) : vendors.length === 0 ? (
          <div className="ek-card p-10 text-center space-y-2">
            <p className="text-sm font-semibold text-ink">
              No single supplier carries all of those items directly in their catalog yet.
            </p>
            <p className="text-xs text-muted">
              Click <strong>Publish List &amp; Receive Vendor Quotes</strong> above—EventKit splits
              different categories automatically so multiple suppliers can bid!
            </p>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {vendors.map((vendor) => (
              <div key={vendor.id} className="ek-card flex flex-col justify-between p-5">
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b border-rule pb-3.5">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-display text-xl font-bold text-ink">
                          {vendor.businessName}
                        </h2>
                        <StatusBadge status="VERIFIED" />
                        {trayApplied && vendor.matchedCount !== undefined && (
                          <span className="rounded-full bg-saffron-soft px-2.5 py-0.5 font-mono text-[11px] font-bold text-saffron-dark border border-saffron/30">
                            Matches {vendor.matchedCount}/{vendor.totalTrayCount} Tray Items
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {vendor.locality}, {vendor.city} •{" "}
                        <span className="font-mono font-semibold text-ink">
                          {vendor.distanceKm} km from{" "}
                          {liveCoords ? "your live location" : selectedLocality}
                        </span>
                        {!vendor.withinGeofence25Km && (
                          <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                            Outside 25 km Indore Zone
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="rounded-lg border border-teal/25 bg-teal-soft px-2.5 py-1 text-right">
                        <p className="flex items-center justify-end gap-1 font-mono text-[10px] font-semibold uppercase text-teal-dark">
                          Trust Score
                          <HelpTooltip
                            title="Trust Score (VRI)"
                            text="Score out of 100 based on completed bookings (40%), on-time delivery (30%), zero disputes (20%), and customer ratings (10%)."
                          />
                        </p>
                        <p className="font-mono text-sm font-bold text-teal-dark">
                          {vendor.vriScore}/100
                        </p>
                      </div>
                      {vendor.avgRating !== null && (
                        <div className="flex items-center gap-1 rounded-lg border border-rule bg-canvas px-2.5 py-1.5 text-xs font-semibold">
                          <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                          {vendor.avgRating} ({vendor.reviewCount})
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tray Match Breakdown Banner */}
                  {trayApplied && vendor.matchedLineDetails && vendor.matchedLineDetails.length > 0 && (
                    <div className="mt-3 rounded-lg border border-teal/30 bg-teal-soft/50 p-3 text-xs space-y-1.5">
                      <div className="flex items-center justify-between font-bold text-teal-dark">
                        <span>Estimated Daily Rent for Matched Tray Items:</span>
                        <span className="font-mono text-sm">
                          {formatINR(vendor.estimatedDailyTotal)} / day
                        </span>
                      </div>
                      {vendor.matchedLineDetails.map((d, i) => (
                        <div key={i} className="flex justify-between text-[11px] text-ink">
                          <span>
                            ✓ {d.requestedQty} × {d.matchedItemName}
                          </span>
                          <span className={d.stockEnough ? "text-teal-dark font-semibold" : "text-amber-800 font-semibold"}>
                            {d.stockEnough
                              ? `${d.allocatableCapacity} in stock`
                              : `Only ${d.allocatableCapacity} ready`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Masked Contact Privacy Strip */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rule bg-canvas/80 px-3 py-2 text-[11px] text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <EyeOff className="h-3.5 w-3.5 text-saffron" />
                      Contact hidden until booking confirms ({vendor.maskedContact.phone})
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono font-semibold text-ink">
                      {vendor.safetyBufferPct}% Safety Reserve
                      <HelpTooltip
                        title="10% Safety Reserve"
                        text="We keep 10% of every supplier's physical stock unbooked online so sudden offline walk-in rentals never cause shortages."
                      />
                    </span>
                  </div>

                  {/* Items & Add to Tray */}
                  <div className="mt-4 space-y-2.5">
                    {vendor.listings.map((sku) => (
                      <div
                        key={sku.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rule bg-surface p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[11px] font-semibold text-muted">
                              {sku.skuCode}
                            </span>
                            <span className="text-sm font-semibold text-ink">{sku.itemName}</span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted">
                            {sku.categoryName} •{" "}
                            <strong>{sku.availability.allocatableCapacity} ready to book</strong> (of{" "}
                            {sku.totalPhysicalStock} total)
                          </p>
                        </div>

                        <div className="flex items-center gap-2.5">
                          <StatusBadge status={sku.availability.status} />
                          <div className="text-right">
                            <p className="font-mono text-sm font-bold text-ink tabular-nums">
                              {formatINR(sku.baseRatePerDay)}
                            </p>
                            <p className="text-[10px] text-muted">
                              {sku.unitType.replace("PER_", "/ ")} / day
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => addSkuToTray(sku)}
                            className="rounded-md border border-rule bg-canvas px-2 py-1 text-[11px] font-semibold text-ink hover:border-saffron hover:bg-saffron-soft"
                            title="Add this item to your Requirement Selection Tray"
                          >
                            + Add
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-rule pt-3 text-xs">
                  <span className="inline-flex items-center gap-1 text-teal-dark font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5" /> GST/ID Verified by Admin
                  </span>
                  <button
                    onClick={publishTrayAsRfq}
                    className="font-semibold text-saffron hover:underline"
                  >
                    Publish Tray &amp; Ask for Quote →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* GET STARTED GUIDED POPUP */}
      {showGetStarted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/55 p-4 backdrop-blur-sm">
          <div className="ek-card w-full max-w-2xl p-6 space-y-5">
            <div className="flex items-start justify-between border-b border-rule pb-3">
              <div>
                <p className="font-mono text-xs font-bold uppercase text-saffron-dark">
                  Welcome to EventKit
                </p>
                <h2 className="font-display text-2xl font-bold text-ink">
                  What brings you to EventKit today?
                </h2>
              </div>
              <button
                onClick={() => setShowGetStarted(false)}
                className="rounded-lg border border-rule p-1.5 text-muted hover:bg-sand"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setShowGetStarted(false);
                  trayRef.current?.scrollIntoView({ behavior: "smooth" });
                }}
                className="rounded-xl border border-saffron/40 bg-saffron-soft/40 p-4 text-left transition hover:bg-saffron-soft"
              >
                <p className="text-sm font-bold text-saffron-dark flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4" /> 1. Build My Equipment List
                </p>
                <p className="mt-1 text-xs text-ink">
                  Pick tents, gadda-pillows, chairs &amp; quantities right here, find nearby
                  suppliers in stock, and publish for quotes.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowGetStarted(false);
                  handleQuickRole("ORGANIZER", "/organizer");
                }}
                className="rounded-xl border border-rule bg-surface p-4 text-left transition hover:border-ink hover:bg-canvas"
              >
                <p className="text-sm font-bold text-ink flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-saffron" /> 2. Compare Live Vendor Quotes
                </p>
                <p className="mt-1 text-xs text-muted">
                  See how an organizer compares 3 competing supplier bids side-by-side and reserves
                  items with a 24h hold.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowGetStarted(false);
                  handleQuickRole("VENDOR_MALWA", "/vendor");
                }}
                className="rounded-xl border border-rule bg-surface p-4 text-left transition hover:border-teal hover:bg-teal-soft/40"
              >
                <p className="text-sm font-bold text-teal-dark flex items-center gap-2">
                  <Building2 className="h-4 w-4" /> 3. I Rent Out Equipment (Supplier)
                </p>
                <p className="mt-1 text-xs text-muted">
                  Manage warehouse stock, send split-up price quotes, confirm 24h holds, and run QR
                  return checks.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowGetStarted(false);
                  handleQuickRole("ADMIN", "/admin");
                }}
                className="rounded-xl border border-rule bg-surface p-4 text-left transition hover:border-ink hover:bg-canvas"
              >
                <p className="text-sm font-bold text-ink flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-teal" /> 4. Platform Admin &amp; Approvals
                </p>
                <p className="mt-1 text-xs text-muted">
                  Approve pending supplier GST documents, mediate item damage disputes, and test the
                  24h auto-expiry timer.
                </p>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
