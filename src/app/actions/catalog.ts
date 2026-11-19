"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  deviceStatusHistory,
  devices,
  gameSessions,
  productCategories,
  products,
  stockMovements,
} from "@/db/schema";
import { authorize } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { AppError, userMessage } from "@/lib/errors";
import type { ActionState } from "@/lib/action-state";
import { AUDIT_ACTIONS, logAuditFromRequest } from "@/lib/audit";
import { centsToInput, toCents } from "@/lib/money";
import { and, inArray } from "drizzle-orm";

/* ------------------------------ Produits ------------------------------ */

export async function createProductAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.PRODUCTS_MANAGE);
    const name = String(formData.get("name") ?? "").trim();
    if (name.length < 2) throw new AppError("Le nom du produit est obligatoire.");

    const priceCents = toCents(String(formData.get("price") ?? "0") || "0");
    const costCents = toCents(String(formData.get("cost") ?? "0") || "0");
    const stock = Math.max(0, Math.floor(Number(formData.get("stock") ?? 0) || 0));
    if (priceCents < 0 || costCents < 0) throw new AppError("Les montants ne peuvent pas être négatifs.");

    const categoryName = String(formData.get("category") ?? "").trim();
    let categoryId: string | null = null;
    if (categoryName) {
      const existing = await db
        .select()
        .from(productCategories)
        .where(eq(productCategories.name, categoryName))
        .limit(1);
      if (existing[0]) categoryId = existing[0].id;
      else {
        const [created] = await db.insert(productCategories).values({ name: categoryName }).returning();
        categoryId = created!.id;
      }
    }

    const [product] = await db
      .insert(products)
      .values({
        name: name.slice(0, 120),
        sku: String(formData.get("sku") ?? "").trim().slice(0, 60),
        barcode: String(formData.get("barcode") ?? "").trim().slice(0, 60),
        categoryId,
        priceCents,
        costCents,
        stockQuantity: stock,
        unitsPerCarton: Math.max(1, Math.floor(Number(formData.get("unitsPerCarton") ?? 1) || 1)),
        minStock: Math.max(0, Math.floor(Number(formData.get("minStock") ?? 0) || 0)),
        description: String(formData.get("description") ?? "").slice(0, 500),
      })
      .returning();

    if (stock > 0) {
      await db.insert(stockMovements).values({
        productId: product!.id,
        type: "initial",
        quantity: stock,
        unitCostCents: costCents,
        userId: user.id,
        reason: "Stock initial",
        stockAfter: stock,
      });
    }

    await logAuditFromRequest({
      actorId: user.id,
      actorName: user.fullName,
      action: AUDIT_ACTIONS.PRODUCT_CREATED,
      entityType: "product",
      entityId: product!.id,
      after: { name: product!.name, priceCents, costCents, stock },
    });

    revalidatePath("/produits");
    revalidatePath("/caisse");
    return { ok: true, message: `Produit « ${product!.name} » créé.` };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function updateProductAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.PRODUCTS_MANAGE);
    const id = String(formData.get("productId") ?? "");
    const [before] = await db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!before) throw new AppError("Produit introuvable.");

    const name = String(formData.get("name") ?? "").trim();
    if (name.length < 2) throw new AppError("Le nom du produit est obligatoire.");

    const priceCents = toCents(String(formData.get("price") ?? "0") || "0");
    const costCents = toCents(String(formData.get("cost") ?? "0") || "0");

    const [updated] = await db
      .update(products)
      .set({
        name: name.slice(0, 120),
        sku: String(formData.get("sku") ?? "").trim().slice(0, 60),
        barcode: String(formData.get("barcode") ?? "").trim().slice(0, 60),
        priceCents,
        costCents,
        minStock: Math.max(0, Math.floor(Number(formData.get("minStock") ?? 0) || 0)),
        unitsPerCarton: Math.max(1, Math.floor(Number(formData.get("unitsPerCarton") ?? 1) || 1)),
        description: String(formData.get("description") ?? "").slice(0, 500),
        isActive: formData.get("isActive") === "on",
        updatedAt: new Date(),
      })
      .where(eq(products.id, id))
      .returning();

    await logAuditFromRequest({
      actorId: user.id,
      actorName: user.fullName,
      action: AUDIT_ACTIONS.PRODUCT_UPDATED,
      entityType: "product",
      entityId: id,
      before: {
        name: before.name,
        priceCents: before.priceCents,
        costCents: before.costCents,
        minStock: before.minStock,
        isActive: before.isActive,
      },
      after: {
        name: updated!.name,
        priceCents,
        costCents,
        minStock: updated!.minStock,
        isActive: updated!.isActive,
      },
    });

    revalidatePath("/produits");
    revalidatePath("/caisse");
    return { ok: true, message: "Produit mis à jour." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

/* ------------------------------ Appareils ----------------------------- */

function parseBillingMode(value: string): "hourly" | "match" | "fixed" {
  return value === "match" || value === "fixed" ? value : "hourly";
}

function parseRounding(value: string): "up" | "nearest" | "none" {
  return value === "nearest" || value === "none" ? value : "up";
}

export async function createDeviceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.DEVICES_MANAGE);
    const name = String(formData.get("name") ?? "").trim();
    if (name.length < 2) throw new AppError("Le nom de l'appareil est obligatoire.");

    const [device] = await db
      .insert(devices)
      .values({
        name: name.slice(0, 80),
        type: (String(formData.get("type") ?? "playstation") as "playstation" | "billiard" | "other") ?? "playstation",
        location: String(formData.get("location") ?? "").slice(0, 80),
        billingMode: parseBillingMode(String(formData.get("billingMode") ?? "hourly")),
        hourlyRateCents: toCents(String(formData.get("hourlyRate") ?? "0") || "0"),
        matchRateCents: toCents(String(formData.get("matchRate") ?? "0") || "0"),
        fixedRateCents: toCents(String(formData.get("fixedRate") ?? "0") || "0"),
        minBillableMinutes: Math.max(0, Math.floor(Number(formData.get("minBillableMinutes") ?? 0) || 0)),
        billingIncrementMinutes: Math.max(1, Math.floor(Number(formData.get("increment") ?? 60) || 60)),
        rounding: parseRounding(String(formData.get("rounding") ?? "up")),
        sortOrder: Math.floor(Number(formData.get("sortOrder") ?? 0) || 0),
      })
      .returning();

    await logAuditFromRequest({
      actorId: user.id,
      actorName: user.fullName,
      action: AUDIT_ACTIONS.DEVICE_UPDATED,
      entityType: "device",
      entityId: device!.id,
      after: { name: device!.name, billingMode: device!.billingMode },
    });

    revalidatePath("/appareils");
    revalidatePath("/sessions");
    return { ok: true, message: `Appareil « ${device!.name} » créé.` };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function updateDeviceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.DEVICES_MANAGE);
    const id = String(formData.get("deviceId") ?? "");
    const [before] = await db.select().from(devices).where(eq(devices.id, id)).limit(1);
    if (!before) throw new AppError("Appareil introuvable.");

    const name = String(formData.get("name") ?? "").trim();
    if (name.length < 2) throw new AppError("Le nom de l'appareil est obligatoire.");

    const [updated] = await db
      .update(devices)
      .set({
        name: name.slice(0, 80),
        type: (String(formData.get("type") ?? before.type) as "playstation" | "billiard" | "other"),
        location: String(formData.get("location") ?? "").slice(0, 80),
        billingMode: parseBillingMode(String(formData.get("billingMode") ?? "hourly")),
        hourlyRateCents: toCents(String(formData.get("hourlyRate") ?? "0") || "0"),
        matchRateCents: toCents(String(formData.get("matchRate") ?? "0") || "0"),
        fixedRateCents: toCents(String(formData.get("fixedRate") ?? "0") || "0"),
        minBillableMinutes: Math.max(0, Math.floor(Number(formData.get("minBillableMinutes") ?? 0) || 0)),
        billingIncrementMinutes: Math.max(1, Math.floor(Number(formData.get("increment") ?? 60) || 60)),
        rounding: parseRounding(String(formData.get("rounding") ?? "up")),
        isActive: formData.get("isActive") === "on",
        notes: String(formData.get("notes") ?? "").slice(0, 500),
        sortOrder: Math.floor(Number(formData.get("sortOrder") ?? 0) || 0),
        updatedAt: new Date(),
      })
      .where(eq(devices.id, id))
      .returning();

    await logAuditFromRequest({
      actorId: user.id,
      actorName: user.fullName,
      action: AUDIT_ACTIONS.DEVICE_UPDATED,
      entityType: "device",
      entityId: id,
      before: {
        name: before.name,
        hourlyRateCents: before.hourlyRateCents,
        billingMode: before.billingMode,
        isActive: before.isActive,
      },
      after: {
        name: updated!.name,
        hourlyRateCents: updated!.hourlyRateCents,
        billingMode: updated!.billingMode,
        isActive: updated!.isActive,
      },
      reason: `Tarif horaire : ${centsToInput(Number(before.hourlyRateCents))} → ${centsToInput(Number(updated!.hourlyRateCents))}`,
    });

    revalidatePath("/appareils");
    revalidatePath("/sessions");
    return { ok: true, message: "Appareil mis à jour." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function setDeviceStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.DEVICES_MANAGE);
    const id = String(formData.get("deviceId") ?? "");
    const status = String(formData.get("status") ?? "");
    if (!["available", "maintenance", "out_of_service"].includes(status)) {
      throw new AppError("Statut invalide.");
    }

    const active = await db
      .select({ id: gameSessions.id })
      .from(gameSessions)
      .where(
        and(eq(gameSessions.deviceId, id), inArray(gameSessions.status, ["running", "paused"])),
      )
      .limit(1);
    if (active.length > 0) {
      throw new AppError("Terminez la session en cours avant de changer le statut.");
    }

    const [before] = await db.select().from(devices).where(eq(devices.id, id)).limit(1);
    if (!before) throw new AppError("Appareil introuvable.");

    await db
      .update(devices)
      .set({ status: status as "available" | "maintenance" | "out_of_service", updatedAt: new Date() })
      .where(eq(devices.id, id));

    await db.insert(deviceStatusHistory).values({
      deviceId: id,
      fromStatus: before.status,
      toStatus: status as "available" | "maintenance" | "out_of_service",
      changedBy: user.id,
      reason: String(formData.get("reason") ?? "").slice(0, 200),
    });

    await logAuditFromRequest({
      actorId: user.id,
      actorName: user.fullName,
      action: AUDIT_ACTIONS.DEVICE_STATUS,
      entityType: "device",
      entityId: id,
      before: { status: before.status },
      after: { status },
      reason: String(formData.get("reason") ?? ""),
    });

    revalidatePath("/appareils");
    revalidatePath("/sessions");
    return { ok: true, message: "Statut mis à jour." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
