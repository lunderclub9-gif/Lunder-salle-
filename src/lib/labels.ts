import { ROLE_LABELS, type Role } from "./permissions";

export function roleLabel(role: string): string {
  return ROLE_LABELS[role as Role] ?? role;
}

export const DEVICE_TYPE_LABELS: Record<string, string> = {
  playstation: "PlayStation",
  billiard: "Billard",
  other: "Autre",
};

export const DEVICE_STATUS_LABELS: Record<string, string> = {
  available: "Disponible",
  occupied: "Occupé",
  reserved: "Réservé",
  paused: "En pause",
  maintenance: "En maintenance",
  out_of_service: "Hors service",
};

export const DEVICE_STATUS_TONES: Record<
  string,
  "neutral" | "accent" | "success" | "warning" | "danger" | "electric"
> = {
  available: "success",
  occupied: "accent",
  reserved: "electric",
  paused: "warning",
  maintenance: "warning",
  out_of_service: "danger",
};

export const BILLING_MODE_LABELS: Record<string, string> = {
  hourly: "À l'heure",
  match: "Par match",
  fixed: "Session fixe",
};

export const ROUNDING_LABELS: Record<string, string> = {
  up: "Arrondi supérieur",
  nearest: "Arrondi au plus proche",
  none: "Aucun arrondi",
};

export const SESSION_STATUS_LABELS: Record<string, string> = {
  running: "En cours",
  paused: "En pause",
  ended: "Terminée",
  cancelled: "Annulée",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Espèces",
  card: "Carte",
  mobile: "Paiement mobile",
  transfer: "Virement",
  credit: "Crédit client",
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  partial: "Partiellement payée",
  paid: "Payée",
  cancelled: "Annulée",
};

export const INVOICE_STATUS_TONES: Record<
  string,
  "neutral" | "accent" | "success" | "warning" | "danger" | "electric"
> = {
  pending: "warning",
  partial: "electric",
  paid: "success",
  cancelled: "danger",
};

export const CREDIT_TX_LABELS: Record<string, string> = {
  debt: "Dette créée",
  repayment: "Remboursement",
  adjustment: "Ajustement",
  reversal: "Annulation",
};

export const SHIFT_STATUS_LABELS: Record<string, string> = {
  open: "Ouverte",
  closed: "Clôturée",
};

export const STOCK_MOVEMENT_LABELS: Record<string, string> = {
  initial: "Stock initial",
  sale: "Vente",
  purchase: "Achat",
  return: "Retour",
  adjustment: "Ajustement",
  loss: "Perte",
};
