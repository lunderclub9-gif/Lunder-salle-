import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { buttonClass } from "@/components/ui";

export default function AccessDeniedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="surface-card animate-rise max-w-md p-8 text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-danger/10 text-danger">
          <ShieldAlert className="h-6 w-6" />
        </span>
        <h1 className="font-display text-xl font-semibold">Accès refusé</h1>
        <p className="mt-2 text-sm text-muted">
          Votre rôle ne dispose pas des permissions nécessaires pour consulter cette page. Contactez le
          propriétaire si vous pensez qu&apos;il s&apos;agit d&apos;une erreur.
        </p>
        <Link href="/tableau-de-bord" className={buttonClass("primary", "md", "mt-6")}>
          Retour au tableau de bord
        </Link>
      </div>
    </div>
  );
}
