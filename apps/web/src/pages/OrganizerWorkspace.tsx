import { useEffect, useState } from "react";
import {
  Award,
  CheckCircle2,
  Eye,
  MessageSquare,
  Plus,
  QrCode,
  RefreshCw,
  Send,
  Star,
  Trash2,
} from "lucide-react";
import { INDORE_LOCALITIES } from "@eventkit/shared";
import { apiFetch, formatINR } from "../lib/api";
import { StatusBadge } from "../components/StatusBadge";
import { CountdownTimer } from "../components/CountdownTimer";
import { BookingLifecycleStepper } from "../components/BookingLifecycleStepper";
import { ChecklistData, QrManifestModal } from "../components/QrManifestModal";
import { HelpTooltip } from "../components/HelpTooltip";

interface Category {
  id: string;
  name: string;
}

interface QuotationSummary {
  id: string;
  vendorId: string;
  rentalSubtotal: number;
  transportFee: number;
  laborFee: number;
  taxAmount: number;
  securityDeposit: number;
  totalAmount: number;
  validUntil: string;
  revisionCount: number;
  revisionNotes?: string;
  notes?: string;
  status: string;
  distanceKm?: number;
  avgRating?: number | null;
  vendor: {
    id: string;
    userId?: string;
    businessName: string;
    locality: string;
    vriScore: number;
  };
  booking?: { id: string; bookingCode: string; status: string; holdExpiresAt: string } | null;
}

interface Requirement {
  id: string;
  rfqCode: string;
  title: string;
  eventType: string;
  startDate: string;
  endDate: string;
  venueLocality: string;
  guestCount: number;
  status: string;
  category: { id: string; name: string };
  items: Array<{ id: string; itemName: string; requestedQuantity: number; unitType: string }>;
  quotations: QuotationSummary[];
}

interface BookingItem {
  id: string;
  bookingCode: string;
  status: string;
  holdExpiresAt: string;
  escrowStatus: string;
  advanceAmount: number;
  depositAmount: number;
  contactRevealed: boolean;
  counterpartyContact: {
    name: string;
    contactPerson?: string;
    phone: string;
    email: string;
    address: string;
  };
  quotation: QuotationSummary & {
    requirement: { id: string; rfqCode: string; title: string; startDate: string; endDate: string };
  };
  checklists: ChecklistData[];
  review?: { id: string; ratingStars: number; reviewText: string } | null;
  supportTickets: Array<{ id: string; ticketCode: string; status: string; claimAmount: number }>;
}

export function OrganizerWorkspace() {
  const [tab, setTab] = useState<"rfqs" | "create" | "bookings">("rfqs");
  const [categories, setCategories] = useState<Category[]>([]);
  const [rfqs, setRfqs] = useState<Requirement[]>([]);
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [selectedRfqId, setSelectedRfqId] = useState<string>("");
  const [matrixData, setMatrixData] = useState<{
    quotations: QuotationSummary[];
    highlights: { lowestTotalId: string | null; highestVriId: string | null; lowestTransportId: string | null };
  } | null>(null);

  // Create RFQ Form State
  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState("Corporate Conference");
  const [startDate, setStartDate] = useState(
    new Date(Date.now() + 86400000 * 10).toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState(
    new Date(Date.now() + 86400000 * 12).toISOString().slice(0, 10)
  );
  const [venueLocality, setVenueLocality] = useState<string>(INDORE_LOCALITIES[0].name);
  const [venueAddress, setVenueAddress] = useState("");
  const [guestCount, setGuestCount] = useState(250);
  const [targetBudget, setTargetBudget] = useState(45000);
  const [draftItems, setDraftItems] = useState<
    Array<{ categoryId: string; itemName: string; unitType: "PER_PIECE" | "PER_SQFT" | "PER_SET"; requestedQuantity: number }>
  >([]);

  // Revision / Messaging / Handover / Review States
  const [revisionQuote, setRevisionQuote] = useState<QuotationSummary | null>(null);
  const [revBudget, setRevBudget] = useState("");
  const [revNotes, setRevNotes] = useState("");
  const [activeChat, setActiveChat] = useState<{ rfqId: string; vendorUserId: string; vendorName: string } | null>(null);
  const [chatMsgs, setChatMsgs] = useState<Array<{ id: string; messageBody: string; sentAt: string; sender: { fullName: string; role: string } }>>([]);
  const [chatText, setChatText] = useState("");
  const [activeChecklist, setActiveChecklist] = useState<{ bookingId: string; bookingCode: string; checklist: ChecklistData } | null>(null);
  const [reviewBookingId, setReviewBookingId] = useState<string | null>(null);
  const [ratingStars, setRatingStars] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [feedbackMsg, setFeedbackMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  async function loadAll() {
    const [catRes, rfqRes, bkRes] = await Promise.all([
      apiFetch<{ categories: Category[] }>("/catalog/categories"),
      apiFetch<{ requirements: Requirement[] }>("/rfqs"),
      apiFetch<{ bookings: BookingItem[] }>("/bookings"),
    ]);
    setCategories(catRes.categories);
    const sortedRfqs = [...rfqRes.requirements].sort((a, b) => {
      const rank = (s: string) => (s === "QUOTED" ? 0 : s === "BROADCAST" ? 1 : 2);
      return rank(a.status) - rank(b.status);
    });
    setRfqs(sortedRfqs);
    setBookings(bkRes.bookings);

    if (catRes.categories.length > 0 && draftItems.length === 0) {
      setDraftItems([
        {
          categoryId: catRes.categories[0].id,
          itemName: "Banquet Cushioned Chairs",
          unitType: "PER_PIECE",
          requestedQuantity: 250,
        },
      ]);
    }

    const bestInitial =
      sortedRfqs.find((r) => r.status === "QUOTED") ||
      sortedRfqs.find((r) => r.quotations.length > 0) ||
      sortedRfqs[0];
    if (bestInitial && !selectedRfqId) {
      setSelectedRfqId(bestInitial.id);
    }
  }

  useEffect(() => {
    loadAll().catch((e) => setErrorMsg(e.message));
  }, []);

  useEffect(() => {
    if (!selectedRfqId) return;
    apiFetch<{
      quotations: QuotationSummary[];
      highlights: { lowestTotalId: string | null; highestVriId: string | null; lowestTransportId: string | null };
    }>(`/quotations/matrix/${selectedRfqId}`)
      .then(setMatrixData)
      .catch(() => setMatrixData(null));
  }, [selectedRfqId, rfqs]);

  async function handleCreateRfq(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setFeedbackMsg("");
    try {
      const res = await apiFetch<{ requirements: Requirement[]; multiCategorySplit: boolean }>("/rfqs", {
        method: "POST",
        body: JSON.stringify({
          title,
          eventType,
          startDate,
          endDate,
          venueLocality,
          venueAddress,
          guestCount: Number(guestCount),
          targetBudget: Number(targetBudget) || undefined,
          items: draftItems,
        }),
      });
      setFeedbackMsg(
        res.multiCategorySplit
          ? `FR-08 Multi-Category Isolation applied: split into ${res.requirements.length} independent RFQ pipelines and broadcast to verified Indore vendors!`
          : `RFQ ${res.requirements[0].rfqCode} broadcast to verified vendors within 25 km!`
      );
      setTitle("");
      setVenueAddress("");
      await loadAll();
      setSelectedRfqId(res.requirements[0].id);
      setTab("rfqs");
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  }

  async function handleAcceptQuote(quoteId: string) {
    setErrorMsg("");
    setFeedbackMsg("");
    try {
      const res = await apiFetch<{ booking: { bookingCode: string } }>(`/quotations/${quoteId}/accept`, {
        method: "POST",
      });
      setFeedbackMsg(
        `Atomic Soft-Hold Initiated (${res.booking.bookingCode})! Competing quotes auto-declined. Vendor has 24 hours to hard-confirm.`
      );
      await loadAll();
      setTab("bookings");
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  }

  async function handleSubmitRevision(e: React.FormEvent) {
    e.preventDefault();
    if (!revisionQuote) return;
    setErrorMsg("");
    try {
      await apiFetch(`/quotations/${revisionQuote.id}/request-revision`, {
        method: "POST",
        body: JSON.stringify({ targetBudget: Number(revBudget), revisionNotes: revNotes }),
      });
      setRevisionQuote(null);
      setRevNotes("");
      setFeedbackMsg("Structured revision request sent to vendor.");
      await loadAll();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  }

  async function openChat(rfqId: string, vendorUserId: string, vendorName: string) {
    setActiveChat({ rfqId, vendorUserId, vendorName });
    const data = await apiFetch<{
      messages: Array<{ id: string; messageBody: string; sentAt: string; sender: { fullName: string; role: string } }>;
    }>(`/rfqs/${rfqId}/messages`);
    setChatMsgs(data.messages);
  }

  async function sendChat(e: React.FormEvent) {
    e.preventDefault();
    if (!activeChat || !chatText.trim()) return;
    await apiFetch(`/rfqs/${activeChat.rfqId}/messages`, {
      method: "POST",
      body: JSON.stringify({ receiverId: activeChat.vendorUserId, messageBody: chatText }),
    });
    setChatText("");
    await openChat(activeChat.rfqId, activeChat.vendorUserId, activeChat.vendorName);
  }

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();
    if (!reviewBookingId) return;
    setErrorMsg("");
    try {
      await apiFetch("/bookings/reviews", {
        method: "POST",
        body: JSON.stringify({
          bookingId: reviewBookingId,
          ratingStars,
          onTimeDelivery: true,
          reviewText,
        }),
      });
      setReviewBookingId(null);
      setReviewText("");
      setFeedbackMsg("Verified review published and Vendor Reliability Index (VRI) updated!");
      await loadAll();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-wider text-saffron">
            Event Planner Workspace
          </p>
          <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Your Event Requests, Supplier Quotes & Bookings
          </h1>
        </div>

        <div className="inline-flex rounded-xl border border-rule bg-surface p-1 text-xs font-semibold">
          {[
            { id: "rfqs", label: `Compare Quotes (${rfqs.length})` },
            { id: "create", label: "+ Request New Quotes" },
            { id: "bookings", label: `My Bookings & QR (${bookings.length})` },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as typeof tab)}
              className={`rounded-lg px-3.5 py-2 transition ${
                tab === t.id ? "bg-ink text-white" : "text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {feedbackMsg && (
        <div className="flex items-center justify-between rounded-xl border border-teal/30 bg-teal-soft px-4 py-3 text-xs font-semibold text-teal-dark">
          <span>{feedbackMsg}</span>
          <button onClick={() => setFeedbackMsg("")} className="underline">
            Dismiss
          </button>
        </div>
      )}
      {errorMsg && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-xs font-semibold text-red-800">
          {errorMsg}
        </div>
      )}

      {/* TAB 1: RFQs & SIDE-BY-SIDE QUOTE MATRIX */}
      {tab === "rfqs" && (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="ek-card p-4 space-y-2.5 h-fit">
            <div className="flex items-center justify-between border-b border-rule pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">
                Your Dispatched RFQs
              </span>
              <button onClick={loadAll} className="text-muted hover:text-ink">
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
            {rfqs.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedRfqId(r.id)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  selectedRfqId === r.id
                    ? "border-saffron bg-saffron-soft/45"
                    : "border-rule bg-surface hover:bg-canvas"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-bold text-saffron-dark">
                    {r.rfqCode}
                  </span>
                  <StatusBadge status={r.status} />
                </div>
                <p className="mt-1 text-sm font-semibold text-ink line-clamp-2">{r.title}</p>
                <p className="mt-1 text-[11px] text-muted">
                  {r.category.name} • {r.quotations.length} bids • {r.venueLocality}
                </p>
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {!matrixData || matrixData.quotations.length === 0 ? (
              <div className="ek-card p-10 text-center">
                <p className="text-sm font-semibold text-ink">
                  Waiting for vendor bids on this requirement
                </p>
                <p className="mt-1 text-xs text-muted">
                  Switch to a Vendor persona using the top bar to submit a 3-way unbundled quote!
                </p>
              </div>
            ) : (
              <div className="ek-card overflow-hidden">
                <div className="border-b border-rule bg-sand/50 px-5 py-4">
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-lg font-bold text-ink">
                      Compare Supplier Quotes Side-by-Side
                    </h2>
                    <HelpTooltip
                      title="How Quote Comparison Works"
                      text="Every supplier must split rent, delivery truck fee, and setup labor. Clicking 'Hold for 24h' reserves the items and automatically declines the other quotes."
                    />
                  </div>
                  <p className="text-xs text-muted">
                    Compare Rent, Delivery Truck, and Setup Labor clearly. Choosing one supplier
                    puts a 24-hour reservation hold while they confirm stock.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-rule bg-canvas/70 text-[11px] uppercase tracking-wider text-muted">
                        <th className="px-4 py-3 font-semibold">Cost & Trust Metric</th>
                        {matrixData.quotations.map((q) => (
                          <th key={q.id} className="min-w-[210px] px-4 py-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-display text-sm font-bold text-ink normal-case">
                                {q.vendor.businessName}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 normal-case">
                              <StatusBadge status={q.status} />
                              {matrixData.highlights.lowestTotalId === q.id && (
                                <span className="rounded bg-teal-soft px-1.5 py-0.5 font-mono text-[10px] font-bold text-teal-dark">
                                  LOWEST BID
                                </span>
                              )}
                              {matrixData.highlights.highestVriId === q.id && (
                                <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-900">
                                  TOP VRI
                                </span>
                              )}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rule">
                      <tr>
                        <td className="px-4 py-2.5 font-semibold text-muted">Supplier Trust Score & Distance</td>
                        {matrixData.quotations.map((q) => (
                          <td key={q.id} className="px-4 py-2.5 font-mono font-semibold text-teal-dark">
                            {q.vendor.vriScore}/100 • {q.distanceKm ?? 0} km away
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-4 py-2.5 font-semibold text-muted">1. Equipment Rent</td>
                        {matrixData.quotations.map((q) => (
                          <td key={q.id} className="px-4 py-2.5 font-mono tabular-nums font-medium">
                            {formatINR(q.rentalSubtotal)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-4 py-2.5 font-semibold text-muted">2. Truck & Delivery Cost</td>
                        {matrixData.quotations.map((q) => (
                          <td key={q.id} className="px-4 py-2.5 font-mono tabular-nums">
                            {formatINR(q.transportFee)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-4 py-2.5 font-semibold text-muted">3. Setup & Removal Labor</td>
                        {matrixData.quotations.map((q) => (
                          <td key={q.id} className="px-4 py-2.5 font-mono tabular-nums">
                            {formatINR(q.laborFee)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-4 py-2.5 font-semibold text-muted">GST & Taxes</td>
                        {matrixData.quotations.map((q) => (
                          <td key={q.id} className="px-4 py-2.5 font-mono tabular-nums text-muted">
                            {formatINR(q.taxAmount)}
                          </td>
                        ))}
                      </tr>
                      <tr className="bg-canvas/60">
                        <td className="px-4 py-3 font-bold text-ink">Total Binding Bid</td>
                        {matrixData.quotations.map((q) => (
                          <td
                            key={q.id}
                            className="px-4 py-3 font-mono text-base font-bold text-ink tabular-nums"
                          >
                            {formatINR(q.totalAmount)}
                            <p className="font-sans text-[11px] font-normal text-muted">
                              Deposit: {formatINR(q.securityDeposit)}
                            </p>
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-4 py-2.5 font-semibold text-muted">Quote Expiry SLA</td>
                        {matrixData.quotations.map((q) => (
                          <td key={q.id} className="px-4 py-2.5">
                            <CountdownTimer targetIso={q.validUntil} />
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-semibold text-muted">Actions</td>
                        {matrixData.quotations.map((q) => (
                          <td key={q.id} className="px-4 py-3 space-y-2">
                            {["SENT", "REVISION_REQUESTED"].includes(q.status) && (
                              <>
                                <button
                                  onClick={() => handleAcceptQuote(q.id)}
                                  className="ek-btn-teal w-full py-2 text-xs"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Choose & Hold for 24 Hours
                                </button>
                                <div className="flex gap-1.5">
                                  <button
                                    onClick={() => {
                                      setRevisionQuote(q);
                                      setRevBudget(String(Math.round(q.totalAmount * 0.9)));
                                    }}
                                    className="ek-btn-secondary flex-1 py-1.5 text-[11px]"
                                  >
                                    Ask Lower Price
                                  </button>
                                  {q.vendor.userId && (
                                    <button
                                      onClick={() =>
                                        openChat(selectedRfqId, q.vendor.userId!, q.vendor.businessName)
                                      }
                                      className="ek-btn-secondary px-2.5 py-1.5 text-[11px]"
                                      title="Masked Q&A"
                                    >
                                      <MessageSquare className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </>
                            )}
                            {q.status === "ACCEPTED" && (
                              <span className="inline-flex items-center gap-1 font-semibold text-teal-dark">
                                <Award className="h-4 w-4" /> Winning Bid
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: MULTI-CATEGORY RFQ BUILDER */}
      {tab === "create" && (
        <form onSubmit={handleCreateRfq} className="ek-card mx-auto max-w-3xl p-6 space-y-5">
          <div className="border-b border-rule pb-3">
            <h2 className="font-display text-xl font-bold text-ink">
              Request Quotes for Your Event
            </h2>
            <p className="text-xs text-muted">
              Fill this once—nearby verified suppliers will send itemized prices. If you add items
              from 2 categories (e.g., Tents + Catering), we split them cleanly for you.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold">Event Title *</label>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Annual Tech Summit Stage & Seating"
                className="ek-input"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Event Type *</label>
              <input
                required
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                className="ek-input"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Start Date *</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="ek-input"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">End Date *</label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="ek-input"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Indore Locality (25km Geofence) *</label>
              <select
                value={venueLocality}
                onChange={(e) => setVenueLocality(e.target.value)}
                className="ek-input"
              >
                {INDORE_LOCALITIES.map((l) => (
                  <option key={l.name} value={l.name}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Venue Street Address *</label>
              <input
                required
                value={venueAddress}
                onChange={(e) => setVenueAddress(e.target.value)}
                placeholder="Brilliant Convention Centre, Scheme 78"
                className="ek-input"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Guest Count *</label>
              <input
                type="number"
                min={10}
                required
                value={guestCount}
                onChange={(e) => setGuestCount(Number(e.target.value))}
                className="ek-input font-mono"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Target Budget (₹)</label>
              <input
                type="number"
                value={targetBudget}
                onChange={(e) => setTargetBudget(Number(e.target.value))}
                className="ek-input font-mono"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-muted">
                Line-Item Asset Demands
              </label>
              <button
                type="button"
                onClick={() =>
                  setDraftItems((prev) => [
                    ...prev,
                    {
                      categoryId: categories[1]?.id || categories[0]?.id || "",
                      itemName: "Commercial Buffet Chafing Dishes",
                      unitType: "PER_PIECE",
                      requestedQuantity: 30,
                    },
                  ])
                }
                className="ek-btn-secondary py-1.5 text-xs"
              >
                <Plus className="h-3.5 w-3.5" /> Add Item / Category
              </button>
            </div>

            {draftItems.map((it, idx) => (
              <div
                key={idx}
                className="grid gap-2 rounded-xl border border-rule bg-canvas/70 p-3 sm:grid-cols-[1.2fr_1.3fr_0.7fr_auto]"
              >
                <select
                  value={it.categoryId}
                  onChange={(e) =>
                    setDraftItems((prev) =>
                      prev.map((p, i) => (i === idx ? { ...p, categoryId: e.target.value } : p))
                    )
                  }
                  className="ek-input py-2 text-xs"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input
                  required
                  value={it.itemName}
                  onChange={(e) =>
                    setDraftItems((prev) =>
                      prev.map((p, i) => (i === idx ? { ...p, itemName: e.target.value } : p))
                    )
                  }
                  placeholder="Equipment item name"
                  className="ek-input py-2 text-xs"
                />
                <input
                  type="number"
                  min={1}
                  required
                  value={it.requestedQuantity}
                  onChange={(e) =>
                    setDraftItems((prev) =>
                      prev.map((p, i) =>
                        i === idx ? { ...p, requestedQuantity: Number(e.target.value) } : p
                      )
                    )
                  }
                  className="ek-input py-2 font-mono text-xs"
                />
                {draftItems.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setDraftItems((prev) => prev.filter((_, i) => i !== idx))}
                    className="rounded-lg border border-rule bg-surface p-2 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button type="submit" className="ek-btn-primary w-full">
            <Send className="h-4 w-4" /> Broadcast Structured RFQ to Verified Vendors
          </button>
        </form>
      )}

      {/* TAB 3: BOOKINGS, ESCROW LEDGER & QR HANDOVER */}
      {tab === "bookings" && (
        <div className="space-y-4">
          {bookings.map((bk) => {
            const deliveryManifest = bk.checklists.find((c) => c.checklistType === "DELIVERY");
            return (
              <div key={bk.id} className="ek-card p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-rule pb-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-ink">{bk.bookingCode}</span>
                      <StatusBadge status={bk.status} />
                      {bk.status === "SOFT_HOLD" && (
                        <CountdownTimer targetIso={bk.holdExpiresAt} label="Vendor SLA" />
                      )}
                    </div>
                    <h3 className="mt-1 font-display text-lg font-bold text-ink">
                      {bk.quotation.requirement.title}
                    </h3>
                    <p className="text-xs text-muted">
                      Vendor: <strong>{bk.counterpartyContact.name}</strong> • Total:{" "}
                      <span className="font-mono font-semibold text-ink">
                        {formatINR(bk.quotation.totalAmount)}
                      </span>
                    </p>
                  </div>

                  {/* Simulated Two-Phase Escrow Ledger Pill */}
                  <div className="rounded-lg border border-rule bg-canvas px-3 py-2 text-right text-xs">
                    <p className="font-mono text-[10px] font-semibold uppercase text-muted">
                      Escrow Ledger Simulation ({bk.escrowStatus})
                    </p>
                    <p className="font-mono font-bold text-ink">
                      30% Adv: {formatINR(bk.advanceAmount)} • Deposit: {formatINR(bk.depositAmount)}
                    </p>
                  </div>
                </div>

                <BookingLifecycleStepper status={bk.status} />

                {/* Contact Reveal Banner (BR-08 / TC-07) */}
                <div
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3.5 py-2.5 text-xs ${
                    bk.contactRevealed
                      ? "border-teal/30 bg-teal-soft text-teal-dark"
                      : "border-amber-200 bg-amber-50 text-amber-900"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    <span>
                      <strong>
                        {bk.contactRevealed ? "Direct Contact Unmasked:" : "Contact Masked (Soft-Hold):"}
                      </strong>{" "}
                      {bk.counterpartyContact.phone} • {bk.counterpartyContact.email} •{" "}
                      {bk.counterpartyContact.address}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {bk.status === "CONFIRMED" && deliveryManifest && (
                      <button
                        onClick={() =>
                          setActiveChecklist({
                            bookingId: bk.id,
                            bookingCode: bk.bookingCode,
                            checklist: deliveryManifest,
                          })
                        }
                        className="ek-btn-teal py-1.5 text-xs"
                      >
                        <QrCode className="h-3.5 w-3.5" /> Sign QR Delivery Manifest
                      </button>
                    )}

                    {bk.status === "COMPLETED" && !bk.review && (
                      <button
                        onClick={() => setReviewBookingId(bk.id)}
                        className="ek-btn-primary py-1.5 text-xs"
                      >
                        <Star className="h-3.5 w-3.5" /> Rate & Review Vendor
                      </button>
                    )}
                  </div>
                </div>

                {bk.supportTickets.length > 0 && (
                  <div className="rounded-lg border border-red-300 bg-red-50 px-3.5 py-2 text-xs text-red-900">
                    Dispute Ticket <strong>{bk.supportTickets[0].ticketCode}</strong> (
                    {bk.supportTickets[0].status}) — Claim:{" "}
                    {formatINR(bk.supportTickets[0].claimAmount)}
                  </div>
                )}

                {bk.review && (
                  <div className="rounded-lg border border-rule bg-canvas px-3.5 py-2 text-xs">
                    <strong>Your Verified Review ({bk.review.ratingStars}/5):</strong>{" "}
                    {bk.review.reviewText}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Revision Modal */}
      {revisionQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4">
          <form onSubmit={handleSubmitRevision} className="ek-card w-full max-w-md p-6 space-y-4">
            <h3 className="font-display text-lg font-bold">
              Request Revision — {revisionQuote.vendor.businessName}
            </h3>
            <div>
              <label className="mb-1 block text-xs font-semibold">Target Total Budget (₹)</label>
              <input
                type="number"
                required
                value={revBudget}
                onChange={(e) => setRevBudget(e.target.value)}
                className="ek-input font-mono"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Revision Note</label>
              <textarea
                required
                rows={3}
                value={revNotes}
                onChange={(e) => setRevNotes(e.target.value)}
                placeholder="e.g., Venue is 4 km away, please optimize freight fee."
                className="ek-input"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRevisionQuote(null)}
                className="ek-btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" className="ek-btn-primary">
                Send Counter-Offer
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Masked Chat Drawer */}
      {activeChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4">
          <div className="ek-card w-full max-w-md p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-rule pb-2">
              <div>
                <p className="text-sm font-bold text-ink">Masked Thread: {activeChat.vendorName}</p>
                <p className="text-[11px] text-muted">
                  Phone numbers are auto-redacted until booking confirmation (BR-08).
                </p>
              </div>
              <button onClick={() => setActiveChat(null)} className="text-xs font-semibold text-saffron">
                Close
              </button>
            </div>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {chatMsgs.map((m) => (
                <div key={m.id} className="rounded-lg border border-rule bg-canvas p-2.5 text-xs">
                  <p className="font-semibold text-ink">
                    {m.sender.fullName} <span className="font-mono text-[10px] text-muted">({m.sender.role})</span>
                  </p>
                  <p className="mt-0.5 text-ink">{m.messageBody}</p>
                </div>
              ))}
            </div>
            <form onSubmit={sendChat} className="flex gap-2">
              <input
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                placeholder="Ask about setup timings or specs..."
                className="ek-input py-2 text-xs"
              />
              <button type="submit" className="ek-btn-primary py-2 text-xs">
                Send
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {reviewBookingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4">
          <form onSubmit={submitReview} className="ek-card w-full max-w-md p-6 space-y-4">
            <h3 className="font-display text-lg font-bold">Submit Verified Review (BR-09)</h3>
            <div>
              <label className="mb-1 block text-xs font-semibold">Rating (1-5 Stars)</label>
              <select
                value={ratingStars}
                onChange={(e) => setRatingStars(Number(e.target.value))}
                className="ek-input"
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} Stars
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Review</label>
              <textarea
                required
                rows={3}
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="Share dispatch punctuality & asset condition..."
                className="ek-input"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReviewBookingId(null)}
                className="ek-btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" className="ek-btn-teal">
                Publish Review
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
          userRole="ORGANIZER"
          onClose={() => setActiveChecklist(null)}
          onCompleted={() => {
            setActiveChecklist(null);
            setFeedbackMsg("QR Delivery Manifest verified and signed!");
            loadAll();
          }}
        />
      )}
    </div>
  );
}
