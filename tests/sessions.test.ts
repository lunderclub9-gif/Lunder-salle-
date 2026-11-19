import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { gameSessions, sessionEvents, devices } from "@/db/schema";
import {
  endSession,
  pauseSession,
  resumeSession,
  startSession,
  transferSession,
} from "@/lib/services/sessions";
import { makeDevice, makeUser, resetDatabase } from "./helpers";

describe("sessions de jeu", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("interdit deux sessions actives sur le même appareil", async () => {
    const { session: user } = await makeUser("cashier");
    const device = await makeDevice();

    await startSession(user, { deviceId: device.id });
    await expect(startSession(user, { deviceId: device.id })).rejects.toThrow(/déjà occupé/i);

    const rows = await db.select().from(gameSessions).where(eq(gameSessions.deviceId, device.id));
    expect(rows).toHaveLength(1);
  });

  it("applique le tarif figé au démarrage malgré un changement de prix", async () => {
    const { session: user } = await makeUser("cashier");
    const device = await makeDevice({ hourlyRateCents: 6000 });

    const session = await startSession(user, { deviceId: device.id });
    await db.update(devices).set({ hourlyRateCents: 9000 }).where(eq(devices.id, device.id));

    const [stored] = await db.select().from(gameSessions).where(eq(gameSessions.id, session.id));
    expect(Number(stored!.hourlyRateCents)).toBe(6000);
  });

  it("exclut la pause de la facturation et conserve l'historique", async () => {
    const { session: user } = await makeUser("cashier");
    const device = await makeDevice({ hourlyRateCents: 6000, billingIncrementMinutes: 60 });

    const session = await startSession(user, { deviceId: device.id });

    // Simule une session démarrée il y a 90 minutes.
    await db
      .update(gameSessions)
      .set({ startedAt: new Date(Date.now() - 90 * 60_000) })
      .where(eq(gameSessions.id, session.id));

    await pauseSession(user, session.id);
    await db
      .update(gameSessions)
      .set({ pausedAt: new Date(Date.now() - 30 * 60_000) })
      .where(eq(gameSessions.id, session.id));
    await resumeSession(user, session.id);

    const { billing } = await endSession(user, session.id);

    expect(billing.pausedSeconds).toBeGreaterThanOrEqual(1790);
    expect(billing.billableMinutes).toBeLessThanOrEqual(61);
    expect(billing.chargedMinutes).toBe(60);
    expect(billing.amountCents).toBe(6000);

    const events = await db.select().from(sessionEvents).where(eq(sessionEvents.sessionId, session.id));
    expect(events.map((event) => event.type)).toEqual(["start", "pause", "resume", "end"]);

    const [deviceAfter] = await db.select().from(devices).where(eq(devices.id, device.id));
    expect(deviceAfter!.status).toBe("available");
  });

  it("est idempotent lors d'une double clôture", async () => {
    const { session: user } = await makeUser("cashier");
    const device = await makeDevice();

    const session = await startSession(user, { deviceId: device.id });
    const first = await endSession(user, session.id);
    const second = await endSession(user, session.id);

    expect(second.billing.amountCents).toBe(first.billing.amountCents);

    const events = await db.select().from(sessionEvents).where(eq(sessionEvents.sessionId, session.id));
    expect(events.filter((event) => event.type === "end")).toHaveLength(1);
  });

  it("transfère une session sans remettre le chronomètre à zéro", async () => {
    const { session: user } = await makeUser("cashier");
    const source = await makeDevice({ name: "PS source" });
    const target = await makeDevice({ name: "PS cible" });

    const session = await startSession(user, { deviceId: source.id });
    const startedAt = new Date(Date.now() - 45 * 60_000);
    await db.update(gameSessions).set({ startedAt }).where(eq(gameSessions.id, session.id));

    const moved = await transferSession(user, { sessionId: session.id, targetDeviceId: target.id });

    expect(new Date(moved.startedAt).getTime()).toBe(startedAt.getTime());
    expect(moved.deviceId).toBe(target.id);
    expect(moved.transferFromSessionId).toBe(session.id);

    const [old] = await db.select().from(gameSessions).where(eq(gameSessions.id, session.id));
    expect(old!.status).toBe("ended");
    expect(old!.computedAmountCents).toBeNull();

    const [oldDevice] = await db.select().from(devices).where(eq(devices.id, source.id));
    expect(oldDevice!.status).toBe("available");
    const [newDevice] = await db.select().from(devices).where(eq(devices.id, target.id));
    expect(newDevice!.status).toBe("occupied");
  });

  it("refuse de transférer vers un appareil en maintenance", async () => {
    const { session: user } = await makeUser("cashier");
    const source = await makeDevice();
    const target = await makeDevice({ status: "maintenance" });

    const session = await startSession(user, { deviceId: source.id });
    await expect(
      transferSession(user, { sessionId: session.id, targetDeviceId: target.id }),
    ).rejects.toThrow(/indisponible/i);
  });

  it("refuse de démarrer un appareil désactivé ou en maintenance", async () => {
    const { session: user } = await makeUser("cashier");
    const inactive = await makeDevice({ isActive: false });
    const maintenance = await makeDevice({ status: "maintenance" });

    await expect(startSession(user, { deviceId: inactive.id })).rejects.toThrow(/désactivé/i);
    await expect(startSession(user, { deviceId: maintenance.id })).rejects.toThrow(/maintenance/i);
  });
});
