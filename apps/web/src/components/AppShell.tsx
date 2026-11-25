import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  BookOpen,
  Boxes,
  Building2,
  ClipboardCheck,
  FileSpreadsheet,
  LogOut,
  Scale,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { GuideModal } from "./GuideModal";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, notifications, logout, demoLogin, markNotificationRead } = useAuth();
  const [showNotifs, setShowNotifs] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [switching, setSwitching] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  async function switchDemoPersona(persona: string, targetPath: string) {
    setSwitching(true);
    try {
      await demoLogin(persona);
      navigate(targetPath);
    } finally {
      setSwitching(false);
    }
  }

  const navItems =
    user?.role === "ORGANIZER"
      ? [
          { to: "/", label: "Browse Suppliers", icon: Building2 },
          { to: "/organizer", label: "My Requests & Quotes", icon: FileSpreadsheet },
        ]
      : user?.role === "VENDOR"
      ? [
          { to: "/vendor", label: "My Warehouse & Orders", icon: Boxes },
          { to: "/", label: "Public Marketplace", icon: Building2 },
        ]
      : user?.role === "ADMIN"
      ? [
          { to: "/admin", label: "Admin Approval & Disputes", icon: Scale },
          { to: "/", label: "Public Marketplace", icon: Building2 },
        ]
      : [{ to: "/", label: "Browse Suppliers", icon: Building2 }];

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* Top Evaluator / Demo Bar */}
      <div className="border-b border-rule bg-ink px-4 py-1.5 text-xs text-white/90 no-print">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            <span className="font-medium">Quick Role Switcher (Try Any Account in 1 Click):</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: "ORGANIZER", label: "Event Planner (Rajesh)", path: "/organizer" },
              { id: "VENDOR_ROYAL", label: "Tent Supplier (Royal Tent)", path: "/vendor" },
              { id: "VENDOR_MALWA", label: "Catering Supplier (Malwa)", path: "/vendor" },
              { id: "ADMIN", label: "Platform Admin", path: "/admin" },
            ].map((p) => (
              <button
                key={p.id}
                disabled={switching}
                onClick={() => switchDemoPersona(p.id, p.path)}
                className="rounded border border-white/20 bg-white/10 px-2 py-0.5 text-[11px] font-medium transition hover:bg-saffron hover:border-saffron disabled:opacity-50"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Header */}
      <header className="sticky top-0 z-30 border-b border-rule bg-surface/95 backdrop-blur no-print">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-5">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-saffron text-white font-display text-lg font-bold shadow-sm">
                E
              </div>
              <div>
                <span className="font-display text-lg font-bold tracking-tight text-ink">
                  EventKit
                </span>
                <span className="ml-2 hidden rounded border border-rule bg-canvas px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted sm:inline">
                  INDORE RENTALS
                </span>
              </div>
            </Link>

            <nav className="hidden items-center gap-1 md:flex">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = location.pathname === item.to;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                      active
                        ? "bg-sand text-ink font-semibold"
                        : "text-muted hover:bg-canvas hover:text-ink"
                    }`}
                  >
                    <Icon className="h-4 w-4 text-saffron" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowGuide(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-saffron/35 bg-saffron-soft px-3 py-2 text-xs font-semibold text-saffron-dark transition hover:bg-saffron hover:text-white"
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>How It Works (Guide)</span>
            </button>

            {user ? (
              <>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowNotifs((v) => !v)}
                    className="relative rounded-lg border border-rule bg-canvas p-2 text-ink hover:bg-sand"
                    aria-label="Notifications"
                  >
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-saffron font-mono text-[10px] font-bold text-white">
                        {unreadCount}
                      </span>
                    )}
                  </button>

                  {showNotifs && (
                    <div className="ek-card absolute right-0 mt-2 w-80 p-3 shadow-lg z-40">
                      <div className="mb-2 flex items-center justify-between border-b border-rule pb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-muted">
                          Activity Alerts
                        </span>
                        <button
                          onClick={() => setShowNotifs(false)}
                          className="text-xs text-saffron font-semibold"
                        >
                          Close
                        </button>
                      </div>
                      <div className="max-h-72 space-y-2 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <p className="py-4 text-center text-xs text-muted">No alerts yet.</p>
                        ) : (
                          notifications.map((n) => (
                            <div
                              key={n.id}
                              onClick={() => markNotificationRead(n.id)}
                              className={`cursor-pointer rounded-lg border p-2.5 text-xs transition ${
                                n.isRead
                                  ? "border-rule bg-surface text-muted"
                                  : "border-saffron/30 bg-saffron-soft/60 text-ink"
                              }`}
                            >
                              <p className="font-semibold">{n.title}</p>
                              <p className="mt-0.5 text-[11px]">{n.body}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="hidden items-center gap-2 rounded-lg border border-rule bg-canvas px-3 py-1.5 sm:flex">
                  {user.role === "ADMIN" ? (
                    <ShieldCheck className="h-4 w-4 text-teal" />
                  ) : user.role === "VENDOR" ? (
                    <ClipboardCheck className="h-4 w-4 text-saffron" />
                  ) : (
                    <UserCheck className="h-4 w-4 text-teal" />
                  )}
                  <div className="text-left leading-tight">
                    <p className="text-xs font-semibold text-ink">
                      {user.vendorProfile?.businessName || user.fullName}
                    </p>
                    <p className="font-mono text-[10px] uppercase text-muted">{user.role}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    logout();
                    navigate("/");
                  }}
                  className="ek-btn-secondary px-3 py-2 text-xs"
                  title="Sign out"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </>
            ) : (
              <Link to="/auth" className="ek-btn-primary py-2 text-xs">
                Sign In / Register
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>

      {showGuide && <GuideModal onClose={() => setShowGuide(false)} />}
    </div>
  );
}
