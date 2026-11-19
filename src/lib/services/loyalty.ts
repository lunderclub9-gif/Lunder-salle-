import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { businessSettings, customers, loyaltyTransactions } from "@/db/schema";
import { AppError } from "../errors";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface LoyaltyConfig {
  enabled: boolean;
  /** Points gagnés par tranche de 100 DA dépensés. */
  pointsPerHundredDzd: number;
  /** Valeur en centimes d'un point au moment de l'échange. */
  pointValueCents: number;
  minRedeemPoints: number;
}

type SettingsRow = typeof businessSettings.$inferSelect;

export function loyaltyConfig(settings: SettingsRow | null | undefined): LoyaltyConfig {
  return {
    enabled: settings?.loyaltyEnabled ?? false,
    pointsPerHundredDzd: Math.max(0, Math.floor(settings?.loyaltyPointsPerHundredDzd ?? 0)),
    pointValueCents: Math.max(0, Math.floor(Number(settings?.loyaltyPointValueCents ?? 0))),
    minRedeemPoints: Math.max(0, Math.floor(settings?.loyaltyMinRedeemPoints ?? 0)),
  };
}

/**
 * Points gagnés pour un montant net en centimes.
 * 100 DA = 10 000 centimes ; arrondi à l'entier inférieur, jamais de points négatifs.
 */
export function pointsEarnedFor(totalCents: number, config: LoyaltyConfig): number {
  if (!config.enabled || config.pointsPerHundredDzd <= 0) return 0;
  const net = Math.max(0, Math.floor(totalCents));
  return Math.floor((net * config.pointsPerHundredDzd) / 10_000);
}

/** Valeur en centimes d'un nombre de points, selon la valeur configurée. */
export function loyaltyValueCents(points: number, config: LoyaltyConfig): number {
  if (!config.enabled || config.pointValueCents <= 0) return 0;
  return Math.max(0, Math.floor(points)) * config.pointValueCents;
}

async function adjustPoints(tx: Tx, customerId: string, delta: number): Promise<number> {
  const [row] = await tx
    .update(customers)
    .set({
      loyaltyPoints: sql`${customers.loyaltyPoints} + ${delta}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(customers.id, customerId),
        sql`${customers.loyaltyPoints} + ${delta} >= 0`,
      ),
    )
    .returning({ points: customers.loyaltyPoints });

  if (!row) throw new AppError("Le solde de points du client ne permet pas cette opération.");
  return Number(row.points);
}

/** Crédite les points d'une vente. Retourne 0 si la fidélité est désactivée. */
export async function earnLoyalty(
  tx: Tx,
  input: {
    customerId: string;
    invoiceId: string;
    invoiceNumber: string;
    totalCents: number;
    actorId: string;
    config: LoyaltyConfig;
  },
): Promise<number> {
  const points = pointsEarnedFor(input.totalCents, input.config);
  if (points <= 0) return 0;

  const balanceAfter = await adjustPoints(tx, input.customerId, points);
  await tx.insert(loyaltyTransactions).values({
    customerId: input.customerId,
    invoiceId: input.invoiceId,
    type: "earn",
    points,
    balanceAfter,
    reason: `Facture ${input.invoiceNumber}`,
    createdBy: input.actorId,
  });

  return points;
}

/**
 * Échange des points contre une remise à l'encaissement.
 * Le client est déjà verrouillé par l'appelant ; le solde est contrôlé en base.
 */
export async function redeemLoyalty(
  tx: Tx,
  input: {
    customerId: string;
    invoiceId: string;
    invoiceNumber: string;
    points: number;
    balance: number;
    actorId: string;
    config: LoyaltyConfig;
  },
): Promise<{ points: number; valueCents: number; balanceAfter: number }> {
  const points = Math.floor(input.points);
  if (points <= 0) throw new AppError("Indiquez au moins un point à utiliser.");
  if (!input.config.enabled) throw new AppError("Le programme de fidélité est désactivé dans les paramètres.");
  if (input.config.pointValueCents <= 0) {
    throw new AppError("La valeur d'un point n'est pas configurée : échange impossible.");
  }
  if (points < input.config.minRedeemPoints) {
    throw new AppError(`Minimum d'échange : ${input.config.minRedeemPoints} point(s).`);
  }
  if (points > input.balance) throw new AppError("Le client ne possède pas autant de points.");

  const balanceAfter = await adjustPoints(tx, input.customerId, -points);
  await tx.insert(loyaltyTransactions).values({
    customerId: input.customerId,
    invoiceId: input.invoiceId,
    type: "redeem",
    points: -points,
    balanceAfter,
    reason: `Facture ${input.invoiceNumber} — ${points} point(s) échangés`,
    createdBy: input.actorId,
  });

  return { points, valueCents: points * input.config.pointValueCents, balanceAfter };
}

/**
 * Annule les points d'une facture (annulation) : contre-passation des gains
 * et restitution des points échangés. Aucune écriture n'est supprimée.
 */
export async function reverseLoyaltyForInvoice(
  tx: Tx,
  input: { invoiceId: string; invoiceNumber: string; customerId: string; reason: string; actorId: string },
): Promise<void> {
  const rows = await tx
    .select()
    .from(loyaltyTransactions)
    .where(eq(loyaltyTransactions.invoiceId, input.invoiceId));

  const net = rows.reduce((total, row) => total - row.points, 0);
  if (net === 0) return;

  const balanceAfter = await adjustPoints(tx, input.customerId, net);
  await tx.insert(loyaltyTransactions).values({
    customerId: input.customerId,
    invoiceId: input.invoiceId,
    type: "reversal",
    points: net,
    balanceAfter,
    reason: `Annulation ${input.invoiceNumber} — ${input.reason}`,
    createdBy: input.actorId,
  });
}

export async function getLoyaltyHistory(customerId: string, limit = 30) {
  return db
    .select()
    .from(loyaltyTransactions)
    .where(eq(loyaltyTransactions.customerId, customerId))
    .orderBy(desc(loyaltyTransactions.createdAt))
    .limit(limit);
}
