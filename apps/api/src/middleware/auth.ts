import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { UserRole } from "@eventkit/shared";
import { prisma } from "../lib/prisma";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  fullName: string;
  vendorProfileId?: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET environment variable must be configured in production");
    }
    return "eventkit-local-dev-secret-change-me";
  }
  return secret;
}

export function signAuthToken(payload: AuthUser): string {
  const expiresIn = (process.env.JWT_EXPIRES_IN || "72h") as jwt.SignOptions["expiresIn"];
  return jwt.sign(payload, getJwtSecret(), { expiresIn });
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication token required" });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as AuthUser;
    const dbUser = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: { vendorProfile: { select: { id: true } } },
    });
    if (!dbUser || !dbUser.isActive) {
      return res.status(401).json({ error: "Session revoked or account suspended" });
    }
    req.user = {
      id: dbUser.id,
      email: dbUser.email,
      role: dbUser.role as UserRole,
      fullName: dbUser.fullName,
      vendorProfileId: dbUser.vendorProfile?.id ?? null,
    };
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired JWT token" });
  }
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return next();
  }
  try {
    const decoded = jwt.verify(authHeader.slice(7), getJwtSecret()) as AuthUser;
    req.user = decoded;
  } catch {
    // Ignore invalid optional token
  }
  return next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Forbidden: requires ${roles.join(" or ")} role` });
    }
    return next();
  };
}
