import { Router } from "express";
import {
  INDORE_LOCALITIES,
  computeIndicativeAvailability,
  createListingSchema,
  haversineKm,
  maskEmail,
  maskPhone,
} from "@eventkit/shared";
import { prisma } from "../lib/prisma";
import { recordAudit } from "../lib/audit";
import { authenticate, requireRole } from "../middleware/auth";

export const catalogRouter = Router();

catalogRouter.get("/categories", async (_req, res) => {
  const categories = await prisma.serviceCategory.findMany({
    orderBy: { name: "asc" },
  });
  return res.json({ categories, localities: INDORE_LOCALITIES });
});

/**
 * Public Verified Vendor & Catalog Discovery (BR-02, BR-08, TC-01, TC-06).
 * Strictly excludes PENDING / REJECTED / SUSPENDED vendors and masks contact credentials.
 */
catalogRouter.get("/vendors", async (req, res) => {
  const categoryId = req.query.categoryId ? String(req.query.categoryId) : undefined;
  const search = req.query.q ? String(req.query.q).trim().toLowerCase() : "";
  const locality = req.query.locality ? String(req.query.locality) : undefined;
  const rawLat = req.query.lat !== undefined ? Number(req.query.lat) : NaN;
  const rawLng = req.query.lng !== undefined ? Number(req.query.lng) : NaN;
  const hasLiveGps = Number.isFinite(rawLat) && Number.isFinite(rawLng);
  const startDate = req.query.startDate ? new Date(String(req.query.startDate)) : new Date();
  const endDate = req.query.endDate ? new Date(String(req.query.endDate)) : startDate;

  const refLocality = INDORE_LOCALITIES.find((l) => l.name === locality) ?? INDORE_LOCALITIES[0];
  const refLat = hasLiveGps ? rawLat : refLocality.lat;
  const refLng = hasLiveGps ? rawLng : refLocality.lng;

  let nearestLocality: string = refLocality.name;
  if (hasLiveGps) {
    let bestDist = Infinity;
    for (const loc of INDORE_LOCALITIES) {
      const d = haversineKm(rawLat, rawLng, loc.lat, loc.lng);
      if (d < bestDist) {
        bestDist = d;
        nearestLocality = loc.name;
      }
    }
  }

  const vendors = await prisma.vendorProfile.findMany({
    where: {
      verificationStatus: "VERIFIED",
      ...(categoryId
        ? { listings: { some: { categoryId } } }
        : {}),
    },
    include: {
      user: { select: { fullName: true, city: true, phone: true, email: true } },
      listings: {
        where: categoryId ? { categoryId } : undefined,
        include: {
          category: true,
          availabilityBlocks: {
            where: {
              blockDate: { gte: startDate, lte: endDate },
            },
          },
        },
      },
      reviews: {
        where: { isHidden: false },
        select: { ratingStars: true },
      },
    },
    orderBy: { vriScore: "desc" },
  });

  const formatted = vendors
    .map((v) => {
      const distanceKm = haversineKm(refLat, refLng, v.latitude, v.longitude);
      const listings = v.listings.map((item) => {
        const peakReserved = item.availabilityBlocks.reduce(
          (max, b) => Math.max(max, b.reservedQuantity),
          0
        );
        const availability = computeIndicativeAvailability({
          totalPhysicalStock: item.totalPhysicalStock,
          safetyBufferPct: v.safetyBufferPct,
          reservedQuantity: peakReserved,
          stockRefreshedAt: v.stockRefreshedAt,
        });

        return {
          id: item.id,
          skuCode: item.skuCode,
          itemName: item.itemName,
          description: item.description,
          categoryId: item.categoryId,
          categoryName: item.category.name,
          unitType: item.unitType,
          baseRatePerDay: item.baseRatePerDay,
          totalPhysicalStock: item.totalPhysicalStock,
          isPackage: item.isPackage,
          photoUrl: item.photoUrl,
          availability,
        };
      });

      const avgRating =
        v.reviews.length > 0
          ? Math.round(
              (v.reviews.reduce((sum, r) => sum + r.ratingStars, 0) / v.reviews.length) * 10
            ) / 10
          : null;

      return {
        id: v.id,
        businessName: v.businessName,
        locality: v.locality,
        city: v.user.city,
        distanceKm,
        withinGeofence25Km: distanceKm <= 25,
        vriScore: v.vriScore,
        safetyBufferPct: v.safetyBufferPct,
        stockRefreshedAt: v.stockRefreshedAt,
        reviewCount: v.reviews.length,
        avgRating,
        // BR-08 & TC-06: Privacy masking on public discovery
        maskedContact: {
          phone: maskPhone(v.user.phone),
          email: maskEmail(v.user.email),
          warehouseAddress: `${v.locality}, ${v.user.city} (Exact godown revealed upon confirmation)`,
        },
        listings,
      };
    })
    .filter((v) => {
      if (!search) return true;
      return (
        v.businessName.toLowerCase().includes(search) ||
        v.locality.toLowerCase().includes(search) ||
        v.listings.some((l) => l.itemName.toLowerCase().includes(search))
      );
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);

  return res.json({
    vendors: formatted,
    locationMeta: {
      mode: hasLiveGps ? "LIVE_GPS" : "LOCALITY",
      nearestLocality,
    },
  });
});

catalogRouter.get("/vendors/:id", async (req, res) => {
  const vendor = await prisma.vendorProfile.findFirst({
    where: { id: req.params.id, verificationStatus: "VERIFIED" },
    include: {
      user: { select: { fullName: true, city: true, phone: true, email: true } },
      listings: { include: { category: true, availabilityBlocks: true } },
      reviews: {
        where: { isHidden: false },
        include: { organizer: { select: { fullName: true, organizationType: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!vendor) {
    return res.status(404).json({ error: "Verified vendor not found" });
  }

  return res.json({
    vendor: {
      id: vendor.id,
      businessName: vendor.businessName,
      locality: vendor.locality,
      city: vendor.user.city,
      vriScore: vendor.vriScore,
      safetyBufferPct: vendor.safetyBufferPct,
      stockRefreshedAt: vendor.stockRefreshedAt,
      maskedContact: {
        phone: maskPhone(vendor.user.phone),
        email: maskEmail(vendor.user.email),
        warehouseAddress: `${vendor.locality}, ${vendor.user.city} (Masked until booking confirmation)`,
      },
      listings: vendor.listings.map((l) => ({
        ...l,
        availability: computeIndicativeAvailability({
          totalPhysicalStock: l.totalPhysicalStock,
          safetyBufferPct: vendor.safetyBufferPct,
          reservedQuantity: l.availabilityBlocks.reduce((m, b) => Math.max(m, b.reservedQuantity), 0),
          stockRefreshedAt: vendor.stockRefreshedAt,
        }),
      })),
      reviews: vendor.reviews,
    },
  });
});

/**
 * Vendor Godown Console: Manage SKUs & 10% Safety Buffer
 */
catalogRouter.get("/my-listings", authenticate, requireRole("VENDOR"), async (req, res) => {
  const vendor = await prisma.vendorProfile.findUnique({
    where: { userId: req.user!.id },
    include: {
      listings: {
        include: {
          category: true,
          availabilityBlocks: {
            where: { blockDate: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
          },
        },
        orderBy: { updatedAt: "desc" },
      },
    },
  });

  if (!vendor) return res.status(404).json({ error: "Vendor profile not found" });

  const enriched = vendor.listings.map((item) => {
    const peakReserved = item.availabilityBlocks.reduce(
      (max, b) => Math.max(max, b.reservedQuantity),
      0
    );
    return {
      ...item,
      availability: computeIndicativeAvailability({
        totalPhysicalStock: item.totalPhysicalStock,
        safetyBufferPct: vendor.safetyBufferPct,
        reservedQuantity: peakReserved,
        stockRefreshedAt: vendor.stockRefreshedAt,
      }),
    };
  });

  return res.json({ vendor, listings: enriched });
});

catalogRouter.post("/my-listings", authenticate, requireRole("VENDOR"), async (req, res) => {
  const parsed = createListingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid SKU data" });
  }

  const vendor = await prisma.vendorProfile.findUnique({ where: { userId: req.user!.id } });
  if (!vendor) return res.status(404).json({ error: "Vendor profile not found" });

  const skuCode =
    parsed.data.skuCode ||
    `EK-${vendor.businessName.slice(0, 3).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

  const listing = await prisma.$transaction(async (tx) => {
    const created = await tx.serviceListing.create({
      data: {
        vendorId: vendor.id,
        categoryId: parsed.data.categoryId,
        skuCode,
        itemName: parsed.data.itemName,
        description: parsed.data.description,
        unitType: parsed.data.unitType,
        baseRatePerDay: parsed.data.baseRatePerDay,
        replacementValue: parsed.data.replacementValue,
        totalPhysicalStock: parsed.data.totalPhysicalStock,
        isPackage: parsed.data.isPackage,
        packageItems: parsed.data.packageItems ?? undefined,
        photoUrl: parsed.data.photoUrl,
      },
      include: { category: true },
    });

    await tx.vendorProfile.update({
      where: { id: vendor.id },
      data: { stockRefreshedAt: new Date() },
    });

    await recordAudit(
      {
        actorId: req.user!.id,
        entityName: "ServiceListing",
        entityId: created.id,
        actionType: "SKU_CREATED",
        newState: String(created.totalPhysicalStock),
        stateSnapshot: { skuCode: created.skuCode, itemName: created.itemName },
      },
      tx
    );

    return created;
  });

  return res.status(201).json({ listing });
});

catalogRouter.patch("/my-listings/:id", authenticate, requireRole("VENDOR"), async (req, res) => {
  const vendor = await prisma.vendorProfile.findUnique({ where: { userId: req.user!.id } });
  if (!vendor) return res.status(404).json({ error: "Vendor profile not found" });

  const existing = await prisma.serviceListing.findFirst({
    where: { id: req.params.id, vendorId: vendor.id },
  });
  if (!existing) return res.status(404).json({ error: "Listing not found in your catalog" });

  const totalPhysicalStock =
    req.body.totalPhysicalStock !== undefined
      ? Number(req.body.totalPhysicalStock)
      : existing.totalPhysicalStock;
  const baseRatePerDay =
    req.body.baseRatePerDay !== undefined ? Number(req.body.baseRatePerDay) : existing.baseRatePerDay;

  if (totalPhysicalStock < 0 || baseRatePerDay <= 0) {
    return res.status(400).json({ error: "Stock must be >= 0 and base rate > 0" });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const item = await tx.serviceListing.update({
      where: { id: existing.id },
      data: {
        totalPhysicalStock,
        baseRatePerDay,
        itemName: req.body.itemName ?? existing.itemName,
        description: req.body.description ?? existing.description,
      },
    });
    await tx.vendorProfile.update({
      where: { id: vendor.id },
      data: { stockRefreshedAt: new Date() },
    });
    return item;
  });

  return res.json({ listing: updated });
});

catalogRouter.post("/refresh-stock", authenticate, requireRole("VENDOR"), async (req, res) => {
  const vendor = await prisma.vendorProfile.update({
    where: { userId: req.user!.id },
    data: { stockRefreshedAt: new Date() },
  });
  await recordAudit({
    actorId: req.user!.id,
    entityName: "VendorProfile",
    entityId: vendor.id,
    actionType: "INVENTORY_HEARTBEAT_REFRESHED",
    newState: vendor.stockRefreshedAt.toISOString(),
  });
  return res.json({ stockRefreshedAt: vendor.stockRefreshedAt });
});
