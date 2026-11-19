import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businessSettings, customers, whatsappMessages } from "@/db/schema";
import { buildWhatsAppLink, normalizePhone, prepareBalanceReminder } from "@/lib/services/whatsapp";
import { formatCents } from "@/lib/money";
import { makeCustomer, resetDatabase } from "./helpers";

describe("rappels WhatsApp", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("normalise les numéros algériens et internationaux", () => {
    expect(normalizePhone("0550 12 34 56")).toBe("213550123456");
    expect(normalizePhone("+213 550 12 34 56")).toBe("213550123456");
    expect(normalizePhone("00213550123456")).toBe("213550123456");
    expect(normalizePhone("550123456")).toBe("213550123456");
    expect(() => normalizePhone("123")).toThrow(/invalide/i);
  });

  it("construit un lien wa.me encodé", () => {
    const link = buildWhatsAppLink("0550123456", "Bonjour & merci");
    expect(link).toBe("https://wa.me/213550123456?text=Bonjour%20%26%20merci");
  });

  it("exige l'activation et le consentement du client", async () => {
    const customer = await makeCustomer({ phone: "0550123456", balanceCents: 5000 });

    await expect(prepareBalanceReminder(customer.id)).rejects.toThrow(/désactivés/i);

    await db.update(businessSettings).set({ whatsappRemindersEnabled: true });
    await expect(prepareBalanceReminder(customer.id)).rejects.toThrow(/consentement/i);

    // Le consentement est une décision du client, pas une valeur par défaut.
    await db
      .update(customers)
      .set({ whatsappConsent: true, balanceCents: 0 })
      .where(eq(customers.id, customer.id));
    await expect(prepareBalanceReminder(customer.id)).rejects.toThrow(/aucune dette/i);
  });

  it("prépare et journalise un rappel pour un client consenti", async () => {
    await db.update(businessSettings).set({ whatsappRemindersEnabled: true });
    const customer = await makeCustomer({
      phone: "0550123456",
      balanceCents: 125000,
      whatsappConsent: true,
      whatsappConsentAt: new Date(),
    });

    const reminder = await prepareBalanceReminder(customer.id);
    expect(reminder.phone).toBe("213550123456");
    expect(reminder.url).toContain("https://wa.me/213550123456?text=");
    expect(reminder.message).toContain(formatCents(125000));

    const rows = await db
      .select()
      .from(whatsappMessages)
      .where(eq(whatsappMessages.customerId, customer.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe("balance_reminder");
    expect(rows[0]!.message).toBe(reminder.message);
  });
});
