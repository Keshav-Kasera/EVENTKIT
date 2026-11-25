import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, ShieldCheck, Sparkles, UserCheck } from "lucide-react";
import { INDORE_LOCALITIES } from "@eventkit/shared";
import { useAuth } from "../context/AuthContext";

export function AuthPage() {
  const { login, register, demoLogin } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [role, setRole] = useState<"ORGANIZER" | "VENDOR">("ORGANIZER");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [organizationType, setOrganizationType] = useState("Wedding & Corporate Planner");
  const [businessName, setBusinessName] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [locality, setLocality] = useState<string>(INDORE_LOCALITIES[0].name);
  const [warehouseAddress, setWarehouseAddress] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function redirectForRole(userRole: string) {
    if (userRole === "VENDOR") navigate("/vendor");
    else if (userRole === "ADMIN") navigate("/admin");
    else navigate("/organizer");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      if (mode === "login") {
        const u = await login(email, password);
        redirectForRole(u.role);
      } else {
        const loc = INDORE_LOCALITIES.find((l) => l.name === locality);
        const u = await register({
          email,
          password,
          fullName,
          phone,
          role,
          city: "Indore",
          organizationType: role === "ORGANIZER" ? organizationType : undefined,
          businessName: role === "VENDOR" ? businessName : undefined,
          gstNumber: role === "VENDOR" ? gstNumber : undefined,
          locality: role === "VENDOR" ? locality : undefined,
          warehouseAddress: role === "VENDOR" ? warehouseAddress : undefined,
          latitude: loc?.lat,
          longitude: loc?.lng,
        });
        redirectForRole(u.role);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDemo(persona: string) {
    setError("");
    setSubmitting(true);
    try {
      const u = await demoLogin(persona);
      redirectForRole(u.role);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="ek-card p-6 sm:p-8">
        <div className="flex items-center justify-between border-b border-rule pb-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink">
              {mode === "login" ? "Sign in to EventKit" : "Create EventKit Account"}
            </h1>
            <p className="text-xs text-muted">
              Role-Based Access Control (Organizer, Vendor Godown, Admin)
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-rule bg-canvas p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`rounded-md px-3 py-1.5 transition ${
                mode === "login" ? "bg-surface text-ink shadow-sm" : "text-muted"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode("register")}
              className={`rounded-md px-3 py-1.5 transition ${
                mode === "register" ? "bg-surface text-ink shadow-sm" : "text-muted"
              }`}
            >
              Register
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {mode === "register" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRole("ORGANIZER")}
                  className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-xs font-semibold transition ${
                    role === "ORGANIZER"
                      ? "border-saffron bg-saffron-soft text-saffron-dark"
                      : "border-rule bg-surface text-muted"
                  }`}
                >
                  <UserCheck className="h-4 w-4" /> Event Organizer
                </button>
                <button
                  type="button"
                  onClick={() => setRole("VENDOR")}
                  className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-xs font-semibold transition ${
                    role === "VENDOR"
                      ? "border-teal bg-teal-soft text-teal-dark"
                      : "border-rule bg-surface text-muted"
                  }`}
                >
                  <Building2 className="h-4 w-4" /> Rental Vendor
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold">Full Name *</label>
                  <input
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g., Keshav Kasera"
                    className="ek-input"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">Phone (+91) *</label>
                  <input
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+919826000000"
                    className="ek-input"
                  />
                </div>
              </div>

              {role === "ORGANIZER" ? (
                <div>
                  <label className="mb-1 block text-xs font-semibold">Organization / Event Type</label>
                  <input
                    value={organizationType}
                    onChange={(e) => setOrganizationType(e.target.value)}
                    className="ek-input"
                  />
                </div>
              ) : (
                <div className="space-y-3 rounded-xl border border-rule bg-canvas/70 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-teal-dark">
                    Vendor KYC & Godown Location (Starts as PENDING until Admin verifies)
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold">Business Name *</label>
                      <input
                        required
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        placeholder="Indore Tent & Sound"
                        className="ek-input"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold">GSTIN / Shop Act ID</label>
                      <input
                        value={gstNumber}
                        onChange={(e) => setGstNumber(e.target.value)}
                        placeholder="23AAAAA0000A1Z5"
                        className="ek-input font-mono text-xs"
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold">Indore Locality *</label>
                      <select
                        value={locality}
                        onChange={(e) => setLocality(e.target.value)}
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
                      <label className="mb-1 block text-xs font-semibold">Godown Address *</label>
                      <input
                        required
                        value={warehouseAddress}
                        onChange={(e) => setWarehouseAddress(e.target.value)}
                        placeholder="Plot 4, Industrial Yard"
                        className="ek-input"
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold">Email Address *</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.in"
              className="ek-input"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold">Password *</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              className="ek-input"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
              {error}
            </div>
          )}

          <button type="submit" disabled={submitting} className="ek-btn-primary w-full">
            {submitting
              ? "Authenticating..."
              : mode === "login"
              ? "Sign In with JWT Session"
              : "Register Account"}
          </button>
        </form>
      </div>

      {/* 1-Click Evaluator / Team Walkthrough Panel */}
      <div className="ek-card flex flex-col justify-between bg-surface p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-saffron-dark">
            <Sparkles className="h-4 w-4" />
            <h2 className="font-display text-lg font-bold text-ink">
              Instant Evaluator & Team Access
            </h2>
          </div>
          <p className="text-xs leading-relaxed text-muted">
            Jump directly into any seeded Indore persona to test the RFQ Comparison Matrix, 24h
            Soft-Hold Lock, QR Handover Audit, and Admin KYC/Dispute Arbitration without typing
            credentials.
          </p>

          <div className="space-y-2.5">
            {[
              {
                id: "ORGANIZER",
                title: "Organizer: Rajesh Sharma (Apex Events)",
                sub: "Has RFQ-2026-101 with 3 competing bids ready to compare & accept",
              },
              {
                id: "VENDOR_ROYAL",
                title: "Vendor: Royal Tent & Decorators (VRI 94.5)",
                sub: "Vijay Nagar godown • 500 chairs, 8000 sq.ft hangar, JBL audio",
              },
              {
                id: "VENDOR_MALWA",
                title: "Vendor: Malwa Infra & Catering (VRI 89.2)",
                sub: "Has an urgent 24h SOFT_HOLD (BK-IN-90215) awaiting confirmation!",
              },
              {
                id: "ADMIN",
                title: "Admin: Meera Kulkarni (Platform Arbiter)",
                sub: "1 Pending Vendor KYC + Watchdog Time-Travel Simulator (TC-05)",
              },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={submitting}
                onClick={() => handleDemo(p.id)}
                className="w-full rounded-xl border border-rule bg-canvas p-3.5 text-left transition hover:border-saffron hover:bg-saffron-soft/40"
              >
                <p className="text-xs font-bold text-ink">{p.title}</p>
                <p className="mt-0.5 text-[11px] text-muted">{p.sub}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2 rounded-lg border border-rule bg-canvas px-3 py-2 text-[11px] text-muted">
          <ShieldCheck className="h-4 w-4 shrink-0 text-teal" />
          Passwords hashed with BCrypt (12 rounds); stateless 72h HMAC-SHA256 JWT tokens.
        </div>
      </div>
    </div>
  );
}
