import { db } from "@/db";
import { businessSettings } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { Card, CardTitle, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { updateSettingsAction } from "@/app/actions/admin";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
  const rows = await db.select().from(businessSettings).limit(1);
  const settings = rows[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Paramètres"
        description="Identité de la salle, règles de facturation et politiques financières."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardTitle title="Identité et documents" subtitle="Ces informations apparaissent sur les factures et tickets." />
          <ActionForm action={updateSettingsAction} submitLabel="Enregistrer les paramètres">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nom de l'entreprise">
                <Input name="businessName" defaultValue={settings?.businessName ?? "LUNDER"} required maxLength={120} />
              </Field>
              <Field label="Téléphone">
                <Input name="phone" defaultValue={settings?.phone ?? ""} maxLength={30} />
              </Field>
              <Field label="Adresse">
                <Input name="address" defaultValue={settings?.address ?? ""} maxLength={200} />
              </Field>
              <Field label="E-mail">
                <Input name="email" type="email" defaultValue={settings?.email ?? ""} maxLength={120} />
              </Field>
              <Field label="Préfixe des factures" hint="Ex. FAC → FAC-2026-00001">
                <Input name="invoicePrefix" defaultValue={settings?.invoicePrefix ?? "FAC"} maxLength={10} />
              </Field>
              <Field label="Devise">
                <Select defaultValue="DZD" disabled>
                  <option value="DZD">Dinar algérien (DZD)</option>
                </Select>
              </Field>
            </div>

            <Field label="Pied de ticket" hint="Message affiché en bas des tickets et factures.">
              <Textarea name="receiptFooter" rows={2} defaultValue={settings?.receiptFooter ?? ""} maxLength={200} />
            </Field>

            <div className="rounded-xl border border-border bg-surface-2/30 p-3">
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Règles financières</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Remise maximale (%)" hint="Hors propriétaire. 0 = remise interdite.">
                  <Input
                    name="maxDiscountPercent"
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={settings?.maxDiscountPercent ?? 0}
                  />
                </Field>
                <Field label="Seuil de stock par défaut">
                  <Input
                    name="defaultStockThreshold"
                    type="number"
                    min={0}
                    defaultValue={settings?.defaultStockThreshold ?? 5}
                  />
                </Field>
                <Field label="Taux de taxe (%)" hint="Affichage uniquement, aucune taxe n'est ajoutée automatiquement.">
                  <Input
                    name="taxRate"
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    defaultValue={((settings?.taxRateBasisPoints ?? 0) / 100).toString()}
                  />
                </Field>
              </div>

              <div className="mt-3 space-y-2 text-sm">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    name="creditEnabled"
                    defaultChecked={settings?.creditEnabled ?? false}
                    className="mt-0.5 h-4 w-4 accent-[#8b5cf6]"
                  />
                  <span>
                    Autoriser le crédit client
                    <span className="block text-[11px] text-muted">
                      Désactivé par défaut. Le plafond de chaque client reste contrôlé séparément.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    name="allowNegativeStock"
                    defaultChecked={settings?.allowNegativeStock ?? false}
                    className="mt-0.5 h-4 w-4 accent-[#f87171]"
                  />
                  <span>
                    Autoriser la vente en stock négatif
                    <span className="block text-[11px] text-muted">
                      Déconseillé : le stock devient incohérent avec les mouvements. Désactivé par défaut.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    name="taxEnabled"
                    defaultChecked={settings?.taxEnabled ?? false}
                    className="mt-0.5 h-4 w-4 accent-[#22d3ee]"
                  />
                  <span>
                    Afficher la taxe sur les documents
                    <span className="block text-[11px] text-muted">
                      Aucune taxe n&apos;est calculée tant que le taux et les règles ne sont pas confirmés.
                    </span>
                  </span>
                </label>
              </div>
            </div>
          </ActionForm>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardTitle title="Informations système" />
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Fuseau horaire</dt>
                <dd>{settings?.timezone ?? "Africa/Algiers"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Devise</dt>
                <dd>{settings?.currency ?? "DZD"} (centimes en base)</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Dernière mise à jour</dt>
                <dd>
                  {settings?.updatedAt
                    ? new Intl.DateTimeFormat("fr-FR", {
                        dateStyle: "short",
                        timeStyle: "short",
                        timeZone: "Africa/Algiers",
                      }).format(new Date(settings.updatedAt))
                    : "—"}
                </dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardTitle title="Sécurité du compte propriétaire" />
            <ul className="space-y-2 text-[11px] leading-relaxed text-muted">
              <li>· Le compte propriétaire principal ne peut pas être rétrogradé ni désactivé par un employé.</li>
              <li>· Toute modification de mot de passe ferme les autres sessions.</li>
              <li>· Les données financières ne sont jamais supprimées, uniquement corrigées par des écritures tracées.</li>
              <li>· Chaque action sensible exige un motif et figure dans le journal d&apos;audit.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
