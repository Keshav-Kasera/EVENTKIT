import { useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Clock,
  FileCheck2,
  Scale,
  ShieldAlert,
  TimerReset,
  XCircle,
} from "lucide-react";
import { apiFetch, formatINR } from "../lib/api";
import { StatusBadge } from "../components/StatusBadge";

interface VendorKyc {
  id: string;
  businessName: string;
  verificationStatus: string;
  gstNumber?: string | null;
  locality: string;
  warehouseAddress: string;
  user: { fullName: string; email: string; phone: string };
}

interface DisputeTicket {
  id: string;
  ticketCode: string;
  status: string;
  claimAmount: number;
  settlementAmount?: number | null;
  resolutionNotes?: string | null;
  booking: {
    id: string;
    bookingCode: string;
    quotation: {
      vendor: { businessName: string };
      requirement: { rfqCode: string; title: string };
    };
  };
}

interface AuditEntry {
  id: string;
  entityName: string;
  actionType: string;
  previousState?: string | null;
  newState?: string | null;
  loggedAt: string;
  actor?: { fullName: string; role: string } | null;
}

interface BookingQuick {
  id: string;
  bookingCode: string;
  status: string;
  holdExpiresAt: string;
}

export function AdminDesk() {
  const [tab, setTab] = useState<"kyc" | "disputes" | "watchdog">("kyc");
  const [vendors, setVendors] = useState<VendorKyc[]>([]);
  const [tickets, setTickets] = useState<DisputeTicket[]>([]);
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [softHolds, setSoftHolds] = useState<BookingQuick[]>([]);
  const [arbitrateTicket, setArbitrateTicket] = useState<DisputeTicket | null>(null);
  const [settlementAmt, setSettlementAmt] = useState("0");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function loadAll() {
    const [kRes, dRes, lRes, bRes] = await Promise.all([
      apiFetch<{ vendors: VendorKyc[] }>("/admin/kyc"),
      apiFetch<{ tickets: DisputeTicket[] }>("/admin/disputes"),
      apiFetch<{ logs: AuditEntry[] }>("/admin/audit-logs"),
      apiFetch<{ bookings: BookingQuick[] }>("/bookings"),
    ]);
    setVendors(kRes.vendors);
    setTickets(dRes.tickets);
    setLogs(lRes.logs);
    setSoftHolds(bRes.bookings.filter((b) => b.status === "SOFT_HOLD"));
  }

  useEffect(() => {
    loadAll().catch((e) => setErr(e.message));
  }, []);

  async function handleKycDecision(vendorId: string, status: "VERIFIED" | "REJECTED") {
    setErr("");
    await apiFetch(`/admin/kyc/${vendorId}`, {
      method: "PATCH",
      body: JSON.stringify({
        verificationStatus: status,
        rejectionReason: status === "REJECTED" ? "Document mismatch during audit" : null,
      }),
    });
    setMsg(`Vendor KYC updated to ${status}.`);
    await loadAll();
  }

  async function handleArbitrate(e: React.FormEvent) {
    e.preventDefault();
    if (!arbitrateTicket) return;
    await apiFetch(`/admin/disputes/${arbitrateTicket.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "RESOLVED",
        settlementAmount: Number(settlementAmt) || 0,
        resolutionNotes,
      }),
    });
    setArbitrateTicket(null);
    setResolutionNotes("");
    setMsg("Immutable dispute resolution logged and booking settled.");
    await loadAll();
  }

  async function handleWatchdogSweep() {
    const res = await apiFetch<{
      summary: { expiredQuotesCount: number; releasedBookingsCount: number };
    }>("/admin/watchdog/sweep", { method: "POST" });
    setMsg(
      `Watchdog sweep finished: ${res.summary.expiredQuotesCount} quotes expired, ${res.summary.releasedBookingsCount} soft-holds released.`
    );
    await loadAll();
  }

  async function handleSimulate24hExpiry(bookingId: string) {
    const res = await apiFetch<{
      summary: { releasedBookingsCount: number };
    }>(`/admin/watchdog/demo-expire/${bookingId}`, { method: "POST" });
    setMsg(
      `TC-05 Simulated 24h Expiry complete! Released ${res.summary.releasedBookingsCount} hold(s), restored inventory buffer, and reopened alternative bids.`
    );
    await loadAll();
  }

  return (
    <div className="space-y-6">
      <div className="ek-card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-wider text-teal-dark">
            Platform Governance & Arbitration
          </p>
          <h1 className="font-display text-2xl font-bold text-ink">
            Admin Compliance & Watchdog Desk
          </h1>
        </div>
        <div className="inline-flex rounded-xl border border-rule bg-canvas p-1 text-xs font-semibold">
          {[
            { id: "kyc", label: `KYC Queue (${vendors.filter((v) => v.verificationStatus === "PENDING").length} Pending)` },
            { id: "disputes", label: `Disputes (${tickets.filter((t) => t.status === "OPEN").length} Open)` },
            { id: "watchdog", label: `Watchdog & Audit Logs (${logs.length})` },
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

      {/* TAB 1: VENDOR KYC QUEUE */}
      {tab === "kyc" && (
        <div className="grid gap-4 md:grid-cols-2">
          {vendors.map((v) => (
            <div key={v.id} className="ek-card p-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg font-bold text-ink">{v.businessName}</h3>
                  <p className="text-xs text-muted">
                    {v.user.fullName} • {v.user.email} • {v.locality}
                  </p>
                </div>
                <StatusBadge status={v.verificationStatus} />
              </div>
              <div className="rounded-lg border border-rule bg-canvas px-3 py-2 font-mono text-xs">
                GSTIN: {v.gstNumber || "Not provided"} • Godown: {v.warehouseAddress}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleKycDecision(v.id, "VERIFIED")}
                  className="ek-btn-teal flex-1 py-2 text-xs"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Approve & List Publicly
                </button>
                <button
                  onClick={() => handleKycDecision(v.id, "REJECTED")}
                  className="ek-btn-secondary py-2 text-xs text-red-700"
                >
                  <XCircle className="h-3.5 w-3.5" /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 2: DISPUTE ARBITRATION */}
      {tab === "disputes" && (
        <div className="space-y-3">
          {tickets.length === 0 ? (
            <div className="ek-card p-10 text-center text-sm text-muted">
              No dispute tickets escalated yet. Flag damage on a Return Audit to test TC-08!
            </div>
          ) : (
            tickets.map((t) => (
              <div key={t.id} className="ek-card p-5 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold">{t.ticketCode}</span>
                    <StatusBadge status={t.status} />
                    <span className="font-mono text-xs text-red-700 font-semibold">
                      Claim: {formatINR(t.claimAmount)}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-ink">
                    {t.booking.quotation.requirement.title} ({t.booking.bookingCode})
                  </p>
                  <p className="text-xs text-muted">{t.resolutionNotes}</p>
                </div>
                {t.status !== "RESOLVED" && (
                  <button
                    onClick={() => {
                      setArbitrateTicket(t);
                      setSettlementAmt(String(t.claimAmount));
                    }}
                    className="ek-btn-primary text-xs"
                  >
                    <Scale className="h-3.5 w-3.5" /> Arbitrate & Settle
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 3: WATCHDOG SLA & IMMUTABLE AUDIT LOGS */}
      {tab === "watchdog" && (
        <div className="space-y-5">
          <div className="ek-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-ink flex items-center gap-2">
                  <Activity className="h-4 w-4 text-saffron" />
                  24-Hour SLA Watchdog & TC-05 Time-Travel Simulator
                </h2>
                <p className="text-xs text-muted">
                  Watchdog runs automatically every 60s and on server startup. Use the simulator
                  below to verify TC-05 live without waiting 24 hours.
                </p>
              </div>
              <button onClick={handleWatchdogSweep} className="ek-btn-secondary text-xs">
                <Clock className="h-3.5 w-3.5" /> Run Immediate Sweep
              </button>
            </div>

            {softHolds.length > 0 && (
              <div className="space-y-2 border-t border-rule pt-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted">
                  Active SOFT_HOLD Bookings
                </p>
                {softHolds.map((b) => (
                  <div
                    key={b.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs"
                  >
                    <span className="font-mono font-bold">
                      {b.bookingCode} • Expires {new Date(b.holdExpiresAt).toLocaleString()}
                    </span>
                    <button
                      onClick={() => handleSimulate24hExpiry(b.id)}
                      className="ek-btn-primary py-1.5 text-xs"
                    >
                      <TimerReset className="h-3.5 w-3.5" /> Simulate +24h1m Expiry (TC-05)
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="ek-card overflow-hidden">
            <div className="border-b border-rule bg-sand/50 px-5 py-3 flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-teal-dark" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted">
                Immutable System Audit Trail (NFR-05)
              </span>
            </div>
            <div className="divide-y divide-rule max-h-96 overflow-y-auto">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-xs"
                >
                  <div>
                    <span className="font-mono font-bold text-ink">{log.actionType}</span>{" "}
                    <span className="text-muted">on {log.entityName}</span>
                    {log.newState && (
                      <span className="ml-2 rounded bg-sand px-1.5 py-0.5 font-mono text-[10px]">
                        → {log.newState}
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-[11px] text-muted">
                    {log.actor ? `${log.actor.fullName} (${log.actor.role})` : "SYSTEM_WATCHDOG"} •{" "}
                    {new Date(log.loggedAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {arbitrateTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4">
          <form onSubmit={handleArbitrate} className="ek-card w-full max-w-md p-6 space-y-4">
            <h3 className="font-display text-lg font-bold flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-saffron" />
              Binding Arbitration — {arbitrateTicket.ticketCode}
            </h3>
            <div>
              <label className="mb-1 block text-xs font-semibold">Approved Settlement (₹)</label>
              <input
                type="number"
                min={0}
                value={settlementAmt}
                onChange={(e) => setSettlementAmt(e.target.value)}
                className="ek-input font-mono"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Immutable Resolution Notes *</label>
              <textarea
                required
                rows={3}
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Record evidence review & final deposit deduction..."
                className="ek-input"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setArbitrateTicket(null)}
                className="ek-btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" className="ek-btn-teal">
                Record Binding Settlement
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
