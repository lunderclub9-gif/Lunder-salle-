"use client";

import { useActionState } from "react";
import { MessageCircle } from "lucide-react";
import { prepareReminderAction, type ReminderState } from "@/app/actions/whatsapp";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function WhatsAppReminderButton({ customerId }: { customerId: string }) {
  const [state, formAction] = useActionState<ReminderState, FormData>(prepareReminderAction, {});

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="customerId" value={customerId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}
      {state.href ? (
        <a
          href={state.href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl bg-success/15 px-3 py-2 text-sm font-medium text-success hover:bg-success/25"
        >
          <MessageCircle className="h-4 w-4" /> Ouvrir WhatsApp
        </a>
      ) : null}
      <SubmitButton variant="secondary" className="w-full" pendingLabel="Préparation…">
        <MessageCircle className="h-4 w-4" /> Préparer un rappel WhatsApp
      </SubmitButton>
    </form>
  );
}
