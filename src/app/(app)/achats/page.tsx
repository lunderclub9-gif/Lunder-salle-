import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Plus, Receipt, ArrowRight } from "lucide-react";
import { db } from "@/db";
import { suppliers, purchases, purchaseItems, products, users } from "@/db/schema";
import { requirePermission, can } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { formatCents } from "@/lib/money";
import { formatDateFr } from "@/lib/cn";
import { PURCHASE_STATUS_LABELS } from "@/lib/labels";
import { Card, EmptyState, Input, Label, PageHeader, Table, Td, Th, Textarea, Select } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { createPurchaseAction, receivePurchaseAction } from "@/app/actions/purchases";
import { cancelPurchaseAction } from "@/app/actions/stock";

export const dynamic = "force-dynamic";

export default async function PurchasesPage() {
  const user = await requirePermission(PERMISSIONS.PURCHASES_MANAGE);
  const [supplierRows, purchaseRows] = await Promise.all([
    db.select().from(suppliers).orderBy(suppliers.name).limit(200),
    db
      .select({
        purchase: purchases,
        supplierName: suppliers.name,
        employeeName: users.fullName,
      })
      .from(purchases)
      .leftJoin(suppliers, eq(suppliers.id, purchases.supplierId))
      .leftJoin(users, eq(users.id, purchases.employeeId))
      .orderBy(desc(purchases.createdAt), desc(purchases.id)),
  ]);

  const statusOptions = Object.entries(PURCHASE_STATUS_LABELS).map(([k, v]) => (
    <option key={k} value={k}>{v}</option>
  ));

  const supplierOptions = supplierRows.map((s) => (
    <option key={s.id} value={s.id}>{s.name}</option>
  ));

  const productOptions = (await db.select({ id: products.id, name: products.name }).from(products).orderBy(products.name).limit(200)).map((p) => (
    <option key={p.id} value={p.id}>{p.name}</option>
  ));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Achats"
        description="Commandes fournisseur, réception et suivi des balances."
        actions={can(user, PERMISSIONS.PURCHASES_MANAGE) ? (
          <ActionForm action={createPurchaseAction} submitLabel="Créer un achat">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label htmlFor="supplierId">Fournisseur</Label>
                <Select id="supplierId" name="supplierId" required>
                  <option value="">Sélectionner…</option>
                  {supplierOptions}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="reference">Référence (optionnel)</Label>
                <Input id="reference" name="reference" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" name="notes" rows={2} />
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-border bg-surface-2/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="itemCount">Articles (0 à 6)</Label>
                <Input id="itemCount" name="itemCount" type="number" min="1" max="6" defaultValue="1" className="w-20" />
              </div>
              <div id="items" className="space-y-2">
                {Array.from({ length: 1 }).map((_, i) => (
                  <div key={i} className="grid grid-cols-4 gap-2 items-end" data-index={i}>
                    <div className="space-y-1">
                      <Label htmlFor={`productId-${i}`}>Produit</Label>
                      <Select id={`productId-${i}`} name={`productId-${i}`} required>
                        <option value="">Sélectionner…</option>
                        {productOptions}
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`quantity-${i}`}>Qté</Label>
                      <Input id={`quantity-${i}`} name={`quantity-${i}`} type="number" min="1" defaultValue="1" required />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`cost-${i}`}>Coût unitaire (DA)</Label>
                      <Input id={`cost-${i}`} name={`cost-${i}`} type="number" min="0" step="0.01" inputMode="decimal" required />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <button type="submit" className="rounded-xl bg-gradient-to-r from-accent to-accent-soft px-4 py-2 text-sm font-medium text-white shadow-lg shadow-accent/25 hover:brightness-110 transition">
                Créer l'achat
              </button>
            </div>
          </ActionForm>
        ) : null}
      />

      <Card>
        {purchaseRows.length === 0 ? (
          <EmptyState title="Aucun achat" description="Les commandes créées apparaissent ici." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Fournisseur</Th>
                <Th>Référence</Th>
                <Th className="text-right">Total</Th>
                <Th>Statut</Th>
                <Th>Responsable</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {purchaseRows.map((row) => (
                <tr key={row.purchase.id} className="transition hover:bg-surface-2/40">
                  <Td className="text-muted">{formatDateFr(row.purchase.purchaseDate, false)}</Td>
                  <Td className="font-medium">{row.supplierName ?? "—"}</Td>
                  <Td className="text-muted">{row.purchase.reference || "—"}</Td>
                  <Td className="text-right">{formatCents(Number(row.purchase.totalCents))}</Td>
                  <Td>
                    <span className="capitalize">{PURCHASE_STATUS_LABELS[row.purchase.status] ?? row.purchase.status}</span>
                  </Td>
                  <Td className="text-muted">{row.employeeName || "—"}</Td>
                  <Td>
                    {row.purchase.status === "cancelled" ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <div className="flex flex-wrap items-start gap-2">
                        {row.purchase.status === "pending" ? (
                          <ActionForm
                            action={receivePurchaseAction}
                            submitLabel="Réceptionner"
                            pendingLabel="Réception…"
                            variant="secondary"
                            size="sm"
                            hidden={{ purchaseId: row.purchase.id }}
                          />
                        ) : null}
                        <ActionForm
                          action={cancelPurchaseAction}
                          submitLabel="Annuler"
                          pendingLabel="Annulation…"
                          variant="danger"
                          size="sm"
                          hidden={{ purchaseId: row.purchase.id }}
                        >
                          <Input name="reason" placeholder="Motif d'annulation" required className="h-8 text-xs" />
                        </ActionForm>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
