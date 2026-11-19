import Link from "next/link";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { CheckCircle2, Link2, Printer, QrCode, RefreshCw, XCircle } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { formatDateFr } from "@/lib/cn";
import {
  REQUEST_STATUS_LABELS,
  REQUEST_TYPE_LABELS,
  buildRequestUrl,
  getRequestSettings,
  listRequests,
  type RequestType,
} from "@/lib/services/requests";
import {
  Alert,
  Badge,
  Card,
  CardTitle,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  buttonClass,
} from "@/components/ui";
import { ActionButton } from "@/components/action-form";
import {
  closeRequestAction,
  enableRequestLinkAction,
  rotateRequestLinkAction,
  startRequestAction,
} from "@/app/actions/requests";

export const dynamic = "force-dynamic";

async function requestOrigin() {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function RequestsPage() {
  const user = await requirePermission(PERMISSIONS.SESSIONS_MANAGE);
  const [settings, rows] = await Promise.all([getRequestSettings(), listRequests()]);

  const token = settings?.requestToken ?? "";
  const link = token ? buildRequestUrl(await requestOrigin(), token) : "";
  const svg = link
    ? await QRCode.toString(link, { type: "svg", margin: 1, width: 240, color: { dark: "#0b0b12", light: "#ffffff" } })
    : "";

  const open = rows.filter(
    (row) => row.request.status === "pending" || row.request.status === "in_progress",
  );
  const closed = rows.filter(
    (row) => row.request.status === "done" || row.request.status === "cancelled",
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Demandes client"
        description="Les clients scannent le QR de la salle pour demander un employé, une commande ou de l'aide."
        actions={
          token ? (
            <Link href="/imprimer/demande" target="_blank" className={buttonClass("secondary", "md")}>
              <Printer className="h-4 w-4" /> Imprimer le QR
            </Link>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card>
            <CardTitle
              title="File d'attente"
              subtitle="Les demandes arrivent en temps réel à l'actualisation de la page."
              action={<Badge tone={open.length > 0 ? "warning" : "neutral"}>{open.length} en cours</Badge>}
            />
            {open.length === 0 ? (
              <EmptyState
                title="Aucune demande en attente"
                description="Le QR affiché à l'accueil permet aux clients d'envoyer une demande."
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Reçue</Th>
                    <Th>Appareil</Th>
                    <Th>Demande</Th>
                    <Th>Client</Th>
                    <Th>Statut</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {open.map(({ request, deviceName }) => (
                    <tr key={request.id}>
                      <Td className="text-muted">{formatDateFr(request.createdAt)}</Td>
                      <Td>{deviceName ?? "—"}</Td>
                      <Td>
                        <span className="font-medium">
                          {REQUEST_TYPE_LABELS[request.type as RequestType] ?? request.type}
                        </span>
                        <span className="block max-w-[280px] text-[11px] text-muted">{request.note}</span>
                      </Td>
                      <Td className="text-muted">
                        {request.customerName || "Anonyme"}
                        {request.customerPhone ? <span className="block text-[11px]">{request.customerPhone}</span> : null}
                      </Td>
                      <Td>
                        <Badge tone={request.status === "pending" ? "warning" : "accent"}>
                          {REQUEST_STATUS_LABELS[request.status]}
                        </Badge>
                      </Td>
                      <Td>
                        <div className="flex justify-end gap-2">
                          {request.status === "pending" ? (
                            <ActionButton
                              action={startRequestAction}
                              label="Prendre"
                              fields={{ requestId: request.id }}
                              icon={<Link2 className="h-3.5 w-3.5" />}
                            />
                          ) : (
                            <ActionButton
                              action={closeRequestAction}
                              label="Terminer"
                              variant="primary"
                              fields={{ requestId: request.id, status: "done" }}
                              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                            />
                          )}
                          <ActionButton
                            action={closeRequestAction}
                            label="Annuler"
                            variant="ghost"
                            fields={{ requestId: request.id, status: "cancelled" }}
                            icon={<XCircle className="h-3.5 w-3.5" />}
                          />
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card>
            <CardTitle title="Historique récent" subtitle="60 dernières demandes." />
            {closed.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">Aucune demande clôturée pour le moment.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Reçue</Th>
                    <Th>Appareil</Th>
                    <Th>Demande</Th>
                    <Th>Statut</Th>
                  </tr>
                </thead>
                <tbody>
                  {closed.map(({ request, deviceName }) => (
                    <tr key={request.id}>
                      <Td className="text-muted">{formatDateFr(request.createdAt)}</Td>
                      <Td>{deviceName ?? "—"}</Td>
                      <Td className="max-w-[320px] truncate">{request.note}</Td>
                      <Td>
                        <Badge tone={request.status === "done" ? "success" : "neutral"}>
                          {REQUEST_STATUS_LABELS[request.status]}
                        </Badge>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardTitle title="QR de la salle" subtitle="À imprimer et afficher à l'accueil." />
            {!token ? (
              <div className="space-y-3">
                <Alert tone="warning">
                  Aucun lien actif. Activez le lien pour générer un QR unique à cette salle.
                </Alert>
                <ActionButton
                  action={enableRequestLinkAction}
                  label="Activer les demandes par QR"
                  variant="primary"
                  icon={<QrCode className="h-4 w-4" />}
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div
                  className="mx-auto w-fit rounded-xl bg-white p-3"
                  // SVG généré côté serveur à partir du lien public de la salle.
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
                <p className="break-all rounded-lg bg-surface-2/50 p-2 text-[11px] text-muted">{link}</p>
                <Link href="/imprimer/demande" target="_blank" className={buttonClass("secondary", "sm", "w-full")}>
                  <Printer className="h-3.5 w-3.5" /> Version imprimable
                </Link>
                {user.role === "owner" ? (
                  <ActionButton
                    action={rotateRequestLinkAction}
                    label="Révoquer et régénérer le lien"
                    variant="ghost"
                    confirmMessage="Les QR déjà imprimés cesseront de fonctionner. Continuer ?"
                    icon={<RefreshCw className="h-3.5 w-3.5" />}
                  />
                ) : null}
              </div>
            )}
          </Card>

          <Card>
            <CardTitle title="Bon à savoir" />
            <ul className="space-y-2 text-[11px] leading-relaxed text-muted">
              <li>· Le lien public ne donne accès qu&apos;au formulaire de demande, jamais aux données de la salle.</li>
              <li>· Cinq demandes maximum par adresse IP toutes les dix minutes.</li>
              <li>· Une seule demande active par appareil à la fois.</li>
              <li>· Chaque prise en charge est journalisée avec le nom de l&apos;employé.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
