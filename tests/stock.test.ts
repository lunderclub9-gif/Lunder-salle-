import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { products, purchases, stockMovements } from "@/db/schema";
import { adjustStock, cancelPurchase } from "@/lib/services/stock";
import { createPurchase, createSupplier, getSupplierBalance, receivePurchase, recordSupplierPayment } from "@/lib/services/purchases";
import { resetDatabase, makeUser, makeProduct } from "./helpers";

describe("phase 3 — ajustements de stock et annulation d'achat", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("décrémente le stock avec un mouvement signé et un motif", async () => {
    const { session: user } = await makeUser("manager");
    const product = await makeProduct({ stockQuantity: 10 });

    const result = await adjustStock(user, {
      productId: product.id,
      quantityDelta: -3,
      type: "loss",
      reason: "Bouteilles cassées",
    });

    expect(result.stock).toBe(7);
    const movements = await db.select().from(stockMovements).where(eq(stockMovements.productId, product.id));
    expect(movements).toHaveLength(1);
    expect(movements[0]!.type).toBe("loss");
    expect(Number(movements[0]!.quantity)).toBe(-3);
    expect(Number(movements[0]!.stockAfter)).toBe(7);
    expect(movements[0]!.reason).toContain("cassées");
  });

  it("refuse un ajustement qui rendrait le stock négatif", async () => {
    const { session: user } = await makeUser("manager");
    const product = await makeProduct({ stockQuantity: 2 });

    await expect(
      adjustStock(user, { productId: product.id, quantityDelta: -5, type: "loss", reason: "Test" }),
    ).rejects.toThrow(/insuffisant/i);

    const [saved] = await db.select().from(products).where(eq(products.id, product.id));
    expect(Number(saved!.stockQuantity)).toBe(2);
    expect(await db.select().from(stockMovements).where(eq(stockMovements.productId, product.id))).toHaveLength(0);
  });

  it("exige un motif et une quantité non nulle", async () => {
    const { session: user } = await makeUser("manager");
    const product = await makeProduct({ stockQuantity: 5 });

    await expect(
      adjustStock(user, { productId: product.id, quantityDelta: 1, type: "adjustment", reason: "ab" }),
    ).rejects.toThrow(/motif/i);
    await expect(
      adjustStock(user, { productId: product.id, quantityDelta: 0, type: "adjustment", reason: "Inventaire" }),
    ).rejects.toThrow(/zéro/i);
  });

  it("annule un achat en attente sans toucher au stock ni au solde", async () => {
    const { session: user } = await makeUser("manager");
    const supplier = await createSupplier(user, { name: "Fournisseur Test" });
    const product = await makeProduct({ stockQuantity: 1 });

    const purchase = await createPurchase(user, {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: 4, unitCostCents: 1000 }],
    });

    const result = await cancelPurchase(user, { purchaseId: purchase.id, reason: "Commande erronée" });
    expect(result.stockReversed).toBe(false);

    const [saved] = await db.select().from(purchases).where(eq(purchases.id, purchase.id));
    expect(saved!.status).toBe("cancelled");
    const [updatedProduct] = await db.select().from(products).where(eq(products.id, product.id));
    expect(Number(updatedProduct!.stockQuantity)).toBe(1);
    expect(Number((await getSupplierBalance(supplier.id))!.balanceCents)).toBe(0);
  });

  it("annule un achat reçu : stock et solde fournisseur contre-passés", async () => {
    const { session: user } = await makeUser("manager");
    const supplier = await createSupplier(user, { name: "Fournisseur Test" });
    const product = await makeProduct({ stockQuantity: 0 });

    const purchase = await createPurchase(user, {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: 6, unitCostCents: 500 }],
    });
    await receivePurchase(user, { purchaseId: purchase.id });

    const result = await cancelPurchase(user, { purchaseId: purchase.id, reason: "Produits défectueux" });
    expect(result.stockReversed).toBe(true);

    const [updatedProduct] = await db.select().from(products).where(eq(products.id, product.id));
    expect(Number(updatedProduct!.stockQuantity)).toBe(0);

    const balance = await getSupplierBalance(supplier.id);
    expect(Number(balance!.totalPurchasesCents)).toBe(0);
    expect(Number(balance!.balanceCents)).toBe(0);

    const movements = await db.select().from(stockMovements).where(eq(stockMovements.purchaseId, purchase.id));
    expect(movements).toHaveLength(2);
    const reversal = movements.find((m) => m.type === "return")!;
    expect(Number(reversal.quantity)).toBe(-6);
    expect(reversal.reason).toContain("Annulation");

    await expect(cancelPurchase(user, { purchaseId: purchase.id, reason: "Encore" })).rejects.toThrow(/déjà annulé/i);
  });

  it("refuse d'annuler un achat reçu dont le stock a été vendu", async () => {
    const { session: user } = await makeUser("manager");
    const supplier = await createSupplier(user, { name: "Fournisseur Test" });
    const product = await makeProduct({ stockQuantity: 0 });

    const purchase = await createPurchase(user, {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: 3, unitCostCents: 1000 }],
    });
    await receivePurchase(user, { purchaseId: purchase.id });
    await adjustStock(user, { productId: product.id, quantityDelta: -2, type: "adjustment", reason: "Vente au comptoir" });

    await expect(cancelPurchase(user, { purchaseId: purchase.id, reason: "Test" })).rejects.toThrow(/insuffisant/i);

    const [saved] = await db.select().from(purchases).where(eq(purchases.id, purchase.id));
    expect(saved!.status).toBe("received");
  });

  it("refuse d'annuler un achat déjà partiellement payé", async () => {
    const { session: user } = await makeUser("manager");
    const supplier = await createSupplier(user, { name: "Fournisseur Test" });
    const product = await makeProduct({ stockQuantity: 0 });

    const purchase = await createPurchase(user, {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: 4, unitCostCents: 1000 }],
    });
    await receivePurchase(user, { purchaseId: purchase.id });
    await recordSupplierPayment(user, { supplierId: supplier.id, amountCents: 1000, method: "cash" });

    await expect(cancelPurchase(user, { purchaseId: purchase.id, reason: "Test" })).rejects.toThrow(/paiements/i);

    const [saved] = await db.select().from(purchases).where(eq(purchases.id, purchase.id));
    expect(saved!.status).toBe("received");
    expect(Number((await getSupplierBalance(supplier.id))!.balanceCents)).toBe(3000);
  });

  it("exige un motif pour annuler un achat", async () => {
    const { session: user } = await makeUser("manager");
    const supplier = await createSupplier(user, { name: "Fournisseur Test" });
    const product = await makeProduct();

    const purchase = await createPurchase(user, {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: 1, unitCostCents: 100 }],
    });

    await expect(cancelPurchase(user, { purchaseId: purchase.id, reason: "ab" })).rejects.toThrow(/motif/i);
  });
});
