import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Package, Plus, Receipt, ArrowRight } from "lucide-react";
import { db } from "@/db";
import { suppliers, supplierBalances, supplierPayments } from "@/db/schema";
import { requirePermission, can } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { formatCents } from "@/lib/money";
import { formatDateFr } from "@/lib/cn";
import { Card, EmptyState, Input, Label, PageHeader, Table, Td, Th, Textarea, Select } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { createSupplierAction, recordSupplierPaymentAction } from "@/app/actions/purchases";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const user = await requirePermission(PERMISSIONS.SUPPLIERS_MANAGE);
  const rows = await db.select().from(suppliers).orderBy(suppliers.name);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fournisseurs"
        description="Fournisseurs, achats, balances et paiements."
        actions={can(user, PERMISSIONS.SUPPLIERS_MANAGE) ? (
          <ActionForm action={createSupplierAction} submitLabel="Ajouter un fournisseur">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label htmlFor="name">Nom</Label>
                <Input id="name" name="name" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="contact">Contact</Label>
                <Input id="contact" name="contact" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone">Téléphone</Label>
                <Input id="phone" name="phone" />
              </div>
              <div className="space-y-1 sm:col-span-2 lg:col-span-1">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" name="notes" rows={2} />
              </div>
            </div>
          </ActionForm>
        ) : null}
      />

      <Card>
        {rows.length === 0 ? (
          <EmptyState title="Aucun fournisseur" description="Ajoutez vos fournisseurs pour suivre les achats et les paiements." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Fournisseur</Th>
                <Th>Contact</Th>
                <Th>Téléphone</Th>
                <Th>Balance</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((supplier) => {
                const balance = (async () => {
                  const b = await db.select().from(supplierBalances).where(eq(supplierBalances.supplierId, supplier.id)).limit(1);
                  return b[0];
                })();
                return (
                  <tr key={supplier.id} className="transition hover:bg-surface-2/40">
                    <td>
                      <Link href={`/fournisseurs/${supplier.id}`} className="font-medium text-accent-soft hover:underline">
                        {supplier.name}
                      </Link>
                    </td>
                    <td className="text-muted">{supplier.contact || "—"}</td>
                    <td className="text-muted">{supplier.phone || "—"}</td>
                    <td className="text-right">
                      {balance.then((b) => b ? formatCents(Number(b.balanceCents)) : "0 DA")}
                    </td>
                    <td className="text-right">
                      <Link href={`/fournisseurs/${supplier.id}`} className="inline-flex items-center gap-1 text-xs text-accent-soft hover:underline">
                        Détails <ArrowRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
