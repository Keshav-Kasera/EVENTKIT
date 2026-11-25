import { Router } from "express";
import { Prisma } from "@prisma/client";
import {
  SOFT_HOLD_HOURS,
  computeAllocatableCapacity,
  computeThreeWayBidTotals,
  haversineKm,
  revisionRequestSchema,
  submitQuotationSchema,
} from "@eventkit/shared";
import { prisma } from "../lib/prisma";
import { notifyUser, recordAudit } from "../lib/audit";
import { authenticate, requireRole } from "../middleware/auth";

export const quotationRouter = Router();

function enumerateEventDates(startDate: Date, endDate: Date): Date[] {
  const days: Date[] = [];
  const cursor = new Date(startDate);
  cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setUTCHours(0, 0, 0, 0);
  while (cursor <= end && days.length < 31) {
    days.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/**
 * Submit or revise a 3-Way Unbundled Quotation (FR-09, FR-10, FR-12, TC-03).
 */
quotationRouter.post("/", authenticate, requireRole("VENDOR"), async (req, res) => {
  const parsed = submitQuotationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid quotation data" });
  }

  const vendor = await prisma.vendorProfile.findUnique({ where: { userId: req.user!.id } });
  if (!vendor || vendor.verificationStatus !== "VERIFIED") {
    return res.status(403).json({ error: "Only VERIFIED vendors can submit quotations" });
  }

  const requirement = await prisma.eventRequirement.findUnique({
    where: { id: parsed.data.requirementId },
  });
  if (!requirement || requirement.status === "CLOSED" || requirement.status === "CANCELLED") {
    return res.status(400).json({ error: "Requirement is closed or unavailable for quoting" });
  }

  const totals = computeThreeWayBidTotals({
    rentalSubtotal: parsed.data.rentalSubtotal,
    transportFee: parsed.data.transportFee,
    laborFee: parsed.data.laborFee,
    taxRatePct: parsed.data.taxRatePct,
  });

  const validUntil = new Date(Date.now() + parsed.data.validHours * 3600 * 1000);

  const quotation = await prisma.$transaction(async (tx) => {
    const existing = await tx.quotation.findUnique({
      where: {
        requirementId_vendorId: {
          requirementId: requirement.id,
          vendorId: vendor.id,
        },
      },
    });

    if (existing) {
      if (!["SENT", "REVISION_REQUESTED"].includes(existing.status)) {
        throw new Error("Cannot modify a quotation that is already accepted, declined, or expired");
      }

      await tx.quoteItem.deleteMany({ where: { quotationId: existing.id } });

      const updated = await tx.quotation.update({
        where: { id: existing.id },
        data: {
          rentalSubtotal: totals.rental,
          transportFee: totals.transport,
          laborFee: totals.labor,
          taxAmount: totals.taxAmount,
          securityDeposit: parsed.data.securityDeposit,
          totalAmount: totals.totalAmount,
          validUntil,
          notes: parsed.data.notes,
          revisionCount: existing.revisionCount + 1,
          status: "SENT",
          items: {
            create: parsed.data.items.map((it) => ({
              listingId: it.listingId ?? null,
              itemName: it.itemName,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              subtotal: Math.round(it.quantity * it.unitPrice * 100) / 100,
            })),
          },
        },
        include: { items: true },
      });

      await recordAudit(
        {
          actorId: req.user!.id,
          entityName: "Quotation",
          entityId: updated.id,
          actionType: "QUOTATION_REVISED",
          previousState: existing.status,
          newState: "SENT",
          stateSnapshot: { totalAmount: totals.totalAmount, revisionCount: updated.revisionCount },
        },
        tx
      );

      return updated;
    }

    const created = await tx.quotation.create({
      data: {
        requirementId: requirement.id,
        vendorId: vendor.id,
        rentalSubtotal: totals.rental,
        transportFee: totals.transport,
        laborFee: totals.labor,
        taxAmount: totals.taxAmount,
        securityDeposit: parsed.data.securityDeposit,
        totalAmount: totals.totalAmount,
        validUntil,
        notes: parsed.data.notes,
        status: "SENT",
        items: {
          create: parsed.data.items.map((it) => ({
            listingId: it.listingId ?? null,
            itemName: it.itemName,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            subtotal: Math.round(it.quantity * it.unitPrice * 100) / 100,
          })),
        },
      },
      include: { items: true },
    });

    await tx.eventRequirement.update({
      where: { id: requirement.id },
      data: { status: "QUOTED" },
    });

    await recordAudit(
      {
        actorId: req.user!.id,
        entityName: "Quotation",
        entityId: created.id,
        actionType: "QUOTATION_SUBMITTED",
        newState: "SENT",
        stateSnapshot: { totalAmount: totals.totalAmount },
      },
      tx
    );

    return created;
  });

  await notifyUser({
    userId: requirement.organizerId,
    title: `New 3-Way Quote from ${vendor.businessName}`,
    body: `Total ₹${totals.totalAmount.toLocaleString("en-IN")} (Rental ₹${totals.rental} + Freight ₹${totals.transport} + Labor ₹${totals.labor})`,
    kind: "SUCCESS",
    linkUrl: "/organizer/rfqs",
  });

  return res.status(201).json({ quotation });
});

/**
 * Interactive Side-by-Side Quote Comparison Matrix (FR-11)
 */
quotationRouter.get("/matrix/:requirementId", authenticate, async (req, res) => {
  const requirement = await prisma.eventRequirement.findUnique({
    where: { id: req.params.requirementId },
    include: {
      category: true,
      items: true,
      quotations: {
        include: {
          vendor: {
            select: {
              id: true,
              userId: true,
              businessName: true,
              locality: true,
              latitude: true,
              longitude: true,
              vriScore: true,
              safetyBufferPct: true,
              reviews: { where: { isHidden: false }, select: { ratingStars: true } },
            },
          },
          items: true,
          booking: true,
        },
        orderBy: { totalAmount: "asc" },
      },
    },
  });

  if (!requirement) {
    return res.status(404).json({ error: "Requirement not found" });
  }

  if (req.user!.role === "ORGANIZER" && requirement.organizerId !== req.user!.id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const enrichedQuotes = requirement.quotations.map((q) => {
    const distanceKm = haversineKm(
      requirement.venueLat,
      requirement.venueLng,
      q.vendor.latitude,
      q.vendor.longitude
    );
    const avgRating =
      q.vendor.reviews.length > 0
        ? Math.round(
            (q.vendor.reviews.reduce((s, r) => s + r.ratingStars, 0) / q.vendor.reviews.length) *
              10
          ) / 10
        : null;

    return {
      ...q,
      distanceKm,
      avgRating,
      reviewCount: q.vendor.reviews.length,
    };
  });

  const activeBids = enrichedQuotes.filter((q) => !["EXPIRED", "DECLINED_AUTO"].includes(q.status));
  const lowestTotalId =
    activeBids.length > 0
      ? activeBids.reduce((best, cur) => (cur.totalAmount < best.totalAmount ? cur : best)).id
      : null;
  const highestVriId =
    activeBids.length > 0
      ? activeBids.reduce((best, cur) => (cur.vendor.vriScore > best.vendor.vriScore ? cur : best))
          .id
      : null;
  const lowestTransportId =
    activeBids.length > 0
      ? activeBids.reduce((best, cur) => (cur.transportFee < best.transportFee ? cur : best)).id
      : null;

  return res.json({
    requirement,
    quotations: enrichedQuotes,
    highlights: {
      lowestTotalId,
      highestVriId,
      lowestTransportId,
    },
  });
});

/**
 * Organizer 1-click Request Revision (FR-12)
 */
quotationRouter.post("/:id/request-revision", authenticate, requireRole("ORGANIZER"), async (req, res) => {
  const parsed = revisionRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid revision note" });
  }

  const quote = await prisma.quotation.findUnique({
    where: { id: req.params.id },
    include: { requirement: true, vendor: true },
  });
  if (!quote || quote.requirement.organizerId !== req.user!.id) {
    return res.status(404).json({ error: "Quotation not found" });
  }
  if (quote.validUntil < new Date() || quote.status === "EXPIRED") {
    return res.status(400).json({ error: "Cannot request revision on an expired quote" });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const q = await tx.quotation.update({
      where: { id: quote.id },
      data: {
        status: "REVISION_REQUESTED",
        revisionNotes: `Target ₹${parsed.data.targetBudget.toLocaleString("en-IN")}: ${parsed.data.revisionNotes}`,
      },
    });
    await recordAudit(
      {
        actorId: req.user!.id,
        entityName: "Quotation",
        entityId: quote.id,
        actionType: "REVISION_REQUESTED",
        previousState: quote.status,
        newState: "REVISION_REQUESTED",
        stateSnapshot: parsed.data,
      },
      tx
    );
    return q;
  });

  await notifyUser({
    userId: quote.vendor.userId,
    title: `Revision Requested (${quote.requirement.rfqCode})`,
    body: `Organizer proposed target budget ₹${parsed.data.targetBudget.toLocaleString("en-IN")}.`,
    kind: "WARNING",
    linkUrl: "/vendor/rfqs",
  });

  return res.json({ quotation: updated });
});

/**
 * Atomic Quote Acceptance -> Winner-Takes-All + Two-Phase SOFT_HOLD (FR-13, BR-04, BR-05, BR-11, TC-04, TC-10).
 * Uses PostgreSQL pessimistic row-level locks (SELECT ... FOR UPDATE) to prevent double-booking races.
 */
quotationRouter.post("/:id/accept", authenticate, requireRole("ORGANIZER"), async (req, res) => {
  const now = new Date();

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const quote = await tx.quotation.findUnique({
          where: { id: req.params.id },
          include: {
            requirement: true,
            vendor: true,
            items: true,
          },
        });

        if (!quote || quote.requirement.organizerId !== req.user!.id) {
          throw { status: 404, message: "Quotation not found" };
        }

        if (quote.validUntil < now || quote.status === "EXPIRED") {
          throw { status: 400, message: "Quotation has expired and cannot be accepted (BR-07)" };
        }

        if (!["SENT", "REVISION_REQUESTED"].includes(quote.status)) {
          throw { status: 409, message: `Quotation is already in ${quote.status} status` };
        }

        const eventDates = enumerateEventDates(
          quote.requirement.startDate,
          quote.requirement.endDate
        );

        // Lock referenced ServiceListings with SELECT ... FOR UPDATE (NFR-03 / TC-10)
        const listingItems = quote.items.filter((it) => Boolean(it.listingId));
        if (listingItems.length > 0) {
          const listingIds = listingItems.map((it) => it.listingId!);
          const lockedRows = await tx.$queryRaw<
            Array<{ id: string; totalPhysicalStock: number; itemName: string }>
          >`
            SELECT id, "totalPhysicalStock", "itemName"
            FROM service_listings
            WHERE id IN (${Prisma.join(listingIds)})
            FOR UPDATE
          `;

          const stockMap = new Map(lockedRows.map((r) => [r.id, r]));

          for (const item of listingItems) {
            const listing = stockMap.get(item.listingId!);
            if (!listing) continue;

            const maxAllocatable = computeAllocatableCapacity(
              listing.totalPhysicalStock,
              quote.vendor.safetyBufferPct
            );

            for (const day of eventDates) {
              const existingAgg = await tx.availabilityBlock.aggregate({
                where: { listingId: listing.id, blockDate: day },
                _sum: { reservedQuantity: true },
              });
              const alreadyReserved = existingAgg._sum.reservedQuantity ?? 0;

              if (alreadyReserved + item.quantity > maxAllocatable) {
                throw {
                  status: 409,
                  message: `Inventory Unavailable: ${listing.itemName} has ${Math.max(
                    0,
                    maxAllocatable - alreadyReserved
                  )} allocatable units left on ${day.toISOString().slice(0, 10)} (10% buffer enforced).`,
                };
              }
            }
          }
        }

        // 1. Accept selected quote & auto-decline competing quotes atomically (BR-04)
        await tx.quotation.update({
          where: { id: quote.id },
          data: { status: "ACCEPTED" },
        });

        await tx.quotation.updateMany({
          where: {
            requirementId: quote.requirementId,
            id: { not: quote.id },
            status: { in: ["SENT", "REVISION_REQUESTED"] },
          },
          data: { status: "DECLINED_AUTO" },
        });

        await tx.eventRequirement.update({
          where: { id: quote.requirementId },
          data: { status: "CLOSED" },
        });

        // 2. Create SOFT_HOLD booking with 24h vendor SLA timer (BR-05 / BR-06)
        const bookingCode = `BK-IN-${Math.floor(10000 + Math.random() * 90000)}`;
        const holdExpiresAt = new Date(now.getTime() + SOFT_HOLD_HOURS * 3600 * 1000);
        const advanceAmount = Math.round(quote.totalAmount * 0.3);

        const booking = await tx.booking.create({
          data: {
            bookingCode,
            quotationId: quote.id,
            status: "SOFT_HOLD",
            holdExpiresAt,
            escrowStatus: "ADVANCE_LOCKED",
            advanceAmount,
            depositAmount: quote.securityDeposit,
          },
        });

        // 3. Reserve AvailabilityBlocks across event window
        for (const item of listingItems) {
          for (const day of eventDates) {
            await tx.availabilityBlock.create({
              data: {
                listingId: item.listingId!,
                bookingId: booking.id,
                blockDate: day,
                reservedQuantity: item.quantity,
              },
            });
          }
        }

        await recordAudit(
          {
            actorId: req.user!.id,
            entityName: "Booking",
            entityId: booking.id,
            actionType: "QUOTE_ACCEPTED_SOFT_HOLD",
            previousState: "NONE",
            newState: "SOFT_HOLD",
            stateSnapshot: {
              bookingCode,
              quotationId: quote.id,
              holdExpiresAt: holdExpiresAt.toISOString(),
            },
          },
          tx
        );

        return { booking, quote };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
    );

    await notifyUser({
      userId: result.quote.vendor.userId,
      title: `Action Required: 24h Soft-Hold (${result.booking.bookingCode})`,
      body: `Organizer accepted your quote of ₹${result.quote.totalAmount.toLocaleString("en-IN")}. Confirm within 24 hours to lock booking.`,
      kind: "WARNING",
      linkUrl: "/vendor/bookings",
    });

    return res.status(201).json({ booking: result.booking });
  } catch (err: unknown) {
    const customErr = err as { status?: number; message?: string };
    if (customErr?.status) {
      return res.status(customErr.status).json({ error: customErr.message });
    }
    throw err;
  }
});
