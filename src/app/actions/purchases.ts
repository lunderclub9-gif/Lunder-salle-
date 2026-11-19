"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { userMessage } from "@/lib/errors";
import type { ActionState } from "@/lib/action-state";
import { createSupplier, createPurchase, receivePurchase, recordSupplierPayment } from "@/lib/services/purchases";
import { toCents } from "@/lib/money";

export async function createSupplierAction(_prev: ActionState, formData: FormData): Promise<ActionState & { supplierId?: string }> {
  try {
    const user = await authorize(PERMISSIONS.SUPPLIERS_MANAGE);
    const name = String(formData.get("name") ?? "").trim();
    const contact = String(formData.get("contact") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();

    const supplier = await createSupplier(user, { name, contact, phone, notes });
    revalidatePath("/fournisseurs");
    return { ok: true, message: "Fournisseur créé.", supplierId: supplier.id };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function createPurchaseAction(_prev: ActionState, formData: FormData): Promise<ActionState & { purchaseId?: string }> {
  try {
    const user = await authorize(PERMISSIONS.PURCHASES_MANAGE);
    const supplierId = String(formData.get("supplierId") ?? "");
    const itemCount = Number(formData.get("itemCount") ?? "0") || 0;
    const items: Array<{ productId: string; quantity: number; unitCostCents: number }> = [];
    for (let i = 0; i < itemCount; i++) {
      const productId = String(formData.get(`productId-${i}`) ?? "");
      const quantity = Number(formData.get(`quantity-${i}`) ?? "0") || 0;
      const unitCostCents = toCents(String(formData.get(`cost-${i}`) ?? "0") || "0");
      if (productId && quantity > 0) items.push({ productId, quantity, unitCostCents });
    }
    const reference = String(formData.get("reference") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();

    const result = await createPurchase(user, { supplierId, items, reference, notes });
    revalidatePath("/achats");
    return { ok: true, message: "Achat créé (en attente de réception).", purchaseId: result.id };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function receivePurchaseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.PURCHASES_MANAGE);
    const purchaseId = String(formData.get("purchaseId") ?? "");
    const notes = String(formData.get("notes") ?? "").trim();

    await receivePurchase(user, { purchaseId, notes });
    revalidatePath("/achats");
    revalidatePath("/produits");
    revalidatePath("/tableau-de-bord");
    return { ok: true, message: "Achat reçu : le stock a été augmenté et le fournisseur crédité." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function recordSupplierPaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.PURCHASES_MANAGE);
    const supplierId = String(formData.get("supplierId") ?? "");
    const amountCents = toCents(String(formData.get("amount") ?? "0") || "0");
    const method = (String(formData.get("method") ?? "cash")) as "cash" | "card" | "transfer";
    const reference = String(formData.get("reference") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();
    const purchaseId = String(formData.get("purchaseId") ?? "") || undefined;

    await recordSupplierPayment(user, { supplierId, amountCents, method, reference, notes, purchaseId });
    revalidatePath("/fournisseurs");
    revalidatePath("/achats");
    return { ok: true, message: "Paiement fournisseur enregistré." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
