import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { Clock, Gamepad2, Monitor, Pause, Play, Square } from "lucide-react";
import { db } from "@/db";
import { customers, devices, gameSessions } from "@/db/schema";
import { can, requireUser } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { listPendingSessions } from "@/lib/services/sessions";
import { getOpenShift } from "@/lib/services/shifts";
import { formatCents } from "@/lib/money";
import {
  BILLING_MODE_LABELS,
  DEVICE_STATUS_LABELS,
  DEVICE_STATUS_TONES,
  DEVICE_TYPE_LABELS,
  ROUNDING_LABELS,
} from "@/lib/labels";
import { Badge, Card, CardTitle, EmptyState, PageHeader, Table, Td, Th, buttonClass } from "@/components/ui";
import { SessionTimer } from "@/components/session-timer";
import { ActionButton } from "@/components/action-form";
import { StartSessionDialog, TransferDialog } from "./session-controls";
import {
  endSessionAction,
  pauseSessionAction,
  resumeSessionAction,
} from "@/app/actions/sessions";
import { formatDateFr } from "@/lib/cn";

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  const user = await requireUser();
  if (!can(user, PERMISSIONS.SESSIONS_MANAGE)) {
    return <EmptyState title="Accès refusé" description="Votre rôle ne permet pas de gérer les sessions." />;
  }

  const [deviceRows, activeRows, pendingRows, customerRows, shift] = await Promise.all([
    db.select().from(devices).orderBy(devices.sortOrder, devices.name),
    db
      .select({ session: gameSessions, customerName: customers.fullName })
      .from(gameSessions)
      .leftJoin(customers, eq(customers.id, gameSessions.customerId))
      .where(inArray(gameSessions.status, ["running", "paused"]))
      .orderBy(desc(gameSessions.startedAt)),
    listPendingSessions(),
    can(user, PERMISSIONS.CUSTOMERS_VIEW)
      ? db
          .select({ id: customers.id, fullName: customers.fullName, phone: customers.phone })
          .from(customers)
          .orderBy(customers.fullName)
          .limit(200)
      : Promise.resolve([]),
    getOpenShift(user.id),
  ]);

  const activeByDevice = new Map(activeRows.map((row) => [row.session.deviceId, row]));
  const availableDevices = deviceRows.filter(
    (device) => device.isActive && !activeByDevice.has(device.id) && device.status !== "maintenance" && device.status !== "out_of_service",
  );

  const pendingTotal = pendingRows.reduce(
    (total, row) => total + Number(row.session.computedAmountCents ?? 0),
    0,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sessions"
        description="Chronométrage serveur : le temps en pause n'est jamais facturé."
        actions={
          <div className="flex items-center gap-2">
            {!shift ? (
              <Link href="/caisse-journal" className={buttonClass("secondary", "md")}>
                Ouvrir la caisse
              </Link>
            ) : null}
            <StartSessionDialog devices={availableDevices} customers={customerRows} />
          </div>
        }
      />

      {availableDevices.length === 0 && deviceRows.length === 0 ? (
        <EmptyState
          title="Aucun appareil configuré"
          description="Ajoutez vos PlayStation et votre table de billard pour démarrer des sessions."
          action={
            <Link href="/appareils" className={buttonClass("primary", "md")}>
              Configurer les appareils
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {deviceRows.map((device) => {
            const active = activeByDevice.get(device.id);
            const tone = DEVICE_STATUS_TONES[device.status] ?? "neutral";
            const priceLabel =
              device.billingMode === "hourly"
                ? `${formatCents(Number(device.hourlyRateCents))} / heure`
                : device.billingMode === "match"
                  ? `${formatCents(Number(device.matchRateCents))} / match`
                  : `${formatCents(Number(device.fixedRateCents))} / session`;

            return (
              <Card
                key={device.id}
                className={`relative overflow-hidden transition ${
                  active ? "glow-accent" : "hover:border-border-strong"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-3 text-accent-soft">
                      {device.type === "billiard" ? <Monitor className="h-4 w-4" /> : <Gamepad2 className="h-4 w-4" />}
                    </span>
                    <div>
                      <p className="font-medium">{device.name}</p>
                      <p className="text-[11px] text-muted">
                        {DEVICE_TYPE_LABELS[device.type]} · {device.location || "Salle"}
                      </p>
                    </div>
                  </div>
                  <Badge tone={tone}>{DEVICE_STATUS_LABELS[device.status]}</Badge>
                </div>

                <div className="mt-3 space-y-1 text-xs text-muted">
                  <p>{priceLabel}</p>
                  <p>
                    {BILLING_MODE_LABELS[device.billingMode]} · incrément {device.billingIncrementMinutes} min ·{" "}
                    {ROUNDING_LABELS[device.rounding]}
                  </p>
                  {device.minBillableMinutes > 0 ? (
                    <p>Minimum facturable : {device.minBillableMinutes} min</p>
                  ) : null}
                  {Number(device.hourlyRateCents) === 0 && device.billingMode === "hourly" ? (
                    <p className="text-warning">Tarif à configurer</p>
                  ) : null}
                </div>

                {active ? (
                  <div className="mt-4 space-y-3 rounded-xl border border-accent/20 bg-accent/5 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] tracking-wide text-muted uppercase">Temps de jeu</span>
                      <SessionTimer
                        startedAt={new Date(active.session.startedAt).toISOString()}
                        pausedSeconds={active.session.pausedSeconds}
                        pausedAt={active.session.pausedAt ? new Date(active.session.pausedAt).toISOString() : null}
                        running={active.session.status === "running"}
                        className="font-display text-lg font-semibold text-accent-soft"
                      />
                    </div>
                    <p className="text-[11px] text-muted">
                      {active.session.customerId ? `Client : ${active.customerName ?? "—"}` : "Client non renseigné"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {active.session.status === "running" ? (
                        <ActionButton
                          action={pauseSessionAction}
                          label="Pause"
                          fields={{ sessionId: active.session.id }}
                          icon={<Pause className="h-3.5 w-3.5" />}
                          variant="secondary"
                        />
                      ) : (
                        <ActionButton
                          action={resumeSessionAction}
                          label="Reprendre"
                          fields={{ sessionId: active.session.id }}
                          icon={<Play className="h-3.5 w-3.5" />}
                          variant="primary"
                        />
                      )}
                      <ActionButton
                        action={endSessionAction}
                        label="Terminer"
                        fields={{ sessionId: active.session.id }}
                        icon={<Square className="h-3.5 w-3.5" />}
                        variant="danger"
                        confirmMessage="Terminer cette session et calculer le montant ?"
                      />
                      <TransferDialog
                        sessionId={active.session.id}
                        devices={deviceRows.filter(
                          (item) =>
                            item.id !== device.id &&
                            item.isActive &&
                            !activeByDevice.has(item.id) &&
                            item.status !== "maintenance" &&
                            item.status !== "out_of_service",
                        )}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-4">
                    {device.isActive ? (
                      <StartSessionDialog
                        devices={[device]}
                        customers={customerRows}
                        presetDeviceId={device.id}
                        triggerLabel="Démarrer"
                        triggerSize="sm"
                        triggerVariant="subtle"
                        triggerClassName="w-full"
                      />
                    ) : (
                      <p className="text-xs text-muted">Appareil désactivé</p>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardTitle
          title="À encaisser"
          subtitle={`${pendingRows.length} session(s) terminée(s) en attente de paiement · ${formatCents(pendingTotal)}`}
          action={
            pendingRows.length > 0 && can(user, PERMISSIONS.POS_SELL) ? (
              <Link href="/caisse" className={buttonClass("primary", "sm")}>
                Encaisser
              </Link>
            ) : null
          }
        />
        {pendingRows.length === 0 ? (
          <EmptyState
            title="Aucune session en attente"
            description="Les sessions terminées apparaissent ici jusqu'à leur encaissement."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Appareil</Th>
                <Th>Début</Th>
                <Th>Fin</Th>
                <Th>Durée facturée</Th>
                <Th className="text-right">Montant</Th>
              </tr>
            </thead>
            <tbody>
              {pendingRows.map((row) => (
                <tr key={row.session.id}>
                  <Td className="font-medium">{row.deviceName}</Td>
                  <Td className="text-muted">{formatDateFr(row.session.startedAt)}</Td>
                  <Td className="text-muted">
                    {row.session.endedAt ? formatDateFr(row.session.endedAt) : "—"}
                  </Td>
                  <Td>
                    <span className="inline-flex items-center gap-1.5 text-muted">
                      <Clock className="h-3.5 w-3.5" />
                      {row.session.billableMinutes ?? 0} min
                    </span>
                  </Td>
                  <Td className="text-right font-medium">
                    {formatCents(Number(row.session.computedAmountCents ?? 0))}
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
