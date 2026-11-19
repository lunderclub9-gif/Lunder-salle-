import { eq } from "drizzle-orm";
import { AlertTriangle, Boxes, Coins, PackageSearch } from "lucide-react";
import { db } from "@/db";
import { products } from "@/db/schema";
import { requirePermission, can } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { formatCents } from "@/lib/money";
import { formatDateFr } from "@/lib/cn";
import { STOCK_MOVEMENT_LABELS } from "@/lib/labels";
import { getStockValue, listLowStockProducts, listStockMovements } from "@/lib/services/stock";
import { Card, CardTitle, EmptyState, Input, Label, PageHeader, Select, StatCard, Table, Td, Textarea, Th } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { adjustStockAction } from "@/app/actions/stock";

export const dynamic = "force-dynamic";

export default async function StockPage() {
  const user = await requirePermission(PERMISSIONS.PRODUCTS_VIEW);
  const [productRows, lowStock, movements, value] = await Promise.all([
    db.select({ id: products.id, name: products.name, stock: products.stockQuantity }).from(products).where(eq(products.isActive, true)).orderBy(products.name).limit(300),
    listLowStockProducts(),
    listStockMovements(80),
    getStockValue(),
  ]);

  const productOptions = productRows.map((p) => (
    <option key={p.id} value={p.id}>
      {p.name} ({p.stock})
    </option>
  ));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock"
        description="Mouvements de stock, alertes de seuil et ajustements justifiés. Le stock n'est jamais écrasé."
        actions={
          can(user, PERMISSIONS.PRODUCTS_MANAGE) ? (
            <ActionForm action={adjustStockAction} submitLabel="Enregistrer l'ajustement">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="productId">Produit</Label>
                  <Select id="productId" name="productId" required>
                    <option value="">Sélectionner…</option>
                    {productOptions}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="quantity">Quantité</Label>
                  <Input id="quantity" name="quantity" type="number" min="1" step="1" defaultValue="1" required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="direction">Sens</Label>
                  <Select id="direction" name="direction" defaultValue="out">
                    <option value="out">Sortie (perte, casse, retour)</option>
                    <option value="in">Entrée (inventaire, correction)</option>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="type">Type</Label>
                  <Select id="type" name="type" defaultValue="adjustment">
                    <option value="adjustment">Ajustement d'inventaire</option>
                    <option value="loss">Perte / casse</option>
                    <option value="return">Retour fournisseur</option>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="reason">Motif (obligatoire)</Label>
                  <Textarea id="reason" name="reason" rows={1} required placeholder="Inventaire du 19/11, casse…" />
                </div>
              </div>
            </ActionForm>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Unités en stock" value={String(value.units)} icon={<Boxes className="h-4 w-4" />} />
        <StatCard label="Valeur au coût" value={formatCents(value.costValueCents)} icon={<Coins className="h-4 w-4" />} />
        <StatCard label="Valeur de vente" value={formatCents(value.saleValueCents)} icon={<PackageSearch className="h-4 w-4" />} />
        <StatCard label="Produits sous le seuil" value={String(lowStock.length)} icon={<AlertTriangle className="h-4 w-4" />} tone={lowStock.length > 0 ? "warning" : "success"} />
      </div>

      <Card>
        <CardTitle title="Alertes de stock bas" />
        {lowStock.length === 0 ? (
          <EmptyState title="Aucun produit sous le seuil" description="Tous les produits actifs sont au-dessus de leur stock minimum." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Produit</Th>
                <Th className="text-right">Stock</Th>
                <Th className="text-right">Seuil</Th>
                <Th className="text-right">Manquant</Th>
              </tr>
            </thead>
            <tbody>
              {lowStock.map((p) => (
                <tr key={p.id} className="transition hover:bg-surface-2/40">
                  <Td className="font-medium">{p.name}</Td>
                  <Td className="text-right text-warning">{p.stockQuantity}</Td>
                  <Td className="text-right text-muted">{p.minStock}</Td>
                  <Td className="text-right">{Math.max(0, p.minStock - Number(p.stockQuantity))}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardTitle title="Derniers mouvements" />
        {movements.length === 0 ? (
          <EmptyState title="Aucun mouvement" description="Chaque vente, réception, perte ou ajustement apparaît ici." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Produit</Th>
                <Th>Type</Th>
                <Th className="text-right">Quantité</Th>
                <Th className="text-right">Stock après</Th>
                <Th>Motif</Th>
                <Th>Employé</Th>
              </tr>
            </thead>
            <tbody>
              {movements.map((row) => (
                <tr key={row.movement.id} className="transition hover:bg-surface-2/40">
                  <Td className="text-muted">{formatDateFr(row.movement.createdAt)}</Td>
                  <Td className="font-medium">{row.productName ?? "—"}</Td>
                  <Td>{STOCK_MOVEMENT_LABELS[row.movement.type] ?? row.movement.type}</Td>
                  <Td className={Number(row.movement.quantity) < 0 ? "text-right text-danger" : "text-right text-success"}>
                    {Number(row.movement.quantity) > 0 ? "+" : ""}
                    {Number(row.movement.quantity)}
                  </Td>
                  <Td className="text-right text-muted">{Number(row.movement.stockAfter)}</Td>
                  <Td className="max-w-xs truncate text-muted">{row.movement.reason || "—"}</Td>
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
