import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { suppliers, supplierBalances, purchases, purchaseItems, products, stockMovements, supplierPayments, users } from "@/db/schema";
import { AppError } from "../errors";
import { logAudit, AUDIT_ACTIONS } from "../audit";
import type { SessionUser } from "../auth";
import { formatCents } from "../money";

export async function createSupplier(user: SessionUser, input: { name: string; contact?: string; phone?: string; notes?: string }) {
  if (input.name.trim().length < 2) throw new AppError("Le nom du fournisseur est obligatoire.");

  return db.transaction(async (tx) => {
    const [supplier] = await tx
      .insert(suppliers)
      .values({
        name: input.name.trim().slice(0, 120),
        contact: (input.contact ?? "").trim().slice(0, 200),
        phone: (input.phone ?? "").trim().slice(0, 30),
        notes: (input.notes ?? "").trim().slice(0, 500),
      })
      .returning();

    await tx.insert(supplierBalances).values({ supplierId: supplier!.id });

    await logAudit(
      {
        actorId: user.id,
        actorName: user.fullName,
        action: AUDIT_ACTIONS.SUPPLIER_CREATED,
        entityType: "supplier",
        entityId: supplier!.id,
        after: { name: supplier!.name },
      },
      tx,
    );

    return supplier!;
  });
}

export async function createPurchase(
  user: SessionUser,
  input: {
    supplierId: string;
    items: Array<{ productId: string; quantity: number; unitCostCents: number }>;
    reference?: string;
    notes?: string;
  },
) {
  const items = input.items.map((item) => ({
    ...item,
    quantity: Math.max(1, Math.floor(item.quantity)),
    unitCostCents: Math.round(item.unitCostCents),
  }));
  if (items.length === 0) throw new AppError("Ajoutez au moins un article.");
  if (items.some((item) => item.unitCostCents < 0)) throw new AppError("Les coûts ne peuvent pas être négatifs.");

  return db.transaction(async (tx) => {
    const supplier = await tx.select().from(suppliers).where(eq(suppliers.id, input.supplierId)).limit(1);
    if (!supplier[0]) throw new AppError("Fournisseur introuvable.");

    const lines: Array<{ productId: string; quantity: number; unitCostCents: number; lineTotalCents: number }> = [];
    for (const item of items) {
      const product = await tx.select().from(products).where(eq(products.id, item.productId)).limit(1);
      if (!product[0]) throw new AppError("Produit introuvable.");
      lines.push({
        productId: item.productId,
        quantity: item.quantity,
        unitCostCents: item.unitCostCents,
        lineTotalCents: item.quantity * item.unitCostCents,
      });
    }

    const totalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);

    const [purchase] = await tx
      .insert(purchases)
      .values({
        supplierId: supplier[0]!.id,
        reference: (input.reference ?? "").trim().slice(0, 120) || `ACH-${Date.now().toString(36).slice(-8).toUpperCase()}`,
        employeeId: user.id,
        totalCents,
        notes: (input.notes ?? "").trim().slice(0, 500),
      })
      .returning();

    await tx.insert(purchaseItems).values(
      lines.map((line) => ({
        purchaseId: purchase!.id,
        productId: line.productId,
        quantity: line.quantity,
        unitCostCents: line.unitCostCents,
        lineTotalCents: line.lineTotalCents,
      })),
    );

    await logAudit(
      {
        actorId: user.id,
        actorName: user.fullName,
        action: AUDIT_ACTIONS.PURCHASE_CREATED,
        entityType: "purchase",
        entityId: purchase!.id,
        after: { supplierId: supplier[0]!.id, totalCents, itemCount: lines.length },
      },
      tx,
    );

    return { id: purchase!.id, totalCents, status: "pending" as const };
  });
}

export async function receivePurchase(user: SessionUser, input: { purchaseId: string; notes?: string }) {
  return db.transaction(async (tx) => {
    const [purchase] = await tx
      .select()
      .from(purchases)
      .where(and(eq(purchases.id, input.purchaseId), eq(purchases.status, "pending")))
      .for("update");
    if (!purchase) throw new AppError("Achat introuvable ou déjà traité.");

    const items = await tx.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, purchase.id));

    for (const item of items) {
      const updated = await tx
        .update(products)
        .set({
          stockQuantity: sql`${products.stockQuantity} + ${item.quantity}`,
        })
        .where(eq(products.id, item.productId))
        .returning({ stock: products.stockQuantity });

      if (updated.length === 0) throw new AppError("Produit introuvable lors de la réception.");

      await tx.insert(stockMovements).values({
        productId: item.productId,
        type: "purchase",
        quantity: item.quantity,
        unitCostCents: item.unitCostCents,
        purchaseId: purchase.id,
        userId: user.id,
        reason: `Réception achat ${purchase.reference}`,
        stockAfter: Number(updated[0]!.stock),
      });
    }

    await tx
      .update(purchases)
      .set({
        status: "received",
        notes: (input.notes ?? "").trim().slice(0, 500),
      })
      .where(eq(purchases.id, purchase.id));

    const [balance] = await tx
      .select()
      .from(supplierBalances)
      .where(eq(supplierBalances.supplierId, purchase.supplierId))
      .for("update");
    if (!balance) throw new AppError("Solde fournisseur introuvable.");

    await tx
      .update(supplierBalances)
      .set({
        totalPurchasesCents: sql`${supplierBalances.totalPurchasesCents} + ${purchase.totalCents}`,
        balanceCents: sql`${supplierBalances.balanceCents} + ${purchase.totalCents}`,
      })
      .where(eq(supplierBalances.supplierId, purchase.supplierId));

    await logAudit(
      {
        actorId: user.id,
        actorName: user.fullName,
        action: AUDIT_ACTIONS.PURCHASE_RECEIVED,
        entityType: "purchase",
        entityId: purchase.id,
        after: { status: "received", totalCents: purchase.totalCents },
      },
      tx,
    );

    return { status: "received" as const };
  });
}

export async function recordSupplierPayment(
  user: SessionUser,
  input: { supplierId: string; amountCents: number; method: "cash" | "card" | "transfer"; reference?: string; notes?: string; purchaseId?: string },
) {
  const amount = Math.round(input.amountCents);
  if (amount <= 0) throw new AppError("Le montant doit être positif.");

  return db.transaction(async (tx) => {
    const supplier = await tx.select().from(suppliers).where(eq(suppliers.id, input.supplierId)).limit(1);
    if (!supplier[0]) throw new AppError("Fournisseur introuvable.");

    const balanceRows = await tx.select().from(supplierBalances).where(eq(supplierBalances.supplierId, supplier[0]!.id)).for("update");
    const balance = balanceRows[0];
    if (!balance) throw new AppError("Solde fournisseur introuvable.");
    if (Number(balance.balanceCents) < amount) throw new AppError(`Le solde dû est de ${formatCents(Number(balance.balanceCents))}.`);

    const [payment] = await tx
      .insert(supplierPayments)
      .values({
        supplierId: supplier[0]!.id,
        purchaseId: input.purchaseId ?? null,
        status: "paid",
        amountCents: amount,
        reference: (input.reference ?? "").trim().slice(0, 120),
        notes: (input.notes ?? "").trim().slice(0, 500),
        paidBy: user.id,
      })
      .returning();

    await tx
      .update(supplierBalances)
      .set({
        totalPaidCents: sql`${supplierBalances.totalPaidCents} + ${amount}`,
        balanceCents: sql`${supplierBalances.balanceCents} - ${amount}`,
      })
      .where(eq(supplierBalances.supplierId, supplier[0]!.id));

    await logAudit(
      {
        actorId: user.id,
        actorName: user.fullName,
        action: AUDIT_ACTIONS.SUPPLIER_PAYMENT_RECORDED,
        entityType: "supplier_payment",
        entityId: payment!.id,
        after: { supplierId: supplier[0]!.id, amountCents: amount, method: input.method },
      },
      tx,
    );

    return { id: payment!.id, status: "paid" as const };
  });
}

export async function getSupplierBalance(supplierId: string) {
  const rows = await db.select().from(supplierBalances).where(eq(supplierBalances.supplierId, supplierId)).limit(1);
  return rows[0] ?? null;
}

export async function listSuppliers() {
  return db.select().from(suppliers).orderBy(suppliers.name);
}

export async function listPurchases(limit = 100) {
  return db
    .select({
      purchase: purchases,
      supplierName: suppliers.name,
      employeeName: users.fullName,
    })
    .from(purchases)
    .leftJoin(suppliers, eq(suppliers.id, purchases.supplierId))
    .leftJoin(users, eq(users.id, purchases.employeeId))
    .orderBy(purchases.createdAt)
    .limit(limit);
}

export async function listSupplierPayments(supplierId: string) {
  return db
    .select({
      payment: supplierPayments,
      purchaseReference: purchases.reference,
      paidByName: users.fullName,
    })
    .from(supplierPayments)
    .leftJoin(purchases, eq(purchases.id, supplierPayments.purchaseId))
    .leftJoin(users, eq(users.id, supplierPayments.paidBy))
    .where(eq(supplierPayments.supplierId, supplierId))
    .orderBy(supplierPayments.createdAt);
}
