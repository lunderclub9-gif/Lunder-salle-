"use client";

import { Plus } from "lucide-react";
import { Modal } from "@/components/modal";
import { ActionForm } from "@/components/action-form";
import { Field, Input, Textarea } from "@/components/ui";
import { createCustomerAction } from "@/app/actions/customers";

export function NewCustomerDialog() {
  return (
    <Modal
      triggerLabel="Nouveau client"
      title="Créer un client"
      description="Le crédit reste désactivé par défaut : le plafond doit être activé explicitement."
      icon={<Plus className="h-4 w-4" />}
    >
      <ActionForm action={createCustomerAction} submitLabel="Créer le client">
        <Field label="Nom complet">
          <Input name="fullName" required placeholder="Nom du client" maxLength={120} />
        </Field>
        <Field label="Téléphone (facultatif)">
          <Input name="phone" inputMode="tel" placeholder="0X XX XX XX XX" maxLength={20} />
        </Field>
        <Field label="Note (facultatif)">
          <Textarea name="notes" rows={2} placeholder="Habitué, préférences…" maxLength={500} />
        </Field>
      </ActionForm>
    </Modal>
  );
}
