import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { deviceStatusHistory, devices, gameSessions, sessionEvents } from "@/db/schema";
import { computeBilling, type BillingResult } from "../billing";
import { AppError } from "../errors";
import { logAudit, AUDIT_ACTIONS } from "../audit";
import type { SessionUser } from "../auth";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function setDeviceStatus(
  tx: Tx,
  deviceId: string,
  toStatus: "available" | "occupied" | "paused" | "maintenance" | "out_of_service" | "reserved",
  actor: SessionUser,
  reason = "",
) {
  const [device] = await tx.select().from(devices).where(eq(devices.id, deviceId)).for("update");
  if (!device) throw new AppError("Appareil introuvable.");
  if (device.status === toStatus) return device;

  await tx.update(devices).set({ status: toStatus, updatedAt: new Date() }).where(eq(devices.id, deviceId));
  await tx.insert(deviceStatusHistory).values({
    deviceId,
    fromStatus: device.status,
    toStatus,
    changedBy: actor.id,
    reason,
  });
  return device;
}

function pausedTotal(session: {
  pausedAt: Date | null;
  pausedSeconds: number;
  startedAt: Date;
}, at: Date): number {
  let paused = session.pausedSeconds;
  if (session.pausedAt) {
    paused += Math.max(0, Math.floor((at.getTime() - new Date(session.pausedAt).getTime()) / 1000));
  }
  return paused;
}

export async function startSession(
  user: SessionUser,
  input: { deviceId: string; customerId?: string | null; matches?: number; notes?: string },
) {
  return db.transaction(async (tx) => {
    const [device] = await tx.select().from(devices).where(eq(devices.id, input.deviceId)).for("update");
    if (!device) throw new AppError("Appareil introuvable.");
    if (!device.isActive) throw new AppError("Cet appareil est désactivé.");
    if (device.status === "maintenance" || device.status === "out_of_service") {
      throw new AppError("Cet appareil est en maintenance.");
    }

    const active = await tx
      .select({ id: gameSessions.id })
      .from(gameSessions)
      .where(
        and(
          eq(gameSessions.deviceId, device.id),
          inArray(gameSessions.status, ["running", "paused"]),
        ),
      )
      .limit(1);
    if (active.length > 0) throw new AppError("Cet appareil est déjà occupé par une session en cours.");

    const matches = Math.max(1, Math.floor(input.matches ?? 1));

    const [session] = await tx
      .insert(gameSessions)
      .values({
        deviceId: device.id,
        customerId: input.customerId ?? null,
        employeeId: user.id,
        status: "running",
        billingMode: device.billingMode,
        hourlyRateCents: device.hourlyRateCents,
        matchRateCents: device.matchRateCents,
        fixedRateCents: device.fixedRateCents,
        minBillableMinutes: device.minBillableMinutes,
        billingIncrementMinutes: device.billingIncrementMinutes,
        rounding: device.rounding,
        matches,
        notes: input.notes ?? "",
      })
      .returning();

    await tx.insert(sessionEvents).values({
      sessionId: session!.id,
      type: "start",
      actorId: user.id,
      data: { deviceName: device.name, billingMode: device.billingMode, matches },
    });

    await setDeviceStatus(tx, device.id, "occupied", user, "Démarrage d'une session");

    await logAudit(
      {
        actorId: user.id,
        actorName: user.fullName,
        action: AUDIT_ACTIONS.SESSION_START,
        entityType: "session",
        entityId: session!.id,
        after: {
          deviceId: device.id,
          deviceName: device.name,
          billingMode: device.billingMode,
          hourlyRateCents: device.hourlyRateCents,
        },
      },
      tx,
    );

    return session!;
  });
}

export async function pauseSession(user: SessionUser, sessionId: string) {
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(gameSessions)
      .where(eq(gameSessions.id, sessionId))
      .for("update");
    if (!session) throw new AppError("Session introuvable.");
    if (session.status !== "running") throw new AppError("Seule une session en cours peut être mise en pause.");

    const now = new Date();
    const [updated] = await tx
      .update(gameSessions)
      .set({ status: "paused", pausedAt: now })
      .where(and(eq(gameSessions.id, sessionId), eq(gameSessions.status, "running")))
      .returning();

    await tx.insert(sessionEvents).values({
      sessionId,
      type: "pause",
      actorId: user.id,
      data: { at: now.toISOString() },
    });
    await setDeviceStatus(tx, session.deviceId, "paused", user, "Session en pause");

    return updated!;
  });
}

export async function resumeSession(user: SessionUser, sessionId: string) {
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(gameSessions)
      .where(eq(gameSessions.id, sessionId))
      .for("update");
    if (!session) throw new AppError("Session introuvable.");
    if (session.status !== "paused") throw new AppError("Cette session n'est pas en pause.");

    const now = new Date();
    const extra = session.pausedAt
      ? Math.max(0, Math.floor((now.getTime() - new Date(session.pausedAt).getTime()) / 1000))
      : 0;

    const [updated] = await tx
      .update(gameSessions)
      .set({ status: "running", pausedAt: null, pausedSeconds: session.pausedSeconds + extra })
      .where(and(eq(gameSessions.id, sessionId), eq(gameSessions.status, "paused")))
      .returning();

    await tx.insert(sessionEvents).values({
      sessionId,
      type: "resume",
      actorId: user.id,
      data: { pausedSecondsAdded: extra },
    });
    await setDeviceStatus(tx, session.deviceId, "occupied", user, "Reprise de session");

    return updated!;
  });
}

/** Termine une session (à partir de maintenant) et fige son montant. */
export async function endSession(
  user: SessionUser,
  sessionId: string,
  tx?: Tx,
): Promise<{ session: typeof gameSessions.$inferSelect; billing: BillingResult }> {
  const run = async (executor: Tx) => {
    const [session] = await executor
      .select()
      .from(gameSessions)
      .where(eq(gameSessions.id, sessionId))
      .for("update");
    if (!session) throw new AppError("Session introuvable.");
    if (session.status === "ended") {
      if (session.endedAt && session.billableMinutes !== null) {
        return {
          session,
          billing: {
            elapsedSeconds: 0,
            pausedSeconds: session.pausedSeconds,
            billableSeconds: 0,
            billableMinutes: session.billableMinutes,
            chargedMinutes: session.billableMinutes,
            amountCents: Number(session.computedAmountCents ?? 0),
            billingMode: session.billingMode,
          } as BillingResult,
        };
      }
      throw new AppError("Cette session est déjà terminée.");
    }
    if (session.status === "cancelled") throw new AppError("Cette session a été annulée.");
    if (session.invoiceId) throw new AppError("Cette session est déjà facturée.");

    const now = new Date();
    const pausedSeconds = pausedTotal(session, now);

    const billing = computeBilling({
      billingMode: session.billingMode,
      hourlyRateCents: Number(session.hourlyRateCents),
      matchRateCents: Number(session.matchRateCents),
      fixedRateCents: Number(session.fixedRateCents),
      minBillableMinutes: session.minBillableMinutes,
      billingIncrementMinutes: session.billingIncrementMinutes,
      rounding: session.rounding,
      matches: session.matches,
      startedAt: new Date(session.startedAt),
      endedAt: now,
      pausedSeconds,
    });

    const [updated] = await executor
      .update(gameSessions)
      .set({
        status: "ended",
        endedAt: now,
        pausedAt: null,
        pausedSeconds,
        billableMinutes: billing.chargedMinutes,
        computedAmountCents: billing.amountCents,
      })
      .where(and(eq(gameSessions.id, sessionId), inArray(gameSessions.status, ["running", "paused"])))
      .returning();

    await executor.insert(sessionEvents).values({
      sessionId,
      type: "end",
      actorId: user.id,
      data: {
        billableMinutes: billing.chargedMinutes,
        amountCents: billing.amountCents,
      },
    });

    await setDeviceStatus(executor, session.deviceId, "available", user, "Fin de session");

    await logAudit(
      {
        actorId: user.id,
        actorName: user.fullName,
        action: AUDIT_ACTIONS.SESSION_END,
        entityType: "session",
        entityId: sessionId,
        after: {
          billableMinutes: billing.chargedMinutes,
          amountCents: billing.amountCents,
          pausedSeconds,
        },
      },
      executor,
    );

    return { session: updated!, billing };
  };

  if (tx) return run(tx);
  return db.transaction(run);
}

export async function transferSession(
  user: SessionUser,
  input: { sessionId: string; targetDeviceId: string },
) {
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(gameSessions)
      .where(eq(gameSessions.id, input.sessionId))
      .for("update");
    if (!session) throw new AppError("Session introuvable.");
    if (session.status !== "running" && session.status !== "paused") {
      throw new AppError("Seule une session active peut être transférée.");
    }
    if (session.deviceId === input.targetDeviceId) throw new AppError("Choisissez un autre appareil.");

    const [target] = await tx
      .select()
      .from(devices)
      .where(eq(devices.id, input.targetDeviceId))
      .for("update");
    if (!target) throw new AppError("Appareil de destination introuvable.");
    if (!target.isActive) throw new AppError("L'appareil de destination est désactivé.");
    if (target.status === "maintenance" || target.status === "out_of_service") {
      throw new AppError("L'appareil de destination est indisponible.");
    }

    const now = new Date();
    const pausedSeconds = pausedTotal(session, now);

    // La session d'origine est clôturée sans facturation : le temps écoulé
    // est repris par la nouvelle session (aucune remise à zéro).
    await tx
      .update(gameSessions)
      .set({
        status: "ended",
        endedAt: now,
        pausedAt: null,
        pausedSeconds,
        billableMinutes: null,
        computedAmountCents: null,
      })
      .where(eq(gameSessions.id, session.id));

    const [moved] = await tx
      .insert(gameSessions)
      .values({
        deviceId: target.id,
        customerId: session.customerId,
        employeeId: user.id,
        shiftId: session.shiftId,
        status: session.status === "paused" ? "paused" : "running",
        billingMode: session.billingMode,
        hourlyRateCents: session.hourlyRateCents,
        matchRateCents: session.matchRateCents,
        fixedRateCents: session.fixedRateCents,
        minBillableMinutes: session.minBillableMinutes,
        billingIncrementMinutes: session.billingIncrementMinutes,
        rounding: session.rounding,
        matches: session.matches,
        startedAt: session.startedAt,
        pausedSeconds,
        pausedAt: session.status === "paused" ? session.pausedAt : null,
        transferFromSessionId: session.id,
        notes: session.notes,
      })
      .returning();

    await tx.insert(sessionEvents).values([
      {
        sessionId: session.id,
        type: "transfer",
        actorId: user.id,
        data: { toDeviceId: target.id, toSessionId: moved!.id },
      },
      {
        sessionId: moved!.id,
        type: "start",
        actorId: user.id,
        data: { transferredFrom: session.id, deviceName: target.name },
      },
    ]);

    await setDeviceStatus(tx, session.deviceId, "available", user, "Transfert de session");
    await setDeviceStatus(
      tx,
      target.id,
      moved!.status === "paused" ? "paused" : "occupied",
      user,
      "Transfert de session",
    );

    await logAudit(
      {
        actorId: user.id,
        actorName: user.fullName,
        action: AUDIT_ACTIONS.SESSION_TRANSFER,
        entityType: "session",
        entityId: moved!.id,
        before: { deviceId: session.deviceId },
        after: { deviceId: target.id, previousSessionId: session.id },
      },
      tx,
    );

    return moved!;
  });
}

export async function listActiveSessions() {
  return db
    .select({ session: gameSessions, deviceName: devices.name, deviceType: devices.type })
    .from(gameSessions)
    .innerJoin(devices, eq(devices.id, gameSessions.deviceId))
    .where(inArray(gameSessions.status, ["running", "paused"]))
    .orderBy(sql`${gameSessions.startedAt} asc`);
}

export async function listPendingSessions() {
  return db
    .select({ session: gameSessions, deviceName: devices.name })
    .from(gameSessions)
    .innerJoin(devices, eq(devices.id, gameSessions.deviceId))
    .where(
      and(
        eq(gameSessions.status, "ended"),
        sql`${gameSessions.invoiceId} is null`,
        sql`${gameSessions.computedAmountCents} is not null`,
      ),
    )
    .orderBy(sql`${gameSessions.endedAt} asc`);
}
