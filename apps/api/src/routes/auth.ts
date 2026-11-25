import { Router } from "express";
import bcrypt from "bcryptjs";
import { loginSchema, registerSchema } from "@eventkit/shared";
import { prisma } from "../lib/prisma";
import { recordAudit } from "../lib/audit";
import { authenticate, signAuthToken } from "../middleware/auth";

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input" });
  }

  const data = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  if (data.role === "VENDOR" && (!data.businessName || !data.warehouseAddress)) {
    return res.status(400).json({
      error: "Business name and warehouse address are required for vendor registration",
    });
  }

  const passwordHash = await bcrypt.hash(data.password, 12);

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash,
        fullName: data.fullName,
        phone: data.phone,
        role: data.role,
        city: data.city,
        organizationType: data.organizationType,
        billingAddress: data.billingAddress,
      },
    });

    let vendorProfile = null;
    if (data.role === "VENDOR") {
      vendorProfile = await tx.vendorProfile.create({
        data: {
          userId: user.id,
          businessName: data.businessName!,
          gstNumber: data.gstNumber || null,
          warehouseAddress: data.warehouseAddress!,
          locality: data.locality || "Vijay Nagar",
          latitude: data.latitude ?? 22.7533,
          longitude: data.longitude ?? 75.8937,
          verificationStatus: "PENDING",
        },
      });
    }

    await recordAudit(
      {
        actorId: user.id,
        entityName: "User",
        entityId: user.id,
        actionType: "USER_REGISTERED",
        newState: data.role,
        stateSnapshot: { email: user.email, role: user.role },
      },
      tx
    );

    return { user, vendorProfile };
  });

  const token = signAuthToken({
    id: created.user.id,
    email: created.user.email,
    role: created.user.role,
    fullName: created.user.fullName,
    vendorProfileId: created.vendorProfile?.id ?? null,
  });

  return res.status(201).json({
    token,
    user: {
      id: created.user.id,
      email: created.user.email,
      fullName: created.user.fullName,
      role: created.user.role,
      city: created.user.city,
      vendorProfile: created.vendorProfile,
    },
  });
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
    include: { vendorProfile: true },
  });

  if (!user || !user.isActive) {
    return res.status(401).json({ error: "Invalid credentials or suspended account" });
  }

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = signAuthToken({
    id: user.id,
    email: user.email,
    role: user.role,
    fullName: user.fullName,
    vendorProfileId: user.vendorProfile?.id ?? null,
  });

  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role,
      city: user.city,
      organizationType: user.organizationType,
      vendorProfile: user.vendorProfile,
    },
  });
});

/**
 * Academic / Evaluator Demo Role Switcher (gated by ENABLE_DEMO_MODE=true in .env).
 * Keeps zero passwords hardcoded in frontend code while allowing 1-click walkthroughs.
 */
authRouter.post("/demo-login", async (req, res) => {
  if (process.env.ENABLE_DEMO_MODE !== "true") {
    return res.status(403).json({ error: "Demo mode is disabled in this environment" });
  }

  const persona = String(req.body?.persona || "");
  const personaEmailMap: Record<string, string> = {
    ORGANIZER: "rajesh.organizer@eventkit.in",
    ORGANIZER_2: "ananya.organizer@eventkit.in",
    VENDOR_ROYAL: "royal.vendor@eventkit.in",
    VENDOR_MALWA: "malwa.vendor@eventkit.in",
    ADMIN: "admin@eventkit.in",
  };

  const email = personaEmailMap[persona];
  if (!email) {
    return res.status(400).json({ error: "Unknown demo persona" });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { vendorProfile: true },
  });

  if (!user) {
    return res.status(404).json({ error: "Demo user not seeded yet. Run database seed." });
  }

  const token = signAuthToken({
    id: user.id,
    email: user.email,
    role: user.role,
    fullName: user.fullName,
    vendorProfileId: user.vendorProfile?.id ?? null,
  });

  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role,
      city: user.city,
      organizationType: user.organizationType,
      vendorProfile: user.vendorProfile,
    },
  });
});

authRouter.get("/me", authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: { vendorProfile: true },
  });
  if (!user) return res.status(404).json({ error: "User not found" });

  return res.json({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role,
      city: user.city,
      organizationType: user.organizationType,
      billingAddress: user.billingAddress,
      vendorProfile: user.vendorProfile,
    },
  });
});

authRouter.get("/notifications", authenticate, async (req, res) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return res.json({ notifications });
});

authRouter.patch("/notifications/:id/read", authenticate, async (req, res) => {
  await prisma.notification.updateMany({
    where: { id: req.params.id, userId: req.user!.id },
    data: { isRead: true },
  });
  return res.json({ ok: true });
});
