import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { suppliers, supplierBalances, purchases, supplierPayments, users } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { formatCents } from "@/lib/money";
import { formatDateFr } from "@/lib/cn";
import { PAYMENT_LOOKUP as PAYMENT_METHOD_LABELS, PURCHASE_STATUS_LABELS, SUPPLIER_PAYMENT_STATUS_LABELS } from "@/lib/labels";
import { Card, CardTitle, PageHeader, Table, Td, Th, Input, Label, Textarea, Select } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { recordSupplierPaymentAction } from "@/app/actions/purchases";

export const dynamic = "force-dynamic";

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission(PERMISSIONS.SUPPLIERS_MANAGE);
  const { id } = await params;

  const [supplierRows, [balance], purchaseRows, paymentRows] = await Promise.all([
    db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1),
    db.select().from(supplierBalances).where(eq(supplierBalances.supplierId, id)).limit(1),
    db
      .select({
        purchase: purchases,
        employeeName: users.fullName,
      })
      .from(purchases)
      .leftJoin(users, eq(users.id, purchases.employeeId))
      .where(eq(purchases.supplierId, id))
      .orderBy(desc(purchases.createdAt)),
    db
      .select({
        payment: supplierPayments,
        purchaseReference: purchases.reference,
        paidByName: users.fullName,
      })
      .from(supplierPayments)
      .leftJoin(purchases, eq(purchases.id, supplierPayments.purchaseId))
      .leftJoin(users, eq(users.id, supplierPayments.paidBy))
      .where(eq(supplierPayments.supplierId, id))
      .orderBy(desc(supplierPayments.createdAt)),
  ]);

  const supplier = supplierRows[0];
  if (!supplier || !balance) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title={supplier.name}
          description={`Fournisseur · ${supplier.contact || "sans contact"} · ${supplier.phone || "sans téléphone"}`}
        />
        <Link href="/fournisseurs" className="flex items-center gap-2 text-sm text-muted">
          <ArrowLeft className="h-4 w-4" /> Retour
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardTitle title="Total des achats" />
          <p className="text-2xl font-semibold">{formatCents(Number(balance.totalPurchasesCents ?? 0))}</p>
          <p className="text-xs text-muted">Tous achats reçus</p>
        </Card>
        <Card>
          <CardTitle title="Total payé" />
          <p className="text-2xl font-semibold text-success">{formatCents(Number(balance.totalPaidCents ?? 0))}</p>
          <p className="text-xs text-muted">Tous paiements</p>
        </Card>
        <Card>
          <CardTitle title="Balance due" />
          <p className={`text-2xl font-semibold ${Number(balance.balanceCents ?? 0) > 0 ? "text-warning" : "text-muted"}`}>
            {formatCents(Number(balance.balanceCents ?? 0))}
          </p>
          <p className="text-xs text-muted">À payer au fournisseur</p>
        </Card>
      </div>

      <Card>
        <CardTitle title="Paiement rapide" subtitle="Enregistrer un paiement partiel ou total" />
        <ActionForm action={recordSupplierPaymentAction} submitLabel="Enregistrer le paiement" variant="secondary">
          <input type="hidden" name="supplierId" value={supplier.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="amount">Montant (DA)</Label>
              <Input id="amount" name="amount" type="number" min="0" step="0.01" inputMode="decimal" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="method">Mode</Label>
              <Select id="method" name="method" defaultValue="cash">
                <option value="cash">Espèces</option>
                <option value="card">Carte</option>
                <option value="transfer">Virement</option>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="reference">Référence (facultatif)</Label>
              <Input id="reference" name="reference" placeholder="N° transaction / virement" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" rows={2} />
            </div>
          </div>
        </ActionForm>
      </Card>

      <Card>
        <CardTitle title="Paiements" subtitle="Historique des paiements au fournisseur" />
        {paymentRows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Aucun paiement enregistré.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Montant</Th>
                <Th>Référence</Th>
                <Th>Payé par</Th>
                <Th>Statut</Th>
              </tr>
            </thead>
            <tbody>
              {paymentRows.map((row) => (
                <tr key={row.payment.id}>
                  <Td className="text-muted">{formatDateFr(row.payment.paymentDate, false)}</Td>
                  <Td className="text-right text-success">{formatCents(Number(row.payment.amountCents))}</Td>
                  <Td className="text-muted">{row.payment.reference || "—"}</Td>
                  <Td className="text-muted">{row.paidByName || "—"}</Td>
                  <Td>
                    <span className="capitalize">{SUPPLIER_PAYMENT_STATUS_LABELS[row.payment.status] ?? row.payment.status}</span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardTitle title="Achats" subtitle="Historique des commandes" />
        {purchaseRows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Aucun achat.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Référence</Th>
                <Th className="text-right">Total</Th>
                <Th>Statut</Th>
                <Th>Responsable</Th>
              </tr>
            </thead>
            <tbody>
              {purchaseRows.map((row) => (
                <tr key={row.purchase.id}>
                  <Td className="text-muted">{formatDateFr(row.purchase.purchaseDate, false)}</Td>
                  <Td className="font-medium">{row.purchase.reference || "—"}</Td>
                  <Td className="text-right">{formatCents(Number(row.purchase.totalCents))}</Td>
                  <Td>
                    <span className="capitalize">{PURCHASE_STATUS_LABELS[row.purchase.status] ?? row.purchase.status}</span>
                  </Td>
                  <Td className="text-muted">{row.employeeName || "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
