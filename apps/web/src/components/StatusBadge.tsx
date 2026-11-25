const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  AVAILABLE: { bg: "bg-teal-soft border-teal/25", text: "text-teal-dark", label: "Available" },
  LIMITED: { bg: "bg-amber-50 border-amber-300", text: "text-amber-800", label: "Limited Stock" },
  REQUIRES_CONFIRMATION: {
    bg: "bg-saffron-soft border-saffron/30",
    text: "text-saffron-dark",
    label: "Requires Confirmation",
  },
  VERIFIED: { bg: "bg-teal-soft border-teal/25", text: "text-teal-dark", label: "Verified" },
  PENDING: { bg: "bg-amber-50 border-amber-300", text: "text-amber-800", label: "KYC Pending" },
  REJECTED: { bg: "bg-red-50 border-red-300", text: "text-red-800", label: "Rejected" },
  SUSPENDED: { bg: "bg-red-50 border-red-300", text: "text-red-800", label: "Suspended" },
  BROADCAST: { bg: "bg-sky-50 border-sky-200", text: "text-sky-800", label: "Broadcast Open" },
  QUOTED: { bg: "bg-teal-soft border-teal/25", text: "text-teal-dark", label: "Quotes Received" },
  CLOSED: { bg: "bg-sand border-rule", text: "text-muted", label: "Closed" },
  SENT: { bg: "bg-sky-50 border-sky-200", text: "text-sky-800", label: "Active Bid" },
  REVISION_REQUESTED: {
    bg: "bg-amber-50 border-amber-300",
    text: "text-amber-800",
    label: "Revision Requested",
  },
  ACCEPTED: { bg: "bg-teal-soft border-teal/25", text: "text-teal-dark", label: "Accepted" },
  DECLINED_AUTO: { bg: "bg-sand border-rule", text: "text-muted", label: "Auto-Declined" },
  EXPIRED: { bg: "bg-red-50 border-red-200", text: "text-red-700", label: "Expired" },
  SOFT_HOLD: { bg: "bg-amber-50 border-amber-400", text: "text-amber-900", label: "24h Soft-Hold" },
  HOLD_RELEASED: { bg: "bg-sand border-rule", text: "text-muted", label: "Hold Released" },
  CONFIRMED: { bg: "bg-teal-soft border-teal/30", text: "text-teal-dark", label: "Confirmed Lock" },
  DELIVERED: { bg: "bg-indigo-50 border-indigo-200", text: "text-indigo-800", label: "Delivered On-Site" },
  COMPLETED: { bg: "bg-emerald-50 border-emerald-300", text: "text-emerald-800", label: "Completed" },
  DISPUTED: { bg: "bg-red-50 border-red-300", text: "text-red-800", label: "Disputed" },
  CANCELLED_PRE_EVENT: { bg: "bg-sand border-rule", text: "text-muted", label: "Cancelled" },
  OPEN: { bg: "bg-red-50 border-red-300", text: "text-red-800", label: "Open Dispute" },
  IN_MEDIATION: { bg: "bg-amber-50 border-amber-300", text: "text-amber-800", label: "In Mediation" },
  RESOLVED: { bg: "bg-teal-soft border-teal/25", text: "text-teal-dark", label: "Resolved" },
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || {
    bg: "bg-sand border-rule",
    text: "text-ink",
    label: status.replaceAll("_", " "),
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-tight ${style.bg} ${style.text}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {style.label}
    </span>
  );
}
