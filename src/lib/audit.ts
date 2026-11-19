import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { requestMeta } from "./auth";

type DbExecutor = Pick<typeof db, "insert">;

export interface AuditInput {
  actorId: string | null;
  actorName: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  ip?: string;
  userAgent?: string;
}

/**
 * Journal append-only : aucune fonction de mise à jour ou de suppression
 * n'existe pour cette table.
 */
export async function logAudit(input: AuditInput, executor: DbExecutor = db): Promise<void> {
  await executor.insert(auditLogs).values({
    actorId: input.actorId,
    actorName: input.actorName,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? "",
    before: input.before ?? null,
    after: input.after ?? null,
    reason: input.reason ?? "",
    ip: input.ip ?? "",
    userAgent: input.userAgent ?? "",
  });
}

/** Variante qui récupère automatiquement l'IP et l'agent de la requête. */
export async function logAuditFromRequest(input: Omit<AuditInput, "ip" | "userAgent">): Promise<void> {
  const meta = await requestMeta();
  await logAudit({ ...input, ip: meta.ip, userAgent: meta.userAgent });
}

export const AUDIT_ACTIONS = {
  LOGIN_SUCCESS: "connexion.reussie",
  LOGIN_FAILED: "connexion.echouee",
  LOGOUT: "deconnexion",
  PASSWORD_CHANGED: "mot_de_passe.modifie",
  SESSION_START: "session.demarree",
  SESSION_PAUSE: "session.pausee",
  SESSION_RESUME: "session.reprise",
  SESSION_END: "session.terminee",
  SESSION_TRANSFER: "session.transferee",
  INVOICE_CREATED: "facture.creee",
  INVOICE_CANCELLED: "facture.annulee",
  PAYMENT_RECORDED: "paiement.enregistre",
  CREDIT_LIMIT_CHANGED: "credit.plafond_modifie",
  CREDIT_REPAYMENT: "credit.remboursement",
  DEVICE_UPDATED: "appareil.modifie",
  DEVICE_STATUS: "appareil.statut",
  PRODUCT_CREATED: "produit.cree",
  PRODUCT_UPDATED: "produit.modifie",
  CUSTOMER_CREATED: "client.cree",
  CUSTOMER_UPDATED: "client.modifie",
  SHIFT_OPENED: "caisse.ouverte",
  SHIFT_CLOSED: "caisse.cloturee",
  USER_CREATED: "utilisateur.cree",
  USER_UPDATED: "utilisateur.modifie",
  SETTINGS_UPDATED: "parametres.modifies",
  EXPENSE_CREATED: "depense.creee",
  CASH_DEPOSIT: "caisse.depot",
  CASH_WITHDRAWAL: "caisse.retrait",
  REFUND_ISSUED: "remboursement.emet",
  REFUND_CANCELLED: "remboursement.annule",
  HANDOVER_RECORDED: "caisse.transfert",
  BACKUP_CREATED: "sauvegarde.creee",
  BACKUP_RESTORED: "sauvegarde.restauree",
} as const;
