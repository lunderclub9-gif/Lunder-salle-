import { eq } from "drizzle-orm";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { requirePermission, can } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { formatCents } from "@/lib/money";
import { formatDateFr } from "@/lib/cn";
import { MAINTENANCE_KIND_LABELS, MAINTENANCE_STATUS_LABELS } from "@/lib/labels";
import { listMaintenance } from "@/lib/services/maintenance";
import { Card, CardTitle, EmptyState, Input, Label, PageHeader, Select, Table, Td, Textarea, Th } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { completeMaintenanceAction, createMaintenanceAction } from "@/app/actions/operations";

export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  const user = await requirePermission(PERMISSIONS.MAINTENANCE_MANAGE);
  const [deviceRows, rows] = await Promise.all([
    db.select({ id: devices.id, name: devices.name, status: devices.status }).from(devices).where(eq(devices.isActive, true)).orderBy(devices.sortOrder, devices.name),
    listMaintenance(100),
  ]);

  const deviceOptions = deviceRows.map((d) => (
    <option key={d.id} value={d.id}>
      {d.name} ({d.status})
    </option>
  ));
  const kindOptions = Object.entries(MAINTENANCE_KIND_LABELS).map(([k, v]) => (
    <option key={k} value={k}>
      {v}
    </option>
  ));

  const openCount = rows.filter((r) => r.record.status === "open" || r.record.status === "in_progress").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Maintenance"
        description="Interventions techniques et immobilisations d'appareils. Aucune intervention n'est supprimée."
        actions={
          can(user, PERMISSIONS.MAINTENANCE_MANAGE) ? (
            <ActionForm action={createMaintenanceAction} submitLabel="Ouvrir l'intervention">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="deviceId">Appareil</Label>
                  <Select id="deviceId" name="deviceId" required>
                    <option value="">Sélectionner…</option>
                    {deviceOptions}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="kind">Type</Label>
                  <Select id="kind" name="kind" defaultValue="corrective">
                    {kindOptions}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cost">Coût estimé (DA)</Label>
                  <Input id="cost" name="cost" type="number" min="0" step="0.01" inputMode="decimal" defaultValue="0" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" name="description" rows={1} required placeholder="Manette HS, écran qui clignote…" />
                </div>
              </div>
            </ActionForm>
          ) : null
        }
      />

      <Card>
        <CardTitle title="Interventions" subtitle={`${openCount} intervention(s) en cours`} />
        {rows.length === 0 ? (
          <EmptyState title="Aucune intervention" description="Les interventions ouvertes apparaissent ici." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Ouverte le</Th>
                <Th>Appareil</Th>
                <Th>Type</Th>
                <Th>Description</Th>
                <Th className="text-right">Coût</Th>
                <Th>Statut</Th>
                <Th>Clôture</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.record.id} className="transition hover:bg-surface-2/40">
                  <Td className="text-muted">{formatDateFr(row.record.startedAt)}</Td>
                  <Td className="font-medium">{row.deviceName ?? "—"}</Td>
                  <Td>{MAINTENANCE_KIND_LABELS[row.record.kind] ?? row.record.kind}</Td>
                  <Td className="max-w-xs truncate">{row.record.description}</Td>
                  <Td className="text-right">{formatCents(Number(row.record.costCents))}</Td>
                  <Td className="text-muted">{MAINTENANCE_STATUS_LABELS[row.record.status] ?? row.record.status}</Td>
                  <Td>
                    {row.record.status === "open" || row.record.status === "in_progress" ? (
                      <ActionForm
                        action={completeMaintenanceAction}
                        submitLabel="Clôturer"
                        variant="secondary"
                        size="sm"
                        hidden={{ maintenanceId: row.record.id }}
                      >
                        <Input name="resolution" placeholder="Compte rendu" required className="h-8 text-xs" />
                        <Input name="cost" type="number" min="0" step="0.01" inputMode="decimal" placeholder="Coût (DA)" className="h-8 text-xs" />
                      </ActionForm>
                    ) : (
                      <span className="text-muted">{row.record.resolution || "—"}</span>
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
