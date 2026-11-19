import { desc } from "drizzle-orm";
import { ShieldCheck } from "lucide-react";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS, PERMISSION_LABELS, ROLE_DEFAULTS, ROLE_LABELS, type Role } from "@/lib/permissions";
import { formatDateFr } from "@/lib/cn";
import { Badge, Card, CardTitle, PageHeader, Table, Td, Th } from "@/components/ui";
import { CreateUserDialog, EditUserDialog, ResetPasswordDialog } from "./staff-dialogs";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const actor = await requirePermission(PERMISSIONS.STAFF_MANAGE);
  const rows = await db.select().from(users).orderBy(desc(users.isPrimaryOwner), users.fullName);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Équipe"
        description="Un compte par employé, avec un rôle dont les permissions sont appliquées côté serveur."
        actions={<CreateUserDialog />}
      />

      <Card>
        <CardTitle title="Comptes" subtitle={`${rows.length} compte(s)`} />
        <Table>
          <thead>
            <tr>
              <Th>Employé</Th>
              <Th>Identifiant</Th>
              <Th>Rôle</Th>
              <Th>Statut</Th>
              <Th>Dernière connexion</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((user) => (
              <tr key={user.id} className="transition hover:bg-surface-2/40">
                <Td>
                  <p className="font-medium">{user.fullName}</p>
                  <p className="text-[11px] text-muted">{user.phone || "—"}</p>
                </Td>
                <Td className="text-muted">{user.username}</Td>
                <Td>
                  <Badge tone={user.role === "owner" ? "accent" : "neutral"}>
                    {user.role === "owner" && user.isPrimaryOwner ? (
                      <>
                        <ShieldCheck className="h-3 w-3" /> {ROLE_LABELS[user.role]}
                      </>
                    ) : (
                      ROLE_LABELS[user.role]
                    )}
                  </Badge>
                </Td>
                <Td>
                  {user.isActive ? (
                    <Badge tone="success">Actif</Badge>
                  ) : (
                    <Badge tone="danger">Désactivé</Badge>
                  )}
                </Td>
                <Td className="text-muted">
                  {user.lastLoginAt ? formatDateFr(user.lastLoginAt) : "Jamais"}
                </Td>
                <Td>
                  <div className="flex items-center gap-1">
                    <EditUserDialog
                      user={{
                        id: user.id,
                        fullName: user.fullName,
                        phone: user.phone,
                        role: user.role,
                        isActive: user.isActive,
                        isPrimaryOwner: user.isPrimaryOwner,
                      }}
                    />
                    {user.id !== actor.id ? (
                      <ResetPasswordDialog userId={user.id} name={user.fullName} />
                    ) : null}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardTitle
          title="Permissions par rôle"
          subtitle="Attribution par défaut. Le propriétaire principal dispose de tous les droits et ne peut pas être rétrogradé."
        />
        <div className="grid gap-3 md:grid-cols-2">
          {(Object.keys(ROLE_LABELS) as Role[]).map((role) => {
            const permissions = ROLE_DEFAULTS[role];

            return (
              <div key={role} className="rounded-xl border border-border bg-surface-2/30 p-3">
                <p className="text-sm font-medium">{ROLE_LABELS[role]}</p>
                <ul className="mt-2 space-y-1 text-[11px] text-muted">
                  {permissions.map((permission) => (
                    <li key={permission}>· {PERMISSION_LABELS[permission]}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-muted">
          Les permissions sont vérifiées dans chaque action serveur : masquer un bouton ne suffit jamais.
        </p>
      </Card>
    </div>
  );
}
