import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customerRequests } from "@/db/schema";
import {
  createCustomerRequest,
  ensureRequestToken,
  getPublicRequestContext,
  setRequestStatus,
} from "@/lib/services/requests";
import { makeDevice, makeUser, resetDatabase } from "./helpers";

async function baseInput(overrides?: Partial<Parameters<typeof createCustomerRequest>[0]>) {
  const token = await ensureRequestToken();
  return {
    token,
    deviceId: null,
    customerName: "Sami",
    customerPhone: "",
    type: "assistance",
    note: "La manette 2 ne répond plus",
    ip: "10.0.0.1",
    ...overrides,
  };
}

describe("demandes client", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("génère un jeton public stable et rejette un jeton inconnu", async () => {
    const first = await ensureRequestToken();
    const second = await ensureRequestToken();
    expect(first).toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(16);

    const context = await getPublicRequestContext(first);
    expect(context?.businessName).toBe("LUNDER");

    expect(await getPublicRequestContext("jeton-invente-trop-long-123456")).toBeNull();
    expect(await getPublicRequestContext("")).toBeNull();
  });

  it("enregistre une demande avec l'appareil et l'IP", async () => {
    const device = await makeDevice();
    const created = await createCustomerRequest(
      await baseInput({ deviceId: device.id, ip: "192.168.1.20" }),
    );

    const [row] = await db
      .select()
      .from(customerRequests)
      .where(eq(customerRequests.id, created.id));

    expect(row!.status).toBe("pending");
    expect(row!.deviceId).toBe(device.id);
    expect(row!.sourceIp).toBe("192.168.1.20");
    expect(row!.note).toContain("manette");
  });

  it("refuse une demande vide, un type inconnu ou un appareil désactivé", async () => {
    await expect(createCustomerRequest(await baseInput({ note: "ok" }))).rejects.toThrow(/3 caractères/i);
    await expect(createCustomerRequest(await baseInput({ type: "pirate" }))).rejects.toThrow(/Type de demande/i);

    const device = await makeDevice({ isActive: false });
    await expect(createCustomerRequest(await baseInput({ deviceId: device.id }))).rejects.toThrow(
      /introuvable ou désactivé/i,
    );
  });

  it("limite le débit par IP et bloque le doublon sur un appareil", async () => {
    const device = await makeDevice();

    await createCustomerRequest(await baseInput({ deviceId: device.id, ip: "10.0.0.9" }));
    await expect(
      createCustomerRequest(await baseInput({ deviceId: device.id, ip: "10.0.0.9", note: "Encore" })),
    ).rejects.toThrow(/déjà en cours/i);

    for (let index = 0; index < 5; index += 1) {
      await createCustomerRequest(await baseInput({ ip: "10.0.0.7", note: `Demande ${index}` }));
    }
    await expect(
      createCustomerRequest(await baseInput({ ip: "10.0.0.7", note: "Trop de demandes" })),
    ).rejects.toThrow(/Trop de demandes/i);
  });

  it("impose le cycle prendre en charge puis traiter", async () => {
    const { row: user } = await makeUser("cashier");
    const created = await createCustomerRequest(await baseInput());

    await expect(
      setRequestStatus({ requestId: created.id, status: "done", userId: user.id }),
    ).rejects.toThrow(/Prenez d'abord/i);

    await setRequestStatus({ requestId: created.id, status: "in_progress", userId: user.id });
    const closed = await setRequestStatus({ requestId: created.id, status: "done", userId: user.id });

    expect(closed.status).toBe("done");
    expect(closed.handledBy).toBe(user.id);
    expect(closed.handledAt).not.toBeNull();

    await expect(
      setRequestStatus({ requestId: created.id, status: "in_progress", userId: user.id }),
    ).rejects.toThrow(/déjà clôturée/i);
  });
});
