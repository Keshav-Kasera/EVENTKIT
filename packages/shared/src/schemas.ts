import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  fullName: z.string().min(2).max(100),
  phone: z.string().min(10).max(15),
  role: z.enum(["ORGANIZER", "VENDOR"]),
  city: z.string().min(2).default("Indore"),
  organizationType: z.string().optional(),
  billingAddress: z.string().optional(),
  // Vendor onboarding fields
  businessName: z.string().optional(),
  gstNumber: z.string().optional(),
  locality: z.string().optional(),
  warehouseAddress: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createListingSchema = z.object({
  categoryId: z.string().uuid(),
  skuCode: z.string().min(2).max(40).optional(),
  itemName: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  unitType: z.enum(["PER_PIECE", "PER_SQFT", "PER_SET"]),
  baseRatePerDay: z.number().positive(),
  replacementValue: z.number().nonnegative().default(0),
  totalPhysicalStock: z.number().int().positive(),
  isPackage: z.boolean().default(false),
  packageItems: z.array(z.object({ itemName: z.string(), qty: z.number().int().positive() })).optional(),
  photoUrl: z.string().optional(),
});

export const createRequirementSchema = z.object({
  title: z.string().min(3).max(140),
  eventType: z.string().min(2).max(80),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  venueAddress: z.string().min(4).max(250),
  venueLocality: z.string().min(2).max(80),
  venueLat: z.number().optional(),
  venueLng: z.number().optional(),
  guestCount: z.number().int().positive(),
  targetBudget: z.number().positive().optional(),
  targetVendorId: z.string().uuid().optional(),
  items: z
    .array(
      z.object({
        categoryId: z.string().uuid(),
        listingId: z.string().uuid().optional(),
        itemName: z.string().min(2).max(120),
        unitType: z.enum(["PER_PIECE", "PER_SQFT", "PER_SET"]).default("PER_PIECE"),
        requestedQuantity: z.number().int().positive(),
        notes: z.string().max(250).optional(),
      })
    )
    .min(1, "Add at least one equipment item"),
});

export const submitQuotationSchema = z.object({
  requirementId: z.string().uuid(),
  rentalSubtotal: z.number().positive("Rental subtotal must be positive"),
  transportFee: z.number().nonnegative("Transport fee cannot be negative"),
  laborFee: z.number().nonnegative("Labor fee cannot be negative"),
  taxRatePct: z.number().min(0).max(28).default(18),
  securityDeposit: z.number().nonnegative().default(0),
  validHours: z.number().int().min(1).max(720).default(48),
  notes: z.string().max(400).optional(),
  items: z
    .array(
      z.object({
        listingId: z.string().uuid().optional(),
        itemName: z.string().min(1),
        quantity: z.number().int().positive(),
        unitPrice: z.number().nonnegative(),
      })
    )
    .min(1),
});

export const revisionRequestSchema = z.object({
  targetBudget: z.number().positive(),
  revisionNotes: z.string().min(4).max(400),
});

export const handoverSignSchema = z.object({
  qrToken: z.string().min(4),
  itemConditionCounts: z.array(
    z.object({
      itemName: z.string(),
      expectedQty: z.number().int().nonnegative(),
      observedQty: z.number().int().nonnegative(),
      condition: z.enum(["GOOD", "MINOR_WEAR", "DAMAGED", "MISSING"]),
      notes: z.string().optional(),
    })
  ),
  preExistingDefects: z.string().max(500).optional(),
  damageClaimAmount: z.number().nonnegative().default(0),
  photoUrls: z.array(z.string()).default([]),
  pinCode: z.string().min(4).max(8),
});

export const reviewSchema = z.object({
  bookingId: z.string().uuid(),
  ratingStars: z.number().int().min(1).max(5),
  onTimeDelivery: z.boolean().default(true),
  reviewText: z.string().min(5).max(800),
});

export const disputeArbitrateSchema = z.object({
  status: z.enum(["IN_MEDIATION", "RESOLVED", "CLOSED"]),
  settlementAmount: z.number().nonnegative().optional(),
  resolutionNotes: z.string().min(5).max(800),
});
