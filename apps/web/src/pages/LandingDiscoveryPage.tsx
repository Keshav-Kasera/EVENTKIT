import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  EyeOff,
  Filter,
  Lock,
  QrCode,
  Search,
  ShieldCheck,
  Star,
  Truck,
} from "lucide-react";
import { INDORE_LOCALITIES } from "@eventkit/shared";
import { apiFetch, formatINR } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { StatusBadge } from "../components/StatusBadge";
import { IndoreGeofenceMap } from "../components/IndoreGeofenceMap";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ categories: Category[] }>("/catalog/categories")
      .then((res) => setCategories(res.categories))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedCategory) params.set("categoryId", selectedCategory);
    if (selectedLocality) params.set("locality", selectedLocality);
    if (searchQuery.trim()) params.set("q", searchQuery.trim());

    apiFetch<{ vendors: PublicVendor[] }>(`/catalog/vendors?${params.toString()}`)
      .then((res) => setVendors(res.vendors))
      .finally(() => setLoading(false));
  }, [selectedCategory, selectedLocality, searchQuery]);

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

  return (
    <div className="space-y-8">
      {/* Editorial Industrial Hero */}
      <section className="ek-card relative overflow-hidden bg-surface p-6 sm:p-10">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.9fr] lg:items-center">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-saffron/30 bg-saffron-soft px-3 py-1 text-xs font-semibold text-saffron-dark">
              <ShieldCheck className="h-3.5 w-3.5" />
              Indore B2B Event Infrastructure Network • Zero Hidden Freight
            </div>

            <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-5xl sm:leading-[1.08]">
              Book verified tent houses, catering & sound with{" "}
              <span className="text-saffron">unbundled quotes</span> and{" "}
              <span className="text-teal">24h soft-hold locks</span>.
            </h1>

            <p className="max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
              EventKit replaces verbal phone haggling and double-booked paper registers with one
              structured RFQ, side-by-side 3-way cost breakdowns (Rental + Freight + Labor), 10%
              safety buffers, and QR-verified delivery & return manifests.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button onClick={handleQuickOrganizerStart} className="ek-btn-primary">
                Launch RFQ Builder
                <ArrowRight className="h-4 w-4" />
              </button>
              <Link to="/auth" className="ek-btn-secondary">
                Vendor Onboarding / Sign In
              </Link>
            </div>
          </div>

          {/* 4-Pillar Engineering Mechanics Card */}
          <div className="rounded-xl border border-rule bg-canvas p-5 space-y-3.5">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">
              Verified Lifecycle Guarantees
            </p>
            {[
              {
                icon: Truck,
                title: "3-Way Unbundled Quotations",
                desc: "Rental, Transport & Setup Labor separated cleanly in every bid.",
              },
              {
                icon: Lock,
                title: "Two-Phase Commit (24h Soft-Hold)",
                desc: "ACID row-locks + 10% offline buffer prevent event-day cancellations.",
              },
              {
                icon: EyeOff,
                title: "Privacy-Gated Contact Masking",
                desc: "Phones & exact godowns stay masked until vendor hard-confirms.",
              },
              {
                icon: QrCode,
                title: "Dual QR Handover Audit",
                desc: "HMAC-signed Delivery & Return checklists resolve damage disputes.",
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

      {/* Interactive Indore 25km Geofence Radar */}
      <IndoreGeofenceMap
        selectedLocality={selectedLocality}
        onSelectLocality={setSelectedLocality}
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
              placeholder="Search chairs, German hangar, chafing dish, JBL audio, or locality..."
              className="ek-input pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              <Filter className="h-3.5 w-3.5" />
            </div>
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
              onChange={(e) => setSelectedLocality(e.target.value)}
              className="ek-input w-auto py-2 text-xs font-medium"
            >
              {INDORE_LOCALITIES.map((l) => (
                <option key={l.name} value={l.name}>
                  Venue: {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Verified Vendor Catalog Feed */}
        {loading ? (
          <div className="ek-card p-10 text-center text-sm text-muted">
            Loading verified Indore rental godowns...
          </div>
        ) : vendors.length === 0 ? (
          <div className="ek-card p-10 text-center text-sm text-muted">
            No verified vendors matched your filters. Try clearing search or choosing all categories.
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
                        {vendor.maskedContact.warehouseAddress} •{" "}
                        <span className="font-mono font-semibold text-ink">
                          {vendor.distanceKm} km away
                        </span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="rounded-lg border border-teal/25 bg-teal-soft px-2.5 py-1 text-right">
                        <p className="font-mono text-[10px] font-semibold uppercase text-teal-dark">
                          VRI Score
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

                  {/* Masked Contact Privacy Strip (BR-08 / TC-06) */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rule bg-canvas/80 px-3 py-2 text-[11px] text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <EyeOff className="h-3.5 w-3.5 text-saffron" />
                      Pre-booking Privacy Active: {vendor.maskedContact.phone} •{" "}
                      {vendor.maskedContact.email}
                    </span>
                    <span className="font-mono font-semibold text-ink">
                      {vendor.safetyBufferPct}% Safety Buffer
                    </span>
                  </div>

                  {/* SKUs & Indicative Availability */}
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
                            {sku.categoryName} • {sku.availability.allocatableCapacity} online
                            allocatable ({sku.totalPhysicalStock} physical)
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
                    <CheckCircle2 className="h-3.5 w-3.5" /> Eligible for Broadcast & Targeted RFQs
                  </span>
                  <button
                    onClick={handleQuickOrganizerStart}
                    className="font-semibold text-saffron hover:underline"
                  >
                    Request Quote →
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
