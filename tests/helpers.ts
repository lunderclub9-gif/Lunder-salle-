import postgres from "postgres";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  businessSettings,
  devices,
  gameSessions,
  products,
  rolePermissions,
  users,
  customers,
  invoices,
  payments,
} from "@/db/schema";
import { ROLE_DEFAULTS, type Permission, type Role } from "@/lib/permissions";
import type { SessionUser } from "@/lib/auth";
import { hashPassword } from "@/lib/password";

export const TEST_PASSWORD = "TestPassword1";

export async function resetDatabase() {
  await db.execute(sql`
    truncate table
      audit_logs, idempotency_keys, whatsapp_messages, loyalty_transactions, customer_requests,
      credit_transactions, payments, invoice_items, invoices,
      supplier_payments, purchase_items, purchases, supplier_balances, suppliers,
      reservations, maintenance_records,
      stock_movements, session_events, sessions, cash_movements, shifts, login_attempts,
      auth_sessions, user_permissions, role_permissions, customers, products, product_categories,
      device_status_history, devices, users, business_settings
    restart identity cascade
  `);
  await db.execute(sql`alter sequence invoice_number_seq restart with 1`);
  await db.insert(businessSettings).values({ id: 1 });
}

export async function makeUser(role: Role, options?: { username?: string; isPrimaryOwner?: boolean }) {
  const username = options?.username ?? `${role}-${Math.random().toString(36).slice(2, 8)}`;
  const [user] = await db
    .insert(users)
    .values({
      fullName: `Utilisateur ${role}`,
      username,
      passwordHash: await hashPassword(TEST_PASSWORD),
      role,
      isPrimaryOwner: options?.isPrimaryOwner ?? false,
    })
    .returning();

  return {
    row: user!,
    session: {
      id: user!.id,
      fullName: user!.fullName,
      username: user!.username,
      role,
      isPrimaryOwner: user!.isPrimaryOwner,
      permissions: new Set<Permission>(role === "owner" ? (Object.values(ROLE_DEFAULTS.owner) as Permission[]) : ROLE_DEFAULTS[role]),
    } satisfies SessionUser,
  };
}

export async function makeDevice(overrides?: Partial<typeof devices.$inferInsert>) {
  const [device] = await db
    .insert(devices)
    .values({
      name: `PS-${Math.random().toString(36).slice(2, 6)}`,
      type: "playstation",
      billingMode: "hourly",
      hourlyRateCents: 6000,
      minBillableMinutes: 0,
      billingIncrementMinutes: 60,
      rounding: "up",
      ...overrides,
    })
    .returning();
  return device!;
}

export async function makeProduct(overrides?: Partial<typeof products.$inferInsert>) {
  const [product] = await db
    .insert(products)
    .values({
      name: `Produit ${Math.random().toString(36).slice(2, 6)}`,
      priceCents: 5000,
      costCents: 2000,
      stockQuantity: 10,
      minStock: 2,
      ...overrides,
    })
    .returning();
  return product!;
}

export async function makeCustomer(overrides?: Partial<typeof customers.$inferInsert>) {
  const [customer] = await db
    .insert(customers)
    .values({
      fullName: `Client ${Math.random().toString(36).slice(2, 6)}`,
      ...overrides,
    })
    .returning();
  return customer!;
}

export async function makeEndedSession(input: {
  deviceId: string;
  employeeId: string;
  amountCents: number;
  minutes?: number;
  customerId?: string | null;
}) {
  const started = new Date(Date.now() - (input.minutes ?? 60) * 60 * 1000);
  const [session] = await db
    .insert(gameSessions)
    .values({
      deviceId: input.deviceId,
      employeeId: input.employeeId,
      customerId: input.customerId ?? null,
      status: "ended",
      billingMode: "hourly",
      hourlyRateCents: 6000,
      startedAt: started,
      endedAt: new Date(),
      billableMinutes: input.minutes ?? 60,
      computedAmountCents: input.amountCents,
    })
    .returning();
  return session!;
}

export async function countInvoices() {
  const rows = await db.select({ id: invoices.id }).from(invoices);
  return rows.length;
}

export async function countPayments() {
  const rows = await db.select({ id: payments.id }).from(payments);
  return rows.length;
}

export async function seedRolePermissions() {
  for (const [role, permissions] of Object.entries(ROLE_DEFAULTS)) {
    for (const permission of permissions) {
      await db.insert(rolePermissions).values({ role: role as Role, permission }).onConflictDoNothing();
    }
  }
}

export function rawClient() {
  return postgres(process.env.DATABASE_URL!, { max: 4, onnotice: () => undefined });
}
