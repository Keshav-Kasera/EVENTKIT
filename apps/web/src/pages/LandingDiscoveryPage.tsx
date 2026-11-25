import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  EyeOff,
  Filter,
  LocateFixed,
  Lock,
  QrCode,
  Search,
  ShieldCheck,
  Star,
  Truck,
  UserCheck,
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
  maskedContact: {
    phone: string;
    email: string;
    warehouseAddress: string;
  };
  listings: ListingItem[];
}

export function LandingDiscoveryPage() {
  const { user, demoLogin } = useAuth();
  const navigate = useNavigate();

  const [categories, setCategories] = useState<Category[]>([]);
  const [vendors, setVendors] = useState<PublicVendor[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedLocality, setSelectedLocality] = useState<string>(INDORE_LOCALITIES[0].name);
  const [liveCoords, setLiveCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"idle" | "locating" | "active" | "denied">("idle");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  function detectLiveLocation() {
    if (!("geolocation" in navigator)) {
      setGpsStatus("denied");
      return;
    }
    setGpsStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLiveCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setGpsStatus("active");
      },
      () => {
        setGpsStatus("denied");
      },
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
  }, [selectedCategory, selectedLocality, liveCoords, searchQuery]);

  async function handleQuickOrganizerStart() {
    if (user?.role === "ORGANIZER") {
      navigate("/organizer");
      return;
    }
    if (!user) {
      await demoLogin("ORGANIZER");
      navigate("/organizer");
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
              Verified Indore Event Suppliers • Zero Hidden Charges
            </div>

            <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-5xl sm:leading-[1.08]">
              Book tents, catering & sound with{" "}
              <span className="text-saffron">clear itemized prices</span> and{" "}
              <span className="text-teal">guaranteed stock</span>.
            </h1>

            <p className="max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
              Planning a wedding, college fest, or corporate event? Tell us what items you need
              once—verified local suppliers send back transparent quotes separating{" "}
              <strong>item rent</strong>, <strong>truck delivery</strong>, and{" "}
              <strong>setup labor</strong> so you can compare side-by-side and book safely.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button onClick={handleQuickOrganizerStart} className="ek-btn-primary">
                Request Event Quotes Now
                <ArrowRight className="h-4 w-4" />
              </button>
              <Link to="/auth" className="ek-btn-secondary">
                Supplier Sign Up / Login
              </Link>
            </div>
          </div>

          {/* Plain-English 4-Step Walkthrough Card */}
          <div className="rounded-xl border border-rule bg-canvas p-5 space-y-3">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">
              How EventKit Protects Your Event (4 Simple Steps)
            </p>
            {[
              {
                icon: Truck,
                title: "1. Clear 3-Part Price Breakdown",
                desc: "Every quote shows Item Rent, Delivery Truck, and Setup Labor separately—no surprise fees.",
              },
              {
                icon: Lock,
                title: "2. 24-Hour Hold Prevents Double-Booking",
                desc: "When you pick a quote, items stay reserved for 24h while the supplier confirms stock.",
              },
              {
                icon: EyeOff,
                title: "3. Phone Numbers Stay Private Until Confirmed",
                desc: "Avoid spam calls—exact addresses and numbers unlock only after booking confirmation.",
              },
              {
                icon: QrCode,
                title: "4. QR Code Check-In at Delivery & Return",
                desc: "Count items together with a scannable QR pass so damage or missing-chair disputes stay fair.",
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

      {/* First-Time Visitor Quick Navigator */}
      <section className="grid gap-3 md:grid-cols-3">
        <button
          type="button"
          onClick={() => handleQuickRole("ORGANIZER", "/organizer")}
          className="ek-card p-4 text-left transition hover:border-saffron hover:bg-saffron-soft/30"
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-saffron-dark">
              <UserCheck className="h-4 w-4" /> I am an Event Planner
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-muted" />
          </div>
          <p className="mt-1.5 text-xs text-muted">
            Compare 3 supplier quotes side-by-side, create a new event request, or check bookings.
          </p>
        </button>

        <button
          type="button"
          onClick={() => handleQuickRole("VENDOR_MALWA", "/vendor")}
          className="ek-card p-4 text-left transition hover:border-teal hover:bg-teal-soft/40"
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-dark">
              <Building2 className="h-4 w-4" /> I am an Equipment Supplier
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-muted" />
          </div>
          <p className="mt-1.5 text-xs text-muted">
            Manage warehouse stock, reply to incoming event requests, or confirm a 24-hour hold.
          </p>
        </button>

        <button
          type="button"
          onClick={() => handleQuickRole("ADMIN", "/admin")}
          className="ek-card p-4 text-left transition hover:border-ink hover:bg-sand/50"
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-ink">
              <ShieldCheck className="h-4 w-4" /> I am Testing as Admin
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-muted" />
          </div>
          <p className="mt-1.5 text-xs text-muted">
            Approve pending supplier documents, resolve item damage disputes, or simulate 24h expiry.
          </p>
        </button>
      </section>

      {/* Interactive Indore 25km Geofence Radar */}
      <IndoreGeofenceMap
        selectedLocality={selectedLocality}
        onSelectLocality={(loc) => {
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
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chairs, tent canopy, buffet dishes, sound speakers, or area..."
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
              onChange={(e) => setSelectedCategory(e.target.value)}
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
            Loading verified Indore suppliers...
          </div>
        ) : vendors.length === 0 ? (
          <div className="ek-card p-10 text-center text-sm text-muted">
            No verified suppliers matched your filters. Try clearing search or choosing all
            categories.
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {vendors.map((vendor) => (
              <div key={vendor.id} className="ek-card flex flex-col justify-between p-5">
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b border-rule pb-3.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-display text-xl font-bold text-ink">
                          {vendor.businessName}
                        </h2>
                        <StatusBadge status="VERIFIED" />
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

                  {/* Items & Availability */}
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

                        <div className="flex items-center gap-3">
                          <StatusBadge status={sku.availability.status} />
                          <div className="text-right">
                            <p className="font-mono text-sm font-bold text-ink tabular-nums">
                              {formatINR(sku.baseRatePerDay)}
                            </p>
                            <p className="text-[10px] text-muted">
                              {sku.unitType.replace("PER_", "/ ")} / day
                            </p>
                          </div>
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
                    onClick={handleQuickOrganizerStart}
                    className="font-semibold text-saffron hover:underline"
                  >
                    Ask for Price Quote →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
