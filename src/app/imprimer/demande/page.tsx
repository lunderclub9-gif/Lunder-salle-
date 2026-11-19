import { headers } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { buildRequestUrl, getRequestSettings } from "@/lib/services/requests";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

export default async function PrintRequestQrPage() {
  await requirePermission(PERMISSIONS.SESSIONS_MANAGE);
  const settings = await getRequestSettings();
  if (!settings?.requestToken) redirect("/demandes");

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const link = buildRequestUrl(`${proto}://${host}`, settings.requestToken);

  const svg = await QRCode.toString(link, {
    type: "svg",
    margin: 1,
    width: 420,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });

  return (
    <main className="mx-auto max-w-xl bg-white px-8 py-10 text-black">
      <div className="no-print mb-6 flex justify-end">
        <PrintButton label="Imprimer le QR" />
      </div>

      <div className="text-center">
        <p className="text-xs font-semibold tracking-[0.3em] uppercase">{settings.businessName}</p>
        <h1 className="mt-2 text-2xl font-bold">Besoin d&apos;aide ?</h1>
        <p className="mt-1 text-sm">Scannez ce QR avec votre téléphone pour envoyer une demande.</p>
        <p className="text-sm">Un employé s&apos;en occupe dès que possible.</p>
      </div>

      <div className="mx-auto my-8 w-fit" dangerouslySetInnerHTML={{ __html: svg }} />

      <p className="text-center text-[11px] break-all text-black/60">{link}</p>
      <p className="mt-6 text-center text-[10px] text-black/50">
        Aucun compte requis. Ce lien sert uniquement à envoyer une demande sur place.
      </p>
    </main>
  );
}
