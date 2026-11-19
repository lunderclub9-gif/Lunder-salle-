"use client";

import { useActionState } from "react";
import { Alert } from "./ui";
import { SubmitButton } from "./submit-button";
import { cn } from "@/lib/cn";
import type { ActionState } from "@/lib/action-state";

type ServerAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel,
  variant = "primary",
  size = "md",
  className,
  submitClassName,
  hidden,
  showSubmit = true,
  footer,
}: {
  action: ServerAction;
  children?: React.ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "subtle";
  size?: "sm" | "md" | "lg";
  className?: string;
  submitClassName?: string;
  hidden?: Record<string, string | number | null | undefined>;
  showSubmit?: boolean;
  footer?: React.ReactNode;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className={cn("space-y-3", className)}>
      {hidden
        ? Object.entries(hidden).map(([key, value]) =>
            value === undefined || value === null ? null : (
              <input key={key} type="hidden" name={key} value={String(value)} />
            ),
          )
        : null}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.message ? <Alert tone="success">{state.message}</Alert> : null}
      {children}
      {showSubmit ? (
        <SubmitButton
          variant={variant}
          size={size}
          className={cn("w-full", submitClassName)}
          pendingLabel={pendingLabel ?? "Traitement…"}
        >
          {submitLabel}
        </SubmitButton>
      ) : null}
      {footer}
    </form>
  );
}

export function ActionButton({
  action,
  label,
  pendingLabel,
  fields,
  variant = "secondary",
  size = "sm",
  icon,
  className,
  confirmMessage,
  title,
}: {
  action: ServerAction;
  label: string;
  pendingLabel?: string;
  fields?: Record<string, string | number | null | undefined>;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "subtle";
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
  className?: string;
  confirmMessage?: string;
  title?: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <form
      action={formAction}
      className={cn("inline-flex flex-col gap-1", className)}
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      {fields
        ? Object.entries(fields).map(([key, value]) =>
            value === undefined || value === null ? null : (
              <input key={key} type="hidden" name={key} value={String(value)} />
            ),
          )
        : null}
      <SubmitButton variant={variant} size={size} pendingLabel={pendingLabel ?? label} title={title}>
        {icon}
        {label}
      </SubmitButton>
      {state.error ? <span className="text-[11px] text-danger">{state.error}</span> : null}
      {state.message ? <span className="text-[11px] text-success">{state.message}</span> : null}
    </form>
  );
}
