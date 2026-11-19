"use client";

import { useState } from "react";
import { ArrowLeftRight, Plus } from "lucide-react";
import { Modal } from "@/components/modal";
import { ActionForm } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { startSessionAction, transferSessionAction } from "@/app/actions/sessions";
import { BILLING_MODE_LABELS, DEVICE_TYPE_LABELS } from "@/lib/labels";
import { formatCents } from "@/lib/money";

interface DeviceOption {
  id: string;
  name: string;
  type: string;
  billingMode: string;
  hourlyRateCents: number;
  matchRateCents: number;
  fixedRateCents: number;
}

interface CustomerOption {
  id: string;
  fullName: string;
  phone: string;
}

export function StartSessionDialog({
  devices,
  customers,
  presetDeviceId,
  triggerLabel = "Démarrer une session",
  triggerSize = "md",
  triggerVariant = "primary",
  triggerClassName,
}: {
  devices: DeviceOption[];
  customers: CustomerOption[];
  presetDeviceId?: string;
  triggerLabel?: string;
  triggerSize?: "sm" | "md" | "lg";
  triggerVariant?: "primary" | "secondary" | "ghost" | "danger" | "subtle";
  triggerClassName?: string;
}) {
  const [deviceId, setDeviceId] = useState(presetDeviceId ?? devices[0]?.id ?? "");
  const [customerId, setCustomerId] = useState("");
  const selected = devices.find((device) => device.id === deviceId);
  const selectedCustomer = customers.find((customer) => customer.id === customerId);

  return (
    <Modal
      triggerLabel={triggerLabel}
      triggerSize={triggerSize}
      triggerVariant={triggerVariant}
      triggerClassName={triggerClassName}
      icon={triggerLabel === "Démarrer" ? undefined : <Plus className="h-4 w-4" />}
      title="Démarrer une session"
      description="Le tarif est figé au démarrage : une modification de prix n'affecte pas une session en cours."
    >
      <ActionForm action={startSessionAction} submitLabel="Démarrer la session" hidden={{ deviceId }}>
        <Field label="Appareil">
          <Select value={deviceId} onChange={(event) => setDeviceId(event.target.value)}>
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name} — {DEVICE_TYPE_LABELS[device.type] ?? device.type}
              </option>
            ))}
          </Select>
        </Field>

        {selected ? (
          <p className="rounded-lg border border-border bg-surface-2/50 px-3 py-2 text-xs text-muted">
            {BILLING_MODE_LABELS[selected.billingMode]} ·{" "}
            {selected.billingMode === "hourly"
              ? `${formatCents(selected.hourlyRateCents)} / heure`
              : selected.billingMode === "match"
                ? `${formatCents(selected.matchRateCents)} / match`
                : `${formatCents(selected.fixedRateCents)} / session`}
          </p>
        ) : null}

        <Field label="Client (facultatif)">
          <Select name="customerId" value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
            <option value="">Sans client</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.fullName}
                {customer.phone ? ` · ${customer.phone}` : ""}
              </option>
            ))}
          </Select>
        </Field>

        {selectedCustomer ? (
          <p className="text-xs text-muted">
            La session sera rattachée à ce client et pourra être facturée avec ses produits.
          </p>
        ) : null}

        <Field label="Nombre de matchs" hint="Utilisé uniquement pour la facturation par match.">
          <Input name="matches" type="number" min={1} defaultValue={1} />
        </Field>

        <Field label="Note (facultatif)">
          <Textarea name="notes" rows={2} placeholder="Manette supplémentaire, demande particulière…" />
        </Field>
      </ActionForm>
    </Modal>
  );
}

export function TransferDialog({ sessionId, devices }: { sessionId: string; devices: DeviceOption[] }) {
  const [targetDeviceId, setTargetDeviceId] = useState(devices[0]?.id ?? "");

  if (devices.length === 0) {
    return (
      <span className="text-[11px] text-muted">Aucun appareil disponible pour un transfert</span>
    );
  }

  return (
    <Modal
      triggerLabel="Transférer"
      triggerVariant="ghost"
      triggerSize="sm"
      icon={<ArrowLeftRight className="h-3.5 w-3.5" />}
      title="Transférer la session"
      description="Le temps de jeu écoulé est conservé : le transfert ne remet pas le chronomètre à zéro."
    >
      <ActionForm
        action={transferSessionAction}
        submitLabel="Transférer"
        hidden={{ sessionId, targetDeviceId }}
      >
        <Field label="Appareil de destination">
          <Select value={targetDeviceId} onChange={(event) => setTargetDeviceId(event.target.value)}>
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </Select>
        </Field>
      </ActionForm>
    </Modal>
  );
}
