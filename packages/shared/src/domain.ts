export type UserRole = "ORGANIZER" | "VENDOR" | "ADMIN";

export type VerificationStatus = "PENDING" | "VERIFIED" | "REJECTED" | "SUSPENDED";

export type IndicativeAvailability = "AVAILABLE" | "LIMITED" | "REQUIRES_CONFIRMATION";

export type UnitType = "PER_PIECE" | "PER_SQFT" | "PER_SET";

export type RequirementStatus = "DRAFT" | "BROADCAST" | "QUOTED" | "CLOSED" | "CANCELLED";

export type QuotationStatus =
  | "SENT"
  | "REVISION_REQUESTED"
  | "ACCEPTED"
  | "DECLINED_AUTO"
  | "DECLINED_BY_ORG"
  | "EXPIRED";

export type BookingStatus =
  | "SOFT_HOLD"
  | "HOLD_RELEASED"
  | "CONFIRMED"
  | "DELIVERED"
  | "RETURNED"
  | "COMPLETED"
  | "DISPUTED"
  | "CANCELLED_PRE_EVENT";

export type EscrowStatus = "NONE" | "ADVANCE_LOCKED" | "RELEASED" | "FROZEN_DISPUTE";

export type ChecklistType = "DELIVERY" | "RETURN";

export type TicketCategory = "NON_RESPONSIVE" | "DAMAGE_DISPUTE" | "CANCEL_DISAGREEMENT";
export type TicketStatus = "OPEN" | "IN_MEDIATION" | "RESOLVED" | "CLOSED";

export const INDORE_LOCALITIES = [
  { name: "Vijay Nagar", lat: 22.7533, lng: 75.8937 },
  { name: "Palasia", lat: 22.7244, lng: 75.8839 },
  { name: "Rajwada", lat: 22.7186, lng: 75.8551 },
  { name: "Bhawarkua", lat: 22.6926, lng: 75.8676 },
  { name: "Rau", lat: 22.6345, lng: 75.8152 },
  { name: "Super Corridor", lat: 22.7712, lng: 75.8186 },
  { name: "MR-10 Bypass", lat: 22.7756, lng: 75.9041 },
  { name: "AB Road / Nipania", lat: 22.7681, lng: 75.9158 },
] as const;

export const MAX_GEOFENCE_KM = 25;
export const DEFAULT_SAFETY_BUFFER_PCT = 10;
export const SOFT_HOLD_HOURS = 24;
export const STALE_STOCK_DAYS = 30;

/**
 * Computes maximum allocatable stock after deducting the vendor's safety buffer (default 10%).
 * FR-04 / FR-06: Ensures offline walk-ins never push online allocation into overbooking.
 */
export function computeAllocatableCapacity(
  totalPhysicalStock: number,
  safetyBufferPct: number = DEFAULT_SAFETY_BUFFER_PCT
): number {
  if (totalPhysicalStock <= 0) return 0;
  const clampedBuffer = Math.min(Math.max(safetyBufferPct, 0), 50);
  return Math.floor(totalPhysicalStock * (1 - clampedBuffer / 100));
}

/**
 * Computes indicative availability badge for a given date range.
 * FR-05 / FR-07:
 *  - AVAILABLE: utilization < 75%
 *  - LIMITED: utilization 75%..95%
 *  - REQUIRES_CONFIRMATION: utilization > 95% OR stock unrefreshed > 30 days
 */
export function computeIndicativeAvailability(params: {
  totalPhysicalStock: number;
  safetyBufferPct: number;
  reservedQuantity: number;
  requestedQuantity?: number;
  stockRefreshedAt: Date | string;
  now?: Date;
}): {
  allocatableCapacity: number;
  remainingAllocatable: number;
  utilizationPct: number;
  status: IndicativeAvailability;
  isStale: boolean;
} {
  const now = params.now ?? new Date();
  const refreshed = new Date(params.stockRefreshedAt);
  const daysSinceRefresh = (now.getTime() - refreshed.getTime()) / (1000 * 60 * 60 * 24);
  const isStale = daysSinceRefresh > STALE_STOCK_DAYS;

  const allocatableCapacity = computeAllocatableCapacity(
    params.totalPhysicalStock,
    params.safetyBufferPct
  );
  const projectedReserved = params.reservedQuantity + (params.requestedQuantity ?? 0);
  const remainingAllocatable = Math.max(0, allocatableCapacity - params.reservedQuantity);

  if (allocatableCapacity <= 0) {
    return {
      allocatableCapacity: 0,
      remainingAllocatable: 0,
      utilizationPct: 100,
      status: "REQUIRES_CONFIRMATION",
      isStale,
    };
  }

  const utilizationPct = Math.round((projectedReserved / allocatableCapacity) * 100);

  let status: IndicativeAvailability;
  if (isStale || utilizationPct > 95) {
    status = "REQUIRES_CONFIRMATION";
  } else if (utilizationPct >= 75) {
    status = "LIMITED";
  } else {
    status = "AVAILABLE";
  }

  return {
    allocatableCapacity,
    remainingAllocatable,
    utilizationPct,
    status,
    isStale,
  };
}

/**
 * Computes 3-way unbundled quotation totals (FR-09 / FR-11).
 */
export function computeThreeWayBidTotals(params: {
  rentalSubtotal: number;
  transportFee: number;
  laborFee: number;
  taxRatePct?: number;
}) {
  const rental = Math.max(0, Number(params.rentalSubtotal) || 0);
  const transport = Math.max(0, Number(params.transportFee) || 0);
  const labor = Math.max(0, Number(params.laborFee) || 0);
  const taxPct = Math.max(0, Number(params.taxRatePct ?? 0));
  const preTax = rental + transport + labor;
  const taxAmount = Math.round(preTax * (taxPct / 100) * 100) / 100;
  const totalAmount = Math.round((preTax + taxAmount) * 100) / 100;
  return { rental, transport, labor, taxAmount, totalAmount };
}

/**
 * Computes Vendor Reliability Index (VRI) per Experiment 02 FR-20:
 * 40% confirmed fulfillment rate + 30% on-time dispatch + 20% low dispute ratio + 10% client ratings.
 */
export function computeVendorVRI(metrics: {
  totalConfirmedOrReleased: number;
  fulfilledCount: number;
  onTimeCount: number;
  disputeCount: number;
  avgRatingStars: number; // 0..5
}): number {
  const total = Math.max(1, metrics.totalConfirmedOrReleased);
  const fulfillmentRate = Math.min(1, metrics.fulfilledCount / total);
  const onTimeRate = Math.min(1, metrics.onTimeCount / Math.max(1, metrics.fulfilledCount));
  const nonDisputeRate = Math.max(0, 1 - metrics.disputeCount / total);
  const ratingNorm = Math.min(1, Math.max(0, metrics.avgRatingStars / 5));

  const score =
    fulfillmentRate * 40 + onTimeRate * 30 + nonDisputeRate * 20 + ratingNorm * 10;
  return Math.round(score * 10) / 10;
}

/**
 * Haversine distance in kilometers between two lat/lng points for 25km geofence matching.
 */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Privacy Contact Masking helper (BR-08 / NFR-06 / TC-06).
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "+91 ••••• •••••";
  return "+91 ••••• •••" + phone.slice(-2);
}

export function maskEmail(email: string | null | undefined): string {
  if (!email) return "hidden@eventkit.masked";
  const [, domain] = email.split("@");
  return `•••••@${domain || "masked.in"}`;
}
