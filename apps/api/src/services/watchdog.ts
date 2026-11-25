import { prisma } from "../lib/prisma";
import { emitGlobalWatchdogEvent, notifyUser, recordAudit } from "../lib/audit";

export interface WatchdogSweepResult {
  expiredQuotesCount: number;
  releasedBookingsCount: number;
  checkedAt: string;
}

/**
 * Autonomous SLA Watchdog Daemon (FR-10, FR-14, BR-06, BR-07, NFR-08).
 * Runs periodically and on server startup to recover any expired soft-holds or quotes.
 */
export async function runWatchdogSweep(now: Date = new Date()): Promise<WatchdogSweepResult> {
  // 1. Expire outdated quotations (BR-07)
  const staleQuotes = await prisma.quotation.findMany({
    where: {
      status: { in: ["SENT", "REVISION_REQUESTED"] },
      validUntil: { lt: now },
    },
    select: { id: true, status: true, requirementId: true, vendorId: true },
  });

  for (const quote of staleQuotes) {
    await prisma.$transaction(async (tx) => {
      await tx.quotation.update({
        where: { id: quote.id },
        data: { status: "EXPIRED" },
      });
      await recordAudit(
        {
          actorId: null,
          entityName: "Quotation",
          entityId: quote.id,
          actionType: "WATCHDOG_QUOTE_EXPIRED",
          previousState: quote.status,
          newState: "EXPIRED",
        },
        tx
      );
    });
  }

  // 2. Expire unconfirmed 24h SOFT_HOLD bookings (FR-16, BR-06, TC-05)
  const expiredHolds = await prisma.booking.findMany({
    where: {
      status: "SOFT_HOLD",
      holdExpiresAt: { lt: now },
    },
    include: {
      quotation: {
        include: {
          vendor: { select: { userId: true, businessName: true } },
          requirement: { select: { id: true, organizerId: true, rfqCode: true } },
        },
      },
    },
  });

  for (const booking of expiredHolds) {
    await prisma.$transaction(async (tx) => {
      // Transition booking to HOLD_RELEASED & release simulated escrow advance
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: "HOLD_RELEASED", escrowStatus: "RELEASED" },
      });

      // Restore reserved inventory blocks immediately (BR-15)
      await tx.availabilityBlock.deleteMany({
        where: { bookingId: booking.id },
      });

      // Mark timed-out quote as EXPIRED and re-open competing DECLINED_AUTO quotes still within validity
      await tx.quotation.update({
        where: { id: booking.quotationId },
        data: { status: "EXPIRED" },
      });

      const reopened = await tx.quotation.updateMany({
        where: {
          requirementId: booking.quotation.requirementId,
          id: { not: booking.quotationId },
          status: "DECLINED_AUTO",
          validUntil: { gt: now },
        },
        data: { status: "SENT" },
      });

      if (reopened.count > 0) {
        await tx.eventRequirement.update({
          where: { id: booking.quotation.requirementId },
          data: { status: "QUOTED" },
        });
      } else {
        await tx.eventRequirement.update({
          where: { id: booking.quotation.requirementId },
          data: { status: "BROADCAST" },
        });
      }

      await recordAudit(
        {
          actorId: null,
          entityName: "Booking",
          entityId: booking.id,
          actionType: "WATCHDOG_SOFT_HOLD_RELEASED",
          previousState: "SOFT_HOLD",
          newState: "HOLD_RELEASED",
          stateSnapshot: {
            bookingCode: booking.bookingCode,
            reopenedQuotes: reopened.count,
          },
        },
        tx
      );
    });

    await notifyUser({
      userId: booking.quotation.requirement.organizerId,
      title: `24h Soft-Hold Expired (${booking.bookingCode})`,
      body: `${booking.quotation.vendor.businessName} did not confirm within 24h. Inventory buffer was restored and valid alternative quotes were re-opened.`,
      kind: "WARNING",
      linkUrl: "/organizer/rfqs",
    });

    await notifyUser({
      userId: booking.quotation.vendor.userId,
      title: `Soft-Hold Timed Out (${booking.bookingCode})`,
      body: `The 24-hour confirmation SLA elapsed for ${booking.quotation.requirement.rfqCode}. The hold has been released.`,
      kind: "INFO",
      linkUrl: "/vendor/bookings",
    });
  }

  const result: WatchdogSweepResult = {
    expiredQuotesCount: staleQuotes.length,
    releasedBookingsCount: expiredHolds.length,
    checkedAt: now.toISOString(),
  };

  if (staleQuotes.length > 0 || expiredHolds.length > 0) {
    emitGlobalWatchdogEvent(result);
  }

  return result;
}

let timer: NodeJS.Timeout | null = null;

export function startWatchdogDaemon(intervalMs: number = 60_000) {
  // Immediate startup recovery sweep (NFR-08: MTTR < 60s)
  runWatchdogSweep().catch((err) => console.error("Watchdog startup sweep error:", err));

  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    runWatchdogSweep().catch((err) => console.error("Watchdog interval error:", err));
  }, intervalMs);
}
