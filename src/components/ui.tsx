import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type ButtonSize = "sm" | "md" | "lg";

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 outline-none",
    "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
    "disabled:pointer-events-none disabled:opacity-50 active:scale-[0.985]",
    size === "sm" && "h-9 px-3 text-sm",
    size === "md" && "h-11 px-4 text-sm",
    size === "lg" && "h-12 px-6 text-base",
    variant === "primary" &&
      "bg-gradient-to-r from-accent to-accent-soft text-white shadow-lg shadow-accent/25 hover:brightness-110",
    variant === "secondary" && "border border-border-strong bg-surface-2 text-text hover:bg-surface-3",
    variant === "ghost" && "text-muted hover:bg-surface-2 hover:text-text",
    variant === "subtle" && "bg-accent/10 text-accent-soft hover:bg-accent/20",
    variant === "danger" && "bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20",
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("surface-card p-5", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({
  title,
  subtitle,
  action,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-3", className)}>
      <div>
        <h2 className="font-display text-base font-semibold tracking-tight">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "electric";

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}) {
  const tones: Record<BadgeTone, string> = {
    neutral: "bg-surface-3 text-muted border-border",
    accent: "bg-accent/12 text-accent-soft border-accent/30",
    success: "bg-success/12 text-success border-success/30",
    warning: "bg-warning/12 text-warning border-warning/30",
    danger: "bg-danger/12 text-danger border-danger/30",
    electric: "bg-electric/10 text-electric border-electric/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text placeholder:text-muted/70",
        "transition focus:border-accent/60 focus:ring-2 focus:ring-accent/25 focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text",
        "transition focus:border-accent/60 focus:ring-2 focus:ring-accent/25 focus:outline-none",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text placeholder:text-muted/70",
        "transition focus:border-accent/60 focus:ring-2 focus:ring-accent/25 focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-xs font-medium tracking-wide text-muted uppercase">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-border", className)}>
      <table className="w-full min-w-[640px] border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "border-b border-border bg-surface-2/60 px-3 py-2.5 text-left text-xs font-semibold tracking-wide text-muted uppercase",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("border-b border-border/60 px-3 py-3 align-middle", className)}>{children}</td>;
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "accent",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "accent" | "success" | "electric" | "warning" | "danger";
}) {
  const tones: Record<string, string> = {
    accent: "from-accent/20 text-accent-soft",
    success: "from-success/20 text-success",
    electric: "from-electric/20 text-electric",
    warning: "from-warning/20 text-warning",
    danger: "from-danger/20 text-danger",
  };
  return (
    <div className="surface-card relative overflow-hidden p-4">
      <div
        className={cn(
          "pointer-events-none absolute -top-12 -right-10 h-28 w-28 rounded-full bg-gradient-to-br to-transparent blur-2xl",
          tones[tone],
        )}
      />
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">{label}</p>
        {icon ? <span className={cn("opacity-80", tones[tone]?.split(" ")[1])}>{icon}</span> : null}
      </div>
      <p className="font-display mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function Alert({
  tone = "danger",
  children,
}: {
  tone?: "danger" | "warning" | "success" | "info";
  children: React.ReactNode;
}) {
  const tones = {
    danger: "border-danger/30 bg-danger/10 text-danger",
    warning: "border-warning/30 bg-warning/10 text-warning",
    success: "border-success/30 bg-success/10 text-success",
    info: "border-electric/30 bg-electric/10 text-electric",
  } as const;
  return (
    <div className={cn("rounded-xl border px-3.5 py-2.5 text-sm", tones[tone])} role="status">
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
export function Label({
  htmlFor,
  children,
  className,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn(
        "block text-xs font-medium tracking-wide text-muted uppercase",
        className,
      )}
    >
      {children}
    </label>
  );
}
export function Sheet({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="relative">{children}</div>;
}
export function SheetTrigger({ children, ...props }: React.HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-1.5 text-xs text-muted hover:bg-surface-3"
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}
export function SheetContent({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="overflow-auto rounded-xl border border-border bg-surface p-4">{children}</div>;
}

export function SheetHeader({ children }: { children: React.ReactNode }) {
  return <div className="mb-3">{children}</div>;
}
export function SheetTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-semibold">{children}</h2>;
}
