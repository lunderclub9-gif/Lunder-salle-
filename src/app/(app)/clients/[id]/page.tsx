import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { CreditCard, Printer, Wallet } from "lucide-react";
import { db } from "@/db";
import { creditTransactions, customers, invoices, users } from "@/db/schema";
import { requirePermission, can } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { formatCents, centsToInput } from "@/lib/money";
import { formatDateFr } from "@/lib/cn";
import { CREDIT_TX_LABELS, INVOICE_STATUS_LABELS, INVOICE_STATUS_TONES } from "@/lib/labels";
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
  Textarea,
  Th,
  buttonClass,
} from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { repaymentAction, setCreditAction, updateCustomerAction } from "@/app/actions/customers";
import { getOpenShift } from "@/lib/services/shifts";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission(PERMISSIONS.CUSTOMERS_VIEW);
  const { id } = await params;

  const [rows, invoiceRows, creditRows, shift] = await Promise.all([
    db.select().from(customers).where(eq(customers.id, id)).limit(1),
    db
      .select({ invoice: invoices, employee: users.fullName })
      .from(invoices)
      .innerJoin(users, eq(users.id, invoices.employeeId))
      .where(eq(invoices.customerId, id))
      .orderBy(desc(invoices.createdAt))
      .limit(30),
    db
      .select({ tx: creditTransactions, actor: users.fullName })
      .from(creditTransactions)
      .leftJoin(users, eq(users.id, creditTransactions.createdBy))
      .where(eq(creditTransactions.customerId, id))
      .orderBy(desc(creditTransactions.createdAt))
      .limit(50),
    getOpenShift(user.id),
  ]);

  const customer = rows[0];
  if (!customer) notFound();

  const [stats] = await db
    .select({
      visits: sql<number>`count(*)::int`,
      spent: sql<number>`coalesce(sum(${invoices.totalCents}), 0)::int`,
      lastVisit: sql<string | null>`max(${invoices.createdAt})`,
    })
    .from(invoices)
    .where(sql`${invoices.customerId} = ${id} and ${invoices.status} <> 'cancelled'`);

  const balance = Number(customer.balanceCents);
  const creditAvailable = Math.max(0, Number(customer.creditLimitCents) - balance);
  const canManageCredit = can(user, PERMISSIONS.CREDIT_MANAGE);

  return (
    <div className="space-y-6">
      <PageHeader
        title={customer.fullName}
        description={`Client depuis le ${formatDateFr(customer.createdAt, false)} · ${stats?.visits ?? 0} visite(s)`}
        actions={
          <Link href="/clients" className={buttonClass("ghost", "md")}>
            Retour à la liste
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-xs tracking-wide text-muted uppercase">Dette actuelle</p>
          <p className={`font-display mt-1 text-2xl font-semibold ${balance > 0 ? "text-warning" : ""}`}>
            {formatCents(balance)}
          </p>
        </Card>
        <Card>
          <p className="text-xs tracking-wide text-muted uppercase">Crédit disponible</p>
          <p className="font-display mt-1 text-2xl font-semibold">
            {customer.creditEnabled ? formatCents(creditAvailable) : "—"}
          </p>
          <p className="mt-1 text-[11px] text-muted">
            {customer.creditEnabled
              ? `Plafond ${formatCents(Number(customer.creditLimitCents))}`
              : "Crédit non activé"}
          </p>
        </Card>
        <Card>
          <p className="text-xs tracking-wide text-muted uppercase">Total facturé</p>
          <p className="font-display mt-1 text-2xl font-semibold">{formatCents(Number(stats?.spent ?? 0))}</p>
          <p className="mt-1 text-[11px] text-muted">
            Dernière visite : {stats?.lastVisit ? formatDateFr(stats.lastVisit) : "—"}
          </p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Card>
            <CardTitle title="Historique des factures" subtitle="Toutes les visites rattachées à ce client" />
            {invoiceRows.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">Aucune facture pour ce client.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Numéro</Th>
                    <Th>Date</Th>
                    <Th className="text-right">Total</Th>
                    <Th className="text-right">Solde</Th>
                    <Th>Statut</Th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceRows.map((row) => (
                    <tr key={row.invoice.id}>
                      <Td>
                        <Link href={`/factures/${row.invoice.id}`} className="text-accent-soft hover:underline">
                          {row.invoice.number}
                        </Link>
                      </Td>
                      <Td className="text-muted">{formatDateFr(row.invoice.createdAt)}</Td>
                      <Td className="text-right">{formatCents(Number(row.invoice.totalCents))}</Td>
                      <Td className="text-right text-muted">{formatCents(Number(row.invoice.balanceCents))}</Td>
                      <Td>
                        <Badge tone={INVOICE_STATUS_TONES[row.invoice.status] ?? "neutral"}>
                          {INVOICE_STATUS_LABELS[row.invoice.status] ?? row.invoice.status}
                        </Badge>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card>
            <CardTitle title="Mouvements de crédit" subtitle="Chaque dette et remboursement est tracé" />
            {creditRows.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">Aucun mouvement de crédit.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Type</Th>
                    <Th>Motif</Th>
                    <Th className="text-right">Montant</Th>
                    <Th className="text-right">Solde après</Th>
                  </tr>
                </thead>
                <tbody>
                  {creditRows.map((row) => (
                    <tr key={row.tx.id}>
                      <Td className="text-muted">{formatDateFr(row.tx.createdAt)}</Td>
                      <Td>{CREDIT_TX_LABELS[row.tx.type] ?? row.tx.type}</Td>
                      <Td className="max-w-[220px] truncate text-muted">{row.tx.reason || "—"}</Td>
                      <Td className={`text-right ${Number(row.tx.amountCents) < 0 ? "text-success" : "text-warning"}`}>
                        {Number(row.tx.amountCents) < 0 ? "-" : "+"}
                        {formatCents(Math.abs(Number(row.tx.amountCents)))}
                      </Td>
                      <Td className="text-right font-medium">{formatCents(Number(row.tx.balanceAfterCents))}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {can(user, PERMISSIONS.CUSTOMERS_MANAGE) ? (
            <Card>
              <CardTitle title="Fiche client" />
              <ActionForm
                action={updateCustomerAction}
                submitLabel="Enregistrer"
                variant="secondary"
                hidden={{ customerId: customer.id }}
              >
                <Field label="Nom complet">
                  <Input name="fullName" defaultValue={customer.fullName} required maxLength={120} />
                </Field>
                <Field label="Téléphone">
                  <Input name="phone" defaultValue={customer.phone} maxLength={20} />
                </Field>
                <Field label="Note">
                  <Textarea name="notes" rows={2} defaultValue={customer.notes} maxLength={500} />
                </Field>
              </ActionForm>
            </Card>
          ) : null}

          {canManageCredit ? (
            <Card>
              <CardTitle
                title="Gestion du crédit"
                subtitle="Le plafond est vérifié de façon atomique à chaque vente."
              />
              <ActionForm
                action={setCreditAction}
                submitLabel="Enregistrer le crédit"
                variant="secondary"
                hidden={{ customerId: customer.id }}
              >
                <Field label="Plafond de crédit (DA)">
                  <Input
                    name="creditLimit"
                    inputMode="decimal"
                    defaultValue={centsToInput(Number(customer.creditLimitCents))}
                  />
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="creditEnabled"
                    defaultChecked={customer.creditEnabled}
                    className="h-4 w-4 accent-[#8b5cf6]"
                  />
                  Autoriser le crédit pour ce client
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="creditBlocked"
                    defaultChecked={customer.creditBlocked}
                    className="h-4 w-4 accent-[#f87171]"
                  />
                  Bloquer le crédit
                </label>
                <Field label="Motif de la modification">
                  <Input name="reason" placeholder="Décision du propriétaire" required />
                </Field>
              </ActionForm>
            </Card>
          ) : null}

          {canManageCredit && balance > 0 ? (
            <Card>
              <CardTitle title="Remboursement de dette" subtitle="Encaissé en espèces et ajouté à la caisse" />
              {!shift ? (
                <Alert tone="warning">Ouvrez votre caisse pour enregistrer un remboursement.</Alert>
              ) : (
                <ActionForm
                  action={repaymentAction}
                  submitLabel="Enregistrer le remboursement"
                  hidden={{ customerId: customer.id }}
                >
                  <Field label="Montant (DA)">
                    <Input name="amount" inputMode="decimal" placeholder={(balance / 100).toFixed(2)} />
                  </Field>
                  <Field label="Note">
                    <Input name="reason" placeholder="Remboursement partiel" />
                  </Field>
                  <p className="flex items-center gap-1.5 text-[11px] text-muted">
                    <Wallet className="h-3 w-3" /> Dette restante après opération :{" "}
                    {formatCents(Math.max(0, balance - 0))} (calcul serveur)
                  </p>
                </ActionForm>
              )}
            </Card>
          ) : null}

          <Card>
            <CardTitle title="Actions rapides" />
            <div className="flex flex-col gap-2">
              <Link href="/caisse" className={buttonClass("secondary", "md", "w-full justify-start")}>
                <CreditCard className="h-4 w-4" /> Encaisser une vente
              </Link>
              <Link href="/clients" className={buttonClass("ghost", "md", "w-full justify-start")}>
                <Printer className="h-4 w-4" /> Liste des clients
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
