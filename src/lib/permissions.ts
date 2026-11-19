/**
 * Clés de permissions. Partagées entre le serveur (autorisation réelle)
 * et l'interface (masquage des actions non autorisées).
 */

export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard.view",
  SESSIONS_MANAGE: "sessions.manage",
  POS_SELL: "pos.sell",
  INVOICES_VIEW: "invoices.view",
  INVOICES_CANCEL: "invoices.cancel",
  CUSTOMERS_VIEW: "customers.view",
  CUSTOMERS_MANAGE: "customers.manage",
  CREDIT_MANAGE: "credit.manage",
  PRODUCTS_VIEW: "products.view",
  PRODUCTS_MANAGE: "products.manage",
  DEVICES_MANAGE: "devices.manage",
  STAFF_MANAGE: "staff.manage",
  SETTINGS_MANAGE: "settings.manage",
  SHIFTS_OWN: "shifts.own",
  SHIFTS_CLOSE_ANY: "shifts.close_any",
  AUDIT_VIEW: "audit.view",
  REPORTS_VIEW: "reports.view",
  DISCOUNTS_APPLY: "discounts.apply",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

export type Role = "owner" | "manager" | "cashier" | "technician" | "viewer";

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Propriétaire",
  manager: "Gérant",
  cashier: "Caissier",
  technician: "Technicien",
  viewer: "Lecteur",
};

export const ROLE_DEFAULTS: Record<Role, Permission[]> = {
  owner: ALL_PERMISSIONS,
  manager: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.SESSIONS_MANAGE,
    PERMISSIONS.POS_SELL,
    PERMISSIONS.INVOICES_VIEW,
    PERMISSIONS.INVOICES_CANCEL,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.CUSTOMERS_MANAGE,
    PERMISSIONS.CREDIT_MANAGE,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.PRODUCTS_MANAGE,
    PERMISSIONS.DEVICES_MANAGE,
    PERMISSIONS.SHIFTS_OWN,
    PERMISSIONS.SHIFTS_CLOSE_ANY,
    PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.DISCOUNTS_APPLY,
  ],
  cashier: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.SESSIONS_MANAGE,
    PERMISSIONS.POS_SELL,
    PERMISSIONS.INVOICES_VIEW,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.SHIFTS_OWN,
  ],
  technician: [PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.PRODUCTS_VIEW],
  viewer: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.INVOICES_VIEW,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.REPORTS_VIEW,
  ],
};

export const PERMISSION_LABELS: Record<Permission, string> = {
  [PERMISSIONS.DASHBOARD_VIEW]: "Consulter le tableau de bord",
  [PERMISSIONS.SESSIONS_MANAGE]: "Gérer les sessions de jeu",
  [PERMISSIONS.POS_SELL]: "Encaisser des ventes",
  [PERMISSIONS.INVOICES_VIEW]: "Consulter les factures",
  [PERMISSIONS.INVOICES_CANCEL]: "Annuler une facture",
  [PERMISSIONS.CUSTOMERS_VIEW]: "Consulter les clients",
  [PERMISSIONS.CUSTOMERS_MANAGE]: "Gérer les clients",
  [PERMISSIONS.CREDIT_MANAGE]: "Gérer le crédit client",
  [PERMISSIONS.PRODUCTS_VIEW]: "Consulter les produits",
  [PERMISSIONS.PRODUCTS_MANAGE]: "Gérer les produits et le stock",
  [PERMISSIONS.DEVICES_MANAGE]: "Gérer les appareils",
  [PERMISSIONS.STAFF_MANAGE]: "Gérer l'équipe",
  [PERMISSIONS.SETTINGS_MANAGE]: "Modifier les paramètres",
  [PERMISSIONS.SHIFTS_OWN]: "Ouvrir et clôturer sa caisse",
  [PERMISSIONS.SHIFTS_CLOSE_ANY]: "Clôturer la caisse d'un autre employé",
  [PERMISSIONS.AUDIT_VIEW]: "Consulter le journal d'audit",
  [PERMISSIONS.REPORTS_VIEW]: "Consulter les rapports",
  [PERMISSIONS.DISCOUNTS_APPLY]: "Appliquer une remise",
};
