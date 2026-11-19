import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { businessSettings, customerRequests, devices } from "@/db/schema";
import { AppError } from "../errors";

export const REQUEST_TYPE_LABELS = {
  assistance: "Assistance",
  order: "Commande",
  other: "Autre",
} as const;

export const REQUEST_STATUS_LABELS = {
  pending: "En attente",
  in_progress: "En cours",
  done: "Traitée",
  cancelled: "Annulée",
} as const;

export type RequestType = keyof typeof REQUEST_TYPE_LABELS;
export type RequestStatus = keyof typeof REQUEST_STATUS_LABELS;

const MAX_REQUESTS_PER_WINDOW = 5;
const REQUEST_WINDOW_MINUTES = 10;

export function requestPath(token: string): string {
  return `/demande/${token}`;
}

export function buildRequestUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}${requestPath(token)}`;
}

export async function getRequestSettings(): Promise<typeof businessSettings.$inferSelect | null> {
  const [settings] = await db.select().from(businessSettings).limit(1);
  return settings ?? null;
}

export async function ensureRequestToken(): Promise<string> {
  const settings = await getRequestSettings();
  if (!settings) throw new AppError("Paramètres de l'entreprise introuvables.");
  if (settings.requestToken) return settings.requestToken;

  const [updated] = await db
    .update(businessSettings)
    .set({ requestToken: randomBytes(24).toString("base64url"), updatedAt: new Date() })
    .where(eq(businessSettings.id, settings.id))
    .returning({ token: businessSettings.requestToken });

  return updated!.token;
}

/** Révoque l'ancien lien : les QR déjà imprimés cessent immédiatement de fonctionner. */
export async function rotateRequestToken(): Promise<string> {
  const settings = await getRequestSettings();
  if (!settings) throw new AppError("Paramètres de l'entreprise introuvables.");

  const [updated] = await db
    .update(businessSettings)
    .set({ requestToken: randomBytes(24).toString("base64url"), updatedAt: new Date() })
    .where(eq(businessSettings.id, settings.id))
    .returning({ token: businessSettings.requestToken });

  return updated!.token;
}

export async function getPublicRequestContext(token: string) {
  if (!token || token.length < 16 || token.length > 80) return null;
  const settings = await getRequestSettings();
  if (!settings || !settings.requestToken || settings.requestToken !== token) return null;

  const activeDevices = await db
    .select({ id: devices.id, name: devices.name, location: devices.location })
    .from(devices)
    .where(eq(devices.isActive, true))
    .orderBy(devices.sortOrder, devices.name);

  return { businessName: settings.businessName, devices: activeDevices };
}

export async function createCustomerRequest(input: {
  token: string;
  deviceId: string | null;
  customerName: string;
  customerPhone: string;
  type: string;
  note: string;
  ip: string;
}) {
  const context = await getPublicRequestContext(input.token);
  if (!context) throw new AppError("Ce lien de demande n'est pas valide. Demandez le QR à l'accueil.");

  const type = input.type as RequestType;
  if (!(type in REQUEST_TYPE_LABELS)) throw new AppError("Type de demande invalide.");

  const note = input.note.trim().slice(0, 300);
  const customerName = input.customerName.trim().slice(0, 80);
  const customerPhone = input.customerPhone.trim().slice(0, 20);

  if (note.length < 3) throw new AppError("Précisez votre demande (3 caractères minimum).");
  if (customerPhone && !/^[0-9+\s().-]{6,20}$/.test(customerPhone)) {
    throw new AppError("Numéro de téléphone invalide.");
  }

  const since = new Date(Date.now() - REQUEST_WINDOW_MINUTES * 60 * 1000);
  const [recent] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customerRequests)
    .where(and(eq(customerRequests.sourceIp, input.ip), gte(customerRequests.createdAt, since)));

  if ((recent?.count ?? 0) >= MAX_REQUESTS_PER_WINDOW) {
    throw new AppError("Trop de demandes envoyées. Patientez quelques minutes avant de réessayer.");
  }

  let deviceId: string | null = null;
  if (input.deviceId) {
    const device = context.devices.find((item) => item.id === input.deviceId);
    if (!device) throw new AppError("Appareil introuvable ou désactivé.");
    deviceId = device.id;
  }

  if (deviceId) {
    const [duplicate] = await db
      .select({ id: customerRequests.id })
      .from(customerRequests)
      .where(
        and(
          eq(customerRequests.deviceId, deviceId),
          inArray(customerRequests.status, ["pending", "in_progress"]),
          gte(customerRequests.createdAt, since),
        ),
      )
      .limit(1);
    if (duplicate) throw new AppError("Une demande est déjà en cours pour cet appareil.");
  }

  const [created] = await db
    .insert(customerRequests)
    .values({
      deviceId,
      customerName,
      customerPhone,
      type,
      note,
      sourceIp: input.ip.slice(0, 80),
    })
    .returning({ id: customerRequests.id, createdAt: customerRequests.createdAt });

  return created!;
}

export async function listRequests() {
  const rows = await db
    .select({ request: customerRequests, deviceName: devices.name })
    .from(customerRequests)
    .leftJoin(devices, eq(devices.id, customerRequests.deviceId))
    .orderBy(desc(customerRequests.createdAt))
    .limit(60);

  return rows;
}

export async function setRequestStatus(
  input: { requestId: string; status: RequestStatus; userId: string },
) {
  if (!(input.status in REQUEST_STATUS_LABELS)) throw new AppError("Statut de demande invalide.");

  const [request] = await db
    .select()
    .from(customerRequests)
    .where(eq(customerRequests.id, input.requestId))
    .limit(1);
  if (!request) throw new AppError("Demande introuvable.");
  if (request.status === input.status) return request;
  if (request.status === "done" || request.status === "cancelled") {
    throw new AppError("Cette demande est déjà clôturée.");
  }
  if (request.status === "pending" && input.status === "done") {
    throw new AppError("Prenez d'abord la demande en charge.");
  }

  const [updated] = await db
    .update(customerRequests)
    .set({
      status: input.status,
      handledBy: input.userId,
      handledAt: new Date(),
    })
    .where(and(eq(customerRequests.id, request.id), eq(customerRequests.status, request.status)))
    .returning();

  if (!updated) throw new AppError("La demande a changé entre-temps. Rechargez la page.");
  return updated;
}
