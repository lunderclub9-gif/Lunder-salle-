import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businessSettings, products, purchaseItems, purchases, suppliers, users } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { formatCents } from "@/lib/money";
import { formatDateFr } from "@/lib/cn";
import { PURCHASE_STATUS_LABELS } from "@/lib/labels";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

export default async function PurchasePrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(PERMISSIONS.PURCHASES_MANAGE);
  const { id } = await params;

  const [rows, items, settingsRows] = await Promise.all([
    db
      .select({ purchase: purchases, supplier: suppliers, employee: users })
      .from(purchases)
      .leftJoin(suppliers, eq(suppliers.id, purchases.supplierId))
      .leftJoin(users, eq(users.id, purchases.employeeId))
      .where(eq(purchases.id, id))
      .limit(1),
    db
      .select({ item: purchaseItems, productName: products.name, sku: products.sku })
      .from(purchaseItems)
      .leftJoin(products, eq(products.id, purchaseItems.productId))
      .where(eq(purchaseItems.purchaseId, id)),
    db.select().from(businessSettings).limit(1),
  ]);

  const row = rows[0];
  if (!row) notFound();
  const settings = settingsRows[0];
  const purchase = row.purchase;

  return (
    <div className="min-h-screen bg-bg px-4 py-8 text-text print:bg-white print:text-black">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] justify-between">
        <Link href="/achats" className="text-xs text-muted hover:underline">
          ← Retour aux achats
        </Link>
        <PrintButton label="Imprimer le bon de commande" />
      </div>

      <div className="print-page mx-auto max-w-[210mm] bg-white p-10 text-black shadow-xl">
        <header className="flex items-start justify-between border-b border-black/20 pb-6">
          <div>
            <p className="font-display text-2xl font-bold tracking-[0.2em]">{settings?.businessName ?? "LUNDER"}</p>
            {settings?.address ? <p className="mt-1 text-sm">{settings.address}</p> : null}
            {settings?.phone ? <p className="text-sm">Tél. {settings.phone}</p> : null}
            {settings?.email ? <p className="text-sm">{settings.email}</p> : null}
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold">Bon de commande</p>
            <p className="text-sm">{purchase.reference || purchase.id.slice(0, 8).toUpperCase()}</p>
            <p className="text-sm">{formatDateFr(purchase.purchaseDate)}</p>
            <p className="text-sm">Statut : {PURCHASE_STATUS_LABELS[purchase.status] ?? purchase.status}</p>
            <p className="text-sm">Établi par : {row.employee?.fullName ?? "—"}</p>
          </div>
        </header>

        <section className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold tracking-wide uppercase text-black/50">Fournisseur</p>
            <p className="mt-1 text-sm font-semibold">{row.supplier?.name ?? "—"}</p>
            {row.supplier?.contact ? <p className="text-sm">{row.supplier.contact}</p> : null}
            {row.supplier?.phone ? <p className="text-sm">Tél. {row.supplier.phone}</p> : null}
          </div>
          {purchase.notes ? (
            <div>
              <p className="text-xs font-semibold tracking-wide uppercase text-black/50">Notes</p>
              <p className="mt-1 text-sm whitespace-pre-line">{purchase.notes}</p>
            </div>
          ) : null}
        </section>

        <table className="mt-8 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black/30 text-left">
              <th className="py-2">Produit</th>
              <th className="py-2">SKU</th>
              <th className="py-2 text-right">Qté</th>
              <th className="py-2 text-right">Coût unitaire</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((line) => (
              <tr key={line.item.id} className="border-b border-black/10">
                <td className="py-2">{line.productName ?? "—"}</td>
                <td className="py-2 text-black/60">{line.sku || "—"}</td>
                <td className="py-2 text-right">{Number(line.item.quantity)}</td>
                <td className="py-2 text-right">{formatCents(Number(line.item.unitCostCents))}</td>
                <td className="py-2 text-right">{formatCents(Number(line.item.lineTotalCents))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="py-3 text-right font-semibold">
                Total
              </td>
              <td className="py-3 text-right font-bold">{formatCents(Number(purchase.totalCents))}</td>
            </tr>
          </tfoot>
        </table>

        <footer className="mt-10 flex justify-between border-t border-black/20 pt-4 text-xs text-black/60">
          <span>Document interne — le stock n'est augmenté qu'à la réception.</span>
          <span>{row.supplier?.name ?? ""}</span>
        </footer>
      </div>
    </div>
  );
}
