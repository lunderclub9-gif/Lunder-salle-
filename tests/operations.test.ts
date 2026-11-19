import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { devices, maintenanceRecords, reservations } from "@/db/schema";
import { cancelReservation, createReservation, updateReservationStatus } from "@/lib/services/reservations";
import { completeMaintenance, createMaintenance } from "@/lib/services/maintenance";
import { resetDatabase, makeUser, makeDevice } from "./helpers";

function at(hour: number, minutes = 0) {
  const d = new Date();
  d.setHours(hour, minutes, 0, 0);
  return d;
}

describe("phase 3 — réservations et maintenance", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("crée une réservation et refuse un créneau qui chevauche", async () => {
    const { session: user } = await makeUser("manager");
    const device = await makeDevice();

    await createReservation(user, {
      deviceId: device.id,
      customerName: "Karim",
      startAt: at(18),
      endAt: at(20),
    });

    await expect(
      createReservation(user, {
        deviceId: device.id,
        customerName: "Sofiane",
        startAt: at(19),
        endAt: at(21),
      }),
    ).rejects.toThrow(/déjà réservé/i);

    const rows = await db.select().from(reservations).where(eq(reservations.deviceId, device.id));
    expect(rows).toHaveLength(1);
  });

  it("autorise deux réservations adjacentes sur le même appareil", async () => {
    const { session: user } = await makeUser("manager");
    const device = await makeDevice();

    await createReservation(user, { deviceId: device.id, customerName: "Karim", startAt: at(18), endAt: at(20) });
    await createReservation(user, { deviceId: device.id, customerName: "Sofiane", startAt: at(20), endAt: at(21) });

    expect(await db.select().from(reservations)).toHaveLength(2);
  });

  it("refuse une fin antérieure au début et un nom trop court", async () => {
    const { session: user } = await makeUser("manager");
    const device = await makeDevice();

    await expect(
      createReservation(user, { deviceId: device.id, customerName: "Karim", startAt: at(20), endAt: at(18) }),
    ).rejects.toThrow(/après/i);
    await expect(
      createReservation(user, { deviceId: device.id, customerName: "K", startAt: at(18), endAt: at(19) }),
    ).rejects.toThrow(/nom/i);
  });

  it("annule une réservation avec motif obligatoire", async () => {
    const { session: user } = await makeUser("manager");
    const device = await makeDevice();
    const reservation = await createReservation(user, {
      deviceId: device.id,
      customerName: "Karim",
      startAt: at(18),
      endAt: at(20),
    });

    await expect(cancelReservation(user, { reservationId: reservation.id, reason: "ab" })).rejects.toThrow(/motif/i);
    await cancelReservation(user, { reservationId: reservation.id, reason: "Client absent" });

    const [saved] = await db.select().from(reservations).where(eq(reservations.id, reservation.id));
    expect(saved!.status).toBe("cancelled");
    expect(saved!.notes).toContain("Client absent");

    // Le créneau annulé est de nouveau disponible.
    await createReservation(user, { deviceId: device.id, customerName: "Sofiane", startAt: at(18), endAt: at(20) });
  });

  it("passe une réservation en installée une seule fois", async () => {
    const { session: user } = await makeUser("manager");
    const device = await makeDevice();
    const reservation = await createReservation(user, {
      deviceId: device.id,
      customerName: "Karim",
      startAt: at(18),
      endAt: at(20),
    });

    await updateReservationStatus(user, { reservationId: reservation.id, status: "seated" });
    await expect(
      updateReservationStatus(user, { reservationId: reservation.id, status: "no_show" }),
    ).rejects.toThrow(/à venir/i);
  });

  it("ouvre une intervention et passe l'appareil en maintenance", async () => {
    const { session: user } = await makeUser("technician");
    const device = await makeDevice({ status: "available" });

    const record = await createMaintenance(user, {
      deviceId: device.id,
      kind: "corrective",
      description: "Manette cassée",
      costCents: 150000,
    });

    expect(record.status).toBe("in_progress");
    const [savedDevice] = await db.select().from(devices).where(eq(devices.id, device.id));
    expect(savedDevice!.status).toBe("maintenance");
  });

  it("refuse deux interventions ouvertes sur le même appareil", async () => {
    const { session: user } = await makeUser("technician");
    const device = await makeDevice();

    await createMaintenance(user, { deviceId: device.id, kind: "corrective", description: "Manette cassée" });
    await expect(
      createMaintenance(user, { deviceId: device.id, kind: "preventive", description: "Nettoyage" }),
    ).rejects.toThrow(/déjà en cours/i);
  });

  it("clôture une intervention et libère l'appareil", async () => {
    const { session: user } = await makeUser("technician");
    const device = await makeDevice();

    const record = await createMaintenance(user, {
      deviceId: device.id,
      kind: "corrective",
      description: "Manette cassée",
    });

    await expect(
      completeMaintenance(user, { maintenanceId: record.id, resolution: "ok" }),
    ).rejects.toThrow(/compte rendu/i);

    await completeMaintenance(user, { maintenanceId: record.id, resolution: "Manette remplacée", costCents: 200000 });

    const [savedRecord] = await db.select().from(maintenanceRecords).where(eq(maintenanceRecords.id, record.id));
    expect(savedRecord!.status).toBe("done");
    expect(Number(savedRecord!.costCents)).toBe(200000);
    expect(savedRecord!.completedAt).not.toBeNull();

    const [savedDevice] = await db.select().from(devices).where(eq(devices.id, device.id));
    expect(savedDevice!.status).toBe("available");
  });
});
