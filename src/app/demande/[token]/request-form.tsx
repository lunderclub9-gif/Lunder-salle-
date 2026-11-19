"use client";

import { useActionState } from "react";
import { Check, Send } from "lucide-react";
import { submitCustomerRequestAction } from "@/app/actions/requests";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { ActionState } from "@/lib/action-state";

export function RequestForm({
  token,
  devices,
}: {
  token: string;
  devices: Array<{ id: string; name: string; location: string }>;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(submitCustomerRequestAction, {});

  if (state.ok) {
    return (
      <div className="surface-card p-8 text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-success/12 text-success">
          <Check className="h-7 w-7" />
        </span>
        <h2 className="font-display text-xl font-semibold">Demande envoyée</h2>
        <p className="mt-2 text-sm text-muted">{state.message}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 text-sm text-accent-soft hover:underline"
        >
          Envoyer une autre demande
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="surface-card space-y-3 p-5">
      <input type="hidden" name="token" value={token} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label="Appareil (facultatif)">
        <Select name="deviceId" defaultValue="">
          <option value="">Je ne sais pas / autre</option>
          {devices.map((device) => (
            <option key={device.id} value={device.id}>
              {device.name}
              {device.location ? ` · ${device.location}` : ""}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Type de demande">
        <Select name="type" defaultValue="assistance">
          <option value="assistance">Assistance / un employé</option>
          <option value="order">Commande (boisson, snack)</option>
          <option value="other">Autre</option>
        </Select>
      </Field>

      <Field label="Votre demande">
        <Textarea
          name="note"
          rows={3}
          required
          minLength={3}
          maxLength={300}
          placeholder="Ex. : manette 2 ne répond plus, apporter une boisson…"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Prénom (facultatif)">
          <Input name="customerName" maxLength={80} placeholder="Pour vous reconnaître" />
        </Field>
        <Field label="Téléphone (facultatif)">
          <Input name="customerPhone" maxLength={20} inputMode="tel" placeholder="0550 00 00 00" />
        </Field>
      </div>

      <SubmitButton className="w-full" pendingLabel="Envoi…">
        <Send className="h-4 w-4" /> Envoyer la demande
      </SubmitButton>
      <p className="text-center text-[11px] text-muted">
        Les informations envoyées servent uniquement à traiter la demande sur place.
      </p>
    </form>
  );
}
