# LUNDER — Gaming Lounge Management System
## Product Requirements Document (PRD) — Version 2.0

**Product:** LUNDER  
**Business:** Gaming lounge in Algeria  
**Currency:** DZD  
**Timezone:** Africa/Algiers  
**Application language:** French only  
**Status:** Revised implementation specification

---

## 1. Vision and operating principle

LUNDER replaces spreadsheets and fragmented manual processes with one dependable system for gaming stations, billiards, sales, customers, credit, inventory, staff, cash, expenses and reporting.

The system must be fast for employees, transparent for the owner, auditable for every financial operation, and responsive on desktop, tablet and mobile.

**Core principle: The owner controls and monitors. Employees operate only within explicitly granted permissions.**

All visible application text—navigation, buttons, validation, errors, notifications, invoices, receipts and reports—must be French. Internal code identifiers may be English.

## 2. Initial business configuration

Initial installation must support:
- Six PlayStation stations and one billiard table.
- Drinks, water, snacks, chocolate, gum and accessories.
- Multiple employees and shifts.
- Customer accounts and optional customer credit.
- Future devices, tables, product categories and locations.

Do not hard-code the number of stations. The owner must be able to add, edit, deactivate and configure resources.

Business settings:
- Business name, logo, address and contact information.
- Currency: DZD by default.
- Timezone: Africa/Algiers by default.
- Invoice numbering, receipt footer and cancellation policy.
- Optional tax display settings, only when configured.
- Session pricing, billing increments and rounding rules.
- Default stock-alert thresholds.

## 3. Roles and permissions

Roles:
1. Owner — full access.
2. Manager — configurable access.
3. Cashier/Employee — POS operations.
4. Technician — maintenance operations.
5. Viewer — read-only access.

Each user has an individual account, name, optional phone, username, securely stored password/PIN, role, active status, creation date, shift history and activity history.

Permissions must be enforced on the server/database, not merely by hiding UI controls.

Employees must not, unless explicitly authorized:
- Change prices or business settings.
- Permanently delete invoices, debts, payments or stock movements.
- Change credit limits or forgive debts.
- Perform unrestricted stock corrections.
- View owner-only profit/financial reports.
- Create privileged accounts or change owner credentials.
- Close another employee's shift.
- Edit or erase audit history.

Sensitive actions require the configured approval level and must record actor, approver, reason, timestamp and source operation.

## 4. Owner dashboard

Provide date-filtered summaries for:
- Sales and collected payments, shown separately.
- Revenue by PlayStation, billiards and products.
- Gross profit, net operating result and cost of goods sold.
- Expenses, purchases and supplier balances.
- Customer credit created, credit collected and outstanding balances.
- Cash expected, cash counted and cash differences.
- Open shifts and employee activity.
- Active sessions and device status.
- Low-stock/out-of-stock alerts.
- Best-selling and most profitable products.
- Device utilization and busiest hours.

Every figure should be traceable to the underlying transactions. Clearly distinguish today's activity from lifetime totals.

## 5. Devices and tables

Configurable fields:
- Name, type, station/location and status.
- Hourly, per-match or per-session price.
- Minimum billable duration/minimum charge.
- Billing increment and rounding rule.
- Maintenance status and notes.

Statuses: Disponible, Occupé, Réservé, En pause, En maintenance, Hors service.

Prevent overlapping active sessions on the same device unless an explicitly configured capacity supports it.

## 6. Gaming sessions

Support:
- Time-based billing.
- Match-based billing.
- Fixed session pricing.
- Billiard hourly or fixed-session billing.

Employee actions:
- Start, pause, resume and end a session.
- Extend a session.
- Add products to the same customer visit/invoice.
- Attach/change customer when permitted.
- Apply authorized discounts.
- Record payment and print receipt.
- Transfer a session to another device with a traceable transfer event.

Each session stores device, employee, start/pause/resume/end timestamps, billable duration, pricing-rule snapshot, match count where relevant, status/history and invoice reference.

Use server-authoritative timestamps. Paused time is not charged. Price changes must not silently alter an already-running session's agreed pricing. Billing and rounding rules must be explicit and testable.

## 7. Visits, invoices and payments

A customer visit may combine one or more sessions and product sales into one invoice where operationally appropriate.

Invoice data:
- Unique invoice number and date/time.
- Employee and shift.
- Optional customer.
- Device/session references.
- Item descriptions, quantities and unit prices.
- Discounts and reasons.
- Subtotal, total, payments and remaining balance.
- Payment methods, status and cancellation/correction history.

Payment methods: Espèces, Carte, Paiement mobile, Virement, Crédit client, Paiement mixte.

Support split and partial payments. Every payment is a separate transaction. Payments plus remaining balance must reconcile exactly with invoice total.

Suggested states: Brouillon (if supported), En attente de paiement, Partiellement payée, Payée, Annulée, Remboursée, Partiellement remboursée.

Never permanently delete invoices or payments. Corrections use cancellation, refund or reversal transactions with mandatory reasons and permission checks. Printing failure must never duplicate a transaction.

## 8. Customer credit and debt protection

Customer profile:
- Name and phone.
- Current outstanding balance and credit limit.
- Credit status.
- Debt/payment history.
- Total purchases, visits and last visit.
- Notes.

Rules:
- Default credit limit is 0 DZD; owner must explicitly enable credit.
- Check remaining credit before accepting a credit transaction.
- Warn at 80% of the limit and reject any transaction that exceeds it.
- Enforce the limit atomically on the server to prevent concurrent requests exceeding it.
- Every debt originates from an invoice.
- Every repayment references the relevant debt/customer balance.
- Support partial repayments and mixed payments.
- Never edit a debt balance directly; create auditable adjustment/reversal transactions.
- Only authorized owner/manager roles may change limits, block credit, forgive balances or approve exceptions.

Record actor, approver if applicable, timestamp, old value, new value and reason for every change.

## 9. Products and inventory

Product fields: name, SKU/barcode, category, purchase cost, selling price, stock quantity/unit, minimum threshold, active status, optional image/description.

Track movements:
- Purchase receipt, sale, customer return, supplier return.
- Damaged/expired goods and staff/personal consumption.
- Manual correction and physical-count adjustment.

Every movement records product, quantity, unit, source document, employee, timestamp and reason. Never silently overwrite stock quantity.

Support carton-to-unit conversion with a defined conversion factor. Prevent negative stock by default; any authorized exception must be logged.

Sales and stock deduction must be atomic: both succeed or neither does.

## 10. Purchases and suppliers

Supplier records include name, contact, purchase history, outstanding balance, payment history and notes.

Purchase records include supplier/date/reference, products, quantities/units/conversion, unit costs, total, paid amount, remaining supplier balance, payment method/status.

Support partial supplier payments, returns and balance reconciliation. Increase stock only when goods are received, not when a purchase is merely drafted.

## 11. Shifts, cash drawer and handover

Each employee opens an individual shift with start time, opening cash, assigned register/drawer and employee identity.

Record during the shift:
- Cash/card/mobile receipts.
- Customer credit created and repayments collected.
- Expenses, refunds, cash deposits/withdrawals.
- Discounts and invoice cancellations.

Expected cash formula:

`Expected cash = Opening cash + cash receipts + cash debt collections - cash refunds - cash expenses - cash withdrawals + cash deposits`

Non-cash payments and newly created customer credit do not increase drawer cash.

At closing, employee enters counted cash; system calculates expected cash and variance. Require a reason for differences. Confirmed closing reports are immutable; corrections require an authorized adjustment. Support documented handover between employees with both parties and amounts. Prevent duplicate open shifts for the same employee/register unless configured.

## 12. Expenses and operating costs

Categories: Rent, Electricity, Internet, Salaries, Maintenance, Cleaning, Supplies, Other.

Each expense includes amount, category, date, payment method, employee, optional receipt attachment, notes and approval status. Distinguish expenses paid from the drawer from those paid externally.

Avoid double-counting product purchases: inventory purchase cost becomes cost of goods sold when products are sold; supplier cash payment is a cash-flow event.

## 13. Financial definitions and reports

Use consistent definitions:
- **Sales/revenue:** value of goods/services sold, excluding cancelled transactions and following configured accounting treatment.
- **Collected payments:** money actually received, separated by payment method.
- **Customer credit created:** unpaid invoice balance, not cash received.
- **Customer credit collected:** repayment received; cash only if paid in cash.
- **Cost of goods sold:** cost associated with products sold.
- **Gross profit:** revenue minus cost of goods sold and explicitly defined direct costs.
- **Net operating result:** gross profit minus recorded operating expenses under the chosen reporting rules.
- **Cash flow:** actual cash inflows/outflows, not profit.
- **Outstanding customer balances:** unpaid customer amounts.
- **Supplier balances:** amounts owed to suppliers.

Reports: daily/weekly/monthly summaries; sales by category/device/employee; product margins and stock movement; customer credit; shift/cash variance; expenses/supplier balances; gross profit/net result/cash flow; device utilization and session duration. Export CSV/Excel and PDF. Every report states date range, currency and calculation basis.

## 14. Reservations and maintenance

Reservations for PlayStation and billiards store customer/contact, device, start/end, deposit, balance, status (requested, confirmed, arrived, cancelled, no-show), and creating/changing employee.

Prevent conflicting reservations. Configure deposit/refund rules. Convert an arrived reservation into a session without duplicating customer or payment records.

Maintenance records include device, issue, date, technician, repair cost, status and repair history.

## 15. Notifications

In-app alerts for low/out-of-stock products, customers nearing/exceeding credit limit, device maintenance/outage, cash variance, invoice cancellation/refund, unusual discount, debt creation/repayment, reservation reminders and supplier payment due.

Respect permissions; employees must not receive owner-only financial information.

## 16. Audit trail and anti-fraud controls

Log authentication/failed attempts, user/permission changes, session lifecycle/device transfers, invoice creation/cancellation/refunds/corrections, discounts/price changes, credit/repayments/limit changes, stock movements/counts, purchases/expenses/supplier payments, shift opening/closing/handover, settings and backup operations.

Each event records actor, timestamp, action, affected record, before/after values where relevant, reason, approval and available request/device metadata.

Audit records must be append-only for normal users. Never log passwords, PINs, tokens or secrets.

## 17. Offline mode and synchronization

Offline mode is a separate engineering capability, not merely a UI toggle.

If implemented:
- Use durable local storage.
- Assign globally unique transaction IDs before synchronization.
- Queue operations with idempotency keys.
- Show sync status and pending queue.
- Never silently discard local operations.
- Define conflict rules for stock, credit, sessions and shifts.
- Protect local data on shared devices.
- Retry safely and report unresolved conflicts.

Multiple disconnected devices cannot guarantee a shared global credit limit or stock total without coordination. Offline credit must be disabled by default or restricted to a locally reserved allowance. Deliver a reliable online-first MVP before promising full multi-device offline operation.

## 18. Security, backups and recovery

Requirements:
- Modern password hashing.
- Server-side role and record authorization.
- Database row-level access policies where supported.
- Input validation and parameterized database operations.
- XSS, CSRF where applicable, injection and session-theft protection.
- Rate limits and login-attempt protection.
- Secure session expiry/logout.
- Owner MFA where available.
- Secrets only in server-side environment configuration.
- HTTPS in production.
- Minimal customer personal-data collection.

Backups: scheduled automatic backups, owner-triggered backup where supported, encrypted storage, retention policy, restore procedure and periodic restore tests. Display last successful backup. A backup is not proven until restoration has been tested.

## 19. Printing and documents

Support thermal receipts at 58 mm and 80 mm, A4 invoices/reports, debt/payment receipts, shift closing reports, purchase and supplier-payment records.

Use readable French labels, DZD amounts, business identity and invoice references. Printing failure must not duplicate transactions.

## 20. Brand and user experience

Brand: **LUNDER**

Visual direction:
- Premium modern gaming lounge aesthetic.
- Dark charcoal/near-black base with restrained purple/electric accents.
- Clear typography and strong contrast.
- Subtle, non-distracting motion.
- Responsive desktop/tablet/mobile layouts.
- Large touch targets and minimal steps for cashier workflows.

Owner area: analytics, settings, reports, staff, stock, finance and audit.  
Employee area: active sessions, POS, customers, payments and own shift.

Do not overload employee screens with owner analytics or settings.

## 21. Suggested data model

Core entities:
users, roles, permissions, user_permissions, devices, device_status_history, sessions, session_events, customers, invoices, invoice_items, payments, refunds, credit_accounts, credit_transactions, products, product_categories, stock_movements, suppliers, purchases, purchase_items, supplier_payments, expenses, shifts, cash_movements, cash_handover, reservations, maintenance_records, notifications, audit_logs, business_settings, backup_records.

Use foreign keys, indexes, timestamps, transaction boundaries and unique constraints. Financial amounts must use fixed-precision decimals or integer minor units, never floating-point arithmetic.

## 22. Delivery phases

### Phase 1 — Reliable online MVP
Authentication/roles; devices and sessions; POS, invoices and split payments; product sales/basic stock deduction; customer profiles; shift opening/closing/cash reconciliation; owner dashboard/basic reports; financial audit trail.

### Phase 2 — Credit and inventory controls
Credit limits and atomic debt checks; partial repayments; purchases/suppliers; stock movements, physical counts and alerts; expenses.

### Phase 3 — Operational maturity
Advanced reports/exports; reservations; maintenance; thermal/A4 printing; notifications and handover.

### Phase 4 — Advanced capabilities
Offline-first architecture/synchronization; QR customer requests; WhatsApp integration subject to provider availability and consent; loyalty program; advanced analytics.

Do not delay a stable usable POS while attempting every advanced feature at once.

## 23. Acceptance criteria

A release is acceptable only when:
- Owner can configure devices, products, prices and staff.
- Employee can run sessions and combine them with product sales.
- Billing correctly handles pauses, resumes and rounding.
- Invoice totals reconcile with payments and outstanding balances.
- Mixed and partial payments work.
- Credit limits cannot be exceeded through concurrent requests.
- Every debt and repayment is traceable.
- Product sales and stock movements remain consistent.
- Expected cash follows the defined formula.
- Employees can close only authorized shifts.
- Financial corrections are auditable and cannot erase history.
- Unauthorized backend requests are rejected.
- Reports distinguish revenue, collected cash, debt and profit.
- Backups can be restored successfully.
- All visible application text is French.
- Desktop and mobile browser workflows work.

## 24. Business decisions to confirm

Do not invent these values. Keep them configurable and ask the owner when needed:
1. Exact hourly price and billing increment per PlayStation.
2. Match price and how match counts are entered.
3. Billiard pricing: hourly, per game or fixed session.
4. Whether customers may share a session/invoice.
5. Actually accepted payment methods.
6. Who may apply discounts and their limits.
7. Whether customer credit is allowed and its limits.
8. Whether stock may go negative.
9. Whether offline mode is needed in the first release.
10. Receipt details and business contact information.

---

**Final product principle:** Every session, sale, payment, debt, stock movement and cash difference must be traceable to a person, a time and a source transaction. Reliability and financial correctness take priority over decorative features.
