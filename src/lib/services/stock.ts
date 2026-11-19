import "server-only";
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { products, stockMovements, users, purchases, purchaseItems, supplierBalances } from "@/db/schema";
import { AppError } from "../errors";
import { logAudit, AUDIT_ACTIONS } from "../audit";
import type { SessionUser } from "../auth";
import { formatCents } from "../money";

export type StockAdjustmentType = "adjustment" | "loss" | "return";

/**
 * Ajustement manuel du stock (inventaire, casse, perte, retour).
 * Le stock n'est jamais écrasé : un mouvement signé est ajouté et le stock
 * est recalculé de façon atomique. Un stock négatif est refusé.
 */
export async function adjustStock(
  user: SessionUser,
  input: { productId: string; quantityDelta: number; type: StockAdjustmentType; reason: string; unitCostCents?: number },
) {
  const delta = Math.trunc(input.quantityDelta);
  if (delta === 0) throw new AppError("La quantité doit être différente de zéro.");
  if (input.reason.trim().length < 3) throw new AppError("Un motif est obligatoire pour ajuster le stock.");

  return db.transaction(async (tx) => {
    const [product] = await tx.select().from(products).where(eq(products.id, input.productId)).for("update");
    if (!product) throw new AppError("Produit introuvable.");

    const nextStock = Number(product.stockQuantity) + delta;
    if (nextStock < 0) {
      throw new AppError(`Stock insuffisant : il reste ${product.stockQuantity} unité(s) de ${product.name}.`);
    }

    const [updated] = await tx
      .update(products)
      .set({ stockQuantity: nextStock, updatedAt: new Date() })
      .where(eq(products.id, product.id))
      .returning({ stock: products.stockQuantity });

    await tx.insert(stockMovements).values({
      productId: product.id,
      type: input.type,
      quantity: delta,
      unitCostCents: Math.max(0, Math.round(input.unitCostCents ?? Number(product.costCents))),
      userId: user.id,
      reason: input.reason.trim().slice(0, 200),
      stockAfter: Number(updated!.stock),
    });

    await logAudit(
      {
        actorId: user.id,
        actorName: user.fullName,
        action: AUDIT_ACTIONS.STOCK_ADJUSTED,
        entityType: "product",
        entityId: product.id,
        before: { stock: Number(product.stockQuantity) },
        after: { stock: nextStock, delta, type: input.type },
        reason: input.reason.trim().slice(0, 200),
      },
      tx,
    );

    return { stock: nextStock, delta };
  });
}

/**
 * Annule un achat. Si l'achat a déjà été reçu, l'annulation écrit les
 * mouvements de stock inverses et diminue le solde fournisseur. Aucun
 * enregistrement n'est supprimé.
 */
export async function cancelPurchase(user: SessionUser, input: { purchaseId: string; reason: string }) {
  const reason = input.reason.trim();
  if (reason.length < 3) throw new AppError("Un motif est obligatoire pour annuler un achat.");

  return db.transaction(async (tx) => {
    const [purchase] = await tx.select().from(purchases).where(eq(purchases.id, input.purchaseId)).for("update");
    if (!purchase) throw new AppError("Achat introuvable.");
    if (purchase.status === "cancelled") throw new AppError("Cet achat est déjà annulé.");

    const items = await tx.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, purchase.id));

    if (purchase.status === "received") {
      for (const item of items) {
        const [product] = await tx.select().from(products).where(eq(products.id, item.productId)).for("update");
        if (!product) throw new AppError("Produit introuvable lors de l'annulation.");
        if (Number(product.stockQuantity) < Number(item.quantity)) {
          throw new AppError(
            `Stock insuffisant pour annuler : ${product.name} n'a plus que ${product.stockQuantity} unité(s).`,
          );
        }

        const [updated] = await tx
          .update(products)
          .set({ stockQuantity: sql`${products.stockQuantity} - ${Number(item.quantity)}`, updatedAt: new Date() })
          .where(eq(products.id, product.id))
          .returning({ stock: products.stockQuantity });

        await tx.insert(stockMovements).values({
          productId: product.id,
          type: "return",
          quantity: -Number(item.quantity),
          unitCostCents: Number(item.unitCostCents),
          purchaseId: purchase.id,
          userId: user.id,
          reason: `Annulation achat ${purchase.reference} — ${reason}`.slice(0, 200),
          stockAfter: Number(updated!.stock),
        });
      }

      const [balance] = await tx
        .select()
        .from(supplierBalances)
        .where(eq(supplierBalances.supplierId, purchase.supplierId))
        .for("update");
      if (!balance) throw new AppError("Solde fournisseur introuvable.");
      if (Number(balance.balanceCents) < Number(purchase.totalCents)) {
        throw new AppError(
          `Des paiements existent déjà sur cet achat (solde dû ${formatCents(Number(balance.balanceCents))}). Enregistrez un remboursement fournisseur avant d'annuler.`,
        );
      }

      await tx
        .update(supplierBalances)
        .set({
          totalPurchasesCents: sql`${supplierBalances.totalPurchasesCents} - ${Number(purchase.totalCents)}`,
          balanceCents: sql`${supplierBalances.balanceCents} - ${Number(purchase.totalCents)}`,
          updatedAt: new Date(),
        })
        .where(eq(supplierBalances.supplierId, purchase.supplierId));
    }

    await tx.update(purchases).set({ status: "cancelled" }).where(eq(purchases.id, purchase.id));

    await logAudit(
      {
        actorId: user.id,
        actorName: user.fullName,
        action: AUDIT_ACTIONS.PURCHASE_CANCELLED,
        entityType: "purchase",
        entityId: purchase.id,
        before: { status: purchase.status },
        after: { status: "cancelled", reversedStock: purchase.status === "received" },
        reason: reason.slice(0, 200),
      },
      tx,
    );

    return { status: "cancelled" as const, stockReversed: purchase.status === "received" };
  });
}

export async function listStockMovements(limit = 100, productId?: string) {
  const query = db
    .select({
      movement: stockMovements,
      productName: products.name,
      employeeName: users.fullName,
    })
    .from(stockMovements)
    .leftJoin(products, eq(products.id, stockMovements.productId))
    .leftJoin(users, eq(users.id, stockMovements.userId))
    .orderBy(desc(stockMovements.createdAt));

  if (productId) {
    return query.where(eq(stockMovements.productId, productId)).limit(limit);
  }
  return query.limit(limit);
}

export async function listLowStockProducts() {
  return db
    .select()
    .from(products)
    .where(and(eq(products.isActive, true), lte(products.stockQuantity, products.minStock)))
    .orderBy(products.stockQuantity, products.name);
}

export async function getStockValue() {
  const [row] = await db
    .select({
      units: sql<number>`coalesce(sum(${products.stockQuantity}), 0)::int`,
      costValueCents: sql<number>`coalesce(sum(${products.stockQuantity} * ${products.costCents}), 0)::bigint`,
      saleValueCents: sql<number>`coalesce(sum(${products.stockQuantity} * ${products.priceCents}), 0)::bigint`,
    })
    .from(products)
    .where(eq(products.isActive, true));

  return {
    units: Number(row?.units ?? 0),
    costValueCents: Number(row?.costValueCents ?? 0),
    saleValueCents: Number(row?.saleValueCents ?? 0),
  };
}
