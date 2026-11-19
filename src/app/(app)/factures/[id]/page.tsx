import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { Ban, Printer, ReceiptText } from "lucide-react";
import { db } from "@/db";
import { customers, invoiceItems, invoices, payments, users } from "@/db/schema";
import { requirePermission, can } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { formatCents } from "@/lib/money";
import { formatDateFr } from "@/lib/cn";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_TONES, PAYMENT_METHOD_LABELS } from "@/lib/labels";
import {
  Alert,
  Badge,
  Card,
  CardTitle,
  Field,
  Input,
  PageHeader,
  Table,
  Td,
  Th,
  buttonClass,
} from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { addPaymentAction, cancelInvoiceAction } from "@/app/actions/invoices";
import { getOpenShift } from "@/lib/services/shifts";

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission(PERMISSIONS.INVOICES_VIEW);
  const { id } = await params;

  const [rows, itemRows, paymentRows, shift] = await Promise.all([
    db
      .select({ invoice: invoices, customer: customers, employee: users })
      .from(invoices)
      .leftJoin(customers, eq(customers.id, invoices.customerId))
      .innerJoin(users, eq(users.id, invoices.employeeId))
      .where(eq(invoices.id, id))
      .limit(1),
    db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id)),
    db
      .select({ payment: payments, receiver: users.fullName })
      .from(payments)
      .leftJoin(users, eq(users.id, payments.receivedBy))
      .where(eq(payments.invoiceId, id))
      .orderBy(desc(payments.createdAt)),
    getOpenShift(user.id),
  ]);

  const row = rows[0];
  if (!row) notFound();
  const invoice = row.invoice;
  const balance = Number(invoice.balanceCents);
  const cancelled = invoice.status === "cancelled";
  const hasCashPayments = paymentRows.some((paymentRow) => paymentRow.payment.method !== "credit");

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Facture ${invoice.number}`}
        description={`${formatDateFr(invoice.createdAt)} · employé : ${row.employee.fullName}`}
        actions={
          <>
            <Badge tone={INVOICE_STATUS_TONES[invoice.status] ?? "neutral"}>
              {INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status}
            </Badge>
            <Link href={`/imprimer/facture/${invoice.id}`} target="_blank" className={buttonClass("secondary", "md")}>
              <Printer className="h-4 w-4" /> Facture A4
            </Link>
            <Link href={`/imprimer/ticket/${invoice.id}`} target="_blank" className={buttonClass("secondary", "md")}>
              <ReceiptText className="h-4 w-4" /> Ticket
            </Link>
          </>
        }
      />

      {cancelled ? (
        <Alert tone="danger">
          Facture annulée le {invoice.cancelledAt ? formatDateFr(invoice.cancelledAt) : "—"} — motif :{" "}
          {invoice.cancelReason || "non renseigné"}
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card>
            <CardTitle title="Lignes de la facture" subtitle={`${itemRows.length} ligne(s)`} />
            <Table>
              <thead>
                <tr>
                  <Th>Description</Th>
                  <Th className="text-right">Qté</Th>
                  <Th className="text-right">Prix unitaire</Th>
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {itemRows.map((item) => (
                  <tr key={item.id}>
                    <Td>
                      <span className="font-medium">{item.description}</span>
                      {item.kind === "session" ? (
                        <Badge tone="accent" className="ml-2">
                          Session
                        </Badge>
                      ) : null}
                    </Td>
                    <Td className="text-right text-muted">{item.quantity}</Td>
                    <Td className="text-right text-muted">{formatCents(Number(item.unitPriceCents))}</Td>
                    <Td className="text-right font-medium">{formatCents(Number(item.lineTotalCents))}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <Card>
            <CardTitle title="Paiements" subtitle="Chaque encaissement est une transaction distincte." />
            {paymentRows.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">Aucun paiement enregistré.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Mode</Th>
                    <Th>Référence</Th>
                    <Th>Encaissé par</Th>
                    <Th className="text-right">Montant</Th>
                  </tr>
                </thead>
                <tbody>
                  {paymentRows.map((paymentRow) => (
                    <tr key={paymentRow.payment.id}>
                      <Td className="text-muted">{formatDateFr(paymentRow.payment.createdAt)}</Td>
                      <Td>{PAYMENT_METHOD_LABELS[paymentRow.payment.method] ?? paymentRow.payment.method}</Td>
                      <Td className="text-muted">{paymentRow.payment.reference || "—"}</Td>
                      <Td className="text-muted">{paymentRow.receiver ?? "—"}</Td>
                      <Td className="text-right font-medium">
                        {formatCents(Number(paymentRow.payment.amountCents))}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardTitle title="Récapitulatif" />
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between text-muted">
                <dt>Sous-total</dt>
                <dd>{formatCents(Number(invoice.subtotalCents))}</dd>
              </div>
              {Number(invoice.discountCents) > 0 ? (
                <div className="flex justify-between text-warning">
                  <dt>Remise{invoice.discountReason ? ` (${invoice.discountReason})` : ""}</dt>
                  <dd>-{formatCents(Number(invoice.discountCents))}</dd>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                <dt>Total</dt>
                <dd>{formatCents(Number(invoice.totalCents))}</dd>
              </div>
              <div className="flex justify-between text-success">
                <dt>Payé</dt>
                <dd>{formatCents(Number(invoice.paidCents))}</dd>
              </div>
              {Number(invoice.creditCents) > 0 ? (
                <div className="flex justify-between text-warning">
                  <dt>Dont crédit client</dt>
                  <dd>{formatCents(Number(invoice.creditCents))}</dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt>Solde restant</dt>
                <dd className={balance > 0 ? "text-warning" : "text-muted"}>{formatCents(balance)}</dd>
              </div>
            </dl>
            <div className="mt-3 border-t border-border pt-3 text-xs text-muted">
              <p>Client : {row.customer?.fullName ?? "sans client"}</p>
              {invoice.notes ? <p className="mt-1">Note : {invoice.notes}</p> : null}
            </div>
          </Card>

          {!cancelled && balance > 0 && can(user, PERMISSIONS.POS_SELL) ? (
            <Card>
              <CardTitle title="Encaisser un paiement" subtitle={`Solde dû : ${formatCents(balance)}`} />
              {!shift ? (
                <Alert tone="warning">Ouvrez votre caisse pour encaisser un paiement.</Alert>
              ) : (
                <ActionForm
                  action={addPaymentAction}
                  submitLabel="Enregistrer le paiement"
                  hidden={{ invoiceId: invoice.id }}
                >
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Mode">
                      <select
                        name="paymentMethod"
                        className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                        defaultValue="cash"
                      >
                        <option value="cash">Espèces</option>
                        <option value="card">Carte</option>
                        <option value="mobile">Paiement mobile</option>
                        <option value="transfer">Virement</option>
                      </select>
                    </Field>
                    <Field label="Montant (DA)">
                      <Input
                        name="paymentAmount"
                        inputMode="decimal"
                        defaultValue={(balance / 100).toFixed(2)}
                      />
                    </Field>
                  </div>
                  <Field label="Référence (facultatif)">
                    <Input name="paymentReference" placeholder="N° de transaction" />
                  </Field>
                </ActionForm>
              )}
            </Card>
          ) : null}

          {!cancelled && can(user, PERMISSIONS.INVOICES_CANCEL) ? (
            <Card>
              <CardTitle title="Annuler la facture" subtitle="Action tracée et irréversible." />
              {hasCashPayments ? (
                <Alert tone="warning">
                  Cette facture comporte des encaissements espèces/carte. Le remboursement sera disponible
                  en Phase 2 : une annulation directe créerait un écart de caisse.
                </Alert>
              ) : (
                <ActionForm
                  action={cancelInvoiceAction}
                  submitLabel="Annuler la facture"
                  variant="danger"
                  hidden={{ invoiceId: invoice.id }}
                >
                  <Field label="Motif d'annulation">
                    <Input name="reason" placeholder="Erreur de saisie, client parti…" required />
                  </Field>
                  <p className="text-[11px] text-muted">
                    Le stock vendu sera restitué et le crédit éventuel annulé. La facture reste consultable.
                  </p>
                </ActionForm>
              )}
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
