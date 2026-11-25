import { AlertTriangle, Check } from "lucide-react";

const STAGES = [
  { key: "SOFT_HOLD", label: "24h Soft-Hold" },
  { key: "CONFIRMED", label: "Hard-Lock & Unmasked" },
  { key: "DELIVERED", label: "Delivery QR Signed" },
  { key: "COMPLETED", label: "Return Audit & Review" },
];

export function BookingLifecycleStepper({ status }: { status: string }) {
  const isDisputed = status === "DISPUTED";
  const isReleased = status === "HOLD_RELEASED" || status === "CANCELLED_PRE_EVENT";

  if (isReleased) {
    return (
      <div className="rounded-lg border border-rule bg-sand/70 px-3 py-2 text-xs font-medium text-muted">
        Booking released — reserved inventory buffer restored to vendor pool.
      </div>
    );
  }

  const activeIdx =
    status === "SOFT_HOLD"
      ? 0
      : status === "CONFIRMED"
      ? 1
      : status === "DELIVERED"
      ? 2
      : 3;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {STAGES.map((stage, idx) => {
        const completed = idx < activeIdx || (status === "COMPLETED" && idx === 3);
        const current = idx === activeIdx && status !== "COMPLETED";
        const disputeNode = isDisputed && idx === 3;

        return (
          <div
            key={stage.key}
            className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition ${
              disputeNode
                ? "border-red-300 bg-red-50 text-red-800"
                : completed
                ? "border-teal/30 bg-teal-soft text-teal-dark"
                : current
                ? "border-saffron/40 bg-saffron-soft text-saffron-dark font-semibold"
                : "border-rule bg-surface text-muted"
            }`}
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                disputeNode
                  ? "bg-red-600 text-white"
                  : completed
                  ? "bg-teal text-white"
                  : current
                  ? "bg-saffron text-white"
                  : "bg-sand text-muted"
              }`}
            >
              {disputeNode ? (
                <AlertTriangle className="h-3 w-3" />
              ) : completed ? (
                <Check className="h-3 w-3" />
              ) : (
                idx + 1
              )}
            </span>
            <span className="truncate">{disputeNode ? "Disputed Escalation" : stage.label}</span>
          </div>
        );
      })}
    </div>
  );
}
