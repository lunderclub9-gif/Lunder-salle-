import Link from "next/link";
import { desc, or, sql } from "drizzle-orm";
import { Search, UserRound } from "lucide-react";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { requirePermission, can } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { formatCents } from "@/lib/money";
import { formatDateFr } from "@/lib/cn";
import { Badge, Card, EmptyState, Input, PageHeader, Table, Td, Th } from "@/components/ui";
import { NewCustomerDialog } from "@/components/new-customer-dialog";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.CUSTOMERS_VIEW);
  const params = await searchParams;
  const query = (params.q ?? "").trim();

  const rows = await db
    .select()
    .from(customers)
    .where(
      query
        ? or(sql`${customers.fullName} ilike ${`%${query}%`}`, sql`${customers.phone} ilike ${`%${query}%`}`)
        : undefined,
    )
    .orderBy(desc(customers.createdAt))
    .limit(150);

  const [totals] = await db
    .select({
      count: sql<number>`count(*)::int`,
      debt: sql<number>`coalesce(sum(${customers.balanceCents}), 0)::int`,
    })
    .from(customers);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clients"
        description={`${totals?.count ?? 0} client(s) · dette totale ${formatCents(Number(totals?.debt ?? 0))}`}
        actions={can(user, PERMISSIONS.CUSTOMERS_MANAGE) ? <NewCustomerDialog /> : null}
      />

      <Card>
        <form className="mb-4 flex gap-2" action="/clients" method="get">
          <div className="relative flex-1">
            <Search className="absolute top-3.5 left-3 h-4 w-4 text-muted" />
            <Input name="q" defaultValue={query} placeholder="Rechercher par nom ou téléphone" className="pl-9" />
          </div>
          <button
            type="submit"
            className="rounded-xl border border-border-strong bg-surface-2 px-4 text-sm text-text hover:bg-surface-3"
          >
            Rechercher
          </button>
        </form>

        {rows.length === 0 ? (
          <EmptyState
            title={query ? "Aucun client trouvé" : "Aucun client enregistré"}
            description={
              query
                ? "Essayez un autre nom ou un autre numéro."
                : "Créez une fiche client pour suivre ses visites, ses factures et son crédit."
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Client</Th>
                <Th>Téléphone</Th>
                <Th className="text-right">Dette</Th>
                <Th>Crédit</Th>
                <Th>Créé le</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((customer) => (
                <tr key={customer.id} className="transition hover:bg-surface-2/40">
                  <Td>
                    <Link
                      href={`/clients/${customer.id}`}
                      className="inline-flex items-center gap-2 font-medium text-accent-soft hover:underline"
                    >
                      <UserRound className="h-3.5 w-3.5" />
                      {customer.fullName}
                    </Link>
                  </Td>
                  <Td className="text-muted">{customer.phone || "—"}</Td>
                  <Td className="text-right">
                    {Number(customer.balanceCents) > 0 ? (
                      <span className="text-warning">{formatCents(Number(customer.balanceCents))}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                  <Td>
                    {!customer.creditEnabled ? (
                      <Badge tone="neutral">Désactivé</Badge>
                    ) : customer.creditBlocked ? (
                      <Badge tone="danger">Bloqué</Badge>
                    ) : (
                      <Badge tone="success">Plafond {formatCents(Number(customer.creditLimitCents))}</Badge>
                    )}
                  </Td>
                  <Td className="text-muted">{formatDateFr(customer.createdAt, false)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

