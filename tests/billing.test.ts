import { describe, expect, it } from "vitest";
import { computeBilling, formatDuration, type BillingRule } from "@/lib/billing";

const base: BillingRule = {
  billingMode: "hourly",
  hourlyRateCents: 6000,
  matchRateCents: 0,
  fixedRateCents: 0,
  minBillableMinutes: 0,
  billingIncrementMinutes: 60,
  rounding: "up",
  matches: 1,
};

function run(startedMinutesAgo: number, pausedSeconds = 0, overrides: Partial<BillingRule> = {}) {
  const endedAt = new Date("2026-01-01T12:00:00Z");
  const startedAt = new Date(endedAt.getTime() - startedMinutesAgo * 60_000);
  return computeBilling({ ...base, ...overrides, startedAt, endedAt, pausedSeconds });
}

describe("facturation des sessions", () => {
  it("facture à l'heure pleine supérieure selon l'incrément", () => {
    const result = run(61);
    expect(result.billableMinutes).toBe(61);
    expect(result.chargedMinutes).toBe(120);
    expect(result.amountCents).toBe(12000);
  });

  it("exclut le temps de pause", () => {
    const result = run(120, 3600); // 2 h écoulées, 1 h de pause
    expect(result.billableMinutes).toBe(60);
    expect(result.chargedMinutes).toBe(60);
    expect(result.amountCents).toBe(6000);
  });

  it("applique la durée minimale facturable", () => {
    const result = run(10, 0, { minBillableMinutes: 60 });
    expect(result.billableMinutes).toBe(10);
    expect(result.chargedMinutes).toBe(60);
    expect(result.amountCents).toBe(6000);
  });

  it("respecte l'arrondi au plus proche", () => {
    const down = run(80, 0, { rounding: "nearest", billingIncrementMinutes: 60 });
    expect(down.chargedMinutes).toBe(60);
    const up = run(100, 0, { rounding: "nearest", billingIncrementMinutes: 60 });
    expect(up.chargedMinutes).toBe(120);
  });

  it("ne facture pas l'arrondi incrémental quand il est désactivé", () => {
    const result = run(75, 0, { rounding: "none" });
    expect(result.chargedMinutes).toBe(75);
    expect(result.amountCents).toBe(7500);
  });

  it("facture au match", () => {
    const endedAt = new Date("2026-01-01T12:00:00Z");
    const result = computeBilling({
      ...base,
      billingMode: "match",
      matchRateCents: 3000,
      matches: 3,
      startedAt: new Date(endedAt.getTime() - 20 * 60_000),
      endedAt,
      pausedSeconds: 0,
    });
    expect(result.amountCents).toBe(9000);
  });

  it("facture une session à prix fixe", () => {
    const endedAt = new Date("2026-01-01T12:00:00Z");
    const result = computeBilling({
      ...base,
      billingMode: "fixed",
      fixedRateCents: 25000,
      startedAt: new Date(endedAt.getTime() - 15 * 60_000),
      endedAt,
      pausedSeconds: 0,
    });
    expect(result.amountCents).toBe(25000);
  });

  it("ne produit jamais de montant négatif", () => {
    const endedAt = new Date("2026-01-01T12:00:00Z");
    const result = computeBilling({
      ...base,
      startedAt: new Date(endedAt.getTime() + 60_000),
      endedAt,
      pausedSeconds: 0,
    });
    expect(result.amountCents).toBe(0);
    expect(result.billableMinutes).toBe(0);
  });

  it("arrondit les montants horaires au centime", () => {
    const result = run(30, 0, { billingIncrementMinutes: 1, hourlyRateCents: 3333 });
    expect(result.chargedMinutes).toBe(30);
    expect(result.amountCents).toBe(1667); // 3333 * 30 / 60 = 1666.5 -> 1667
  });

  it("formate les durées en français", () => {
    expect(formatDuration(45 * 60)).toBe("45 min");
    expect(formatDuration(3600)).toBe("1 h");
    expect(formatDuration(5100)).toBe("1 h 25 min");
  });
});
