import { desc, eq, sql } from "drizzle-orm";
import { Banknote, Lock, Unlock, Wallet } from "lucide-react";
import { db } from "@/db";
import { payments, shifts, users } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { closeShiftAction, openShiftAction } from "@/app/actions/shifts";
import { computeExpectedCash, getOpenShift } from "@/lib/services/shifts";
import { formatCents } from "@/lib/money";
import { formatDateFr } from "@/lib/cn";
import { PAYMENT_METHOD_LABELS, SHIFT_STATUS_LABELS } from "@/lib/labels";
import {
  Alert,
  Badge,
  Card,
  CardTitle,
  Field,
  Input,
  PageHeader,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { ActionForm } from "@/components/action-form";

export const dynamic = "force-dynamic";

export default async function ShiftPage() {
  const user = await requirePermission(PERMISSIONS.SHIFTS_OWN);
  const shift = await getOpenShift(user.id);

  const [history, paymentSummary] = await Promise.all([
    db
      .select({ shift: shifts, userName: users.fullName })
      .from(shifts)
      .innerJoin(users, eq(users.id, shifts.userId))
      .orderBy(desc(shifts.openedAt))
      .limit(30),
    shift
      ? db
          .select({ method: payments.method, amount: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` })
          .from(payments)
          .where(eq(payments.shiftId, shift.id))
          .groupBy(payments.method)
      : Promise.resolve([]),
  ]);

  const expected = shift ? await computeExpectedCash(shift.id) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ma caisse"
        description="Chaque employé ouvre sa propre caisse. La caisse attendue est calculée à partir des transactions réelles."
      />

      {shift ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <Card>
            <CardTitle
              title="Caisse en cours"
              subtitle={`${shift.registerName} · ouverte le ${formatDateFr(shift.openedAt)}`}
              action={<Badge tone="success">Ouverte</Badge>}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-surface-2/40 p-3">
                <p className="text-[11px] text-muted">Fonds de départ</p>
                <p className="font-display mt-1 text-lg font-semibold">
                  {formatCents(Number(shift.openingCashCents))}
                </p>
              </div>
              <div className="rounded-xl border border-success/30 bg-success/10 p-3">
                <p className="text-[11px] text-success">Caisse attendue</p>
                <p className="font-display mt-1 text-lg font-semibold text-success">{formatCents(expected)}</p>
              </div>
              <div className="rounded-xl border border-border bg-surface-2/40 p-3">
                <p className="text-[11px] text-muted">Encaissements</p>
                <p className="font-display mt-1 text-lg font-semibold">
                  {formatCents(expected - Number(shift.openingCashCents))}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">Détail par mode</p>
              {paymentSummary.length === 0 ? (
                <p className="text-sm text-muted">Aucun encaissement sur cette caisse.</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {paymentSummary.map((row) => (
                    <li
                      key={row.method}
                      className="flex items-center justify-between rounded-lg bg-surface-2/40 px-3 py-2 text-sm"
                    >
                      <span className="text-muted">{PAYMENT_METHOD_LABELS[row.method] ?? row.method}</span>
                      <span className="font-medium">{formatCents(Number(row.amount))}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
                <Banknote className="mt-0.5 h-3 w-3 shrink-0" />
                Seuls les paiements en espèces alimentent la caisse physique. Le crédit accordé et les
                paiements carte/mobile/virement n&apos;y sont pas ajoutés.
              </p>
            </div>
          </Card>

          <Card>
            <CardTitle title="Clôturer la caisse" subtitle="Comptez le liquide présent dans le tiroir." />
            <ActionForm
              action={closeShiftAction}
              submitLabel="Clôturer la caisse"
              variant="danger"
              hidden={{ shiftId: shift.id }}
            >
              <Field label="Montant compté (DA)">
                <Input name="countedCash" inputMode="decimal" placeholder={(expected / 100).toFixed(2)} required />
              </Field>
              <Field label="Motif en cas d'écart">
                <Input name="varianceReason" placeholder="Erreur de rendu, fonds manquant…" />
              </Field>
              <Alert tone="warning">
                La clôture est définitive. Toute correction ultérieure devra passer par une écriture
                d&apos;ajustement tracée.
              </Alert>
            </ActionForm>
          </Card>
        </div>
      ) : (
        <Card className="mx-auto max-w-lg">
          <CardTitle title="Ouvrir la caisse" subtitle="Le fonds de départ permet de calculer les écarts." />
          <ActionForm action={openShiftAction} submitLabel="Ouvrir la caisse">
            <Field label="Nom de la caisse">
              <Input name="registerName" defaultValue="Caisse principale" maxLength={80} />
            </Field>
            <Field label="Fonds de départ (DA)">
              <Input name="openingCash" inputMode="decimal" placeholder="0.00" defaultValue="0.00" />
            </Field>
            <p className="flex items-start gap-1.5 text-[11px] text-muted">
              <Unlock className="mt-0.5 h-3 w-3 shrink-0" />
              Une seule caisse ouverte par employé. L&apos;ouverture est enregistrée dans le journal d&apos;audit.
            </p>
          </ActionForm>
        </Card>
      )}

      <Card>
        <CardTitle title="Historique des caisses" subtitle="Les clôtures confirmées ne peuvent plus être modifiées." />
        {history.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">Aucune caisse enregistrée.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Employé</Th>
                <Th>Ouverture</Th>
                <Th>Clôture</Th>
                <Th className="text-right">Départ</Th>
                <Th className="text-right">Attendu</Th>
                <Th className="text-right">Compté</Th>
                <Th className="text-right">Écart</Th>
                <Th>Statut</Th>
              </tr>
            </thead>
            <tbody>
              {history.map(({ shift: row, userName }) => {
                const variance = Number(row.varianceCents ?? 0);
                return (
                  <tr key={row.id}>
                    <Td className="font-medium">{userName}</Td>
                    <Td className="text-muted">{formatDateFr(row.openedAt)}</Td>
                    <Td className="text-muted">{row.closedAt ? formatDateFr(row.closedAt) : "—"}</Td>
                    <Td className="text-right text-muted">{formatCents(Number(row.openingCashCents))}</Td>
                    <Td className="text-right">{row.expectedCashCents !== null ? formatCents(Number(row.expectedCashCents)) : "—"}</Td>
                    <Td className="text-right">
                      {row.countedCashCents !== null ? formatCents(Number(row.countedCashCents)) : "—"}
                    </Td>
                    <Td className={`text-right ${variance === 0 ? "text-muted" : variance < 0 ? "text-danger" : "text-warning"}`}>
                      {row.varianceCents !== null ? formatCents(variance) : "—"}
                    </Td>
                    <Td>
                      {row.status === "open" ? (
                        <Badge tone="success">
                          <Unlock className="h-3 w-3" /> {SHIFT_STATUS_LABELS.open}
                        </Badge>
                      ) : (
                        <Badge tone="neutral">
                          <Lock className="h-3 w-3" /> {SHIFT_STATUS_LABELS.closed}
                        </Badge>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted">
          <Wallet className="h-3 w-3" /> Les dépenses, retraits et transferts de caisse arrivent en Phase 2.
        </p>
      </Card>
    </div>
  );
}
