import "server-only";
import { and, asc, eq, gt, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { customers, devices, reservations, users } from "@/db/schema";
import { AppError } from "../errors";
import { logAudit, AUDIT_ACTIONS } from "../audit";
import type { SessionUser } from "../auth";

export type ReservationStatus = "booked" | "seated" | "cancelled" | "no_show";

export async function createReservation(
  user: SessionUser,
  input: {
    deviceId: string;
    customerId?: string | null;
    customerName: string;
    customerPhone?: string;
    partySize?: number;
    startAt: Date;
    endAt: Date;
    notes?: string;
  },
) {
  const customerName = input.customerName.trim();
  if (customerName.length < 2) throw new AppError("Le nom du client est obligatoire.");
  if (!(input.startAt instanceof Date) || Number.isNaN(input.startAt.getTime())) {
    throw new AppError("Date de début invalide.");
  }
  if (!(input.endAt instanceof Date) || Number.isNaN(input.endAt.getTime())) {
    throw new AppError("Date de fin invalide.");
  }
  if (input.endAt <= input.startAt) throw new AppError("La fin doit être après le début.");

  return db.transaction(async (tx) => {
    const [device] = await tx.select().from(devices).where(eq(devices.id, input.deviceId)).for("update");
    if (!device) throw new AppError("Appareil introuvable.");
    if (!device.isActive) throw new AppError("Cet appareil est inactif.");

    const conflicts = await tx
      .select({ id: reservations.id })
      .from(reservations)
      .where(
        and(
          eq(reservations.deviceId, device.id),
          inArray(reservations.status, ["booked", "seated"]),
          lt(reservations.startAt, input.endAt),
          gt(reservations.endAt, input.startAt),
        ),
      )
      .limit(1);
    if (conflicts.length > 0) throw new AppError("Ce créneau est déjà réservé sur cet appareil.");

    if (input.customerId) {
      const [customer] = await tx.select({ id: customers.id }).from(customers).where(eq(customers.id, input.customerId)).limit(1);
      if (!customer) throw new AppError("Client introuvable.");
    }

    const [reservation] = await tx
      .insert(reservations)
      .values({
        deviceId: device.id,
        customerId: input.customerId || null,
        customerName: customerName.slice(0, 120),
        customerPhone: (input.customerPhone ?? "").trim().slice(0, 30),
        partySize: Math.max(1, Math.trunc(input.partySize ?? 1)),
        startAt: input.startAt,
        endAt: input.endAt,
        notes: (input.notes ?? "").trim().slice(0, 500),
        createdBy: user.id,
      })
      .returning();

    await logAudit(
      {
        actorId: user.id,
        actorName: user.fullName,
        action: AUDIT_ACTIONS.RESERVATION_CREATED,
        entityType: "reservation",
        entityId: reservation!.id,
        after: {
          deviceId: device.id,
          startAt: input.startAt.toISOString(),
          endAt: input.endAt.toISOString(),
          customerName,
        },
      },
      tx,
    );

    return reservation!;
  });
}

export async function updateReservationStatus(
  user: SessionUser,
  input: { reservationId: string; status: Extract<ReservationStatus, "seated" | "no_show"> },
) {
  return db.transaction(async (tx) => {
    const [reservation] = await tx
      .select()
      .from(reservations)
      .where(eq(reservations.id, input.reservationId))
      .for("update");
    if (!reservation) throw new AppError("Réservation introuvable.");
    if (reservation.status !== "booked") throw new AppError("Seule une réservation à venir peut changer de statut.");

    await tx
      .update(reservations)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(reservations.id, reservation.id));

    await logAudit(
      {
        actorId: user.id,
        actorName: user.fullName,
        action: AUDIT_ACTIONS.RESERVATION_STATUS,
        entityType: "reservation",
        entityId: reservation.id,
        before: { status: reservation.status },
        after: { status: input.status },
      },
      tx,
    );

    return { status: input.status };
  });
}

export async function cancelReservation(user: SessionUser, input: { reservationId: string; reason: string }) {
  const reason = input.reason.trim();
  if (reason.length < 3) throw new AppError("Un motif est obligatoire pour annuler une réservation.");

  return db.transaction(async (tx) => {
    const [reservation] = await tx
      .select()
      .from(reservations)
      .where(eq(reservations.id, input.reservationId))
      .for("update");
    if (!reservation) throw new AppError("Réservation introuvable.");
    if (reservation.status === "cancelled") throw new AppError("Cette réservation est déjà annulée.");
    if (reservation.status === "no_show") throw new AppError("Cette réservation est marquée absente : créez-en une nouvelle.");

    await tx
      .update(reservations)
      .set({ status: "cancelled", notes: `${reservation.notes}\nAnnulation : ${reason}`.trim().slice(0, 500), updatedAt: new Date() })
      .where(eq(reservations.id, reservation.id));

    await logAudit(
      {
        actorId: user.id,
        actorName: user.fullName,
        action: AUDIT_ACTIONS.RESERVATION_CANCELLED,
        entityType: "reservation",
        entityId: reservation.id,
        before: { status: reservation.status },
        after: { status: "cancelled" },
        reason: reason.slice(0, 200),
      },
      tx,
    );

    return { status: "cancelled" as const };
  });
}

export async function listReservations(input?: { from?: Date; limit?: number }) {
  const limit = input?.limit ?? 100;
  const base = db
    .select({
      reservation: reservations,
      deviceName: devices.name,
      creatorName: users.fullName,
    })
    .from(reservations)
    .leftJoin(devices, eq(devices.id, reservations.deviceId))
    .leftJoin(users, eq(users.id, reservations.createdBy))
    .orderBy(asc(reservations.startAt))
    .limit(limit);

  if (input?.from) return base.where(gte(reservations.endAt, input.from));
  return base;
}
