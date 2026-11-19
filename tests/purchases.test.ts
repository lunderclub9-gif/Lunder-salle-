import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { products, purchases, stockMovements, supplierBalances } from "@/db/schema";
import {
  createPurchase,
  createSupplier,
  getSupplierBalance,
  listSupplierPayments,
  receivePurchase,
  recordSupplierPayment,
} from "@/lib/services/purchases";
import { resetDatabase, makeUser, makeProduct } from "./helpers";

describe("phase 3 — fournisseurs et achats", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("crée un fournisseur avec un solde à zéro", async () => {
    const { session: user } = await makeUser("manager");
    const supplier = await createSupplier(user, { name: "Grossiste Jeux", phone: "0550" });

    const balance = await getSupplierBalance(supplier.id);
    expect(balance).not.toBeNull();
    expect(Number(balance!.balanceCents)).toBe(0);
    expect(Number(balance!.totalPurchasesCents)).toBe(0);
  });

  it("refuse un nom de fournisseur trop court", async () => {
    const { session: user } = await makeUser("manager");
    await expect(createSupplier(user, { name: "A" })).rejects.toThrow(/obligatoire/i);
  });

  it("calcule le total d'un achat sans toucher au solde avant réception", async () => {
    const { session: user } = await makeUser("manager");
    const supplier = await createSupplier(user, { name: "Fournisseur Test" });
    const product = await makeProduct({ stockQuantity: 3, costCents: 1000 });

    const purchase = await createPurchase(user, {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: 4, unitCostCents: 1000 }],
    });

    expect(purchase.totalCents).toBe(4000);
    expect(purchase.status).toBe("pending");
    expect(Number((await getSupplierBalance(supplier.id))!.balanceCents)).toBe(0);
  });

  it("refuse un achat sans article", async () => {
    const { session: user } = await makeUser("manager");
    const supplier = await createSupplier(user, { name: "Fournisseur Test" });
    await expect(createPurchase(user, { supplierId: supplier.id, items: [] })).rejects.toThrow(/article/i);
  });

  it("réceptionne un achat : stock, mouvement de stock et solde fournisseur", async () => {
    const { session: user } = await makeUser("manager");
    const supplier = await createSupplier(user, { name: "Fournisseur Test" });
    const product = await makeProduct({ stockQuantity: 3, costCents: 1000 });

    const purchase = await createPurchase(user, {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: 5, unitCostCents: 1000 }],
    });

    await receivePurchase(user, { purchaseId: purchase.id });

    const [updatedProduct] = await db.select().from(products).where(eq(products.id, product.id));
    expect(Number(updatedProduct!.stockQuantity)).toBe(8);

    const movements = await db.select().from(stockMovements).where(eq(stockMovements.productId, product.id));
    expect(movements).toHaveLength(1);
    expect(movements[0]!.type).toBe("purchase");
    expect(Number(movements[0]!.quantity)).toBe(5);
    expect(movements[0]!.purchaseId).toBe(purchase.id);
    expect(Number(movements[0]!.stockAfter)).toBe(8);

    const [savedPurchase] = await db.select().from(purchases).where(eq(purchases.id, purchase.id));
    expect(savedPurchase!.status).toBe("received");

    const balance = await getSupplierBalance(supplier.id);
    expect(Number(balance!.totalPurchasesCents)).toBe(5000);
    expect(Number(balance!.balanceCents)).toBe(5000);
  });

  it("refuse de réceptionner deux fois le même achat", async () => {
    const { session: user } = await makeUser("manager");
    const supplier = await createSupplier(user, { name: "Fournisseur Test" });
    const product = await makeProduct({ stockQuantity: 0 });

    const purchase = await createPurchase(user, {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: 2, unitCostCents: 500 }],
    });

    await receivePurchase(user, { purchaseId: purchase.id });
    await expect(receivePurchase(user, { purchaseId: purchase.id })).rejects.toThrow(/déjà traité/i);

    const [savedProduct] = await db.select().from(products).where(eq(products.id, product.id));
    expect(Number(savedProduct!.stockQuantity)).toBe(2);
    expect(Number((await getSupplierBalance(supplier.id))!.balanceCents)).toBe(1000);
  });

  it("enregistre un paiement fournisseur et diminue le solde", async () => {
    const { session: user } = await makeUser("manager");
    const supplier = await createSupplier(user, { name: "Fournisseur Test" });
    const product = await makeProduct({ stockQuantity: 0 });

    const purchase = await createPurchase(user, {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: 10, unitCostCents: 1000 }],
    });
    await receivePurchase(user, { purchaseId: purchase.id });

    await recordSupplierPayment(user, {
      supplierId: supplier.id,
      amountCents: 4000,
      method: "cash",
      reference: "REG-1",
      purchaseId: purchase.id,
    });

    const balance = await getSupplierBalance(supplier.id);
    expect(Number(balance!.totalPaidCents)).toBe(4000);
    expect(Number(balance!.balanceCents)).toBe(6000);

    const payments = await listSupplierPayments(supplier.id);
    expect(payments).toHaveLength(1);
    expect(payments[0]!.payment.reference).toBe("REG-1");
    expect(payments[0]!.paidByName).toBe(user.fullName);
  });

  it("refuse un paiement supérieur au solde dû", async () => {
    const { session: user } = await makeUser("manager");
    const supplier = await createSupplier(user, { name: "Fournisseur Test" });

    await expect(
      recordSupplierPayment(user, { supplierId: supplier.id, amountCents: 500, method: "cash" }),
    ).rejects.toThrow(/solde/i);

    const rows = await db.select().from(supplierBalances).where(eq(supplierBalances.supplierId, supplier.id));
    expect(Number(rows[0]!.balanceCents)).toBe(0);
    expect(await listSupplierPayments(supplier.id)).toHaveLength(0);
  });

  it("refuse un montant de paiement non positif", async () => {
    const { session: user } = await makeUser("manager");
    const supplier = await createSupplier(user, { name: "Fournisseur Test" });
    await expect(
      recordSupplierPayment(user, { supplierId: supplier.id, amountCents: 0, method: "cash" }),
    ).rejects.toThrow(/positif/i);
  });
});
