import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { businessSettings, customers, invoiceItems, invoices, payments, users } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { formatCents } from "@/lib/money";
import { formatDateFr } from "@/lib/cn";
import { PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(PERMISSIONS.INVOICES_VIEW);
  const { id } = await params;

  const [rows, items, paymentRows, settingsRows] = await Promise.all([
    db
      .select({ invoice: invoices, customer: customers, employee: users })
      .from(invoices)
      .leftJoin(customers, eq(customers.id, invoices.customerId))
      .innerJoin(users, eq(users.id, invoices.employeeId))
      .where(eq(invoices.id, id))
      .limit(1),
    db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id)),
    db.select().from(payments).where(eq(payments.invoiceId, id)).orderBy(desc(payments.createdAt)),
    db.select().from(businessSettings).limit(1),
  ]);

  const row = rows[0];
  if (!row) notFound();
  const settings = settingsRows[0];
  const invoice = row.invoice;

  return (
    <div className="min-h-screen bg-bg px-4 py-8 text-text print:bg-white print:text-black">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] justify-between">
        <Link href={`/factures/${invoice.id}`} className="text-xs text-muted hover:underline">
          ← Retour à la facture
        </Link>
        <PrintButton label="Imprimer la facture" />
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
            <p className="text-lg font-semibold">Facture</p>
            <p className="text-sm">{invoice.number}</p>
            <p className="text-sm">{formatDateFr(invoice.createdAt)}</p>
            <p className="text-sm">Employé : {row.employee.fullName}</p>
          </div>
        </header>

        <section className="mt-6 flex justify-between gap-6">
          <div>
            <p className="text-xs tracking-wide text-black/50 uppercase">Client</p>
            <p className="mt-1 font-medium">{row.customer?.fullName ?? "Client non renseigné"}</p>
            {row.customer?.phone ? <p className="text-sm">{row.customer.phone}</p> : null}
          </div>
          <div className="text-right text-sm">
            <p className="text-xs tracking-wide text-black/50 uppercase">Statut</p>
            <p className="mt-1 font-medium">
              {invoice.status === "cancelled"
                ? "Annulée"
                : invoice.status === "paid"
                  ? "Payée"
                  : invoice.status === "partial"
                    ? "Partiellement payée"
                    : "En attente de paiement"}
            </p>
          </div>
        </section>

        <table className="mt-8 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black/20 text-left text-xs tracking-wide text-black/60 uppercase">
              <th className="py-2">Description</th>
              <th className="py-2 text-right">Qté</th>
              <th className="py-2 text-right">Prix unitaire</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-black/10">
                <td className="py-2">{item.description}</td>
                <td className="py-2 text-right">{item.quantity}</td>
                <td className="py-2 text-right">{formatCents(Number(item.unitPriceCents))}</td>
                <td className="py-2 text-right">{formatCents(Number(item.lineTotalCents))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="mt-6 ml-auto w-64 space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Sous-total</span>
            <span>{formatCents(Number(invoice.subtotalCents))}</span>
          </div>
          {Number(invoice.discountCents) > 0 ? (
            <div className="flex justify-between">
              <span>Remise{invoice.discountReason ? ` — ${invoice.discountReason}` : ""}</span>
              <span>-{formatCents(Number(invoice.discountCents))}</span>
            </div>
          ) : null}
          {Number(invoice.loyaltyDiscountCents) > 0 ? (
            <div className="flex justify-between">
              <span>Fidélité ({invoice.loyaltyPointsUsed} pts)</span>
              <span>-{formatCents(Number(invoice.loyaltyDiscountCents))}</span>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-black/20 pt-1 text-base font-semibold">
            <span>Total</span>
            <span>{formatCents(Number(invoice.totalCents))}</span>
          </div>
          <div className="flex justify-between">
            <span>Payé</span>
            <span>{formatCents(Number(invoice.paidCents))}</span>
          </div>
          <div className="flex justify-between">
            <span>Solde dû</span>
            <span>{formatCents(Number(invoice.balanceCents))}</span>
          </div>
        </section>

        <section className="mt-8">
          <p className="text-xs tracking-wide text-black/50 uppercase">Paiements</p>
          <ul className="mt-1 text-sm">
            {paymentRows.map((payment) => (
              <li key={payment.id}>
                {formatDateFr(payment.createdAt)} · {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method} ·{" "}
                {formatCents(Number(payment.amountCents))}
              </li>
            ))}
          </ul>
        </section>

        {invoice.status === "cancelled" ? (
          <p className="mt-6 border border-black/40 p-3 text-center font-semibold">
            FACTURE ANNULÉE — {invoice.cancelReason}
          </p>
        ) : null}

        <footer className="mt-10 border-t border-black/20 pt-4 text-center text-xs text-black/60">
          <p>{settings?.receiptFooter ?? "Merci de votre visite !"}</p>
          {settings?.taxEnabled && settings.taxRateBasisPoints > 0 ? (
            <p className="mt-1">Taux de taxe affiché : {(settings.taxRateBasisPoints / 100).toFixed(2)} %</p>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
