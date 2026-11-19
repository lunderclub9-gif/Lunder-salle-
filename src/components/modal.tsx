"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { buttonClass } from "./ui";
import { cn } from "@/lib/cn";

export function Modal({
  triggerLabel,
  title,
  description,
  children,
  triggerClassName,
  triggerVariant = "primary",
  triggerSize = "md",
  icon,
  wide,
}: {
  triggerLabel: string;
  title: string;
  description?: string;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  triggerClassName?: string;
  triggerVariant?: "primary" | "secondary" | "ghost" | "danger" | "subtle";
  triggerSize?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClass(triggerVariant, triggerSize, triggerClassName)}
      >
        {icon}
        {triggerLabel}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
          <button
            aria-label="Fermer"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={close}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={cn(
              "animate-rise relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-surface p-6 shadow-2xl sm:rounded-2xl",
              wide ? "sm:max-w-3xl" : "sm:max-w-lg",
            )}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-semibold">{title}</h2>
                {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Fermer"
                className="rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {typeof children === "function" ? children(close) : children}
          </div>
        </div>
      ) : null}
    </>
  );
}
