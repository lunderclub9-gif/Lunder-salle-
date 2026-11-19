import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { gameSessions, shifts, users } from "@/db/schema";
import { can } from "@/lib/auth";
import { PERMISSIONS, ROLE_DEFAULTS } from "@/lib/permissions";
import { makeDevice, makeUser, resetDatabase } from "./helpers";

describe("autorisations et contraintes serveur", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("applique la matrice des permissions par rôle", () => {
    const cashier = {
      id: "1",
      fullName: "C",
      username: "c",
      role: "cashier" as const,
      isPrimaryOwner: false,
      permissions: new Set(ROLE_DEFAULTS.cashier),
    };
    const owner = { ...cashier, role: "owner" as const, permissions: new Set(ROLE_DEFAULTS.owner) };

    expect(can(cashier, PERMISSIONS.POS_SELL)).toBe(true);
    expect(can(cashier, PERMISSIONS.SESSIONS_MANAGE)).toBe(true);
    expect(can(cashier, PERMISSIONS.INVOICES_VIEW)).toBe(true);
    expect(can(cashier, PERMISSIONS.INVOICES_CANCEL)).toBe(false);
    expect(can(cashier, PERMISSIONS.STAFF_MANAGE)).toBe(false);
    expect(can(cashier, PERMISSIONS.SETTINGS_MANAGE)).toBe(false);
    expect(can(cashier, PERMISSIONS.AUDIT_VIEW)).toBe(false);
    expect(can(cashier, PERMISSIONS.CREDIT_MANAGE)).toBe(false);
    expect(can(cashier, PERMISSIONS.DISCOUNTS_APPLY)).toBe(false);

    expect(can(owner, PERMISSIONS.STAFF_MANAGE)).toBe(true);
    expect(can(owner, PERMISSIONS.AUDIT_VIEW)).toBe(true);
    expect(can(owner, PERMISSIONS.SETTINGS_MANAGE)).toBe(true);

    expect(can(null, PERMISSIONS.POS_SELL)).toBe(false);
  });

  it("le gérant ne dispose pas de la gestion des comptes ni des paramètres par défaut", () => {
    const manager = new Set(ROLE_DEFAULTS.manager);
    expect(manager.has(PERMISSIONS.STAFF_MANAGE)).toBe(false);
    expect(manager.has(PERMISSIONS.SETTINGS_MANAGE)).toBe(false);
    expect(manager.has(PERMISSIONS.CREDIT_MANAGE)).toBe(true);
    expect(manager.has(PERMISSIONS.DISCOUNTS_APPLY)).toBe(true);
  });

  it("la base refuse un second propriétaire principal", async () => {
    await makeUser("owner", { isPrimaryOwner: true, username: "proprio" });
    await expect(
      makeUser("owner", { isPrimaryOwner: true, username: "proprio2" }),
    ).rejects.toBeTruthy();

    const primaries = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(sql`${users.isPrimaryOwner} = true`);
    expect(primaries[0]?.count).toBe(1);
  });

  it("la base interdit deux sessions actives sur un appareil", async () => {
    const { row } = await makeUser("cashier");
    const device = await makeDevice();

    await db.insert(gameSessions).values({
      deviceId: device.id,
      employeeId: row.id,
      billingMode: "hourly",
      status: "running",
    });

    await expect(
      db.insert(gameSessions).values({
        deviceId: device.id,
        employeeId: row.id,
        billingMode: "hourly",
        status: "paused",
      }),
    ).rejects.toBeTruthy();
  });

  it("la base interdit deux caisses ouvertes pour un employé", async () => {
    const { row } = await makeUser("cashier");
    await db.insert(shifts).values({ userId: row.id, status: "open" });
    await expect(db.insert(shifts).values({ userId: row.id, status: "open" })).rejects.toBeTruthy();
  });

  it("ne stocke jamais de mot de passe en clair", async () => {
    const { row } = await makeUser("cashier");
    expect(row.passwordHash).not.toContain("TestPassword1");
    expect(row.passwordHash.startsWith("scrypt$")).toBe(true);
  });
});
