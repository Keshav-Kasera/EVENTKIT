import test from "node:test";
import assert from "node:assert/strict";
import {
  computeAllocatableCapacity,
  computeIndicativeAvailability,
  computeThreeWayBidTotals,
  computeVendorVRI,
  haversineKm,
  maskEmail,
  maskPhone,
} from "@eventkit/shared";
import { generateManifestQrToken } from "../src/lib/qr";

test("TC-02: 10% Safety Buffer & Indicative Availability Thresholds (FR-04, FR-05)", () => {
  // 500 physical chairs with 10% buffer -> 450 max allocatable
  const maxAlloc = computeAllocatableCapacity(500, 10);
  assert.equal(maxAlloc, 450);

  // Requesting 460 chairs exceeds 450 -> REQUIRES_CONFIRMATION (>95% / over capacity)
  const over = computeIndicativeAvailability({
    totalPhysicalStock: 500,
    safetyBufferPct: 10,
    reservedQuantity: 0,
    requestedQuantity: 460,
    stockRefreshedAt: new Date(),
  });
  assert.equal(over.status, "REQUIRES_CONFIRMATION");

  // 350 reserved of 450 (78%) -> LIMITED
  const limited = computeIndicativeAvailability({
    totalPhysicalStock: 500,
    safetyBufferPct: 10,
    reservedQuantity: 350,
    stockRefreshedAt: new Date(),
  });
  assert.equal(limited.status, "LIMITED");

  // Stale stock (>30 days) -> REQUIRES_CONFIRMATION even if 0 reserved
  const staleDate = new Date(Date.now() - 35 * 86400 * 1000);
  const stale = computeIndicativeAvailability({
    totalPhysicalStock: 500,
    safetyBufferPct: 10,
    reservedQuantity: 0,
    stockRefreshedAt: staleDate,
  });
  assert.equal(stale.isStale, true);
  assert.equal(stale.status, "REQUIRES_CONFIRMATION");
});

test("TC-03: 3-Way Unbundled Financial Calculation (FR-09)", () => {
  const bid = computeThreeWayBidTotals({
    rentalSubtotal: 15000,
    transportFee: 3000,
    laborFee: 2000,
    taxRatePct: 0,
  });
  assert.equal(bid.totalAmount, 20000);

  const bidWithGst = computeThreeWayBidTotals({
    rentalSubtotal: 15000,
    transportFee: 3000,
    laborFee: 2000,
    taxRatePct: 18,
  });
  assert.equal(bidWithGst.taxAmount, 3600);
  assert.equal(bidWithGst.totalAmount, 23600);
});

test("TC-06: Privacy Contact Masking (BR-08, NFR-06)", () => {
  const maskedPh = maskPhone("+919826033001");
  assert.ok(!maskedPh.includes("9826033"));
  assert.ok(maskedPh.endsWith("01"));

  const maskedEm = maskEmail("royal.vendor@eventkit.in");
  assert.ok(!maskedEm.includes("royal.vendor"));
  assert.ok(maskedEm.endsWith("@eventkit.in"));
});

test("FR-20: Vendor Reliability Index (VRI) Weighted Formula", () => {
  const perfect = computeVendorVRI({
    totalConfirmedOrReleased: 10,
    fulfilledCount: 10,
    onTimeCount: 10,
    disputeCount: 0,
    avgRatingStars: 5,
  });
  assert.equal(perfect, 100);

  const withDispute = computeVendorVRI({
    totalConfirmedOrReleased: 10,
    fulfilledCount: 9,
    onTimeCount: 8,
    disputeCount: 1,
    avgRatingStars: 4,
  });
  assert.ok(withDispute > 70 && withDispute < 100);
});

test("Indore 25 km Geofence & QR Manifest Deterministic HMAC", () => {
  // Vijay Nagar to Rajwada is well under 25 km
  const km = haversineKm(22.7533, 75.8937, 22.7186, 75.8551);
  assert.ok(km > 3 && km < 10);

  const qr1 = generateManifestQrToken("BK-IN-90215", "DELIVERY");
  const qr2 = generateManifestQrToken("BK-IN-90215", "RETURN");
  assert.notEqual(qr1, qr2);
  assert.ok(qr1.startsWith("EK-BK-IN-90215-DEL-"));
});
