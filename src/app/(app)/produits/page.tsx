import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { productCategories, products } from "@/db/schema";
import { requirePermission, can } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { formatCents } from "@/lib/money";
import { Badge, Card, CardTitle, EmptyState, PageHeader, StatCard, Table, Td, Th } from "@/components/ui";
import { CreateProductDialog, EditProductDialog } from "./product-dialogs";
import { Package, TriangleAlert, Wallet } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const user = await requirePermission(PERMISSIONS.PRODUCTS_VIEW);

  const [rows, categoryRows] = await Promise.all([
    db
      .select({ product: products, categoryName: productCategories.name })
      .from(products)
      .leftJoin(productCategories, eq(productCategories.id, products.categoryId))
      .orderBy(productCategories.name, products.name),
    db.select().from(productCategories).orderBy(productCategories.name),
  ]);

  const [aggregate] = await db
    .select({
      stockValue: sql<number>`coalesce(sum(${products.stockQuantity} * ${products.costCents}), 0)::int`,
      lowCount: sql<number>`coalesce(sum(case when ${products.stockQuantity} <= ${products.minStock} then 1 else 0 end), 0)::int`,
    })
    .from(products)
    .where(eq(products.isActive, true));

  const canManage = can(user, PERMISSIONS.PRODUCTS_MANAGE);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Produits & stock"
        description="Prix, coûts et seuils sont modifiables à tout moment ; chaque vente crée un mouvement de stock."
        actions={canManage ? <CreateProductDialog categories={categoryRows.map((row) => row.name)} /> : null}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Produits actifs"
          value={rows.filter((row) => row.product.isActive).length}
          icon={<Package className="h-4 w-4" />}
        />
        <StatCard
          label="Valeur du stock (au coût)"
          value={formatCents(Number(aggregate?.stockValue ?? 0))}
          icon={<Wallet className="h-4 w-4" />}
          tone="success"
        />
        <StatCard
          label="Alertes de stock"
          value={Number(aggregate?.lowCount ?? 0)}
          icon={<TriangleAlert className="h-4 w-4" />}
          tone="warning"
        />
      </div>

      <Card>
        <CardTitle title="Catalogue" subtitle={`${rows.length} produit(s)`} />
        {rows.length === 0 ? (
          <EmptyState
            title="Aucun produit"
            description="Ajoutez vos boissons, snacks et accessoires pour les vendre depuis l'encaissement."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Produit</Th>
                <Th>Catégorie</Th>
                <Th className="text-right">Prix</Th>
                <Th className="text-right">Coût</Th>
                <Th className="text-right">Marge</Th>
                <Th className="text-right">Stock</Th>
                <Th>État</Th>
                {canManage ? <Th /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ product, categoryName }) => {
                const price = Number(product.priceCents);
                const cost = Number(product.costCents);
                const margin = price - cost;
                const low = Number(product.stockQuantity) <= product.minStock;
                return (
                  <tr key={product.id} className="transition hover:bg-surface-2/40">
                    <Td>
                      <p className="font-medium">{product.name}</p>
                      <p className="text-[11px] text-muted">{product.sku || product.barcode || "—"}</p>
                    </Td>
                    <Td className="text-muted">{categoryName ?? "—"}</Td>
                    <Td className="text-right">{formatCents(price)}</Td>
                    <Td className="text-right text-muted">{formatCents(cost)}</Td>
                    <Td className={`text-right ${margin > 0 ? "text-success" : "text-muted"}`}>
                      {formatCents(margin)}
                    </Td>
                    <Td className="text-right">
                      <span className={low ? "text-warning" : ""}>{Number(product.stockQuantity)}</span>
                      <span className="ml-1 text-[11px] text-muted">/ {product.minStock}</span>
                    </Td>
                    <Td>
                      {!product.isActive ? (
                        <Badge tone="neutral">Inactif</Badge>
                      ) : Number(product.stockQuantity) <= 0 ? (
                        <Badge tone="danger">Rupture</Badge>
                      ) : low ? (
                        <Badge tone="warning">Stock bas</Badge>
                      ) : (
                        <Badge tone="success">Disponible</Badge>
                      )}
                    </Td>
                    {canManage ? (
                      <Td>
                        <EditProductDialog
                          product={{
                            id: product.id,
                            name: product.name,
                            sku: product.sku,
                            barcode: product.barcode,
                            priceCents: price,
                            costCents: cost,
                            minStock: product.minStock,
                            unitsPerCarton: product.unitsPerCarton,
                            description: product.description,
                            isActive: product.isActive,
                          }}
                        />
                      </Td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <p className="text-[11px] text-muted">
        Les mouvements de stock avancés (réception, inventaire physique, pertes) arrivent en Phase 3.
      </p>
    </div>
  );
}
