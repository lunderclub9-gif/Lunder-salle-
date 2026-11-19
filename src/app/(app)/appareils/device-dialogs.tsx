"use client";

import { Pencil, Plus } from "lucide-react";
import { Modal } from "@/components/modal";
import { ActionForm } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { createDeviceAction, updateDeviceAction } from "@/app/actions/catalog";
import { centsToInput } from "@/lib/money";

interface DeviceDefaults {
  id: string;
  name: string;
  type: string;
  location: string;
  billingMode: string;
  hourlyRateCents: number;
  matchRateCents: number;
  fixedRateCents: number;
  minBillableMinutes: number;
  billingIncrementMinutes: number;
  rounding: string;
  notes: string;
  isActive: boolean;
  sortOrder: number;
}

function PricingFields({ device }: { device?: DeviceDefaults }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Mode de facturation">
          <Select name="billingMode" defaultValue={device?.billingMode ?? "hourly"}>
            <option value="hourly">À l&apos;heure</option>
            <option value="match">Par match</option>
            <option value="fixed">Session fixe</option>
          </Select>
        </Field>
        <Field label="Incrément (minutes)">
          <Input
            name="increment"
            type="number"
            min={1}
            defaultValue={device?.billingIncrementMinutes ?? 60}
          />
        </Field>
        <Field label="Tarif horaire (DA)">
          <Input
            name="hourlyRate"
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={device ? centsToInput(device.hourlyRateCents) : ""}
          />
        </Field>
        <Field label="Tarif par match (DA)">
          <Input
            name="matchRate"
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={device ? centsToInput(device.matchRateCents) : ""}
          />
        </Field>
        <Field label="Tarif session fixe (DA)">
          <Input
            name="fixedRate"
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={device ? centsToInput(device.fixedRateCents) : ""}
          />
        </Field>
        <Field label="Minimum facturable (min)">
          <Input
            name="minBillableMinutes"
            type="number"
            min={0}
            defaultValue={device?.minBillableMinutes ?? 0}
          />
        </Field>
        <Field label="Arrondi">
          <Select name="rounding" defaultValue={device?.rounding ?? "up"}>
            <option value="up">Arrondi supérieur</option>
            <option value="nearest">Au plus proche</option>
            <option value="none">Aucun</option>
          </Select>
        </Field>
        <Field label="Ordre d'affichage">
          <Input name="sortOrder" type="number" defaultValue={device?.sortOrder ?? 0} />
        </Field>
      </div>
      <p className="text-[11px] text-muted">
        Laisser un tarif à 0 DA bloque la facturation utile : configurez au moins le tarif du mode choisi.
      </p>
    </>
  );
}

export function CreateDeviceDialog() {
  return (
    <Modal
      triggerLabel="Nouvel appareil"
      title="Ajouter un appareil"
      description="PlayStation, table de billard ou autre poste. Le nombre d'appareils n'est pas limité."
      icon={<Plus className="h-4 w-4" />}
    >
      <ActionForm action={createDeviceAction} submitLabel="Créer l'appareil">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Nom">
            <Input name="name" required placeholder="PlayStation 7" maxLength={80} />
          </Field>
          <Field label="Type">
            <Select name="type" defaultValue="playstation">
              <option value="playstation">PlayStation</option>
              <option value="billiard">Billard</option>
              <option value="other">Autre</option>
            </Select>
          </Field>
        </div>
        <Field label="Emplacement">
          <Input name="location" placeholder="Salle principale" maxLength={80} />
        </Field>
        <PricingFields />
      </ActionForm>
    </Modal>
  );
}

export function EditDeviceDialog({ device }: { device: DeviceDefaults }) {
  return (
    <Modal
      triggerLabel=""
      title={`Modifier ${device.name}`}
      description="Les changements de tarif ne s'appliquent qu'aux nouvelles sessions."
      icon={<Pencil className="h-3.5 w-3.5" />}
      triggerVariant="ghost"
      triggerSize="sm"
      triggerClassName="px-2"
      wide
    >
      <ActionForm action={updateDeviceAction} submitLabel="Enregistrer" hidden={{ deviceId: device.id }}>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Nom">
            <Input name="name" defaultValue={device.name} required maxLength={80} />
          </Field>
          <Field label="Type">
            <Select name="type" defaultValue={device.type}>
              <option value="playstation">PlayStation</option>
              <option value="billiard">Billard</option>
              <option value="other">Autre</option>
            </Select>
          </Field>
        </div>
        <Field label="Emplacement">
          <Input name="location" defaultValue={device.location} maxLength={80} />
        </Field>
        <PricingFields device={device} />
        <Field label="Notes">
          <Textarea name="notes" rows={2} defaultValue={device.notes} maxLength={500} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={device.isActive}
            className="h-4 w-4 accent-[#8b5cf6]"
          />
          Appareil actif
        </label>
      </ActionForm>
    </Modal>
  );
}
