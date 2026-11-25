import type { Prisma } from "@prisma/client";
import type { Server as SocketIOServer } from "socket.io";
import { prisma } from "./prisma";

let ioInstance: SocketIOServer | null = null;

export function registerSocketIO(io: SocketIOServer) {
  ioInstance = io;
}

export function emitUserEvent(userId: string, event: string, payload: unknown) {
  if (ioInstance) {
    ioInstance.to(`user:${userId}`).emit(event, payload);
  }
}

export function emitGlobalWatchdogEvent(payload: unknown) {
  if (ioInstance) {
    ioInstance.emit("watchdog:update", payload);
  }
}

export async function recordAudit(
  params: {
    actorId?: string | null;
    entityName: string;
    entityId: string;
    actionType: string;
    previousState?: string | null;
    newState?: string | null;
    stateSnapshot?: Prisma.InputJsonValue;
  },
  tx?: Prisma.TransactionClient
) {
  const client = tx ?? prisma;
  return client.auditLog.create({
    data: {
      actorId: params.actorId ?? null,
      entityName: params.entityName,
      entityId: params.entityId,
      actionType: params.actionType,
      previousState: params.previousState ?? null,
      newState: params.newState ?? null,
      stateSnapshot: params.stateSnapshot ?? undefined,
    },
  });
}

export async function notifyUser(
  params: {
    userId: string;
    title: string;
    body: string;
    kind?: "INFO" | "SUCCESS" | "WARNING" | "ERROR";
    linkUrl?: string;
  },
  tx?: Prisma.TransactionClient
) {
  const client = tx ?? prisma;
  const note = await client.notification.create({
    data: {
      userId: params.userId,
      title: params.title,
      body: params.body,
      kind: params.kind ?? "INFO",
      linkUrl: params.linkUrl ?? null,
    },
  });
  emitUserEvent(params.userId, "notification:new", note);
  return note;
}
