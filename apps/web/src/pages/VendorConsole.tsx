import { useEffect, useState } from "react";
import {
  AlertCircle,
  Boxes,
  CheckCircle2,
  Plus,
  QrCode,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { computeAllocatableCapacity, computeThreeWayBidTotals } from "@eventkit/shared";
import { apiFetch, formatINR } from "../lib/api";
import { StatusBadge } from "../components/StatusBadge";
import { CountdownTimer } from "../components/CountdownTimer";
import { BookingLifecycleStepper } from "../components/BookingLifecycleStepper";
import { ChecklistData, QrManifestModal } from "../components/QrManifestModal";

interface Category {
  id: string;
  name: string;
}

interface VendorListing {
  id: string;
  skuCode: string;
  itemName: string;
  unitType: string;
  baseRatePerDay: number;
  totalPhysicalStock: number;
  category: { id: string; name: string };
  availability: {
    allocatableCapacity: number;
    remainingAllocatable: number;
    utilizationPct: number;
    status: string;
    isStale: boolean;
  };
}

interface VendorRfq {
  id: string;
  rfqCode: string;
  title: string;
  eventType: string;
  startDate: string;
  endDate: string;
  venueLocality: string;
  venueAddress: string;
  guestCount: number;
  distanceKm: number;
  status: string;
  organizer: { fullName: string; organizationType?: string; phone: string };
  items: Array<{ id: string; itemName: string; requestedQuantity: number; unitType: string }>;
  quotations: Array<{
    id: string;
    totalAmount: number;
    status: string;
    revisionNotes?: string;
    revisionCount: number;
  }>;
}

interface VendorBooking {
  id: string;
  bookingCode: string;
  status: string;
  holdExpiresAt: string;
  escrowStatus: string;
  advanceAmount: number;
  depositAmount: number;
  contactRevealed: boolean;
  counterpartyContact: { name: string; phone: string; email: string; address: string };
  quotation: {
    totalAmount: number;
    requirement: { title: string; rfqCode: string; startDate: string; endDate: string };
  };
  checklists: ChecklistData[];
}

export function VendorConsole() {
  const [tab, setTab] = useState<"bookings" | "rfqs" | "catalog">("bookings");
  const [vendor, setVendor] = useState<{
    id: string;
    businessName: string;
    verificationStatus: string;
    safetyBufferPct: number;
    vriScore: number;
    stockRefreshedAt: string;
  } | null>(null);
  const [listings, setListings] = useState<VendorListing[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rfqs, setRfqs] = useState<VendorRfq[]>([]);
  const [bookings, setBookings] = useState<VendorBooking[]>([]);

  // New SKU Form
  const [showAddSku, setShowAddSku] = useState(false);
  const [skuCategoryId, setSkuCategoryId] = useState("");
  const [skuName, setSkuName] = useState("");
  const [skuUnit, setSkuUnit] = useState<"PER_PIECE" | "PER_SQFT" | "PER_SET">("PER_PIECE");
  const [skuRate, setSkuRate] = useState(50);
  const [skuStock, setSkuStock] = useState(200);

  // 3-Way Bid Modal
  const [bidRfq, setBidRfq] = useState<VendorRfq | null>(null);
  const [rentalSubtotal, setRentalSubtotal] = useState(25000);
  const [transportFee, setTransportFee] = useState(2500);
  const [laborFee, setLaborFee] = useState(3000);
  const [securityDeposit, setSecurityDeposit] = useState(8000);
  const [bidNotes, setBidNotes] = useState("");

  // QR Handover Modal
  const [activeChecklist, setActiveChecklist] = useState<{
    bookingId: string;
    bookingCode: string;
    checklist: ChecklistData;
  } | null>(null);

  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function loadAll() {
    const [catRes, myCat, rfqRes, bkRes] = await Promise.all([
      apiFetch<{ categories: Category[] }>("/catalog/categories"),
      apiFetch<{ vendor: typeof vendor; listings: VendorListing[] }>("/catalog/my-listings"),
      apiFetch<{ requirements: VendorRfq[] }>("/rfqs"),
      apiFetch<{ bookings: VendorBooking[] }>("/bookings"),
    ]);
    setCategories(catRes.categories);
    if (!skuCategoryId && catRes.categories[0]) setSkuCategoryId(catRes.categories[0].id);
    setVendor(myCat.vendor);
    setListings(myCat.listings);
    setRfqs(rfqRes.requirements);
    setBookings(bkRes.bookings);
  }

  useEffect(() => {
    loadAll().catch((e) => setErr(e.message));
  }, []);

  async function handleAddSku(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      await apiFetch("/catalog/my-listings", {
        method: "POST",
        body: JSON.stringify({
          categoryId: skuCategoryId,
          itemName: skuName,
          unitType: skuUnit,
          baseRatePerDay: Number(skuRate),
          totalPhysicalStock: Number(skuStock),
        }),
      });
      setSkuName("");
      setShowAddSku(false);
      setMsg("SKU added and 10% safety buffer recalculated!");
      await loadAll();
    } catch (error) {
      setErr((error as Error).message);
    }
  }

  async function handleRefreshHeartbeat() {
    await apiFetch("/catalog/refresh-stock", { method: "POST" });
    setMsg("Inventory heartbeat refreshed! Availability indicators updated for the next 30 days.");
    await loadAll();
  }

  async function handleSubmitBid(e: React.FormEvent) {
    e.preventDefault();
    if (!bidRfq) return;
    setErr("");
    try {
      const items = bidRfq.items.map((it) => ({
        itemName: it.itemName,
        quantity: it.requestedQuantity,
        unitPrice: Math.round((rentalSubtotal / Math.max(1, bidRfq.items.length)) / Math.max(1, it.requestedQuantity)),
      }));
      await apiFetch("/quotations", {
        method: "POST",
        body: JSON.stringify({
          requirementId: bidRfq.id,
          rentalSubtotal: Number(rentalSubtotal),
          transportFee: Number(transportFee),
          laborFee: Number(laborFee),
          taxRatePct: 18,
          securityDeposit: Number(securityDeposit),
          validHours: 48,
          notes: bidNotes,
          items,
        }),
      });
      setBidRfq(null);
      setMsg("3-Way Unbundled Bid dispatched to Organizer!");
      await loadAll();
    } catch (error) {
      setErr((error as Error).message);
    }
  }

  async function handleConfirmHold(bookingId: string) {
    setErr("");
    try {
      await apiFetch(`/bookings/${bookingId}/confirm`, { method: "POST" });
      setMsg("Hard-Lock Confirmed! Contact details unmasked & QR Handover Manifests generated.");
      await loadAll();
    } catch (error) {
      setErr((error as Error).message);
    }
  }

  async function handleReleaseHold(bookingId: string) {
    setErr("");
    try {
      await apiFetch(`/bookings/${bookingId}/release`, { method: "POST" });
      setMsg("Soft-Hold released cleanly. Reserved stock restored to pool.");
      await loadAll();
    } catch (error) {
      setErr((error as Error).message);
    }
  }

  const bidPreview = computeThreeWayBidTotals({
    rentalSubtotal,
    transportFee,
    laborFee,
    taxRatePct: 18,
  });

  const softHoldCount = bookings.filter((b) => b.status === "SOFT_HOLD").length;

  return (
    <div className="space-y-6">
      {/* Vendor Header & VRI Scorecard */}
      <div className="ek-card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-ink">
              {vendor?.businessName || "Vendor Godown Console"}
            </h1>
            {vendor && <StatusBadge status={vendor.verificationStatus} />}
          </div>
          <p className="mt-1 text-xs text-muted">
            Supplier Warehouse &amp; Order Console • {vendor?.safetyBufferPct ?? 10}% safety reserve
            kept free for offline walk-in orders
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl border border-teal/30 bg-teal-soft px-3.5 py-2 text-center">
            <p className="font-mono text-[10px] font-semibold uppercase text-teal-dark">
              Your Trust Score
            </p>
            <p className="font-mono text-lg font-bold text-teal-dark">
              {vendor?.vriScore ?? 85}/100
            </p>
          </div>
          <div className="inline-flex rounded-xl border border-rule bg-canvas p-1 text-xs font-semibold">
            {[
              { id: "bookings", label: `Orders & Holds (${softHoldCount} Urgent)` },
              { id: "rfqs", label: `New Requests (${rfqs.length})` },
              { id: "catalog", label: `My Stock Items (${listings.length})` },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id as typeof tab)}
                className={`min-h-[44px] rounded-lg px-3.5 py-2 transition ${
                  tab === t.id ? "bg-ink text-white" : "text-muted hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {vendor?.verificationStatus !== "VERIFIED" && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong>KYC Pending Admin Verification (BR-02):</strong> Your profile is hidden from
            public search and cannot submit quotes until an Administrator approves your GST/ID proof.
          </div>
        </div>
      )}

      {msg && (
        <div className="rounded-xl border border-teal/30 bg-teal-soft px-4 py-3 text-xs font-semibold text-teal-dark">
          {msg}
        </div>
      )}
      {err && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-xs font-semibold text-red-800">
          {err}
        </div>
      )}

      {/* TAB 1: URGENT 24H SOFT-HOLDS & QR HANDOVER AUDITS */}
      {tab === "bookings" && (
        <div className="space-y-4">
          {bookings.length === 0 ? (
            <div className="ek-card p-10 text-center text-sm text-muted">
              No active bookings or soft-holds yet. Submit a 3-way bid on an incoming RFQ!
            </div>
          ) : (
            bookings.map((bk) => {
              const delivery = bk.checklists.find((c) => c.checklistType === "DELIVERY");
              const ret = bk.checklists.find((c) => c.checklistType === "RETURN");
              return (
                <div
                  key={bk.id}
                  className={`ek-card p-5 space-y-4 ${
                    bk.status === "SOFT_HOLD" ? "border-amber-400 ring-2 ring-amber-200/70" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-rule pb-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-bold">{bk.bookingCode}</span>
                        <StatusBadge status={bk.status} />
                        {bk.status === "SOFT_HOLD" && (
                          <CountdownTimer targetIso={bk.holdExpiresAt} label="Confirm Within" />
                        )}
                      </div>
                      <h3 className="mt-1 font-display text-lg font-bold">
                        {bk.quotation.requirement.title}
                      </h3>
                      <p className="text-xs text-muted">
                        Client: <strong>{bk.counterpartyContact.name}</strong> •{" "}
                        {bk.counterpartyContact.phone} • {bk.counterpartyContact.address}
                      </p>
                    </div>
                    <div className="text-right font-mono">
                      <p className="text-xs text-muted">Binding Total</p>
                      <p className="text-lg font-bold text-ink">
                        {formatINR(bk.quotation.totalAmount)}
                      </p>
                    </div>
                  </div>

                  <BookingLifecycleStepper status={bk.status} />

                  {/* Mobile-Friendly >=48px Warehouse Touch Actions */}
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    {bk.status === "SOFT_HOLD" && (
                      <>
                        <button
                          onClick={() => handleConfirmHold(bk.id)}
                          className="ek-btn-teal min-h-[48px] flex-1 sm:flex-none"
                        >
                          <CheckCircle2 className="h-4 w-4" /> Confirm Order &amp; Unlock Contact
                        </button>
                        <button
                          onClick={() => handleReleaseHold(bk.id)}
                          className="ek-btn-secondary min-h-[48px] border-red-300 text-red-700 hover:bg-red-50"
                        >
                          <XCircle className="h-4 w-4" /> Stock Booked Offline? Release Hold
                        </button>
                      </>
                    )}

                    {bk.status === "CONFIRMED" && delivery && (
                      <button
                        onClick={() =>
                          setActiveChecklist({
                            bookingId: bk.id,
                            bookingCode: bk.bookingCode,
                            checklist: delivery,
                          })
                        }
                        className="ek-btn-primary min-h-[48px]"
                      >
                        <QrCode className="h-4 w-4" /> Check-In Delivery (QR Pass)
                      </button>
                    )}

                    {bk.status === "DELIVERED" && ret && (
                      <button
                        onClick={() =>
                          setActiveChecklist({
                            bookingId: bk.id,
                            bookingCode: bk.bookingCode,
                            checklist: ret,
                          })
                        }
                        className="ek-btn-teal min-h-[48px]"
                      >
                        <ShieldCheck className="h-4 w-4" /> Check Returned Items (QR Pass)
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: INCOMING RFQs & 3-WAY UNBUNDLED BIDDING */}
      {tab === "rfqs" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {rfqs.map((r) => {
            const myQuote = r.quotations[0];
            return (
              <div key={r.id} className="ek-card flex flex-col justify-between p-5 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-saffron-dark">
                      {r.rfqCode} • {r.distanceKm} km from godown
                    </span>
                    <StatusBadge status={myQuote ? myQuote.status : r.status} />
                  </div>
                  <h3 className="font-display text-lg font-bold text-ink">{r.title}</h3>
                  <p className="text-xs text-muted">
                    {r.eventType} • {r.guestCount} guests • {r.venueAddress}
                  </p>

                  <div className="rounded-lg border border-rule bg-canvas p-3 space-y-1 text-xs">
                    {r.items.map((it) => (
                      <div key={it.id} className="flex justify-between">
                        <span className="font-medium text-ink">{it.itemName}</span>
                        <span className="font-mono font-bold">
                          {it.requestedQuantity} {it.unitType.replace("PER_", "")}
                        </span>
                      </div>
                    ))}
                  </div>

                  {myQuote?.revisionNotes && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <strong>Revision Requested:</strong> {myQuote.revisionNotes}
                      </div>
                    </div>
                  )}
                </div>

                {(!myQuote || myQuote.status === "REVISION_REQUESTED") && (
                  <button
                    onClick={() => setBidRfq(r)}
                    className="ek-btn-primary min-h-[48px] w-full"
                  >
                    {myQuote ? "Submit Revised 3-Way Quote" : "Create 3-Way Unbundled Bid"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 3: GODOWN INVENTORY & 10% SAFETY BUFFER VISUALIZER */}
      {tab === "catalog" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted">
              Last stock heartbeat:{" "}
              <strong className="text-ink">
                {vendor ? new Date(vendor.stockRefreshedAt).toLocaleString() : "—"}
              </strong>
            </p>
            <div className="flex gap-2">
              <button onClick={handleRefreshHeartbeat} className="ek-btn-secondary min-h-[48px]">
                <RefreshCw className="h-4 w-4" /> Refresh 30-Day Heartbeat
              </button>
              <button
                onClick={() => setShowAddSku((v) => !v)}
                className="ek-btn-primary min-h-[48px]"
              >
                <Plus className="h-4 w-4" /> Add Godown SKU
              </button>
            </div>
          </div>

          {showAddSku && (
            <form onSubmit={handleAddSku} className="ek-card p-5 space-y-4">
              <h3 className="font-display text-lg font-bold">Add Warehouse SKU</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <select
                  value={skuCategoryId}
                  onChange={(e) => setSkuCategoryId(e.target.value)}
                  className="ek-input"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input
                  required
                  value={skuName}
                  onChange={(e) => setSkuName(e.target.value)}
                  placeholder="Item Name (e.g., German Canopy)"
                  className="ek-input"
                />
                <input
                  type="number"
                  min={1}
                  required
                  value={skuRate}
                  onChange={(e) => setSkuRate(Number(e.target.value))}
                  placeholder="Daily Rate ₹"
                  className="ek-input font-mono"
                />
                <input
                  type="number"
                  min={1}
                  required
                  value={skuStock}
                  onChange={(e) => setSkuStock(Number(e.target.value))}
                  placeholder="Physical Stock"
                  className="ek-input font-mono"
                />
              </div>
              <div className="flex items-center justify-between text-xs text-muted">
                <span>
                  10% Buffer Preview: Physical {skuStock} → Online Allocatable{" "}
                  <strong>{computeAllocatableCapacity(skuStock, 10)}</strong> units
                </span>
                <button type="submit" className="ek-btn-teal">
                  Save SKU
                </button>
              </div>
            </form>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {listings.map((item) => {
              const bufferUnits = item.totalPhysicalStock - item.availability.allocatableCapacity;
              return (
                <div key={item.id} className="ek-card p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs font-semibold text-muted">
                        {item.skuCode} • {item.category.name}
                      </span>
                      <h3 className="font-display text-lg font-bold text-ink">{item.itemName}</h3>
                    </div>
                    <StatusBadge status={item.availability.status} />
                  </div>

                  {/* Interactive 90% Online vs 10% Safety Buffer Visual Bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[11px] font-mono">
                      <span>
                        Online Cap: <strong>{item.availability.allocatableCapacity}</strong> (90%)
                      </span>
                      <span className="text-saffron-dark">
                        Offline Buffer: <strong>{bufferUnits}</strong> (10%)
                      </span>
                    </div>
                    <div className="flex h-2.5 overflow-hidden rounded-full bg-sand">
                      <div className="w-[90%] bg-teal" />
                      <div className="w-[10%] bg-saffron" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-rule pt-3 text-xs">
                    <span className="font-mono font-bold text-ink">
                      {formatINR(item.baseRatePerDay)} / day
                    </span>
                    <span className="inline-flex items-center gap-1 text-muted">
                      <Boxes className="h-3.5 w-3.5" />
                      {item.availability.remainingAllocatable} remaining online
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3-Way Unbundled Quote Builder Modal */}
      {bidRfq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/55 p-4 backdrop-blur-sm">
          <form onSubmit={handleSubmitBid} className="ek-card w-full max-w-lg p-6 space-y-4">
            <h3 className="font-display text-xl font-bold">
              Send Split-Up Price Quote — {bidRfq.rfqCode}
            </h3>
            <p className="text-xs text-muted">
              Enter Item Rent, Delivery Truck Fee, and Setup Labor separately so the organizer sees
              a transparent breakdown.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold">1. Asset Rental (₹) *</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={rentalSubtotal}
                  onChange={(e) => setRentalSubtotal(Number(e.target.value))}
                  className="ek-input font-mono"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold">2. Transport & Freight (₹) *</label>
                <input
                  type="number"
                  min={0}
                  required
                  value={transportFee}
                  onChange={(e) => setTransportFee(Number(e.target.value))}
                  className="ek-input font-mono"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold">3. Setup/Dismantle Labor (₹) *</label>
                <input
                  type="number"
                  min={0}
                  required
                  value={laborFee}
                  onChange={(e) => setLaborFee(Number(e.target.value))}
                  className="ek-input font-mono"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold">Refundable Deposit (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={securityDeposit}
                  onChange={(e) => setSecurityDeposit(Number(e.target.value))}
                  className="ek-input font-mono"
                />
              </div>
            </div>

            <div className="rounded-xl border border-rule bg-canvas p-3.5 font-mono text-xs space-y-1">
              <div className="flex justify-between">
                <span>Subtotal + Freight + Labor:</span>
                <span>{formatINR(bidPreview.rental + bidPreview.transport + bidPreview.labor)}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>GST (18%):</span>
                <span>{formatINR(bidPreview.taxAmount)}</span>
              </div>
              <div className="flex justify-between border-t border-rule pt-1 text-sm font-bold text-ink">
                <span>Total Binding Bid:</span>
                <span>{formatINR(bidPreview.totalAmount)}</span>
              </div>
            </div>

            <input
              value={bidNotes}
              onChange={(e) => setBidNotes(e.target.value)}
              placeholder="Optional delivery schedule or crew notes..."
              className="ek-input text-xs"
            />

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setBidRfq(null)} className="ek-btn-secondary">
                Cancel
              </button>
              <button type="submit" className="ek-btn-teal min-h-[48px]">
                Dispatch Unbundled Quote
              </button>
            </div>
          </form>
        </div>
      )}

      {activeChecklist && (
        <QrManifestModal
          bookingId={activeChecklist.bookingId}
          bookingCode={activeChecklist.bookingCode}
          checklist={activeChecklist.checklist}
          userRole="VENDOR"
          onClose={() => setActiveChecklist(null)}
          onCompleted={() => {
            setActiveChecklist(null);
            setMsg("QR Handover Audit recorded!");
            loadAll();
          }}
        />
      )}
    </div>
  );
}
