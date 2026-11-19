import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, invoices, users } from "@/db/schema";
import { requirePermission, can } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_TONES } from "@/lib/labels";
import { formatCents } from "@/lib/money";
import { formatDateFr } from "@/lib/cn";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th, buttonClass } from "@/components/ui";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "all", label: "Toutes" },
  { key: "paid", label: "Payées" },
  { key: "partial", label: "Partielles" },
  { key: "pending", label: "En attente" },
  { key: "cancelled", label: "Annulées" },
];

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string; page?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.INVOICES_VIEW);
  const params = await searchParams;
  const status = FILTERS.some((filter) => filter.key === params.statut) ? params.statut : "all";
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const perPage = 25;

  const where = status && status !== "all" ? eq(invoices.status, status as "paid") : undefined;

  const [rows, countRows] = await Promise.all([
    db
      .select({
        invoice: invoices,
        customerName: customers.fullName,
        employeeName: users.fullName,
      })
      .from(invoices)
      .leftJoin(customers, eq(customers.id, invoices.customerId))
      .innerJoin(users, eq(users.id, invoices.employeeId))
      .where(where)
      .orderBy(desc(invoices.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ count: sql<number>`count(*)::int` }).from(invoices).where(where),
  ]);

  const total = countRows[0]?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Factures"
        description="Aucune facture n'est supprimée : les corrections passent par une annulation tracée."
        actions={
          can(user, PERMISSIONS.POS_SELL) ? (
            <Link href="/caisse" className={buttonClass("primary", "md")}>
              Nouvelle vente
            </Link>
          ) : null
        }
      />

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((filter) => (
          <Link
            key={filter.key}
            href={`/factures?statut=${filter.key}`}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs transition",
              status === filter.key
                ? "border-accent/50 bg-accent/15 text-accent-soft"
                : "border-border text-muted hover:text-text",
            )}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title="Aucune facture"
            description="Les ventes encaissées apparaîtront ici avec leur détail de paiement."
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Numéro</Th>
                  <Th>Date</Th>
                  <Th>Client</Th>
                  <Th>Employé</Th>
                  <Th className="text-right">Total</Th>
                  <Th className="text-right">Payé</Th>
                  <Th className="text-right">Solde</Th>
                  <Th>Statut</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.invoice.id} className="transition hover:bg-surface-2/40">
                    <Td>
                      <Link
                        href={`/factures/${row.invoice.id}`}
                        className="font-medium text-accent-soft hover:underline"
                      >
                        {row.invoice.number}
                      </Link>
                    </Td>
                    <Td className="text-muted">{formatDateFr(row.invoice.createdAt)}</Td>
                    <Td>{row.customerName ?? <span className="text-muted">—</span>}</Td>
                    <Td className="text-muted">{row.employeeName}</Td>
                    <Td className="text-right">{formatCents(Number(row.invoice.totalCents))}</Td>
                    <Td className="text-right text-success">{formatCents(Number(row.invoice.paidCents))}</Td>
                    <Td className="text-right">
                      {Number(row.invoice.balanceCents) > 0 ? (
                        <span className="text-warning">{formatCents(Number(row.invoice.balanceCents))}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={INVOICE_STATUS_TONES[row.invoice.status] ?? "neutral"}>
                        {INVOICE_STATUS_LABELS[row.invoice.status] ?? row.invoice.status}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>

            {pages > 1 ? (
              <div className="mt-4 flex items-center justify-between text-xs text-muted">
                <span>
                  {total} facture(s) · page {page} / {pages}
                </span>
                <div className="flex gap-2">
                  {page > 1 ? (
                    <Link href={`/factures?statut=${status}&page=${page - 1}`} className={buttonClass("secondary", "sm")}>
                      Précédent
                    </Link>
                  ) : null}
                  {page < pages ? (
                    <Link href={`/factures?statut=${status}&page=${page + 1}`} className={buttonClass("secondary", "sm")}>
                      Suivant
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}
