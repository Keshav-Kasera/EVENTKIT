import crypto from "crypto";
import { Router } from "express";
import {
  INDORE_LOCALITIES,
  MAX_GEOFENCE_KM,
  createRequirementSchema,
  haversineKm,
  maskEmail,
  maskPhone,
} from "@eventkit/shared";
import { prisma } from "../lib/prisma";
import { notifyUser, recordAudit } from "../lib/audit";
import { authenticate, requireRole } from "../middleware/auth";

export const rfqRouter = Router();

/**
 * Create & Dispatch RFQ with Multi-Category Isolation (FR-06, FR-07, FR-08).
 * Splits items from distinct categories into separate bidding pipelines automatically.
 */
rfqRouter.post("/", authenticate, requireRole("ORGANIZER"), async (req, res) => {
  const parsed = createRequirementSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid RFQ payload" });
  }

  const data = parsed.data;
  const startDate = new Date(data.startDate);
  const endDate = new Date(data.endDate);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) {
    return res.status(400).json({ error: "End date must be on or after start date" });
  }

  const locMeta = INDORE_LOCALITIES.find((l) => l.name === data.venueLocality);
  const venueLat = data.venueLat ?? locMeta?.lat ?? 22.7196;
  const venueLng = data.venueLng ?? locMeta?.lng ?? 75.8577;

  // Group items by categoryId for FR-08 Multi-Category Isolation
  const byCategory = new Map<string, typeof data.items>();
  for (const item of data.items) {
    const group = byCategory.get(item.categoryId) ?? [];
    group.push(item);
    byCategory.set(item.categoryId, group);
  }

  const batchId = byCategory.size > 1 ? crypto.randomUUID() : null;
  const createdRequirements = [];

  for (const [categoryId, categoryItems] of byCategory.entries()) {
    // Find eligible VERIFIED vendors (BR-02)
    let targetVendors = [];
    if (data.targetVendorId) {
      const single = await prisma.vendorProfile.findFirst({
        where: { id: data.targetVendorId, verificationStatus: "VERIFIED" },
      });
      if (!single) {
        return res.status(400).json({ error: "Targeted vendor is not verified" });
      }
      targetVendors = [single];
    } else {
      const allVerified = await prisma.vendorProfile.findMany({
        where: {
          verificationStatus: "VERIFIED",
          listings: { some: { categoryId } },
        },
      });
      // Geofence <= 25km filter, max 5 vendors (FR-07)
      const withinRadius = allVerified
        .map((v) => ({
          vendor: v,
          dist: haversineKm(venueLat, venueLng, v.latitude, v.longitude),
        }))
        .filter((x) => x.dist <= MAX_GEOFENCE_KM)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 5)
        .map((x) => x.vendor);

      targetVendors =
        withinRadius.length > 0
          ? withinRadius
          : allVerified.slice(0, 5);
    }

    const rfqCode = `RFQ-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const targetVendorIds = targetVendors.map((v) => v.id);

    const created = await prisma.$transaction(async (tx) => {
      const rfq = await tx.eventRequirement.create({
        data: {
          organizerId: req.user!.id,
          categoryId,
          batchId,
          rfqCode,
          title:
            byCategory.size > 1
              ? `${data.title} (Category Split)`
              : data.title,
          eventType: data.eventType,
          startDate,
          endDate,
          venueAddress: data.venueAddress,
          venueLocality: data.venueLocality,
          venueLat,
          venueLng,
          guestCount: data.guestCount,
          targetBudget: data.targetBudget,
          targetVendorIds,
          status: "BROADCAST",
          items: {
            create: categoryItems.map((it) => ({
              listingId: it.listingId ?? null,
              itemName: it.itemName,
              unitType: it.unitType,
              requestedQuantity: it.requestedQuantity,
              notes: it.notes,
            })),
          },
        },
        include: { category: true, items: true },
      });

      await recordAudit(
        {
          actorId: req.user!.id,
          entityName: "EventRequirement",
          entityId: rfq.id,
          actionType: "RFQ_BROADCAST",
          newState: "BROADCAST",
          stateSnapshot: { rfqCode, targetVendorCount: targetVendorIds.length },
        },
        tx
      );

      return rfq;
    });

    for (const v of targetVendors) {
      await notifyUser({
        userId: v.userId,
        title: `New RFQ Broadcast (${rfqCode})`,
        body: `${data.eventType} in ${data.venueLocality} for ${data.guestCount} guests.`,
        kind: "INFO",
        linkUrl: "/vendor/rfqs",
      });
    }

    createdRequirements.push(created);
  }

  return res.status(201).json({
    requirements: createdRequirements,
    multiCategorySplit: createdRequirements.length > 1,
  });
});

/**
 * List RFQs for current Organizer or Vendor
 */
rfqRouter.get("/", authenticate, async (req, res) => {
  if (req.user!.role === "ORGANIZER") {
    const requirements = await prisma.eventRequirement.findMany({
      where: { organizerId: req.user!.id },
      include: {
        category: true,
        items: true,
        quotations: {
          include: {
            vendor: { select: { id: true, businessName: true, locality: true, vriScore: true } },
            booking: { select: { id: true, bookingCode: true, status: true, holdExpiresAt: true } },
          },
          orderBy: { totalAmount: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return res.json({ requirements });
  }

  if (req.user!.role === "VENDOR") {
    const vendor = await prisma.vendorProfile.findUnique({ where: { userId: req.user!.id } });
    if (!vendor) return res.status(404).json({ error: "Vendor profile not found" });

    // Verified vendors see open broadcasts targeted to them or matching their categories
    const allRfqs = await prisma.eventRequirement.findMany({
      include: {
        category: true,
        items: true,
        organizer: { select: { id: true, fullName: true, organizationType: true, phone: true, email: true } },
        quotations: {
          where: { vendorId: vendor.id },
          include: { booking: true, items: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const filtered = allRfqs
      .filter((r) => {
        const targets = Array.isArray(r.targetVendorIds) ? (r.targetVendorIds as string[]) : [];
        return targets.includes(vendor.id) || r.quotations.length > 0;
      })
      .map((r) => {
        const myQuote = r.quotations[0];
        const isConfirmed =
          myQuote?.booking &&
          ["CONFIRMED", "DELIVERED", "RETURNED", "COMPLETED", "DISPUTED"].includes(
            myQuote.booking.status
          );
        const distanceKm = haversineKm(vendor.latitude, vendor.longitude, r.venueLat, r.venueLng);

        return {
          ...r,
          distanceKm,
          organizer: {
            id: r.organizer.id,
            fullName: r.organizer.fullName,
            organizationType: r.organizer.organizationType,
            phone: isConfirmed ? r.organizer.phone : maskPhone(r.organizer.phone),
            email: isConfirmed ? r.organizer.email : maskEmail(r.organizer.email),
          },
          venueAddress: isConfirmed
            ? r.venueAddress
            : `${r.venueLocality}, Indore (Exact gate address revealed upon booking confirmation)`,
        };
      });

    return res.json({ requirements: filtered });
  }

  // ADMIN view
  const requirements = await prisma.eventRequirement.findMany({
    include: { category: true, items: true, quotations: true },
    orderBy: { createdAt: "desc" },
  });
  return res.json({ requirements });
});

/**
 * Contextual Masked Messaging on an RFQ (Process 7.0, BR-08)
 */
rfqRouter.get("/:id/messages", authenticate, async (req, res) => {
  const messages = await prisma.message.findMany({
    where: { requirementId: req.params.id },
    include: {
      sender: { select: { id: true, fullName: true, role: true } },
    },
    orderBy: { sentAt: "asc" },
  });
  return res.json({ messages });
});

rfqRouter.post("/:id/messages", authenticate, async (req, res) => {
  const body = String(req.body?.messageBody || "").trim();
  const receiverId = String(req.body?.receiverId || "");
  if (!body || !receiverId) {
    return res.status(400).json({ error: "receiverId and messageBody are required" });
  }

  // BR-08 contact masking enforcement prior to confirmation
  const confirmedBooking = await prisma.booking.findFirst({
    where: {
      quotation: { requirementId: req.params.id },
      status: { in: ["CONFIRMED", "DELIVERED", "RETURNED", "COMPLETED"] },
    },
  });

  let sanitizedBody = body;
  if (!confirmedBooking) {
    sanitizedBody = body.replace(/(?:\+91[\s-]?)?[6-9]\d{9}/g, "[Phone Masked Until Confirmed]");
  }

  const msg = await prisma.message.create({
    data: {
      requirementId: req.params.id,
      senderId: req.user!.id,
      receiverId,
      messageBody: sanitizedBody,
    },
    include: { sender: { select: { id: true, fullName: true, role: true } } },
  });

  await notifyUser({
    userId: receiverId,
    title: "New RFQ Message",
    body: sanitizedBody.slice(0, 90),
    kind: "INFO",
  });

  return res.status(201).json({ message: msg });
});
