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

export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ largeur?: string }>;
}) {
  await requirePermission(PERMISSIONS.INVOICES_VIEW);
  const { id } = await params;
  const { largeur } = await searchParams;
  const width = largeur === "58" ? "58mm" : "80mm";

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
      <div className="no-print mx-auto mb-4 flex max-w-[420px] justify-between">
        <Link href={`/factures/${invoice.id}`} className="text-xs text-muted hover:underline">
          ← Retour à la facture
        </Link>
        <div className="flex gap-2">
          <Link
            href={`/imprimer/ticket/${invoice.id}?largeur=${width === "58mm" ? "80" : "58"}`}
            className="rounded-lg border border-border px-2 py-1 text-[11px] text-muted"
          >
            Format {width === "58mm" ? "80 mm" : "58 mm"}
          </Link>
          <PrintButton label="Imprimer le ticket" />
        </div>
      </div>

      <div
        className="print-page mx-auto bg-white p-4 font-mono text-[11px] leading-snug text-black shadow-xl"
        style={{ width }}
      >
        <div className="text-center">
          <p className="text-sm font-bold tracking-[0.2em]">{settings?.businessName ?? "LUNDER"}</p>
          {settings?.address ? <p>{settings.address}</p> : null}
          {settings?.phone ? <p>Tél. {settings.phone}</p> : null}
        </div>

        <div className="my-2 border-t border-dashed border-black/40" />

        <p>
          Ticket : <strong>{invoice.number}</strong>
        </p>
        <p>Date : {formatDateFr(invoice.createdAt)}</p>
        <p>Employé : {row.employee.fullName}</p>
        {row.customer ? <p>Client : {row.customer.fullName}</p> : null}

        <div className="my-2 border-t border-dashed border-black/40" />

        <table className="w-full">
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td className="pr-1 align-top">{item.description}</td>
                <td className="w-8 text-right align-top">×{item.quantity}</td>
                <td className="w-16 text-right align-top">{formatCents(Number(item.lineTotalCents))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="my-2 border-t border-dashed border-black/40" />

        <div className="space-y-0.5">
          <div className="flex justify-between">
            <span>Sous-total</span>
            <span>{formatCents(Number(invoice.subtotalCents))}</span>
          </div>
          {Number(invoice.discountCents) > 0 ? (
            <div className="flex justify-between">
              <span>Remise</span>
              <span>-{formatCents(Number(invoice.discountCents))}</span>
            </div>
          ) : null}
          {Number(invoice.loyaltyDiscountCents) > 0 ? (
            <div className="flex justify-between">
              <span>Fidélité ({invoice.loyaltyPointsUsed} pts)</span>
              <span>-{formatCents(Number(invoice.loyaltyDiscountCents))}</span>
            </div>
          ) : null}
          <div className="flex justify-between text-[13px] font-bold">
            <span>TOTAL</span>
            <span>{formatCents(Number(invoice.totalCents))}</span>
          </div>
          {paymentRows.map((payment) => (
            <div key={payment.id} className="flex justify-between">
              <span>{PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}</span>
              <span>{formatCents(Number(payment.amountCents))}</span>
            </div>
          ))}
          <div className="flex justify-between">
            <span>Solde dû</span>
            <span>{formatCents(Number(invoice.balanceCents))}</span>
          </div>
        </div>

        {invoice.status === "cancelled" ? (
          <p className="mt-2 border border-black/40 p-1 text-center font-bold">FACTURE ANNULÉE</p>
        ) : null}

        <div className="my-2 border-t border-dashed border-black/40" />
        <p className="text-center">{settings?.receiptFooter ?? "Merci de votre visite !"}</p>
        <p className="mt-1 text-center text-[9px]">Document généré par LUNDER</p>
      </div>
    </div>
  );
}
