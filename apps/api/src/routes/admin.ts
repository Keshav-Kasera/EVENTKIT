import { Router } from "express";
import { disputeArbitrateSchema } from "@eventkit/shared";
import { prisma } from "../lib/prisma";
import { notifyUser, recordAudit } from "../lib/audit";
import { authenticate, requireRole } from "../middleware/auth";
import { runWatchdogSweep } from "../services/watchdog";

export const adminRouter = Router();

adminRouter.use(authenticate, requireRole("ADMIN"));

adminRouter.get("/overview", async (_req, res) => {
  const [
    vendorCounts,
    rfqCount,
    bookingStats,
    openTickets,
    recentLogs,
  ] = await Promise.all([
    prisma.vendorProfile.groupBy({ by: ["verificationStatus"], _count: true }),
    prisma.eventRequirement.count(),
    prisma.booking.groupBy({ by: ["status"], _count: true }),
    prisma.supportTicket.count({ where: { status: { in: ["OPEN", "IN_MEDIATION"] } } }),
    prisma.auditLog.findMany({
      include: { actor: { select: { fullName: true, role: true } } },
      orderBy: { loggedAt: "desc" },
      take: 25,
    }),
  ]);

  return res.json({
    vendorCounts,
    rfqCount,
    bookingStats,
    openTickets,
    recentLogs,
  });
});

adminRouter.get("/kyc", async (_req, res) => {
  const vendors = await prisma.vendorProfile.findMany({
    include: {
      user: { select: { fullName: true, email: true, phone: true, city: true, createdAt: true } },
      _count: { select: { listings: true, quotations: true } },
    },
    orderBy: { verificationStatus: "asc" },
  });
  return res.json({ vendors });
});

adminRouter.patch("/kyc/:vendorId", async (req, res) => {
  const status = String(req.body?.verificationStatus || "");
  const rejectionReason = req.body?.rejectionReason ? String(req.body.rejectionReason) : null;
  if (!["VERIFIED", "REJECTED", "SUSPENDED", "PENDING"].includes(status)) {
    return res.status(400).json({ error: "Invalid verification status" });
  }

  const existing = await prisma.vendorProfile.findUnique({ where: { id: req.params.vendorId } });
  if (!existing) return res.status(404).json({ error: "Vendor not found" });

  const updated = await prisma.$transaction(async (tx) => {
    const vp = await tx.vendorProfile.update({
      where: { id: existing.id },
      data: {
        verificationStatus: status as never,
        rejectionReason,
        verifiedAt: status === "VERIFIED" ? new Date() : existing.verifiedAt,
      },
    });
    await recordAudit(
      {
        actorId: req.user!.id,
        entityName: "VendorProfile",
        entityId: vp.id,
        actionType: `KYC_${status}`,
        previousState: existing.verificationStatus,
        newState: status,
        stateSnapshot: { rejectionReason },
      },
      tx
    );
    return vp;
  });

  await notifyUser({
    userId: existing.userId,
    title: `KYC Verification ${status}`,
    body:
      status === "VERIFIED"
        ? "Your business profile is now live in public search and eligible for RFQ broadcasts!"
        : `KYC status updated to ${status}. ${rejectionReason || ""}`,
    kind: status === "VERIFIED" ? "SUCCESS" : "WARNING",
    linkUrl: "/vendor/catalog",
  });

  return res.json({ vendor: updated });
});

adminRouter.get("/disputes", async (_req, res) => {
  const tickets = await prisma.supportTicket.findMany({
    include: {
      raisedBy: { select: { fullName: true, email: true, role: true } },
      resolvedByAdmin: { select: { fullName: true } },
      booking: {
        include: {
          checklists: true,
          quotation: {
            include: {
              vendor: { select: { id: true, businessName: true, userId: true } },
              requirement: { select: { rfqCode: true, title: true, organizerId: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return res.json({ tickets });
});

/**
 * Immutable Dispute Arbitration (FR-20, BR-12).
 */
adminRouter.patch("/disputes/:ticketId", async (req, res) => {
  const parsed = disputeArbitrateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid arbitration input" });
  }

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: req.params.ticketId },
    include: { booking: { include: { quotation: { include: { vendor: true, requirement: true } } } } },
  });
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });

  const updated = await prisma.$transaction(async (tx) => {
    const t = await tx.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: parsed.data.status,
        settlementAmount: parsed.data.settlementAmount ?? ticket.claimAmount,
        resolutionNotes: parsed.data.resolutionNotes,
        resolvedByAdminId: req.user!.id,
        resolvedAt: ["RESOLVED", "CLOSED"].includes(parsed.data.status) ? new Date() : null,
      },
    });

    if (["RESOLVED", "CLOSED"].includes(parsed.data.status)) {
      await tx.booking.update({
        where: { id: ticket.bookingId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          escrowStatus: "RELEASED",
        },
      });
    }

    await recordAudit(
      {
        actorId: req.user!.id,
        entityName: "SupportTicket",
        entityId: ticket.id,
        actionType: "DISPUTE_ARBITRATED",
        previousState: ticket.status,
        newState: parsed.data.status,
        stateSnapshot: parsed.data,
      },
      tx
    );

    return t;
  });

  await notifyUser({
    userId: ticket.booking.quotation.requirement.organizerId,
    title: `Dispute ${parsed.data.status} (${ticket.ticketCode})`,
    body: parsed.data.resolutionNotes,
    kind: "INFO",
    linkUrl: "/organizer/bookings",
  });
  await notifyUser({
    userId: ticket.booking.quotation.vendor.userId,
    title: `Dispute ${parsed.data.status} (${ticket.ticketCode})`,
    body: parsed.data.resolutionNotes,
    kind: "INFO",
    linkUrl: "/vendor/bookings",
  });

  return res.json({ ticket: updated });
});

adminRouter.get("/reviews", async (_req, res) => {
  const reviews = await prisma.review.findMany({
    include: {
      organizer: { select: { fullName: true } },
      vendor: { select: { businessName: true } },
      booking: { select: { bookingCode: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return res.json({ reviews });
});

/**
 * Review Moderation (BR-13): Admin may HIDE/UNHIDE with cause, never edit review scores/text.
 */
adminRouter.patch("/reviews/:reviewId/moderate", async (req, res) => {
  const isHidden = Boolean(req.body?.isHidden);
  const moderationReason = String(req.body?.moderationReason || "Policy compliance action");

  const existing = await prisma.review.findUnique({ where: { id: req.params.reviewId } });
  if (!existing) return res.status(404).json({ error: "Review not found" });

  const updated = await prisma.$transaction(async (tx) => {
    const rev = await tx.review.update({
      where: { id: existing.id },
      data: { isHidden, moderationReason },
    });
    await recordAudit(
      {
        actorId: req.user!.id,
        entityName: "Review",
        entityId: existing.id,
        actionType: isHidden ? "REVIEW_HIDDEN" : "REVIEW_RESTORED",
        previousState: String(existing.isHidden),
        newState: String(isHidden),
        stateSnapshot: { moderationReason },
      },
      tx
    );
    return rev;
  });

  return res.json({ review: updated });
});

adminRouter.get("/audit-logs", async (_req, res) => {
  const logs = await prisma.auditLog.findMany({
    include: { actor: { select: { fullName: true, role: true, email: true } } },
    orderBy: { loggedAt: "desc" },
    take: 100,
  });
  return res.json({ logs });
});

adminRouter.post("/watchdog/sweep", async (_req, res) => {
  const summary = await runWatchdogSweep(new Date());
  return res.json({ summary });
});

/**
 * Academic Viva Demo Helper (TC-05):
 * Fast-forwards a SOFT_HOLD booking's holdExpiresAt past 24h and triggers the Watchdog rollback immediately.
 */
adminRouter.post("/watchdog/demo-expire/:bookingId", async (req, res) => {
  const booking = await prisma.booking.findUnique({ where: { id: req.params.bookingId } });
  if (!booking || booking.status !== "SOFT_HOLD") {
    return res.status(400).json({ error: "Select an active SOFT_HOLD booking to simulate 24h expiry" });
  }

  await prisma.booking.update({
    where: { id: booking.id },
    data: { holdExpiresAt: new Date(Date.now() - 60_000) },
  });

  const summary = await runWatchdogSweep(new Date());
  return res.json({ summary, simulatedExpiredBookingId: booking.id });
});
