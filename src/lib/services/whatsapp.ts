import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businessSettings, customers, whatsappMessages } from "@/db/schema";
import { AppError } from "../errors";
import { formatCents } from "../money";

/**
 * Normalise un numéro algérien ou international en chiffres seuls.
 * Aucun envoi automatique : le lien wa.me est ouvert par un employé.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 6) throw new AppError("Numéro de téléphone invalide.");

  let normalized = digits;
  if (normalized.startsWith("00")) normalized = normalized.slice(2);
  if (normalized.startsWith("213")) {
    // déjà au format international
  } else if (normalized.startsWith("0")) {
    normalized = `213${normalized.slice(1)}`;
  } else if (normalized.length === 9) {
    normalized = `213${normalized}`;
  }

  if (normalized.length < 10 || normalized.length > 15) {
    throw new AppError("Numéro international invalide.");
  }
  return normalized;
}

export function buildWhatsAppLink(phone: string, message: string): string {
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`;
}

export function buildBalanceReminder(input: {
  businessName: string;
  customerName: string;
  balanceCents: number;
}): string {
  const firstName = input.customerName.trim().split(/\s+/)[0] || "Bonjour";
  return [
    `Bonjour ${firstName},`,
    `petit rappel de ${input.businessName} : votre solde restant est de ${formatCents(input.balanceCents)}.`,
    "Merci de passer régler quand vous pouvez. À bientôt !",
  ].join(" ");
}

export async function setWhatsAppConsent(input: { customerId: string; consent: boolean }) {
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, input.customerId))
    .limit(1);
  if (!customer) throw new AppError("Client introuvable.");
  if (input.consent && !customer.phone.trim()) {
    throw new AppError("Renseignez d'abord un numéro de téléphone pour ce client.");
  }

  const [updated] = await db
    .update(customers)
    .set({
      whatsappConsent: input.consent,
      whatsappConsentAt: input.consent ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(customers.id, customer.id))
    .returning();

  return updated!;
}

/**
 * Prépare un rappel WhatsApp manuel. Le message est journalisé mais jamais envoyé
 * par le serveur : l'employé ouvre le lien et vérifie le contenu avant l'envoi.
 */
export async function prepareBalanceReminder(customerId: string) {
  const [settings] = await db.select().from(businessSettings).limit(1);
  if (!settings?.whatsappRemindersEnabled) {
    throw new AppError("Les rappels WhatsApp sont désactivés dans les paramètres.");
  }

  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) throw new AppError("Client introuvable.");
  if (!customer.whatsappConsent) {
    throw new AppError("Ce client n'a pas donné son consentement pour WhatsApp.");
  }
  if (Number(customer.balanceCents) <= 0) throw new AppError("Ce client n'a aucune dette à rappeler.");

  const phone = normalizePhone(customer.phone);
  const message = buildBalanceReminder({
    businessName: settings.businessName,
    customerName: customer.fullName,
    balanceCents: Number(customer.balanceCents),
  });

  await db.insert(whatsappMessages).values({
    customerId: customer.id,
    kind: "balance_reminder",
    phone,
    message,
  });

  return { phone, message, url: `https://wa.me/${phone}?text=${encodeURIComponent(message)}` };
}
