import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { devices, reservations } from "@/db/schema";
import { requirePermission, can } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { formatDateFr } from "@/lib/cn";
import { RESERVATION_STATUS_LABELS } from "@/lib/labels";
import { Card, CardTitle, EmptyState, Input, Label, PageHeader, Select, Table, Td, Textarea, Th } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { cancelReservationAction, createReservationAction, markReservationAction } from "@/app/actions/operations";

export const dynamic = "force-dynamic";

function localInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default async function ReservationsPage() {
  const user = await requirePermission(PERMISSIONS.RESERVATIONS_MANAGE);

  const now = new Date();
  const [deviceRows, upcoming] = await Promise.all([
    db.select({ id: devices.id, name: devices.name }).from(devices).where(eq(devices.isActive, true)).orderBy(devices.sortOrder, devices.name),
    db
      .select({ reservation: reservations, deviceName: devices.name })
      .from(reservations)
      .leftJoin(devices, eq(devices.id, reservations.deviceId))
      .where(and(gte(reservations.endAt, now)))
      .orderBy(reservations.startAt)
      .limit(100),
  ]);

  const later = new Date(now.getTime() + 60 * 60 * 1000);
  const deviceOptions = deviceRows.map((d) => (
    <option key={d.id} value={d.id}>
      {d.name}
    </option>
  ));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Réservations"
        description="Créneaux réservés par appareil. Un conflit sur le même appareil est refusé."
        actions={
          can(user, PERMISSIONS.RESERVATIONS_MANAGE) ? (
            <ActionForm action={createReservationAction} submitLabel="Enregistrer la réservation">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="deviceId">Appareil</Label>
                  <Select id="deviceId" name="deviceId" required>
                    <option value="">Sélectionner…</option>
                    {deviceOptions}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="customerName">Client</Label>
                  <Input id="customerName" name="customerName" required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="customerPhone">Téléphone</Label>
                  <Input id="customerPhone" name="customerPhone" inputMode="tel" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="partySize">Personnes</Label>
                  <Input id="partySize" name="partySize" type="number" min="1" defaultValue="1" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="startAt">Début</Label>
                  <Input id="startAt" name="startAt" type="datetime-local" defaultValue={localInputValue(now)} required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="endAt">Fin</Label>
                  <Input id="endAt" name="endAt" type="datetime-local" defaultValue={localInputValue(later)} required />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea id="notes" name="notes" rows={2} />
                </div>
              </div>
            </ActionForm>
          ) : null
        }
      />

      <Card>
        <CardTitle title="À venir" subtitle="Réservations non terminées, classées par heure de début." />
        {upcoming.length === 0 ? (
          <EmptyState title="Aucune réservation" description="Les créneaux réservés apparaissent ici." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Début</Th>
                <Th>Fin</Th>
                <Th>Appareil</Th>
                <Th>Client</Th>
                <Th className="text-right">Personnes</Th>
                <Th>Statut</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((row) => (
                <tr key={row.reservation.id} className="transition hover:bg-surface-2/40">
                  <Td>{formatDateFr(row.reservation.startAt)}</Td>
                  <Td className="text-muted">{formatDateFr(row.reservation.endAt)}</Td>
                  <Td className="font-medium">{row.deviceName ?? "—"}</Td>
                  <Td>
                    {row.reservation.customerName}
                    {row.reservation.customerPhone ? <span className="text-muted"> · {row.reservation.customerPhone}</span> : null}
                  </Td>
                  <Td className="text-right">{row.reservation.partySize}</Td>
                  <Td className="text-muted">{RESERVATION_STATUS_LABELS[row.reservation.status] ?? row.reservation.status}</Td>
                  <Td>
                    {row.reservation.status === "booked" ? (
                      <div className="flex flex-wrap items-start gap-2">
                        <ActionForm
                          action={markReservationAction}
                          submitLabel="Installer"
                          variant="secondary"
                          size="sm"
                          hidden={{ reservationId: row.reservation.id, status: "seated" }}
                        />
                        <ActionForm
                          action={markReservationAction}
                          submitLabel="Absent"
                          variant="ghost"
                          size="sm"
                          hidden={{ reservationId: row.reservation.id, status: "no_show" }}
                        />
                        <ActionForm
                          action={cancelReservationAction}
                          submitLabel="Annuler"
                          variant="danger"
                          size="sm"
                          hidden={{ reservationId: row.reservation.id }}
                        >
                          <Input name="reason" placeholder="Motif" required className="h-8 text-xs" />
                        </ActionForm>
                      </div>
                    ) : (
                      <span className="text-muted">—</span>
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
