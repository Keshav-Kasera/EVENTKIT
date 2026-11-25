import "../src/lib/env";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function makeQrToken(bookingCode: string, type: string) {
  const secret = process.env.QR_HMAC_SECRET || "eventkit-dev-qr-secret";
  const hash = crypto
    .createHmac("sha256", secret)
    .update(`${bookingCode}:${type}`)
    .digest("hex")
    .slice(0, 12)
    .toUpperCase();
  return `EK-${bookingCode}-${type.slice(0, 3)}-${hash}`;
}

async function main() {
  const ifEmptyOnly = process.argv.includes("--if-empty");
  if (ifEmptyOnly) {
    const existingUsers = await prisma.user.count();
    if (existingUsers > 0) {
      console.log(`Database already has ${existingUsers} users; skipping --if-empty seed.`);
      return;
    }
  }

  const seedPassword = process.env.DEMO_SEED_PASSWORD;
  if (!seedPassword) {
    if (ifEmptyOnly) {
      console.log("DEMO_SEED_PASSWORD not set; skipping automatic seed.");
      return;
    }
    throw new Error(
      "DEMO_SEED_PASSWORD environment variable is required to run seed. Set it in apps/api/.env"
    );
  }

  const passwordHash = await bcrypt.hash(seedPassword, 12);

  // Clear existing data cleanly in dependency order for idempotent re-seeding
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.message.deleteMany();
  await prisma.supportTicket.deleteMany();
  await prisma.review.deleteMany();
  await prisma.handoverChecklist.deleteMany();
  await prisma.availabilityBlock.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.quoteItem.deleteMany();
  await prisma.quotation.deleteMany();
  await prisma.requirementItem.deleteMany();
  await prisma.eventRequirement.deleteMany();
  await prisma.serviceListing.deleteMany();
  await prisma.vendorProfile.deleteMany();
  await prisma.serviceCategory.deleteMany();
  await prisma.user.deleteMany();

  // 1. Service Categories (4 core categories per PRD)
  const categories = await Promise.all([
    prisma.serviceCategory.create({
      data: {
        slug: "tentage-furniture",
        name: "Tentage & Heavy Furniture",
        description: "Waterproof German hangars, shamiyanas, banquet chairs, sofas, and foam bedding.",
      },
    }),
    prisma.serviceCategory.create({
      data: {
        slug: "catering-equipment",
        name: "Commercial Catering & Utensils",
        description: "Heavy copper handis, chafing dishes, buffet counters, and commercial gas burners.",
      },
    }),
    prisma.serviceCategory.create({
      data: {
        slug: "lighting-audio",
        name: "Ambient Lighting & Audio",
        description: "Line-array PA systems, LED PAR cans, trussing, and silent DG generator backups.",
      },
    }),
    prisma.serviceCategory.create({
      data: {
        slug: "decor-staging",
        name: "Thematic Decor & Staging",
        description: "Modular stage risers, floral backdrops, mandap trusses, and VIP lounge seating.",
      },
    }),
  ]);

  const [catTent, catCatering, catAudio, catDecor] = categories;

  // 2. Users (Admin, 2 Organizers, 4 Vendors — 3 VERIFIED + 1 PENDING for TC-01)
  const admin = await prisma.user.create({
    data: {
      email: "admin@eventkit.in",
      passwordHash,
      fullName: "Meera Kulkarni (Platform Arbiter)",
      phone: "+919826011001",
      role: "ADMIN",
      city: "Indore",
    },
  });

  const organizer1 = await prisma.user.create({
    data: {
      email: "rajesh.organizer@eventkit.in",
      passwordHash,
      fullName: "Rajesh Sharma",
      phone: "+919826022001",
      role: "ORGANIZER",
      organizationType: "Corporate & Wedding Planner (Apex Events)",
      billingAddress: "402 Orbit Mall, AB Road, Vijay Nagar, Indore",
      city: "Indore",
    },
  });

  const organizer2 = await prisma.user.create({
    data: {
      email: "ananya.organizer@eventkit.in",
      passwordHash,
      fullName: "Ananya Verma",
      phone: "+919826022002",
      role: "ORGANIZER",
      organizationType: "University Cultural Fest Committee",
      billingAddress: "Pigamber Campus Road, Rau, Indore",
      city: "Indore",
    },
  });

  const v1User = await prisma.user.create({
    data: {
      email: "royal.vendor@eventkit.in",
      passwordHash,
      fullName: "Vikram Patel",
      phone: "+919826033001",
      role: "VENDOR",
      city: "Indore",
    },
  });

  const v2User = await prisma.user.create({
    data: {
      email: "malwa.vendor@eventkit.in",
      passwordHash,
      fullName: "Harish Jain",
      phone: "+919826033002",
      role: "VENDOR",
      city: "Indore",
    },
  });

  const v3User = await prisma.user.create({
    data: {
      email: "narmada.vendor@eventkit.in",
      passwordHash,
      fullName: "Sandeep Tiwari",
      phone: "+919826033003",
      role: "VENDOR",
      city: "Indore",
    },
  });

  const v4PendingUser = await prisma.user.create({
    data: {
      email: "pending.vendor@eventkit.in",
      passwordHash,
      fullName: "Rohan Chouhan",
      phone: "+919826033004",
      role: "VENDOR",
      city: "Indore",
    },
  });

  // 3. Vendor Profiles
  const vpRoyal = await prisma.vendorProfile.create({
    data: {
      userId: v1User.id,
      businessName: "Royal Tent & Decorators",
      verificationStatus: "VERIFIED",
      gstNumber: "23AABCR4029A1Z5",
      idProofUrl: "/uploads/demo-gst-royal.pdf",
      warehouseAddress: "Plot 18, Lasudia Mori Godown Yard, Vijay Nagar, Indore",
      locality: "Vijay Nagar",
      latitude: 22.7654,
      longitude: 75.8995,
      safetyBufferPct: 10,
      vriScore: 94.5,
      verifiedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20),
      stockRefreshedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
    },
  });

  const vpMalwa = await prisma.vendorProfile.create({
    data: {
      userId: v2User.id,
      businessName: "Malwa Infra & Catering Supplies",
      verificationStatus: "VERIFIED",
      gstNumber: "23AADCM8812B1Z9",
      idProofUrl: "/uploads/demo-gst-malwa.pdf",
      warehouseAddress: "24 Siyaganj Main Mandi Road, Rajwada, Indore",
      locality: "Rajwada",
      latitude: 22.7192,
      longitude: 75.8612,
      safetyBufferPct: 10,
      vriScore: 89.2,
      verifiedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 15),
      stockRefreshedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4),
    },
  });

  const vpNarmada = await prisma.vendorProfile.create({
    data: {
      userId: v3User.id,
      businessName: "Narmada Sound, Lights & Pandals",
      verificationStatus: "VERIFIED",
      gstNumber: "23AAECN9901C1Z2",
      idProofUrl: "/uploads/demo-gst-narmada.pdf",
      warehouseAddress: "Sector C, Sanwer Industrial Area, Super Corridor, Indore",
      locality: "Super Corridor",
      latitude: 22.7712,
      longitude: 75.8186,
      safetyBufferPct: 10,
      vriScore: 91.0,
      verifiedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 12),
      stockRefreshedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 35), // Intentionally > 30 days for FR-05 demo!
    },
  });

  // Unverified pending vendor (TC-01: must never appear in public search or receive RFQs)
  await prisma.vendorProfile.create({
    data: {
      userId: v4PendingUser.id,
      businessName: "Indore Unverified Shamiyana House",
      verificationStatus: "PENDING",
      gstNumber: "23PEND0000D1Z1",
      idProofUrl: "/uploads/demo-pending-kyc.pdf",
      warehouseAddress: "12 Bypass Service Lane, Bhawarkua, Indore",
      locality: "Bhawarkua",
      latitude: 22.6926,
      longitude: 75.8676,
      safetyBufferPct: 10,
      vriScore: 70.0,
    },
  });

  // 4. Service Listings (SKUs + Packages)
  const royalChairs = await prisma.serviceListing.create({
    data: {
      vendorId: vpRoyal.id,
      categoryId: catTent.id,
      skuCode: "RYL-CHR-500",
      itemName: "Chiavari Gold Banquet Chair (Cushioned)",
      description: "Stackable resin-steel banquet chairs with ivory velvet seat pads.",
      unitType: "PER_PIECE",
      baseRatePerDay: 45,
      replacementValue: 1200,
      totalPhysicalStock: 500,
    },
  });

  const royalHangar = await prisma.serviceListing.create({
    data: {
      vendorId: vpRoyal.id,
      categoryId: catTent.id,
      skuCode: "RYL-TNT-100",
      itemName: "Waterproof German Hangar Canopy (Sq. Ft.)",
      description: "Aluminum truss waterproof hangar with side curtains and ceiling drape.",
      unitType: "PER_SQFT",
      baseRatePerDay: 28,
      replacementValue: 350,
      totalPhysicalStock: 8000,
    },
  });

  const royalSound = await prisma.serviceListing.create({
    data: {
      vendorId: vpRoyal.id,
      categoryId: catAudio.id,
      skuCode: "RYL-AUD-012",
      itemName: "JBL Dual Line-Array PA Stack + Mixer",
      description: "Includes 4 tops, 2 dual-18 subs, digital console, and 2 UHF cordless mics.",
      unitType: "PER_SET",
      baseRatePerDay: 8500,
      replacementValue: 145000,
      totalPhysicalStock: 6,
    },
  });

  const malwaChairs = await prisma.serviceListing.create({
    data: {
      vendorId: vpMalwa.id,
      categoryId: catTent.id,
      skuCode: "MLW-CHR-600",
      itemName: "Cross-Back Banquet Chair (Covered)",
      description: "Heavy-duty banquet seating with white satin cover & gold sash.",
      unitType: "PER_PIECE",
      baseRatePerDay: 38,
      replacementValue: 950,
      totalPhysicalStock: 600,
    },
  });

  const malwaBuffet = await prisma.serviceListing.create({
    data: {
      vendorId: vpMalwa.id,
      categoryId: catCatering.id,
      skuCode: "MLW-CAT-200",
      itemName: "Brass & Steel Chafing Dish Set (8L Roll-Top)",
      description: "Commercial hydraulic roll-top chafing dishes with gel fuel holders.",
      unitType: "PER_PIECE",
      baseRatePerDay: 320,
      replacementValue: 6500,
      totalPhysicalStock: 80,
    },
  });

  const narmadaChairs = await prisma.serviceListing.create({
    data: {
      vendorId: vpNarmada.id,
      categoryId: catTent.id,
      skuCode: "NRM-CHR-400",
      itemName: "Executive Padded Conference Chair",
      description: "Chrome-frame cushioned banquet & seminar chairs.",
      unitType: "PER_PIECE",
      baseRatePerDay: 40,
      replacementValue: 1100,
      totalPhysicalStock: 400,
    },
  });

  await prisma.serviceListing.create({
    data: {
      vendorId: vpNarmada.id,
      categoryId: catDecor.id,
      skuCode: "NRM-STG-004",
      itemName: "Modular Truss Stage + LED Wall Frame (24x16 ft)",
      description: "4ft high carpeted stage deck with wooden skirting and backdrop truss.",
      unitType: "PER_SET",
      baseRatePerDay: 14000,
      replacementValue: 220000,
      totalPhysicalStock: 4,
    },
  });

  // 5. Demo RFQ #1 (QUOTED — 3 competing unbundled bids ready for Side-by-Side Comparison!)
  const futureStart = new Date(Date.now() + 1000 * 60 * 60 * 24 * 12);
  const futureEnd = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);

  const rfq1 = await prisma.eventRequirement.create({
    data: {
      organizerId: organizer1.id,
      categoryId: catTent.id,
      rfqCode: "RFQ-2026-101",
      title: "Apex Tech Annual Summit — Main Plenary Tentage & Seating",
      eventType: "Corporate Summit",
      startDate: futureStart,
      endDate: futureEnd,
      venueAddress: "Brilliant Convention Centre Lawn, Scheme 78, Vijay Nagar, Indore",
      venueLocality: "Vijay Nagar",
      venueLat: 22.7605,
      venueLng: 75.8878,
      guestCount: 350,
      targetBudget: 52000,
      targetVendorIds: [vpRoyal.id, vpMalwa.id, vpNarmada.id],
      status: "QUOTED",
      items: {
        create: [
          {
            listingId: royalChairs.id,
            itemName: "Banquet / Plenary Chairs (Cushioned)",
            unitType: "PER_PIECE",
            requestedQuantity: 300,
            notes: "Uniform white or gold finish",
          },
          {
            listingId: royalHangar.id,
            itemName: "Waterproof Canopy Area",
            unitType: "PER_SQFT",
            requestedQuantity: 1500,
            notes: "Need side masking curtains",
          },
        ],
      },
    },
  });

  const quoteValid = new Date(Date.now() + 1000 * 60 * 60 * 72);

  await prisma.quotation.create({
    data: {
      requirementId: rfq1.id,
      vendorId: vpRoyal.id,
      rentalSubtotal: 42000,
      transportFee: 3200,
      laborFee: 4000,
      taxAmount: 8856,
      securityDeposit: 10000,
      totalAmount: 58056,
      validUntil: quoteValid,
      notes: "Includes overnight standby crew and rain-gutter sealing.",
      status: "SENT",
      items: {
        create: [
          { listingId: royalChairs.id, itemName: "Chiavari Gold Banquet Chair", quantity: 300, unitPrice: 45, subtotal: 13500 },
          { listingId: royalHangar.id, itemName: "Waterproof German Hangar Canopy", quantity: 1500, unitPrice: 19, subtotal: 28500 },
        ],
      },
    },
  });

  await prisma.quotation.create({
    data: {
      requirementId: rfq1.id,
      vendorId: vpMalwa.id,
      rentalSubtotal: 38500,
      transportFee: 4800,
      laborFee: 4500,
      taxAmount: 8604,
      securityDeposit: 12000,
      totalAmount: 56404,
      validUntil: quoteValid,
      notes: "Dispatched from Rajwada central godown; morning 6 AM setup.",
      status: "SENT",
      items: {
        create: [
          { listingId: malwaChairs.id, itemName: "Cross-Back Banquet Chair", quantity: 300, unitPrice: 38, subtotal: 11400 },
          { itemName: "Waterproof Box Canopy (1500 sq.ft)", quantity: 1500, unitPrice: 18.06, subtotal: 27100 },
        ],
      },
    },
  });

  await prisma.quotation.create({
    data: {
      requirementId: rfq1.id,
      vendorId: vpNarmada.id,
      rentalSubtotal: 40000,
      transportFee: 5500,
      laborFee: 3800,
      taxAmount: 8874,
      securityDeposit: 8000,
      totalAmount: 58174,
      validUntil: quoteValid,
      notes: "20-day inventory refresh pending; standard crew included.",
      status: "SENT",
      items: {
        create: [
          { listingId: narmadaChairs.id, itemName: "Executive Padded Conference Chair", quantity: 300, unitPrice: 40, subtotal: 12000 },
          { itemName: "Event Canopy Structure (1500 sq.ft)", quantity: 1500, unitPrice: 18.66, subtotal: 28000 },
        ],
      },
    },
  });

  // Masked pre-booking message on RFQ #1
  await prisma.message.create({
    data: {
      requirementId: rfq1.id,
      senderId: organizer1.id,
      receiverId: v1User.id,
      messageBody: "Can your crew complete hangar trussing by 8 AM on Day 1 before AV soundcheck?",
    },
  });
  await prisma.message.create({
    data: {
      requirementId: rfq1.id,
      senderId: v1User.id,
      receiverId: organizer1.id,
      messageBody: "Yes, we bring two rigging teams the night before so Day 1 morning is clear by 7:30 AM.",
    },
  });

  // 6. Demo RFQ #2 -> Active SOFT_HOLD Booking (for live 24h countdown demonstration)
  const holdStart = new Date(Date.now() + 1000 * 60 * 60 * 24 * 20);
  const holdEnd = new Date(Date.now() + 1000 * 60 * 60 * 24 * 21);

  const rfqHold = await prisma.eventRequirement.create({
    data: {
      organizerId: organizer2.id,
      categoryId: catCatering.id,
      rfqCode: "RFQ-2026-102",
      title: "Medicaps Cultural Fest — VIP Dining Chafing Dishes",
      eventType: "University Festival",
      startDate: holdStart,
      endDate: holdEnd,
      venueAddress: "AB Road Pigamber Campus Lawn, Rau, Indore",
      venueLocality: "Rau",
      venueLat: 22.6345,
      venueLng: 75.8152,
      guestCount: 400,
      status: "CLOSED",
      items: {
        create: [
          {
            listingId: malwaBuffet.id,
            itemName: "Brass & Steel Chafing Dish Set (8L Roll-Top)",
            unitType: "PER_PIECE",
            requestedQuantity: 40,
          },
        ],
      },
    },
  });

  const holdQuote = await prisma.quotation.create({
    data: {
      requirementId: rfqHold.id,
      vendorId: vpMalwa.id,
      rentalSubtotal: 12800,
      transportFee: 1800,
      laborFee: 1200,
      taxAmount: 2844,
      securityDeposit: 5000,
      totalAmount: 18644,
      validUntil: quoteValid,
      status: "ACCEPTED",
      items: {
        create: [
          { listingId: malwaBuffet.id, itemName: "Brass & Steel Chafing Dish Set (8L Roll-Top)", quantity: 40, unitPrice: 320, subtotal: 12800 },
        ],
      },
    },
  });

  const softHoldBooking = await prisma.booking.create({
    data: {
      bookingCode: "BK-IN-90215",
      quotationId: holdQuote.id,
      status: "SOFT_HOLD",
      holdExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 22), // 22 hours remaining
      escrowStatus: "ADVANCE_LOCKED",
      advanceAmount: Math.round(18644 * 0.3),
      depositAmount: 5000,
    },
  });

  await prisma.availabilityBlock.createMany({
    data: [
      { listingId: malwaBuffet.id, bookingId: softHoldBooking.id, blockDate: holdStart, reservedQuantity: 40 },
      { listingId: malwaBuffet.id, bookingId: softHoldBooking.id, blockDate: holdEnd, reservedQuantity: 40 },
    ],
  });

  // 7. Demo RFQ #3 -> COMPLETED Booking with signed QR Checklists & Verified Review
  const pastStart = new Date(Date.now() - 1000 * 60 * 60 * 24 * 10);
  const pastEnd = new Date(Date.now() - 1000 * 60 * 60 * 24 * 8);

  const rfqDone = await prisma.eventRequirement.create({
    data: {
      organizerId: organizer1.id,
      categoryId: catAudio.id,
      rfqCode: "RFQ-2026-098",
      title: "Palasia Product Launch — Line-Array PA & Mics",
      eventType: "Product Launch",
      startDate: pastStart,
      endDate: pastEnd,
      venueAddress: "Sayaji Terrace Hall, Vijay Nagar, Indore",
      venueLocality: "Vijay Nagar",
      venueLat: 22.7533,
      venueLng: 75.8937,
      guestCount: 220,
      status: "CLOSED",
      items: {
        create: [
          {
            listingId: royalSound.id,
            itemName: "JBL Dual Line-Array PA Stack + Mixer",
            unitType: "PER_SET",
            requestedQuantity: 2,
          },
        ],
      },
    },
  });

  const doneQuote = await prisma.quotation.create({
    data: {
      requirementId: rfqDone.id,
      vendorId: vpRoyal.id,
      rentalSubtotal: 34000,
      transportFee: 2500,
      laborFee: 3500,
      taxAmount: 7200,
      securityDeposit: 10000,
      totalAmount: 47200,
      validUntil: pastStart,
      status: "ACCEPTED",
      items: {
        create: [
          { listingId: royalSound.id, itemName: "JBL Dual Line-Array PA Stack + Mixer", quantity: 2, unitPrice: 17000, subtotal: 34000 },
        ],
      },
    },
  });

  const completedBooking = await prisma.booking.create({
    data: {
      bookingCode: "BK-IN-90190",
      quotationId: doneQuote.id,
      status: "COMPLETED",
      holdExpiresAt: pastStart,
      confirmedAt: new Date(pastStart.getTime() - 1000 * 60 * 60 * 36),
      deliveredAt: pastStart,
      returnedAt: pastEnd,
      completedAt: pastEnd,
      escrowStatus: "RELEASED",
      advanceAmount: Math.round(47200 * 0.3),
      depositAmount: 10000,
    },
  });

  await prisma.handoverChecklist.createMany({
    data: [
      {
        bookingId: completedBooking.id,
        checklistType: "DELIVERY",
        qrToken: makeQrToken("BK-IN-90190", "DELIVERY"),
        itemConditionCounts: [
          { itemName: "JBL Dual Line-Array PA Stack + Mixer", expectedQty: 2, observedQty: 2, condition: "GOOD" },
        ],
        preExistingDefects: "Minor road-case scuff on Stack B",
        organizerSigned: true,
        vendorSigned: true,
        organizerPin: "4821",
        vendorPin: "9034",
        signedAt: pastStart,
      },
      {
        bookingId: completedBooking.id,
        checklistType: "RETURN",
        qrToken: makeQrToken("BK-IN-90190", "RETURN"),
        itemConditionCounts: [
          { itemName: "JBL Dual Line-Array PA Stack + Mixer", expectedQty: 2, observedQty: 2, condition: "GOOD" },
        ],
        preExistingDefects: "Zero new defects",
        damageClaimAmount: 0,
        organizerSigned: true,
        vendorSigned: true,
        organizerPin: "4821",
        vendorPin: "9034",
        signedAt: pastEnd,
      },
    ],
  });

  await prisma.review.create({
    data: {
      bookingId: completedBooking.id,
      organizerId: organizer1.id,
      vendorId: vpRoyal.id,
      ratingStars: 5,
      onTimeDelivery: true,
      reviewText: "Delivered 90 minutes before soundcheck. Exact unbundled invoice matched final settlement with zero surprises.",
      vendorReply: "Thank you Rajesh ji! Pleasure supporting Apex Events in Indore.",
    },
  });

  // 8. Initial Audit Log & Notifications
  await prisma.auditLog.createMany({
    data: [
      {
        actorId: admin.id,
        entityName: "VendorProfile",
        entityId: vpRoyal.id,
        actionType: "KYC_VERIFIED",
        previousState: "PENDING",
        newState: "VERIFIED",
        stateSnapshot: { gstNumber: vpRoyal.gstNumber },
      },
      {
        actorId: organizer2.id,
        entityName: "Booking",
        entityId: softHoldBooking.id,
        actionType: "SOFT_HOLD_INITIATED",
        previousState: "NONE",
        newState: "SOFT_HOLD",
        stateSnapshot: { bookingCode: "BK-IN-90215", advanceAmount: softHoldBooking.advanceAmount },
      },
    ],
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: organizer1.id,
        title: "3 Unbundled Quotes Received",
        body: "RFQ-2026-101 has 3 competing bids ready in your Comparison Matrix.",
        kind: "SUCCESS",
        linkUrl: "/organizer/rfqs",
      },
      {
        userId: v2User.id,
        title: "Urgent: 24h Soft-Hold Awaiting Confirmation",
        body: "Booking BK-IN-90215 (Malwa Catering) requires 1-click confirmation before SLA expiry.",
        kind: "WARNING",
        linkUrl: "/vendor/bookings",
      },
      {
        userId: admin.id,
        title: "1 Vendor Pending KYC Review",
        body: "Indore Unverified Shamiyana House uploaded GST/ID proof for verification.",
        kind: "INFO",
        linkUrl: "/admin/kyc",
      },
    ],
  });

  console.log("EventKit database seeded successfully with Indore demo dataset.");
}

main()
  .catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
