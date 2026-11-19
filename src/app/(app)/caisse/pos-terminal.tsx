"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  CreditCard,
  Minus,
  Plus,
  Printer,
  ReceiptText,
  ShoppingCart,
  Trash2,
  UserRound,
} from "lucide-react";
import { checkoutAction, type CheckoutState } from "@/app/actions/pos";
import { formatCents } from "@/lib/money";
import { Alert, Badge, Card, CardTitle, EmptyState, Field, Input, Select, Textarea, buttonClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { cn } from "@/lib/cn";

interface PendingSession {
  id: string;
  deviceName: string;
  label: string;
  amountCents: number;
  endedAt: string;
}

interface ProductOption {
  id: string;
  name: string;
  priceCents: number;
  stockQuantity: number;
  categoryId: string | null;
}

interface CustomerOption {
  id: string;
  fullName: string;
  phone: string;
  balanceCents: number;
  creditLimitCents: number;
  creditEnabled: boolean;
  creditBlocked: boolean;
}

interface PaymentRow {
  key: string;
  method: "cash" | "card" | "mobile" | "transfer";
  amount: string;
  reference: string;
}

export function PosTerminal({
  pendingSessions,
  products,
  categories,
  customers,
  creditEnabled,
  canDiscount,
  maxDiscountPercent,
  allowNegativeStock,
  shiftName,
}: {
  pendingSessions: PendingSession[];
  products: ProductOption[];
  categories: Array<{ id: string; name: string }>;
  customers: CustomerOption[];
  creditEnabled: boolean;
  canDiscount: boolean;
  maxDiscountPercent: number;
  allowNegativeStock: boolean;
  shiftName: string;
}) {
  const [state, formAction] = useActionState<CheckoutState, FormData>(checkoutAction, {});
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [customerId, setCustomerId] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [notes, setNotes] = useState("");
  const [useCredit, setUseCredit] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [payments, setPayments] = useState<PaymentRow[]>([
    { key: "p1", method: "cash", amount: "", reference: "" },
  ]);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()),
  );

  const customer = customers.find((item) => item.id === customerId) ?? null;

  const sessionSubtotal = useMemo(
    () =>
      pendingSessions
        .filter((session) => selectedSessions.includes(session.id))
        .reduce((total, session) => total + session.amountCents, 0),
    [pendingSessions, selectedSessions],
  );

  const cartLines = useMemo(
    () =>
      Object.entries(cart)
        .filter(([, quantity]) => quantity > 0)
        .map(([productId, quantity]) => {
          const product = products.find((item) => item.id === productId);
          return product
            ? { product, quantity, lineTotal: product.priceCents * quantity }
            : null;
        })
        .filter((line): line is { product: ProductOption; quantity: number; lineTotal: number } => line !== null),
    [cart, products],
  );

  const productSubtotal = cartLines.reduce((total, line) => total + line.lineTotal, 0);
  const subtotal = sessionSubtotal + productSubtotal;

  const percentValue = Math.max(0, Math.min(100, Number(discountPercent.replace(",", ".")) || 0));
  const discountCents = canDiscount
    ? Math.round((subtotal * Math.round(percentValue * 100)) / 10_000)
    : 0;
  const total = Math.max(0, subtotal - discountCents);

  const paidCents = payments.reduce(
    (sum, payment) => sum + Math.round((Number(payment.amount.replace(",", ".")) || 0) * 100),
    0,
  );
  const remaining = total - paidCents;

  const creditAvailable = customer
    ? Math.max(0, customer.creditLimitCents - customer.balanceCents)
    : 0;
  const creditPossible =
    creditEnabled &&
    customer !== null &&
    customer.creditEnabled &&
    !customer.creditBlocked &&
    remaining > 0 &&
    remaining <= creditAvailable;

  const hasLines = selectedSessions.length > 0 || cartLines.length > 0;

  function addProduct(product: ProductOption) {
    setCart((current) => {
      const quantity = current[product.id] ?? 0;
      if (!allowNegativeStock && quantity >= product.stockQuantity) return current;
      return { ...current, [product.id]: quantity + 1 };
    });
  }

  function setQuantity(productId: string, quantity: number, stock: number) {
    setCart((current) => {
      const next = { ...current };
      const bounded = Math.max(0, allowNegativeStock ? quantity : Math.min(quantity, stock));
      if (bounded === 0) delete next[productId];
      else next[productId] = bounded;
      return next;
    });
  }

  function fillRemaining(method: PaymentRow["method"]) {
    setPayments((current) => {
      const others = current.reduce(
        (sum, payment) => sum + Math.round((Number(payment.amount.replace(",", ".")) || 0) * 100),
        0,
      );
      const remainingCents = Math.max(0, total - others);
      const index = current.findIndex((payment) => payment.method === method);
      const amount = (remainingCents / 100).toFixed(2);
      if (index >= 0) {
        const next = [...current];
        next[index] = { ...next[index]!, amount };
        return next;
      }
      return [...current, { key: crypto.randomUUID(), method, amount, reference: "" }];
    });
  }

  function resetTerminal() {
    setSelectedSessions([]);
    setCart({});
    setCustomerId("");
    setDiscountPercent("");
    setDiscountReason("");
    setNotes("");
    setUseCredit(false);
    setPayments([{ key: "p1", method: "cash", amount: "", reference: "" }]);
    setIdempotencyKey(crypto.randomUUID());
  }

  if (state.ok && state.invoiceId) {
    return (
      <Card className="animate-rise mx-auto max-w-xl p-8 text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-success/12 text-success">
          <Check className="h-7 w-7" />
        </span>
        <h2 className="font-display text-xl font-semibold">Vente enregistrée</h2>
        <p className="mt-1 text-sm text-muted">{state.message}</p>
        <p className="font-display mt-4 text-3xl font-semibold">{formatCents(state.totalCents ?? total)}</p>
        <p className="mt-1 text-xs text-muted">Caisse : {shiftName}</p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Link
            href={`/imprimer/ticket/${state.invoiceId}`}
            target="_blank"
            className={buttonClass("primary", "md")}
          >
            <Printer className="h-4 w-4" /> Imprimer le ticket
          </Link>
          <Link href={`/factures/${state.invoiceId}`} className={buttonClass("secondary", "md")}>
            <ReceiptText className="h-4 w-4" /> Voir la facture
          </Link>
          <button type="button" onClick={resetTerminal} className={buttonClass("ghost", "md")}>
            Nouvelle vente
          </button>
        </div>
      </Card>
    );
  }

  const filteredProducts =
    categoryFilter === "all"
      ? products
      : products.filter((product) => product.categoryId === categoryFilter);

  return (
    <form action={formAction} className="grid gap-4 lg:grid-cols-[1fr_420px]">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="sessionIds" value={selectedSessions.join(",")} />
      {cartLines.map((line) => (
        <input key={line.product.id} type="hidden" name="productId" value={line.product.id} />
      ))}
      {cartLines.map((line) => (
        <input
          key={`q-${line.product.id}`}
          type="hidden"
          name="productQuantity"
          value={line.quantity}
        />
      ))}
      <input type="hidden" name="notes" value={notes} />
      <input type="hidden" name="customerId" value={customerId} />
      {canDiscount ? (
        <>
          <input type="hidden" name="discountPercent" value={percentValue} />
          <input type="hidden" name="discountReason" value={discountReason} />
        </>
      ) : null}
      {useCredit ? <input type="hidden" name="useCredit" value="on" /> : null}

      <div className="space-y-4">
        <Card>
          <CardTitle
            title="Sessions à encaisser"
            subtitle="Sessions terminées, non encore facturées."
            action={<Badge tone={selectedSessions.length > 0 ? "accent" : "neutral"}>{selectedSessions.length} sélectionnée(s)</Badge>}
          />
          {pendingSessions.length === 0 ? (
            <EmptyState
              title="Aucune session en attente"
              description="Terminez une session depuis la page Sessions pour l'encaisser ici."
              action={
                <Link href="/sessions" className={buttonClass("secondary", "sm")}>
                  Voir les sessions
                </Link>
              }
            />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {pendingSessions.map((session) => {
                const selected = selectedSessions.includes(session.id);
                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() =>
                      setSelectedSessions((current) =>
                        selected ? current.filter((id) => id !== session.id) : [...current, session.id],
                      )
                    }
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-xl border p-3 text-left transition",
                      selected
                        ? "border-accent/60 bg-accent/10 glow-accent"
                        : "border-border bg-surface-2/40 hover:border-border-strong",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{session.deviceName}</span>
                      <span className="block text-[11px] text-muted">{session.label}</span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold">
                      {formatCents(session.amountCents)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <CardTitle
            title="Produits"
            subtitle="Cliquez pour ajouter au ticket."
            action={
              products.length > 0 ? (
                <span className="text-[11px] text-muted">{cartLines.length} ligne(s)</span>
              ) : null
            }
          />
          {products.length === 0 ? (
            <EmptyState
              title="Catalogue vide"
              description="Ajoutez des produits avec leur prix pour les vendre."
              action={
                <Link href="/produits" className={buttonClass("secondary", "sm")}>
                  Gérer les produits
                </Link>
              }
            />
          ) : (
            <>
              <div className="mb-3 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setCategoryFilter("all")}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition",
                    categoryFilter === "all"
                      ? "border-accent/50 bg-accent/15 text-accent-soft"
                      : "border-border text-muted hover:text-text",
                  )}
                >
                  Tout
                </button>
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setCategoryFilter(category.id)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition",
                      categoryFilter === category.id
                        ? "border-accent/50 bg-accent/15 text-accent-soft"
                        : "border-border text-muted hover:text-text",
                    )}
                  >
                    {category.name}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {filteredProducts.map((product) => {
                  const out = !allowNegativeStock && product.stockQuantity <= 0;
                  const quantity = cart[product.id] ?? 0;
                  return (
                    <button
                      key={product.id}
                      type="button"
                      disabled={out}
                      onClick={() => addProduct(product)}
                      className={cn(
                        "group relative rounded-xl border p-3 text-left transition",
                        out
                          ? "cursor-not-allowed border-border/60 opacity-40"
                          : "border-border bg-surface-2/40 hover:border-accent/50 hover:bg-accent/5 active:scale-[0.98]",
                      )}
                    >
                      {quantity > 0 ? (
                        <span className="absolute top-2 right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">
                          {quantity}
                        </span>
                      ) : null}
                      <span className="block truncate text-sm font-medium">{product.name}</span>
                      <span className="mt-1 block text-sm font-semibold text-accent-soft">
                        {formatCents(product.priceCents)}
                      </span>
                      <span className={cn("mt-0.5 block text-[11px]", product.stockQuantity <= 0 ? "text-danger" : "text-muted")}>
                        {out ? "Rupture" : `Stock : ${product.stockQuantity}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </Card>

        {cartLines.length > 0 ? (
          <Card>
            <CardTitle title="Ticket" subtitle="Ajustez les quantités." />
            <ul className="space-y-2">
              {cartLines.map((line) => (
                <li key={line.product.id} className="flex items-center gap-2 rounded-xl bg-surface-2/40 p-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{line.product.name}</p>
                    <p className="text-[11px] text-muted">
                      {formatCents(line.product.priceCents)} × {line.quantity}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Retirer une unité"
                      className="rounded-lg border border-border p-1.5 text-muted hover:text-text"
                      onClick={() => setQuantity(line.product.id, line.quantity - 1, line.product.stockQuantity)}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-7 text-center text-sm">{line.quantity}</span>
                    <button
                      type="button"
                      aria-label="Ajouter une unité"
                      className="rounded-lg border border-border p-1.5 text-muted hover:text-text disabled:opacity-40"
                      disabled={!allowNegativeStock && line.quantity >= line.product.stockQuantity}
                      onClick={() => setQuantity(line.product.id, line.quantity + 1, line.product.stockQuantity)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Supprimer la ligne"
                      className="ml-1 rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                      onClick={() => setQuantity(line.product.id, 0, line.product.stockQuantity)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="w-24 text-right text-sm font-medium">
                    {formatCents(line.lineTotal)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>

      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardTitle title="Règlement" subtitle={`Caisse : ${shiftName}`} />

          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

          <div className="mt-3 space-y-3">
            <Field label="Client (facultatif)">
              <Select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
                <option value="">Sans client</option>
                {customers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.fullName}
                    {item.phone ? ` · ${item.phone}` : ""}
                  </option>
                ))}
              </Select>
            </Field>

            {customer ? (
              <div className="rounded-lg border border-border bg-surface-2/40 px-3 py-2 text-[11px] text-muted">
                <p className="flex items-center gap-1.5">
                  <UserRound className="h-3 w-3" />
                  Dette actuelle : <span className="font-medium text-text">{formatCents(customer.balanceCents)}</span>
                </p>
                {customer.creditEnabled ? (
                  <p className="mt-1">
                    Crédit disponible : {formatCents(creditAvailable)}
                    {customer.creditBlocked ? " · crédit bloqué" : ""}
                  </p>
                ) : (
                  <p className="mt-1">Crédit non activé pour ce client.</p>
                )}
              </div>
            ) : null}

            {canDiscount ? (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Remise (%)">
                  <Input
                    inputMode="decimal"
                    placeholder="0"
                    value={discountPercent}
                    onChange={(event) => setDiscountPercent(event.target.value)}
                  />
                </Field>
                <Field label="Motif">
                  <Input
                    placeholder="Geste commercial"
                    value={discountReason}
                    onChange={(event) => setDiscountReason(event.target.value)}
                  />
                </Field>
                <p className="col-span-2 -mt-1 text-[11px] text-muted">
                  Maximum autorisé : {maxDiscountPercent} %. Toute remise est journalisée.
                </p>
              </div>
            ) : null}

            <div className="space-y-1.5 rounded-xl border border-border bg-surface-2/30 p-3 text-sm">
              <div className="flex justify-between text-muted">
                <span>Sessions</span>
                <span>{formatCents(sessionSubtotal)}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Produits</span>
                <span>{formatCents(productSubtotal)}</span>
              </div>
              {discountCents > 0 ? (
                <div className="flex justify-between text-warning">
                  <span>Remise</span>
                  <span>-{formatCents(discountCents)}</span>
                </div>
              ) : null}
              <div className="mt-1 flex justify-between border-t border-border pt-2 text-base font-semibold">
                <span>Total</span>
                <span>{formatCents(total)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium tracking-wide text-muted uppercase">Paiements</span>
                <div className="flex gap-1">
                  {(["cash", "card", "mobile", "transfer"] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => fillRemaining(method)}
                      className="rounded-md border border-border px-2 py-0.5 text-[10px] text-muted hover:border-accent/40 hover:text-text"
                    >
                      {method === "cash" ? "Espèces" : method === "card" ? "Carte" : method === "mobile" ? "Mobile" : "Virement"}
                    </button>
                  ))}
                </div>
              </div>

              {payments.map((payment, index) => (
                <div key={payment.key} className="flex gap-2">
                  <Select
                    name="paymentMethod"
                    value={payment.method}
                    onChange={(event) =>
                      setPayments((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, method: event.target.value as PaymentRow["method"] }
                            : item,
                        ),
                      )
                    }
                    className="w-32 shrink-0"
                  >
                    <option value="cash">Espèces</option>
                    <option value="card">Carte</option>
                    <option value="mobile">Mobile</option>
                    <option value="transfer">Virement</option>
                  </Select>
                  <Input
                    name="paymentAmount"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={payment.amount}
                    onChange={(event) =>
                      setPayments((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, amount: event.target.value } : item,
                        ),
                      )
                    }
                  />
                  <input type="hidden" name="paymentReference" value={payment.reference} />
                  {payments.length > 1 ? (
                    <button
                      type="button"
                      aria-label="Supprimer ce paiement"
                      className="rounded-lg px-2 text-muted hover:text-danger"
                      onClick={() => setPayments((current) => current.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              ))}

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() =>
                    setPayments((current) => [
                      ...current,
                      { key: crypto.randomUUID(), method: "card", amount: "", reference: "" },
                    ])
                  }
                  className="text-xs text-accent-soft hover:underline"
                >
                  + Ajouter un paiement
                </button>
                <span className={cn("font-medium", remaining > 0 ? "text-warning" : "text-success")}>
                  {remaining === 0
                    ? "Solder"
                    : remaining > 0
                      ? `Reste ${formatCents(remaining)}`
                      : `Excédent ${formatCents(-remaining)}`}
                </span>
              </div>

              {creditPossible ? (
                <label className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs">
                  <input
                    type="checkbox"
                    checked={useCredit}
                    onChange={(event) => setUseCredit(event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[#fbbf24]"
                  />
                  <span>
                    <span className="flex items-center gap-1 font-medium text-warning">
                      <CreditCard className="h-3.5 w-3.5" /> Mettre {formatCents(remaining)} en crédit client
                    </span>
                    <span className="mt-0.5 block text-muted">
                      Nouvelle dette : {formatCents(customer ? customer.balanceCents + remaining : remaining)} — plafond{" "}
                      {formatCents(customer?.creditLimitCents ?? 0)}.
                    </span>
                  </span>
                </label>
              ) : remaining > 0 && customer ? (
                <p className="text-[11px] text-muted">
                  {!creditEnabled
                    ? "Le crédit client est désactivé dans les paramètres."
                    : customer.creditBlocked
                      ? "Le crédit de ce client est bloqué."
                      : !customer.creditEnabled
                        ? "Le crédit n'est pas activé pour ce client."
                        : `Crédit disponible insuffisant (${formatCents(creditAvailable)}).`}
                </p>
              ) : null}
            </div>

            <Field label="Note (facultatif)">
              <Textarea
                rows={2}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Remarque sur la vente"
              />
            </Field>

            <SubmitButton
              size="lg"
              className="w-full"
              pendingLabel="Encaissement…"
              disabled={!hasLines || total < 0}
            >
              <ShoppingCart className="h-4 w-4" />
              {hasLines ? `Encaisser ${formatCents(total)}` : "Ajoutez une ligne"}
            </SubmitButton>

            {hasLines && remaining !== 0 ? (
              <p className="text-center text-[11px] text-muted">
                {remaining > 0
                  ? "Complétez les paiements ou autorisez le crédit pour valider."
                  : "Le montant saisi dépasse le total."}
              </p>
            ) : null}
          </div>
        </Card>
      </div>
    </form>
  );
}

