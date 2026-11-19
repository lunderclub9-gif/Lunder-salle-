import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { deviceStatusHistory, devices, maintenanceRecords, users } from "@/db/schema";
import { AppError } from "../errors";
import { logAudit, AUDIT_ACTIONS } from "../audit";
import type { SessionUser } from "../auth";

export const MAINTENANCE_KINDS = ["preventive", "corrective", "cleaning", "inspection"] as const;

export async function createMaintenance(
  user: SessionUser,
  input: { deviceId: string; kind: string; description: string; costCents?: number },
) {
  const description = input.description.trim();
  if (description.length < 3) throw new AppError("La description de l'intervention est obligatoire.");
  if ((input.costCents ?? 0) < 0) throw new AppError("Le coût ne peut pas être négatif.");

  return db.transaction(async (tx) => {
    const [device] = await tx.select().from(devices).where(eq(devices.id, input.deviceId)).for("update");
    if (!device) throw new AppError("Appareil introuvable.");

    const open = await tx
      .select({ id: maintenanceRecords.id })
      .from(maintenanceRecords)
      .where(
        and(
          eq(maintenanceRecords.deviceId, device.id),
          inArray(maintenanceRecords.status, ["open", "in_progress"]),
        ),
      )
      .limit(1);
    if (open.length > 0) throw new AppError("Une intervention est déjà en cours sur cet appareil.");

    const [record] = await tx
      .insert(maintenanceRecords)
      .values({
        deviceId: device.id,
        kind: input.kind || "corrective",
        description: description.slice(0, 500),
        costCents: Math.max(0, Math.round(input.costCents ?? 0)),
        technicianId: user.id,
        status: "in_progress",
      })
      .returning();

    if (device.status !== "maintenance") {
      await tx.update(devices).set({ status: "maintenance", updatedAt: new Date() }).where(eq(devices.id, device.id));
      await tx.insert(deviceStatusHistory).values({
        deviceId: device.id,
        fromStatus: device.status,
        toStatus: "maintenance",
        changedBy: user.id,
        reason: `Intervention : ${description.slice(0, 120)}`,
      });
    }

    await logAudit(
      {
        actorId: user.id,
        actorName: user.fullName,
        action: AUDIT_ACTIONS.MAINTENANCE_CREATED,
        entityType: "device",
        entityId: device.id,
        after: { maintenanceId: record!.id, kind: record!.kind, costCents: record!.costCents },
      },
      tx,
    );

    return record!;
  });
}

export async function completeMaintenance(
  user: SessionUser,
  input: { maintenanceId: string; resolution: string; costCents?: number },
) {
  const resolution = input.resolution.trim();
  if (resolution.length < 3) throw new AppError("Le compte rendu de l'intervention est obligatoire.");
  if ((input.costCents ?? 0) < 0) throw new AppError("Le coût ne peut pas être négatif.");

  return db.transaction(async (tx) => {
    const [record] = await tx
      .select()
      .from(maintenanceRecords)
      .where(eq(maintenanceRecords.id, input.maintenanceId))
      .for("update");
    if (!record) throw new AppError("Intervention introuvable.");
    if (record.status === "done" || record.status === "cancelled") throw new AppError("Cette intervention est déjà clôturée.");

    await tx
      .update(maintenanceRecords)
      .set({
        status: "done",
        resolution: resolution.slice(0, 500),
        costCents: Math.max(0, Math.round(input.costCents ?? Number(record.costCents))),
        completedAt: new Date(),
      })
      .where(eq(maintenanceRecords.id, record.id));

    const [device] = await tx.select().from(devices).where(eq(devices.id, record.deviceId)).for("update");
    if (device && device.status === "maintenance") {
      await tx.update(devices).set({ status: "available", updatedAt: new Date() }).where(eq(devices.id, device.id));
      await tx.insert(deviceStatusHistory).values({
        deviceId: device.id,
        fromStatus: "maintenance",
        toStatus: "available",
        changedBy: user.id,
        reason: "Intervention terminée",
      });
    }

    await logAudit(
      {
        actorId: user.id,
        actorName: user.fullName,
        action: AUDIT_ACTIONS.MAINTENANCE_COMPLETED,
        entityType: "device",
        entityId: record.deviceId,
        before: { status: record.status },
        after: { status: "done", costCents: Math.round(input.costCents ?? Number(record.costCents)) },
        reason: resolution.slice(0, 200),
      },
      tx,
    );

    return { status: "done" as const };
  });
}

export async function listMaintenance(limit = 100) {
  return db
    .select({
      record: maintenanceRecords,
      deviceName: devices.name,
      technicianName: users.fullName,
    })
    .from(maintenanceRecords)
    .leftJoin(devices, eq(devices.id, maintenanceRecords.deviceId))
    .leftJoin(users, eq(users.id, maintenanceRecords.technicianId))
    .orderBy(desc(maintenanceRecords.startedAt))
    .limit(limit);
}
