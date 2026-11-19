"use client";

import { Pencil, Plus } from "lucide-react";
import { Modal } from "@/components/modal";
import { ActionForm } from "@/components/action-form";
import { Field, Input, Textarea } from "@/components/ui";
import { createProductAction, updateProductAction } from "@/app/actions/catalog";
import { centsToInput } from "@/lib/money";

interface ProductDefaults {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  priceCents: number;
  costCents: number;
  minStock: number;
  unitsPerCarton: number;
  description: string;
  isActive: boolean;
}

export function CreateProductDialog({ categories }: { categories: string[] }) {
  return (
    <Modal
      triggerLabel="Nouveau produit"
      title="Ajouter un produit"
      description="Stockez les prix en dinars ; les calculs sont faits en centimes côté serveur."
      icon={<Plus className="h-4 w-4" />}
    >
      <ActionForm action={createProductAction} submitLabel="Créer le produit">
        <Field label="Nom du produit">
          <Input name="name" required placeholder="Eau minérale" maxLength={120} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Prix de vente (DA)">
            <Input name="price" inputMode="decimal" required placeholder="0.00" />
          </Field>
          <Field label="Coût d'achat (DA)">
            <Input name="cost" inputMode="decimal" placeholder="0.00" />
          </Field>
          <Field label="Stock initial">
            <Input name="stock" type="number" min={0} defaultValue={0} />
          </Field>
          <Field label="Seuil d'alerte">
            <Input name="minStock" type="number" min={0} defaultValue={5} />
          </Field>
          <Field label="Unités par carton">
            <Input name="unitsPerCarton" type="number" min={1} defaultValue={1} />
          </Field>
          <Field label="Catégorie">
            <Input name="category" list="categories" placeholder="Boissons" />
            <datalist id="categories">
              {categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </Field>
          <Field label="Code-barres (facultatif)">
            <Input name="barcode" placeholder="613…" />
          </Field>
          <Field label="Référence (facultatif)">
            <Input name="sku" placeholder="EAU-01" />
          </Field>
        </div>
        <Field label="Description (facultatif)">
          <Textarea name="description" rows={2} maxLength={500} />
        </Field>
      </ActionForm>
    </Modal>
  );
}

export function EditProductDialog({ product }: { product: ProductDefaults }) {
  return (
    <Modal
      triggerLabel=""
      title={`Modifier ${product.name}`}
      description="Une modification de prix n'affecte pas les sessions déjà en cours."
      icon={<Pencil className="h-3.5 w-3.5" />}
      triggerVariant="ghost"
      triggerSize="sm"
      triggerClassName="px-2"
    >
      <ActionForm
        action={updateProductAction}
        submitLabel="Enregistrer"
        hidden={{ productId: product.id }}
      >
        <Field label="Nom du produit">
          <Input name="name" defaultValue={product.name} required maxLength={120} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Prix de vente (DA)">
            <Input name="price" inputMode="decimal" defaultValue={centsToInput(product.priceCents)} />
          </Field>
          <Field label="Coût d'achat (DA)">
            <Input name="cost" inputMode="decimal" defaultValue={centsToInput(product.costCents)} />
          </Field>
          <Field label="Seuil d'alerte">
            <Input name="minStock" type="number" min={0} defaultValue={product.minStock} />
          </Field>
          <Field label="Unités par carton">
            <Input name="unitsPerCarton" type="number" min={1} defaultValue={product.unitsPerCarton} />
          </Field>
          <Field label="Référence">
            <Input name="sku" defaultValue={product.sku} maxLength={60} />
          </Field>
          <Field label="Code-barres">
            <Input name="barcode" defaultValue={product.barcode} maxLength={60} />
          </Field>
        </div>
        <Field label="Description">
          <Textarea name="description" rows={2} defaultValue={product.description} maxLength={500} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={product.isActive}
            className="h-4 w-4 accent-[#8b5cf6]"
          />
          Produit actif (visible à l&apos;encaissement)
        </label>
      </ActionForm>
    </Modal>
  );
}
