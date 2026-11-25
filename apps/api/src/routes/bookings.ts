import { Router } from "express";
import {
  computeVendorVRI,
  handoverSignSchema,
  maskEmail,
  maskPhone,
  reviewSchema,
} from "@eventkit/shared";
import { prisma } from "../lib/prisma";
import { notifyUser, recordAudit } from "../lib/audit";
import { generateManifestQrToken, generatePin4, renderQrDataUrl } from "../lib/qr";
import { authenticate, requireRole } from "../middleware/auth";

export const bookingRouter = Router();

const REVEALED_STATES = ["CONFIRMED", "DELIVERED", "RETURNED", "COMPLETED", "DISPUTED"];

async function recalculateVendorVRI(vendorId: string) {
  const bookings = await prisma.booking.findMany({
    where: { quotation: { vendorId } },
    include: { review: true, supportTickets: true },
  });

  const relevant = bookings.filter((b) =>
    ["CONFIRMED", "DELIVERED", "RETURNED", "COMPLETED", "DISPUTED", "HOLD_RELEASED"].includes(
      b.status
    )
  );
  const fulfilled = bookings.filter((b) =>
    ["DELIVERED", "RETURNED", "COMPLETED"].includes(b.status)
  );
  const reviews = bookings.map((b) => b.review).filter((r): r is NonNullable<typeof r> => Boolean(r));
  const onTimeCount = reviews.filter((r) => r.onTimeDelivery).length || fulfilled.length;
  const disputeCount = bookings.filter((b) => b.status === "DISPUTED" || b.supportTickets.length > 0).length;
  const avgRatingStars =
    reviews.length > 0
      ? reviews.reduce((s, r) => s + r.ratingStars, 0) / reviews.length
      : 4.5;

  const vriScore = computeVendorVRI({
    totalConfirmedOrReleased: relevant.length,
    fulfilledCount: fulfilled.length,
    onTimeCount,
    disputeCount,
    avgRatingStars,
  });

  await prisma.vendorProfile.update({
    where: { id: vendorId },
    data: { vriScore },
  });

  return vriScore;
}

/**
 * List bookings for Organizer or Vendor with BR-08 Contact Masking & QR Manifest DataURLs.
 */
bookingRouter.get("/", authenticate, async (req, res) => {
  const whereClause =
    req.user!.role === "ORGANIZER"
      ? { quotation: { requirement: { organizerId: req.user!.id } } }
      : req.user!.role === "VENDOR"
      ? { quotation: { vendor: { userId: req.user!.id } } }
      : {};

  const bookings = await prisma.booking.findMany({
    where: whereClause,
    include: {
      quotation: {
        include: {
          items: true,
          vendor: {
            include: { user: { select: { id: true, fullName: true, phone: true, email: true } } },
          },
          requirement: {
            include: {
              category: true,
              organizer: { select: { id: true, fullName: true, phone: true, email: true, organizationType: true } },
            },
          },
        },
      },
      checklists: true,
      review: true,
      supportTickets: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const enriched = await Promise.all(
    bookings.map(async (b) => {
      const revealContacts = REVEALED_STATES.includes(b.status);
      const checklistsWithQr = await Promise.all(
        b.checklists.map(async (c) => ({
          ...c,
          qrImageUrl: await renderQrDataUrl(c.qrToken),
        }))
      );

      return {
        ...b,
        checklists: checklistsWithQr,
        contactRevealed: revealContacts,
        counterpartyContact:
          req.user!.role === "ORGANIZER"
            ? {
                name: b.quotation.vendor.businessName,
                contactPerson: b.quotation.vendor.user.fullName,
                phone: revealContacts
                  ? b.quotation.vendor.user.phone
                  : maskPhone(b.quotation.vendor.user.phone),
                email: revealContacts
                  ? b.quotation.vendor.user.email
                  : maskEmail(b.quotation.vendor.user.email),
                address: revealContacts
                  ? b.quotation.vendor.warehouseAddress
                  : `${b.quotation.vendor.locality}, Indore (Masked until Confirmed)`,
              }
            : {
                name: b.quotation.requirement.organizer.fullName,
                organizationType: b.quotation.requirement.organizer.organizationType,
                phone: revealContacts
                  ? b.quotation.requirement.organizer.phone
                  : maskPhone(b.quotation.requirement.organizer.phone),
                email: revealContacts
                  ? b.quotation.requirement.organizer.email
                  : maskEmail(b.quotation.requirement.organizer.email),
                address: revealContacts
                  ? b.quotation.requirement.venueAddress
                  : `${b.quotation.requirement.venueLocality}, Indore (Masked until Confirmed)`,
              },
      };
    })
  );

  return res.json({ bookings: enriched });
});

/**
 * Vendor 1-Click Hard-Lock Confirmation within 24h SLA (FR-15, FR-17, TC-07).
 * Unmasks contacts & generates Delivery + Return QR Handover Manifests.
 */
bookingRouter.post("/:id/confirm", authenticate, requireRole("VENDOR"), async (req, res) => {
  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
    include: {
      quotation: {
        include: {
          vendor: true,
          items: true,
          requirement: true,
        },
      },
    },
  });

  if (!booking || booking.quotation.vendor.userId !== req.user!.id) {
    return res.status(404).json({ error: "Booking not found" });
  }
  if (booking.status !== "SOFT_HOLD") {
    return res.status(409).json({ error: `Booking is in ${booking.status} state` });
  }
  if (booking.holdExpiresAt < new Date()) {
    return res.status(400).json({ error: "24-hour soft-hold window has expired" });
  }

  const defaultCounts = booking.quotation.items.map((it) => ({
    itemName: it.itemName,
    expectedQty: it.quantity,
    observedQty: it.quantity,
    condition: "GOOD",
  }));

  const orgPin = generatePin4();
  const venPin = generatePin4();

  const updated = await prisma.$transaction(async (tx) => {
    const confirmed = await tx.booking.update({
      where: { id: booking.id },
      data: {
        status: "CONFIRMED",
        confirmedAt: new Date(),
      },
    });

    await tx.handoverChecklist.createMany({
      data: [
        {
          bookingId: booking.id,
          checklistType: "DELIVERY",
          qrToken: generateManifestQrToken(booking.bookingCode, "DELIVERY"),
          itemConditionCounts: defaultCounts,
          organizerPin: orgPin,
          vendorPin: venPin,
        },
        {
          bookingId: booking.id,
          checklistType: "RETURN",
          qrToken: generateManifestQrToken(booking.bookingCode, "RETURN"),
          itemConditionCounts: defaultCounts,
          organizerPin: orgPin,
          vendorPin: venPin,
        },
      ],
    });

    await recordAudit(
      {
        actorId: req.user!.id,
        entityName: "Booking",
        entityId: booking.id,
        actionType: "BOOKING_HARD_CONFIRMED",
        previousState: "SOFT_HOLD",
        newState: "CONFIRMED",
        stateSnapshot: { bookingCode: booking.bookingCode },
      },
      tx
    );

    return confirmed;
  });

  await notifyUser({
    userId: booking.quotation.requirement.organizerId,
    title: `Booking Confirmed! (${booking.bookingCode})`,
    body: `${booking.quotation.vendor.businessName} confirmed your order. Direct contact info & QR Delivery Manifest are now active.`,
    kind: "SUCCESS",
    linkUrl: "/organizer/bookings",
  });

  return res.json({ booking: updated });
});

/**
 * Vendor Reject Soft-Hold OR Pre-Event Cancellation (FR-16, BR-15 instant buffer restore).
 */
bookingRouter.post("/:id/release", authenticate, async (req, res) => {
  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
    include: {
      quotation: { include: { vendor: true, requirement: true } },
    },
  });
  if (!booking) return res.status(404).json({ error: "Booking not found" });

  const isVendor = req.user!.id === booking.quotation.vendor.userId;
  const isOrganizer = req.user!.id === booking.quotation.requirement.organizerId;
  if (!isVendor && !isOrganizer && req.user!.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const nextStatus = booking.status === "SOFT_HOLD" ? "HOLD_RELEASED" : "CANCELLED_PRE_EVENT";

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: booking.id },
      data: { status: nextStatus, escrowStatus: "RELEASED" },
    });

    // BR-15: Restore reserved inventory blocks immediately
    await tx.availabilityBlock.deleteMany({ where: { bookingId: booking.id } });

    if (booking.status === "SOFT_HOLD") {
      await tx.quotation.update({
        where: { id: booking.quotationId },
        data: { status: "DECLINED_BY_ORG" },
      });
      await tx.quotation.updateMany({
        where: {
          requirementId: booking.quotation.requirementId,
          id: { not: booking.quotationId },
          status: "DECLINED_AUTO",
          validUntil: { gt: new Date() },
        },
        data: { status: "SENT" },
      });
      await tx.eventRequirement.update({
        where: { id: booking.quotation.requirementId },
        data: { status: "QUOTED" },
      });
    }

    await recordAudit(
      {
        actorId: req.user!.id,
        entityName: "Booking",
        entityId: booking.id,
        actionType: "BOOKING_RELEASED",
        previousState: booking.status,
        newState: nextStatus,
      },
      tx
    );
  });

  await notifyUser({
    userId: isVendor
      ? booking.quotation.requirement.organizerId
      : booking.quotation.vendor.userId,
    title: `Booking Released (${booking.bookingCode})`,
    body: `Soft-hold/booking was released and inventory blocks were restored immediately.`,
    kind: "WARNING",
  });

  return res.json({ status: nextStatus });
});

/**
 * QR-Verified Digital Handover Manifest (DELIVERY & RETURN) (FR-16..FR-19, BR-10, TC-08).
 */
bookingRouter.post("/:id/handover/:type", authenticate, async (req, res) => {
  const checklistType = req.params.type.toUpperCase();
  if (checklistType !== "DELIVERY" && checklistType !== "RETURN") {
    return res.status(400).json({ error: "Checklist type must be DELIVERY or RETURN" });
  }

  const parsed = handoverSignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid checklist payload" });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
    include: {
      quotation: { include: { vendor: true, requirement: true } },
      checklists: true,
    },
  });

  if (!booking) return res.status(404).json({ error: "Booking not found" });

  const isVendor = req.user!.id === booking.quotation.vendor.userId;
  const isOrganizer = req.user!.id === booking.quotation.requirement.organizerId;
  if (!isVendor && !isOrganizer) {
    return res.status(403).json({ error: "Only booking participants can sign handover manifests" });
  }

  const checklist = booking.checklists.find((c) => c.checklistType === checklistType);
  if (!checklist) {
    return res.status(404).json({ error: "Handover manifest not initialized" });
  }

  if (checklist.qrToken !== parsed.data.qrToken.trim()) {
    return res.status(400).json({ error: "QR verification token mismatch. Scan the official booking QR pass." });
  }

  if (checklistType === "RETURN" && booking.status !== "DELIVERED") {
    return res.status(400).json({ error: "Delivery manifest must be completed before Return audit (BR-10)" });
  }

  const hasDiscrepancy =
    parsed.data.damageClaimAmount > 0 ||
    parsed.data.itemConditionCounts.some(
      (it) => it.observedQty < it.expectedQty || it.condition === "DAMAGED" || it.condition === "MISSING"
    );

  const result = await prisma.$transaction(async (tx) => {
    const updatedChecklist = await tx.handoverChecklist.update({
      where: { id: checklist.id },
      data: {
        itemConditionCounts: parsed.data.itemConditionCounts,
        preExistingDefects: parsed.data.preExistingDefects,
        damageClaimAmount: parsed.data.damageClaimAmount,
        photoUrls: parsed.data.photoUrls,
        organizerSigned: isOrganizer ? true : checklist.organizerSigned || (checklistType === "DELIVERY" ? true : false),
        vendorSigned: isVendor ? true : checklist.vendorSigned || (checklistType === "DELIVERY" ? true : false),
        signedAt: new Date(),
      },
    });

    if (checklistType === "DELIVERY") {
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: "DELIVERED", deliveredAt: new Date() },
      });
      await recordAudit(
        {
          actorId: req.user!.id,
          entityName: "Booking",
          entityId: booking.id,
          actionType: "DELIVERY_MANIFEST_SIGNED",
          previousState: booking.status,
          newState: "DELIVERED",
        },
        tx
      );
      return { bookingStatus: "DELIVERED", ticket: null, checklist: updatedChecklist };
    }

    // RETURN audit logic (FR-18 / FR-19 / TC-08)
    await tx.availabilityBlock.deleteMany({ where: { bookingId: booking.id } });

    if (hasDiscrepancy) {
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: "DISPUTED",
          returnedAt: new Date(),
          escrowStatus: "FROZEN_DISPUTE",
        },
      });

      const ticketCode = `TKT-${Math.floor(10000 + Math.random() * 90000)}`;
      const ticket = await tx.supportTicket.create({
        data: {
          ticketCode,
          bookingId: booking.id,
          raisedByUserId: req.user!.id,
          category: "DAMAGE_DISPUTE",
          status: "OPEN",
          claimAmount: parsed.data.damageClaimAmount,
          resolutionNotes: `Auto-escalated from Return Audit. Notes: ${parsed.data.preExistingDefects || "Item shortage or damage flagged."}`,
        },
      });

      await recordAudit(
        {
          actorId: req.user!.id,
          entityName: "Booking",
          entityId: booking.id,
          actionType: "RETURN_AUDIT_DISPUTED",
          previousState: booking.status,
          newState: "DISPUTED",
          stateSnapshot: { ticketCode, claimAmount: parsed.data.damageClaimAmount },
        },
        tx
      );

      return { bookingStatus: "DISPUTED", ticket, checklist: updatedChecklist };
    }

    // Zero discrepancies -> COMPLETED & unlock reviews!
    await tx.booking.update({
      where: { id: booking.id },
      data: {
        status: "COMPLETED",
        returnedAt: new Date(),
        completedAt: new Date(),
        escrowStatus: "RELEASED",
      },
    });

    await recordAudit(
      {
        actorId: req.user!.id,
        entityName: "Booking",
        entityId: booking.id,
        actionType: "RETURN_AUDIT_COMPLETED",
        previousState: booking.status,
        newState: "COMPLETED",
      },
      tx
    );

    return { bookingStatus: "COMPLETED", ticket: null, checklist: updatedChecklist };
  });

  await recalculateVendorVRI(booking.quotation.vendorId);

  if (result.ticket) {
    await notifyUser({
      userId: booking.quotation.requirement.organizerId,
      title: `Dispute Ticket Raised (${result.ticket.ticketCode})`,
      body: `Return audit flagged damages/missing items (₹${parsed.data.damageClaimAmount}). Admin mediation opened.`,
      kind: "ERROR",
      linkUrl: "/organizer/bookings",
    });
  } else if (result.bookingStatus === "COMPLETED") {
    await notifyUser({
      userId: booking.quotation.requirement.organizerId,
      title: `Booking Completed (${booking.bookingCode})`,
      body: `Clean return signed! Security deposit released & review unlocked.`,
      kind: "SUCCESS",
      linkUrl: "/organizer/bookings",
    });
  }

  return res.json(result);
});

/**
 * Verified Review Submission (BR-09, TC-09). Strictly blocked unless status === COMPLETED.
 */
bookingRouter.post("/reviews", authenticate, requireRole("ORGANIZER"), async (req, res) => {
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid review payload" });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: parsed.data.bookingId },
    include: {
      quotation: { include: { requirement: true } },
      review: true,
    },
  });

  if (!booking || booking.quotation.requirement.organizerId !== req.user!.id) {
    return res.status(404).json({ error: "Booking not found" });
  }
  if (booking.status !== "COMPLETED") {
    return res.status(403).json({ error: "Reviews permitted only for COMPLETED bookings (BR-09)" });
  }
  if (booking.review) {
    return res.status(409).json({ error: "Only one review is permitted per completed booking" });
  }

  const review = await prisma.review.create({
    data: {
      bookingId: booking.id,
      organizerId: req.user!.id,
      vendorId: booking.quotation.vendorId,
      ratingStars: parsed.data.ratingStars,
      onTimeDelivery: parsed.data.onTimeDelivery,
      reviewText: parsed.data.reviewText,
    },
  });

  const newVri = await recalculateVendorVRI(booking.quotation.vendorId);

  return res.status(201).json({ review, updatedVri: newVri });
});

bookingRouter.post("/reviews/:id/reply", authenticate, requireRole("VENDOR"), async (req, res) => {
  const reply = String(req.body?.vendorReply || "").trim();
  if (!reply) return res.status(400).json({ error: "Reply text is required" });

  const vendor = await prisma.vendorProfile.findUnique({ where: { userId: req.user!.id } });
  const review = await prisma.review.findFirst({
    where: { id: req.params.id, vendorId: vendor?.id },
  });
  if (!review) return res.status(404).json({ error: "Review not found" });

  const updated = await prisma.review.update({
    where: { id: review.id },
    data: { vendorReply: reply },
  });
  return res.json({ review: updated });
});
