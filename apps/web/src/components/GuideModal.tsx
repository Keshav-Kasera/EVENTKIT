import { useState } from "react";
import { BookOpen, Building2, CheckCircle2, HelpCircle, QrCode, ShieldCheck, UserCheck, X } from "lucide-react";

export function GuideModal({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<"flow" | "roles" | "glossary">("flow");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/55 p-4 backdrop-blur-sm">
      <div className="ek-card max-h-[90vh] w-full max-w-3xl overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-4 border-b border-rule pb-4">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-saffron-soft p-2 text-saffron-dark">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-ink">
                How EventKit Works — Simple Guide
              </h2>
              <p className="text-xs text-muted">
                No technical background needed. Here is what every button and term means.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-rule p-1.5 text-muted hover:bg-sand"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 inline-flex rounded-xl border border-rule bg-canvas p-1 text-xs font-semibold">
          {[
            { id: "flow", label: "1. Step-by-Step Flow" },
            { id: "roles", label: "2. Who Uses Which Screen?" },
            { id: "glossary", label: "3. Simple Word Meanings" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setSection(t.id as typeof section)}
              className={`rounded-lg px-3.5 py-2 transition ${
                section === t.id ? "bg-ink text-white" : "text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {section === "flow" && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              {
                step: "Step 1",
                title: "Tell suppliers what you need",
                desc: "Instead of calling 10 tent houses separately, fill one simple form with your event date, Indore area, guest count, and items (chairs, tents, sound, or catering utensils).",
              },
              {
                step: "Step 2",
                title: "Compare clear, split-up prices",
                desc: "Verified local suppliers send you price quotes showing Rent, Delivery Truck Cost, and Setup Labor separately—so nobody hides extra labor charges on event day.",
              },
              {
                step: "Step 3",
                title: "24-Hour Hold → Confirmed Booking",
                desc: "When you pick the best quote, the items are held for 24 hours so the supplier can double-check their warehouse. Once they click Confirm, phone numbers and exact addresses are unlocked.",
              },
              {
                step: "Step 4",
                title: "QR Check-in at Delivery & Return",
                desc: "When items arrive—and again when they are picked up—both sides verify item counts using a QR pass and optional photos. Zero post-event arguments about missing chairs.",
              },
            ].map((item) => (
              <div key={item.step} className="rounded-xl border border-rule bg-canvas/70 p-4">
                <span className="font-mono text-[11px] font-bold uppercase text-saffron-dark">
                  {item.step}
                </span>
                <h3 className="mt-1 font-display text-base font-bold text-ink">{item.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">{item.desc}</p>
              </div>
            ))}
          </div>
        )}

        {section === "roles" && (
          <div className="mt-5 space-y-3">
            {[
              {
                icon: UserCheck,
                role: "Event Organizer (Buyer)",
                where: "Top bar → Organizer (Apex Events) → RFQs & Quote Matrix",
                what: "Use this if you are planning a wedding, college fest, or corporate event and want to request quotes, compare suppliers side-by-side, and book items.",
              },
              {
                icon: Building2,
                role: "Equipment Supplier / Vendor",
                where: "Top bar → Vendor (Royal Tent) or Vendor (Malwa Catering)",
                what: "Use this if you own a tent house, sound setup, or catering godown. Manage your stock, send price quotes to organizers, confirm 24-hour holds, and check returned items.",
              },
              {
                icon: ShieldCheck,
                role: "Platform Admin (Arbiter)",
                where: "Top bar → Admin Arbiter",
                what: "Checks new vendor GST/ID documents before they appear publicly, settles damage disputes if items return broken, and tests the 24-hour auto-expiry timer.",
              },
            ].map((r) => {
              const Icon = r.icon;
              return (
                <div key={r.role} className="flex items-start gap-3 rounded-xl border border-rule bg-canvas/70 p-4">
                  <div className="rounded-lg bg-teal-soft p-2 text-teal-dark">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-ink">{r.role}</p>
                    <p className="font-mono text-[11px] font-semibold text-saffron-dark">{r.where}</p>
                    <p className="mt-1 text-xs text-muted">{r.what}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {section === "glossary" && (
          <div className="mt-5 divide-y divide-rule rounded-xl border border-rule bg-surface">
            {[
              {
                term: "RFQ (Request for Quotation)",
                meaning: "Your event shopping list (dates, venue area, item quantities) sent to nearby verified suppliers so they can send back price offers.",
              },
              {
                term: "Clear Itemized / Unbundled Quote",
                meaning: "A price offer broken into 3 parts: (1) Item Rent, (2) Truck Delivery Fee, and (3) Setup & Removal Labor—plus GST.",
              },
              {
                term: "24-Hour Reservation Hold (Soft-Hold)",
                meaning: "A temporary 24-hour lock after you choose a quote. It gives the supplier time to confirm they didn't rent those items offline to a walk-in customer.",
              },
              {
                term: "10% Safety Reserve",
                meaning: "We automatically keep 10% of every supplier's stock unbooked online (e.g., 450 of 500 chairs) as a cushion against sudden walk-in orders.",
              },
              {
                term: "Trust Score (VRI)",
                meaning: "A score out of 100 showing how reliable a supplier is—based on fulfilled orders, on-time delivery, zero disputes, and customer star ratings.",
              },
              {
                term: "Masked Contact Privacy",
                meaning: "Phone numbers and exact warehouse street addresses stay hidden until a supplier confirms the booking, preventing spam and off-platform bypassing.",
              },
              {
                term: "QR Handover Pass",
                meaning: "A unique scannable QR code created when a booking is confirmed. Used at delivery and pickup to prove the exact count and condition of every item.",
              },
            ].map((g) => (
              <div key={g.term} className="p-3.5 text-xs">
                <p className="font-bold text-ink flex items-center gap-1.5">
                  <HelpCircle className="h-3.5 w-3.5 text-saffron" /> {g.term}
                </p>
                <p className="mt-1 text-muted leading-relaxed">{g.meaning}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 flex items-center justify-between border-t border-rule pt-4 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <QrCode className="h-4 w-4 text-teal" />
            Tip: Use the dark bar at the very top anytime to switch between Organizer, Vendor, and Admin views.
          </span>
          <button onClick={onClose} className="ek-btn-primary py-2 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5" /> Got It, Let&apos;s Explore
          </button>
        </div>
      </div>
    </div>
  );
}
