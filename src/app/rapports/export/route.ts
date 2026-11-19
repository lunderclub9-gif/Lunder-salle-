import { and, eq, gte, ne } from "drizzle-orm";
import { db } from "@/db";
import { customers, expenses, expenseCategories, invoices, products, supplierBalances, suppliers } from "@/db/schema";
import { can, getSessionUser } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** Échappe une valeur CSV (séparateur point-virgule, adapté à Excel FR). */
function cell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  const escaped = text.replace(/"/g, '""');
  return /[";\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
}

function toCsv(rows: unknown[][]): string {
  return rows.map((row) => row.map(cell).join(";")).join("\r\n") + "\r\n";
}

function csvResponse(filename: string, body: string) {
  return new Response(`\uFEFF${body}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return new Response("Session expirée.", { status: 401 });
  if (!can(user, PERMISSIONS.REPORTS_VIEW)) return new Response("Accès refusé.", { status: 403 });

  const type = new URL(request.url).searchParams.get("type") ?? "ventes";
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);
  const stamp = new Date().toISOString().slice(0, 10);

  if (type === "ventes") {
    const rows = await db
      .select({
        number: invoices.number,
        createdAt: invoices.createdAt,
        status: invoices.status,
        subtotal: invoices.subtotalCents,
        discount: invoices.discountCents,
        total: invoices.totalCents,
        paid: invoices.paidCents,
        credit: invoices.creditCents,
      })
      .from(invoices)
      .where(and(gte(invoices.createdAt, thirtyDaysAgo), ne(invoices.status, "cancelled")))
      .orderBy(invoices.createdAt);

    return csvResponse(
      `ventes-${stamp}.csv`,
      toCsv([
        ["Numéro", "Date", "Statut", "Sous-total (centimes)", "Remise (centimes)", "Total (centimes)", "Payé (centimes)", "Crédit (centimes)"],
        ...rows.map((row) => [
          row.number,
          row.createdAt.toISOString(),
          row.status,
          row.subtotal,
          row.discount,
          row.total,
          row.paid,
          row.credit,
        ]),
      ]),
    );
  }

  if (type === "depenses") {
    const rows = await db
      .select({ expense: expenses, categoryName: expenseCategories.name })
      .from(expenses)
      .leftJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
      .where(gte(expenses.expenseDate, thirtyDaysAgo))
      .orderBy(expenses.expenseDate);

    return csvResponse(
      `depenses-${stamp}.csv`,
      toCsv([
        ["Date", "Catégorie", "Montant (centimes)", "Payée en espèces", "Notes"],
        ...rows.map((row) => [
          row.expense.expenseDate.toISOString(),
          row.categoryName ?? "",
          row.expense.amountCents,
          row.expense.paidWithCash ? "oui" : "non",
          row.expense.notes,
        ]),
      ]),
    );
  }

  if (type === "stock") {
    const rows = await db.select().from(products).orderBy(products.name);
    return csvResponse(
      `stock-${stamp}.csv`,
      toCsv([
        ["Produit", "SKU", "Code-barres", "Stock", "Seuil", "Coût (centimes)", "Prix (centimes)", "Actif"],
        ...rows.map((row) => [
          row.name,
          row.sku,
          row.barcode,
          row.stockQuantity,
          row.minStock,
          row.costCents,
          row.priceCents,
          row.isActive ? "oui" : "non",
        ]),
      ]),
    );
  }

  if (type === "fournisseurs") {
    const rows = await db
      .select({ supplier: suppliers, balance: supplierBalances })
      .from(suppliers)
      .leftJoin(supplierBalances, eq(supplierBalances.supplierId, suppliers.id))
      .orderBy(suppliers.name);

    return csvResponse(
      `fournisseurs-${stamp}.csv`,
      toCsv([
        ["Fournisseur", "Contact", "Téléphone", "Achats (centimes)", "Payé (centimes)", "Solde dû (centimes)"],
        ...rows.map((row) => [
          row.supplier.name,
          row.supplier.contact,
          row.supplier.phone,
          row.balance?.totalPurchasesCents ?? 0,
          row.balance?.totalPaidCents ?? 0,
          row.balance?.balanceCents ?? 0,
        ]),
      ]),
    );
  }

  if (type === "clients") {
    const rows = await db.select().from(customers).orderBy(customers.fullName);
    return csvResponse(
      `clients-${stamp}.csv`,
      toCsv([
        ["Client", "Téléphone", "Crédit autorisé", "Plafond (centimes)", "Solde dû (centimes)", "Bloqué"],
        ...rows.map((row) => [
          row.fullName,
          row.phone,
          row.creditEnabled ? "oui" : "non",
          row.creditLimitCents,
          row.balanceCents,
          row.creditBlocked ? "oui" : "non",
        ]),
      ]),
    );
  }

  return new Response("Type d'export inconnu.", { status: 400 });
}
