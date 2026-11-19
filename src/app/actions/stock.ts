"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { userMessage } from "@/lib/errors";
import type { ActionState } from "@/lib/action-state";
import { adjustStock, cancelPurchase, type StockAdjustmentType } from "@/lib/services/stock";

export async function adjustStockAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.PRODUCTS_MANAGE);
    const productId = String(formData.get("productId") ?? "");
    const quantity = Number(formData.get("quantity") ?? "0") || 0;
    const direction = String(formData.get("direction") ?? "out") === "in" ? 1 : -1;
    const type = String(formData.get("type") ?? "adjustment") as StockAdjustmentType;
    const reason = String(formData.get("reason") ?? "").trim();

    const result = await adjustStock(user, { productId, quantityDelta: direction * quantity, type, reason });
    revalidatePath("/stock");
    revalidatePath("/produits");
    revalidatePath("/tableau-de-bord");
    return { ok: true, message: `Stock mis à jour : ${result.stock} unité(s).` };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function cancelPurchaseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.PURCHASES_MANAGE);
    const purchaseId = String(formData.get("purchaseId") ?? "");
    const reason = String(formData.get("reason") ?? "").trim();

    const result = await cancelPurchase(user, { purchaseId, reason });
    revalidatePath("/achats");
    revalidatePath("/stock");
    revalidatePath("/fournisseurs");
    revalidatePath("/produits");
    revalidatePath("/tableau-de-bord");
    return {
      ok: true,
      message: result.stockReversed
        ? "Achat annulé : stock et solde fournisseur contre-passés."
        : "Achat annulé.",
    };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
