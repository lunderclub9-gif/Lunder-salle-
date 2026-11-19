/**
 * Montants monétaires : toujours des entiers en unités mineures (centimes).
 * Aucun flottant n'intervient dans un calcul financier.
 */

export const CURRENCY = "DZD";

/** Convertit un montant saisi (ex. « 1200,50 » ou 1200.5) en centimes. */
export function toCents(input: string | number): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new Error("Montant invalide");
    return Math.round(input * 100);
  }
  const cleaned = input.trim().replace(/\s/g, "").replace(",", ".");
  if (cleaned === "") throw new Error("Montant requis");
  if (!/^-?\d+(\.\d{0,2})?$/.test(cleaned)) throw new Error("Montant invalide");
  return Math.round(Number(cleaned) * 100);
}

/** Formate des centimes en chaîne DZD lisible (français). */
export function formatCents(cents: number, options?: { withCurrency?: boolean }): string {
  const safe = Number.isFinite(cents) ? Math.round(cents) : 0;
  const negative = safe < 0;
  const absolute = Math.abs(safe);
  const dinars = Math.floor(absolute / 100);
  const remainder = absolute % 100;
  const formatted = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: remainder === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(dinars + remainder / 100);
  const withCurrency = options?.withCurrency ?? true;
  return `${negative ? "-" : ""}${formatted}${withCurrency ? " DA" : ""}`;
}

/** Conversion centimes -> champ de formulaire (sans séparateur de milliers). */
export function centsToInput(cents: number): string {
  const safe = Math.round(cents || 0);
  return (safe / 100).toFixed(2);
}

export function percentOf(cents: number, basisPoints: number): number {
  return Math.round((cents * basisPoints) / 10_000);
}

/** Arrondi d'un pourcentage de remise, borné par le maximum autorisé. */
export function discountFromPercent(subtotalCents: number, percent: number): number {
  if (percent <= 0) return 0;
  const bounded = Math.min(Math.max(percent, 0), 100);
  return Math.round((subtotalCents * Math.round(bounded * 100)) / 10_000);
}

export function sumCents(values: number[]): number {
  return values.reduce((total, value) => total + Math.round(value || 0), 0);
}
