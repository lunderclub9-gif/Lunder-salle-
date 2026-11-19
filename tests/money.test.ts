import { describe, expect, it } from "vitest";
import { centsToInput, discountFromPercent, formatCents, percentOf, toCents } from "@/lib/money";

describe("montants en centimes", () => {
  it("convertit les saisies françaises et anglaises", () => {
    expect(toCents("1 200,50")).toBe(120050);
    expect(toCents("1200.5")).toBe(120050);
    expect(toCents("0")).toBe(0);
    expect(toCents(12.34)).toBe(1234);
  });

  it("refuse les montants invalides", () => {
    expect(() => toCents("abc")).toThrow();
    expect(() => toCents("12.345")).toThrow();
    expect(() => toCents("")).toThrow();
  });

  it("formate en dinars algériens", () => {
    const normalise = (value: string) => value.replace(/\u202f/g, " ");
    expect(normalise(formatCents(120050))).toBe("1 200,50 DA");
    expect(normalise(formatCents(120000))).toBe("1 200 DA");
    expect(normalise(formatCents(-5000))).toBe("-50 DA");
  });

  it("arrondit au centime sans dérive flottante", () => {
    expect(toCents("0.1") + toCents("0.2")).toBe(30);
    expect(toCents("19.99") * 3).toBe(5997);
  });

  it("calcule les remises en pourcentage", () => {
    expect(discountFromPercent(10000, 10)).toBe(1000);
    expect(discountFromPercent(9990, 15)).toBe(1499); // 1498.5 arrondi
    expect(discountFromPercent(10000, 0)).toBe(0);
  });

  it("convertit vers un champ de formulaire", () => {
    expect(centsToInput(120050)).toBe("1200.50");
    expect(percentOf(10000, 500)).toBe(500);
  });
});
