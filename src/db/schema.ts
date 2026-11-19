import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ *
 * Énumérations
 * ------------------------------------------------------------------ */

export const userRoleEnum = pgEnum("user_role", [
  "owner",
  "manager",
  "cashier",
  "technician",
  "viewer",
]);

export const deviceTypeEnum = pgEnum("device_type", ["playstation", "billiard", "other"]);

export const deviceStatusEnum = pgEnum("device_status", [
  "available",
  "occupied",
  "reserved",
  "paused",
  "maintenance",
  "out_of_service",
]);

export const billingModeEnum = pgEnum("billing_mode", ["hourly", "match", "fixed"]);

export const roundingRuleEnum = pgEnum("rounding_rule", ["up", "nearest", "none"]);

export const sessionStatusEnum = pgEnum("session_status", [
  "running",
  "paused",
  "ended",
  "cancelled",
]);

export const sessionEventTypeEnum = pgEnum("session_event_type", [
  "start",
  "pause",
  "resume",
  "transfer",
  "end",
  "cancel",
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "pending",
  "partial",
  "paid",
  "cancelled",
]);

export const invoiceItemKindEnum = pgEnum("invoice_item_kind", ["session", "product", "manual"]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "cash",
  "card",
  "mobile",
  "transfer",
  "credit",
]);

export const cashMovementTypeEnum = pgEnum("cash_movement_type", [
  "deposit",
  "withdrawal",
  "credit_repayment",
  "refund",
  "expense",
]);

export const expenseCategoryEnum = pgEnum("expense_category", [
  "rent",
  "electricity",
  "internet",
  "salaries",
  "maintenance",
  "cleaning",
  "supplies",
  "other",
]);

export const refundStatusEnum = pgEnum("refund_status", [
  "pending",
  "issued",
]);

export const creditTxTypeEnum = pgEnum("credit_tx_type", [
  "debt",
  "repayment",
  "adjustment",
  "reversal",
]);

export const supplierPaymentStatusEnum = pgEnum("supplier_payment_status", [
  "pending",
  "paid",
  "returned",
]);

export const shiftStatusEnum = pgEnum("shift_status", ["open", "closed"]);

export const stockMovementTypeEnum = pgEnum("stock_movement_type", [
  "initial",
  "sale",
  "purchase",
  "return",
  "adjustment",
  "loss",
]);

/* ------------------------------------------------------------------ *
 * Séquences
 * ------------------------------------------------------------------ */

export const suppliers = pgTable("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  contact: text("contact").notNull().default(""),
  phone: text("phone").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("suppliers_name_idx").on(t.name)]);

export const supplierBalances = pgTable("supplier_balances", {
  supplierId: uuid("supplier_id")
    .notNull()
    .references(() => suppliers.id, { onDelete: "cascade" }),
  totalPurchasesCents: bigint("total_purchases_cents", { mode: "number" }).notNull().default(0),
  totalPaidCents: bigint("total_paid_cents", { mode: "number" }).notNull().default(0),
  balanceCents: bigint("balance_cents", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("supplier_balances_idx").on(t.supplierId)]);

export const purchases = pgTable("purchases", {
  id: uuid("id").primaryKey().defaultRandom(),
  supplierId: uuid("supplier_id")
    .notNull()
    .references(() => suppliers.id, { onDelete: "restrict" }),
  purchaseDate: timestamp("purchase_date", { withTimezone: true }).notNull().defaultNow(),
  reference: text("reference").notNull().default(""),
  employeeId: uuid("employee_id").references(() => users.id, { onDelete: "set null" }),
  totalCents: bigint("total_cents", { mode: "number" }).notNull().default(0),
  status: text("status").notNull().default("pending"),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("purchases_supplier_idx").on(t.supplierId, t.createdAt)]);

export const purchaseItems = pgTable("purchase_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  purchaseId: uuid("purchase_id")
    .notNull()
    .references(() => purchases.id, { onDelete: "cascade" }),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "restrict" }),
  quantity: bigint("quantity", { mode: "number" }).notNull(),
  unitCostCents: bigint("unit_cost_cents", { mode: "number" }).notNull(),
  lineTotalCents: bigint("line_total_cents", { mode: "number" }).notNull(),
});

export const supplierPayments = pgTable(
  "supplier_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    purchaseId: uuid("purchase_id").references(() => purchases.id, { onDelete: "set null" }),
    status: supplierPaymentStatusEnum("status").notNull().default("pending"),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    paymentDate: timestamp("payment_date", { withTimezone: true }).notNull().defaultNow(),
    paidBy: uuid("paid_by").references(() => users.id, { onDelete: "set null" }),
    reference: text("reference").notNull().default(""),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("supplier_payments_supplier_idx").on(t.supplierId, t.createdAt)],
);

export const backupRecords = pgTable("backup_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  status: text("status").notNull(),
  kind: text("kind").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  notes: text("notes").notNull().default(""),
});

export const invoiceNumberSeq = pgSequence("invoice_number_seq", { startWith: 1 });

/* ------------------------------------------------------------------ *
 * Réglages et comptes
 * ------------------------------------------------------------------ */

export const businessSettings = pgTable("business_settings", {
  id: integer("id").primaryKey().default(1),
  businessName: text("business_name").notNull().default("LUNDER"),
  address: text("address").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  currency: text("currency").notNull().default("DZD"),
  timezone: text("timezone").notNull().default("Africa/Algiers"),
  invoicePrefix: text("invoice_prefix").notNull().default("FAC"),
  receiptFooter: text("receipt_footer").notNull().default("Merci de votre visite !"),
  taxEnabled: boolean("tax_enabled").notNull().default(false),
  taxRateBasisPoints: integer("tax_rate_basis_points").notNull().default(0),
  creditEnabled: boolean("credit_enabled").notNull().default(false),
  allowNegativeStock: boolean("allow_negative_stock").notNull().default(false),
  defaultStockThreshold: integer("default_stock_threshold").notNull().default(5),
  maxDiscountPercent: integer("max_discount_percent").notNull().default(0),
  sessionBankerRounding: boolean("session_banker_rounding").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    username: text("username").notNull(),
    phone: text("phone").notNull().default(""),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull().default("cashier"),
    isPrimaryOwner: boolean("is_primary_owner").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_username_unique").on(sql`lower(${t.username})`),
    uniqueIndex("users_single_primary_owner").on(t.isPrimaryOwner).where(sql`${t.isPrimaryOwner} = true`),
  ],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    role: userRoleEnum("role").notNull(),
    permission: text("permission").notNull(),
    allowed: boolean("allowed").notNull().default(true),
  },
  (t) => [uniqueIndex("role_permissions_unique").on(t.role, t.permission)],
);

export const userPermissions = pgTable(
  "user_permissions",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permission: text("permission").notNull(),
    allowed: boolean("allowed").notNull(),
  },
  (t) => [uniqueIndex("user_permissions_unique").on(t.userId, t.permission)],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ip: text("ip").notNull().default(""),
    userAgent: text("user_agent").notNull().default(""),
  },
  (t) => [
    uniqueIndex("auth_sessions_token_unique").on(t.tokenHash),
    index("auth_sessions_user_idx").on(t.userId),
  ],
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull(),
    ip: text("ip").notNull().default(""),
    success: boolean("success").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_attempts_lookup_idx").on(t.username, t.createdAt)],
);

/* ------------------------------------------------------------------ *
 * Appareils
 * ------------------------------------------------------------------ */

export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    type: deviceTypeEnum("type").notNull().default("playstation"),
    location: text("location").notNull().default(""),
    status: deviceStatusEnum("status").notNull().default("available"),
    billingMode: billingModeEnum("billing_mode").notNull().default("hourly"),
    hourlyRateCents: bigint("hourly_rate_cents", { mode: "number" }).notNull().default(0),
    matchRateCents: bigint("match_rate_cents", { mode: "number" }).notNull().default(0),
    fixedRateCents: bigint("fixed_rate_cents", { mode: "number" }).notNull().default(0),
    minBillableMinutes: integer("min_billable_minutes").notNull().default(0),
    billingIncrementMinutes: integer("billing_increment_minutes").notNull().default(60),
    rounding: roundingRuleEnum("rounding").notNull().default("up"),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("devices_active_idx").on(t.isActive, t.sortOrder)],
);

export const deviceStatusHistory = pgTable(
  "device_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "restrict" }),
    fromStatus: deviceStatusEnum("from_status"),
    toStatus: deviceStatusEnum("to_status").notNull(),
    changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("device_status_history_device_idx").on(t.deviceId, t.createdAt)],
);

/* ------------------------------------------------------------------ *
 * Clients
 * ------------------------------------------------------------------ */

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    phone: text("phone").notNull().default(""),
    notes: text("notes").notNull().default(""),
    creditEnabled: boolean("credit_enabled").notNull().default(false),
    creditLimitCents: bigint("credit_limit_cents", { mode: "number" }).notNull().default(0),
    balanceCents: bigint("balance_cents", { mode: "number" }).notNull().default(0),
    creditBlocked: boolean("credit_blocked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("customers_name_idx").on(t.fullName),
    index("customers_phone_idx").on(t.phone),
  ],
);

/* ------------------------------------------------------------------ *
 * Shifts et caisse
 * ------------------------------------------------------------------ */

export const shifts = pgTable(
  "shifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    registerName: text("register_name").notNull().default("Caisse principale"),
    status: shiftStatusEnum("status").notNull().default("open"),
    openingCashCents: bigint("opening_cash_cents", { mode: "number" }).notNull().default(0),
    countedCashCents: bigint("counted_cash_cents", { mode: "number" }),
    expectedCashCents: bigint("expected_cash_cents", { mode: "number" }),
    varianceCents: bigint("variance_cents", { mode: "number" }),
    varianceReason: text("variance_reason").notNull().default(""),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: uuid("closed_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("shifts_one_open_per_user").on(t.userId).where(sql`${t.status} = 'open'`),
    index("shifts_status_idx").on(t.status, t.openedAt),
  ],
);

export const cashMovements = pgTable(
  "cash_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shiftId: uuid("shift_id")
      .notNull()
      .references(() => shifts.id, { onDelete: "restrict" }),
    type: text("type").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    reason: text("reason").notNull().default(""),
    invoiceId: uuid("invoice_id"),
    customerId: uuid("customer_id"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("cash_movements_shift_idx").on(t.shiftId, t.createdAt)],
);

export const expenseCategories = pgTable("expense_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id").references(() => expenseCategories.id, { onDelete: "restrict" }),
    shiftId: uuid("shift_id").references(() => shifts.id, { onDelete: "set null" }),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    paidWithCash: boolean("paid_with_cash").notNull().default(false),
    expenseDate: timestamp("expense_date", { withTimezone: true }).notNull().defaultNow(),
    employeeId: uuid("employee_id").references(() => users.id, { onDelete: "set null" }),
    receiptAttachmentUrl: text("receipt_attachment_url").notNull().default(""),
    notes: text("notes").notNull().default(""),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("expenses_shift_idx").on(t.shiftId), index("expenses_category_idx").on(t.categoryId)],
);

export const cashHandover = pgTable(
  "cash_handover",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromUserId: uuid("from_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    toUserId: uuid("to_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    shiftId: uuid("shift_id")
      .notNull()
      .references(() => shifts.id, { onDelete: "restrict" }),
    handoverAmountCents: bigint("handover_amount_cents", { mode: "number" }).notNull(),
    handoverReason: text("handover_reason").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("cash_handover_shift_idx").on(t.shiftId, t.createdAt)],
);

export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    issuedBy: uuid("issued_by").references(() => users.id, { onDelete: "set null" }),
    status: refundStatusEnum("status").notNull().default("pending"),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    refundMethod: text("refund_method").notNull().default(""),
    reference: text("reference").notNull().default(""),
    reason: text("reason").notNull().default(""),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("refunds_invoice_idx").on(t.invoiceId)],
);

/* ------------------------------------------------------------------ *
 * Sessions de jeu
 * ------------------------------------------------------------------ */

export const gameSessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    shiftId: uuid("shift_id").references(() => shifts.id, { onDelete: "restrict" }),
    status: sessionStatusEnum("status").notNull().default("running"),
    billingMode: billingModeEnum("billing_mode").notNull(),
    hourlyRateCents: bigint("hourly_rate_cents", { mode: "number" }).notNull().default(0),
    matchRateCents: bigint("match_rate_cents", { mode: "number" }).notNull().default(0),
    fixedRateCents: bigint("fixed_rate_cents", { mode: "number" }).notNull().default(0),
    minBillableMinutes: integer("min_billable_minutes").notNull().default(0),
    billingIncrementMinutes: integer("billing_increment_minutes").notNull().default(60),
    rounding: roundingRuleEnum("rounding").notNull().default("up"),
    matches: integer("matches").notNull().default(1),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    pausedSeconds: integer("paused_seconds").notNull().default(0),
    billableMinutes: integer("billable_minutes"),
    computedAmountCents: bigint("computed_amount_cents", { mode: "number" }),
    invoiceId: uuid("invoice_id"),
    transferFromSessionId: uuid("transfer_from_session_id"),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sessions_one_active_per_device")
      .on(t.deviceId)
      .where(sql`${t.status} in ('running','paused')`),
    index("sessions_status_idx").on(t.status),
    index("sessions_started_idx").on(t.startedAt),
  ],
);

export const sessionEvents = pgTable(
  "session_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => gameSessions.id, { onDelete: "cascade" }),
    type: sessionEventTypeEnum("type").notNull(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("session_events_session_idx").on(t.sessionId, t.createdAt)],
);

/* ------------------------------------------------------------------ *
 * Produits et stock
 * ------------------------------------------------------------------ */

export const productCategories = pgTable("product_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    sku: text("sku").notNull().default(""),
    barcode: text("barcode").notNull().default(""),
    categoryId: uuid("category_id").references(() => productCategories.id, { onDelete: "set null" }),
    costCents: bigint("cost_cents", { mode: "number" }).notNull().default(0),
    priceCents: bigint("price_cents", { mode: "number" }).notNull().default(0),
    stockQuantity: bigint("stock_quantity", { mode: "number" }).notNull().default(0),
    unitsPerCarton: integer("units_per_carton").notNull().default(1),
    minStock: integer("min_stock").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    imageUrl: text("image_url").notNull().default(""),
    description: text("description").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("products_active_idx").on(t.isActive),
    uniqueIndex("products_sku_unique").on(t.sku).where(sql`${t.sku} <> ''`),
  ],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    type: stockMovementTypeEnum("type").notNull(),
    quantity: bigint("quantity", { mode: "number" }).notNull(),
    unitCostCents: bigint("unit_cost_cents", { mode: "number" }).notNull().default(0),
    invoiceId: uuid("invoice_id"),
    purchaseId: uuid("purchase_id"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason").notNull().default(""),
    stockAfter: bigint("stock_after", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("stock_movements_product_idx").on(t.productId, t.createdAt)],
);

/* ------------------------------------------------------------------ *
 * Factures et paiements
 * ------------------------------------------------------------------ */

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").notNull(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "restrict" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    shiftId: uuid("shift_id").references(() => shifts.id, { onDelete: "restrict" }),
    status: invoiceStatusEnum("status").notNull().default("pending"),
    subtotalCents: bigint("subtotal_cents", { mode: "number" }).notNull().default(0),
    discountCents: bigint("discount_cents", { mode: "number" }).notNull().default(0),
    discountReason: text("discount_reason").notNull().default(""),
    totalCents: bigint("total_cents", { mode: "number" }).notNull().default(0),
    paidCents: bigint("paid_cents", { mode: "number" }).notNull().default(0),
    balanceCents: bigint("balance_cents", { mode: "number" }).notNull().default(0),
    creditCents: bigint("credit_cents", { mode: "number" }).notNull().default(0),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: uuid("cancelled_by").references(() => users.id, { onDelete: "set null" }),
    cancelReason: text("cancel_reason").notNull().default(""),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("invoices_number_unique").on(t.number),
    index("invoices_created_idx").on(t.createdAt),
    index("invoices_customer_idx").on(t.customerId),
    index("invoices_shift_idx").on(t.shiftId),
  ],
);

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    kind: invoiceItemKindEnum("kind").notNull(),
    sessionId: uuid("session_id").references(() => gameSessions.id, { onDelete: "set null" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    quantity: bigint("quantity", { mode: "number" }).notNull().default(1),
    unitPriceCents: bigint("unit_price_cents", { mode: "number" }).notNull(),
    lineTotalCents: bigint("line_total_cents", { mode: "number" }).notNull(),
    unitCostCents: bigint("unit_cost_cents", { mode: "number" }).notNull().default(0),
  },
  (t) => [index("invoice_items_invoice_idx").on(t.invoiceId)],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "restrict" }),
    shiftId: uuid("shift_id").references(() => shifts.id, { onDelete: "restrict" }),
    method: paymentMethodEnum("method").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    receivedBy: uuid("received_by").references(() => users.id, { onDelete: "set null" }),
    reference: text("reference").notNull().default(""),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payments_invoice_idx").on(t.invoiceId),
    index("payments_shift_idx").on(t.shiftId),
    index("payments_created_idx").on(t.createdAt),
  ],
);

export const creditTransactions = pgTable(
  "credit_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "restrict" }),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "restrict" }),
    type: creditTxTypeEnum("type").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    balanceAfterCents: bigint("balance_after_cents", { mode: "number" }).notNull(),
    reason: text("reason").notNull().default(""),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("credit_tx_customer_idx").on(t.customerId, t.createdAt),
    index("credit_tx_invoice_idx").on(t.invoiceId),
  ],
);

/* ------------------------------------------------------------------ *
 * Audit et idempotence
 * ------------------------------------------------------------------ */

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorName: text("actor_name").notNull().default(""),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull().default(""),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason").notNull().default(""),
    ip: text("ip").notNull().default(""),
    userAgent: text("user_agent").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_created_idx").on(t.createdAt),
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
  ],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    key: text("key").primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    requestHash: text("request_hash").notNull(),
    response: jsonb("response").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idempotency_created_idx").on(t.createdAt)],
);

/* ------------------------------------------------------------------ *
 * Relations
 * ------------------------------------------------------------------ */

export const usersRelations = relations(users, ({ many }) => ({
  shifts: many(shifts),
  invoices: many(invoices),
}));

export const devicesRelations = relations(devices, ({ many }) => ({
  sessions: many(gameSessions),
  statusHistory: many(deviceStatusHistory),
}));

export const gameSessionsRelations = relations(gameSessions, ({ one, many }) => ({
  device: one(devices, { fields: [gameSessions.deviceId], references: [devices.id] }),
  customer: one(customers, { fields: [gameSessions.customerId], references: [customers.id] }),
  employee: one(users, { fields: [gameSessions.employeeId], references: [users.id] }),
  invoice: one(invoices, { fields: [gameSessions.invoiceId], references: [invoices.id] }),
  events: many(sessionEvents),
}));

export const suppliersRelations = relations(suppliers, ({ one, many }) => ({
  balances: one(supplierBalances, { fields: [suppliers.id], references: [supplierBalances.supplierId] }),
  purchases: many(purchases),
}));

export const purchasesRelations = relations(purchases, ({ one, many }) => ({
  supplier: one(suppliers, { fields: [purchases.supplierId], references: [suppliers.id] }),
  employee: one(users, { fields: [purchases.employeeId], references: [users.id] }),
  items: many(purchaseItems),
  payments: many(supplierPayments),
}));

export const purchaseItemsRelations = relations(purchaseItems, ({ one }) => ({
  purchase: one(purchases, { fields: [purchaseItems.purchaseId], references: [purchases.id] }),
  product: one(products, { fields: [purchaseItems.productId], references: [products.id] }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  customer: one(customers, { fields: [invoices.customerId], references: [customers.id] }),
  employee: one(users, { fields: [invoices.employeeId], references: [users.id] }),
  shift: one(shifts, { fields: [invoices.shiftId], references: [shifts.id] }),
  items: many(invoiceItems),
  payments: many(payments),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceItems.invoiceId], references: [invoices.id] }),
  product: one(products, { fields: [invoiceItems.productId], references: [products.id] }),
  session: one(gameSessions, { fields: [invoiceItems.sessionId], references: [gameSessions.id] }),
}));

export type User = typeof users.$inferSelect;
export type Device = typeof devices.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Product = typeof products.$inferSelect;
export type GameSession = typeof gameSessions.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Shift = typeof shifts.$inferSelect;
export type BusinessSettings = typeof businessSettings.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type SupplierBalance = typeof supplierBalances.$inferSelect;
export type Purchase = typeof purchases.$inferSelect;
export type PurchaseItem = typeof purchaseItems.$inferSelect;
export type SupplierPayment = typeof supplierPayments.$inferSelect;

