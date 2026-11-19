import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { formatDateFr } from "@/lib/cn";
import { Badge, Card, CardTitle, EmptyState, PageHeader, Table, Td, Th, buttonClass } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requirePermission(PERMISSIONS.AUDIT_VIEW);
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const perPage = 40;

  const rows = await db
    .select({ log: auditLogs, actorName: users.fullName })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(perPage)
    .offset((page - 1) * perPage);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Journal d'audit"
        description="Entrées en append-only : aucune interface ne permet de modifier ou de supprimer une trace."
      />

      <Card>
        <CardTitle title="Événements récents" subtitle={`Page ${page}`} />
        {rows.length === 0 ? (
          <EmptyState title="Aucun événement" description="Les actions apparaîtront ici dès la première connexion." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Acteur</Th>
                <Th>Action</Th>
                <Th>Entité</Th>
                <Th>Motif</Th>
                <Th>Détail</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ log, actorName }) => (
                <tr key={log.id} className="align-top">
                  <Td className="whitespace-nowrap text-muted">{formatDateFr(log.createdAt)}</Td>
                  <Td>{actorName ?? log.actorName ?? "Système"}</Td>
                  <Td>
                    <Badge tone={log.action.includes("annulee") ? "danger" : log.action.includes("creee") ? "success" : "neutral"}>
                      {log.action}
                    </Badge>
                  </Td>
                  <Td className="text-muted">
                    {log.entityType}
                    {log.entityId ? ` · ${log.entityId.slice(0, 8)}` : ""}
                  </Td>
                  <Td className="max-w-[180px] truncate text-muted">{log.reason || "—"}</Td>
                  <Td className="max-w-[280px]">
                    <details>
                      <summary className="cursor-pointer text-[11px] text-accent-soft">Voir</summary>
                      <pre className="mt-1 max-h-56 overflow-auto rounded-lg bg-surface-2 p-2 text-[10px] whitespace-pre-wrap text-muted">
                        {JSON.stringify({ before: log.before, after: log.after, ip: log.ip }, null, 2)}
                      </pre>
                    </details>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        <div className="mt-4 flex justify-between text-xs text-muted">
          <Link
            href={`/audit?page=${Math.max(1, page - 1)}`}
            className={buttonClass("secondary", "sm", page === 1 ? "pointer-events-none opacity-40" : "")}
          >
            Précédent
          </Link>
          <Link href={`/audit?page=${page + 1}`} className={buttonClass("secondary", "sm")}>
            Suivant
          </Link>
        </div>
      </Card>
    </div>
  );
}
