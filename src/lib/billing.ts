/**
 * Facturation des sessions — logique pure, testée unitairement.
 *
 * Règles :
 * 1. Les minutes facturables sont calculées à partir des horodatages serveur,
 *    temps en pause exclu, arrondi à la minute supérieure.
 * 2. La durée minimale facturable s'applique ensuite.
 * 3. L'incrément de facturation et la règle d'arrondi produisent les minutes facturées.
 * 4. Le montant est calculé en centimes à partir du tarif figé au démarrage.
 */

export type BillingMode = "hourly" | "match" | "fixed";
export type RoundingRule = "up" | "nearest" | "none";

export interface BillingRule {
  billingMode: BillingMode;
  hourlyRateCents: number;
  matchRateCents: number;
  fixedRateCents: number;
  minBillableMinutes: number;
  billingIncrementMinutes: number;
  rounding: RoundingRule;
  matches: number;
}

export interface BillingInput extends BillingRule {
  startedAt: Date;
  endedAt: Date;
  pausedSeconds: number;
}

export interface BillingResult {
  elapsedSeconds: number;
  pausedSeconds: number;
  billableSeconds: number;
  billableMinutes: number;
  chargedMinutes: number;
  amountCents: number;
  billingMode: BillingMode;
}

function roundMinutes(minutes: number, increment: number, rule: RoundingRule): number {
  if (minutes <= 0) return 0;
  const step = Math.max(1, Math.floor(increment || 1));
  switch (rule) {
    case "nearest":
      return Math.max(step, Math.round(minutes / step) * step);
    case "none":
      return minutes;
    case "up":
    default:
      return Math.ceil(minutes / step) * step;
  }
}

export function computeBilling(input: BillingInput): BillingResult {
  const elapsedMs = Math.max(0, input.endedAt.getTime() - input.startedAt.getTime());
  const pausedSeconds = Math.max(0, Math.min(input.pausedSeconds, Math.floor(elapsedMs / 1000)));
  const billableSeconds = Math.max(0, Math.floor(elapsedMs / 1000) - pausedSeconds);
  const rawMinutes = Math.ceil(billableSeconds / 60);

  const withMinimum = Math.max(rawMinutes, Math.max(0, input.minBillableMinutes));
  const chargedMinutes = roundMinutes(
    withMinimum,
    input.billingIncrementMinutes,
    input.rounding,
  );

  let amountCents = 0;

  switch (input.billingMode) {
    case "match": {
      const matches = Math.max(1, Math.floor(input.matches || 1));
      amountCents = matches * Math.max(0, input.matchRateCents);
      break;
    }
    case "fixed": {
      amountCents = Math.max(0, input.fixedRateCents);
      break;
    }
    case "hourly":
    default: {
      amountCents = Math.round((Math.max(0, input.hourlyRateCents) * chargedMinutes) / 60);
      break;
    }
  }

  return {
    elapsedSeconds: Math.floor(elapsedMs / 1000),
    pausedSeconds,
    billableSeconds,
    billableMinutes: rawMinutes,
    chargedMinutes,
    amountCents,
    billingMode: input.billingMode,
  };
}

/** Duration lisible en français, ex. « 1 h 25 min ». */
export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${String(minutes).padStart(2, "0")} min`;
}
