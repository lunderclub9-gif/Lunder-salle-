import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { devices, gameSessions } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { formatCents } from "@/lib/money";
import {
  BILLING_MODE_LABELS,
  DEVICE_STATUS_LABELS,
  DEVICE_STATUS_TONES,
  DEVICE_TYPE_LABELS,
  ROUNDING_LABELS,
} from "@/lib/labels";
import { Badge, Card, CardTitle, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { ActionButton } from "@/components/action-form";
import { CreateDeviceDialog, EditDeviceDialog } from "./device-dialogs";
import { setDeviceStatusAction } from "@/app/actions/catalog";

export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  await requirePermission(PERMISSIONS.DEVICES_MANAGE);

  const [rows, activeRows] = await Promise.all([
    db.select().from(devices).orderBy(devices.sortOrder, devices.name),
    db
      .select({ deviceId: gameSessions.deviceId })
      .from(gameSessions)
      .where(inArray(gameSessions.status, ["running", "paused"])),
  ]);

  const busy = new Set(activeRows.map((row) => row.deviceId));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Appareils"
        description="Six PlayStation et une table de billard sont créées à l'installation. Tarifs et règles de facturation sont entièrement configurables."
        actions={<CreateDeviceDialog />}
      />

      <Card>
        <CardTitle title="Parc d'appareils" subtitle={`${rows.length} appareil(s)`} />
        {rows.length === 0 ? (
          <EmptyState title="Aucun appareil" description="Ajoutez votre premier poste de jeu." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Appareil</Th>
                <Th>Type</Th>
                <Th>Facturation</Th>
                <Th>Tarif</Th>
                <Th>Statut</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((device) => {
                const isBusy = busy.has(device.id);
                const rate =
                  device.billingMode === "hourly"
                    ? `${formatCents(Number(device.hourlyRateCents))} / h`
                    : device.billingMode === "match"
                      ? `${formatCents(Number(device.matchRateCents))} / match`
                      : `${formatCents(Number(device.fixedRateCents))} / session`;
                return (
                  <tr key={device.id} className="transition hover:bg-surface-2/40">
                    <Td>
                      <p className="font-medium">{device.name}</p>
                      <p className="text-[11px] text-muted">{device.location || "—"}</p>
                    </Td>
                    <Td className="text-muted">{DEVICE_TYPE_LABELS[device.type] ?? device.type}</Td>
                    <Td className="text-muted">
                      {BILLING_MODE_LABELS[device.billingMode]} · {device.billingIncrementMinutes} min ·{" "}
                      {ROUNDING_LABELS[device.rounding]}
                      {device.minBillableMinutes > 0 ? ` · min ${device.minBillableMinutes} min` : ""}
                    </Td>
                    <Td>
                      <span className={rate.startsWith("0 DA") ? "text-warning" : ""}>{rate}</span>
                    </Td>
                    <Td>
                      <Badge tone={DEVICE_STATUS_TONES[device.status] ?? "neutral"}>
                        {DEVICE_STATUS_LABELS[device.status] ?? device.status}
                      </Badge>
                      {!device.isActive ? (
                        <Badge tone="neutral" className="ml-1">
                          Inactif
                        </Badge>
                      ) : null}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1">
                        <EditDeviceDialog
                          device={{
                            id: device.id,
                            name: device.name,
                            type: device.type,
                            location: device.location,
                            billingMode: device.billingMode,
                            hourlyRateCents: Number(device.hourlyRateCents),
                            matchRateCents: Number(device.matchRateCents),
                            fixedRateCents: Number(device.fixedRateCents),
                            minBillableMinutes: device.minBillableMinutes,
                            billingIncrementMinutes: device.billingIncrementMinutes,
                            rounding: device.rounding,
                            notes: device.notes,
                            isActive: device.isActive,
                            sortOrder: device.sortOrder,
                          }}
                        />
                        {!isBusy && device.status === "available" ? (
                          <>
                            <ActionButton
                              action={setDeviceStatusAction}
                              label="Maintenance"
                              fields={{ deviceId: device.id, status: "maintenance", reason: "Mise en maintenance" }}
                              variant="ghost"
                            />
                            <ActionButton
                              action={setDeviceStatusAction}
                              label="Hors service"
                              fields={{ deviceId: device.id, status: "out_of_service", reason: "Panne" }}
                              variant="ghost"
                            />
                          </>
                        ) : null}
                        {!isBusy && (device.status === "maintenance" || device.status === "out_of_service") ? (
                          <ActionButton
                            action={setDeviceStatusAction}
                            label="Remettre en service"
                            fields={{ deviceId: device.id, status: "available", reason: "Retour en service" }}
                            variant="subtle"
                          />
                        ) : null}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <p className="text-[11px] text-muted">
        Les dossiers de maintenance détaillés (technicien, coût de réparation, historique) arrivent en Phase 4.
      </p>
    </div>
  );
}
