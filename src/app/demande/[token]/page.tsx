import { notFound } from "next/navigation";
import { getPublicRequestContext } from "@/lib/services/requests";
import { RequestForm } from "./request-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Demande client",
  robots: { index: false, follow: false },
};

export default async function PublicRequestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const context = await getPublicRequestContext(token);
  if (!context) notFound();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <p className="text-xs font-medium tracking-[0.2em] text-accent-soft uppercase">{context.businessName}</p>
        <h1 className="font-display mt-2 text-2xl font-semibold">Besoin de quelque chose ?</h1>
        <p className="mt-2 text-sm text-muted">
          Envoyez une demande : elle apparaît immédiatement sur le poste de l&apos;équipe. Aucun compte
          n&apos;est nécessaire.
        </p>
      </div>

      <RequestForm token={token} devices={context.devices} />

      <p className="mt-6 text-center text-[11px] text-muted">
        Ce lien est propre à la salle. Ne le partagez pas en dehors de l&apos;établissement.
      </p>
    </main>
  );
}
