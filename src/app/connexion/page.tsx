import type { Metadata } from "next";
import { Gamepad2, ShieldCheck, Timer, Wallet } from "lucide-react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-stretch">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden border-r border-border bg-surface/40 p-12 lg:flex">
        <div className="pointer-events-none absolute -top-32 -left-24 h-96 w-96 rounded-full bg-accent/20 blur-[120px]" />
        <div className="pointer-events-none absolute right-0 bottom-0 h-80 w-80 rounded-full bg-electric/10 blur-[100px]" />

        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-electric text-white shadow-lg shadow-accent/30">
            <Gamepad2 className="h-5 w-5" />
          </span>
          <span className="font-display text-xl font-bold tracking-[0.22em]">LUNDER</span>
        </div>

        <div className="relative max-w-md">
          <p className="font-display text-4xl leading-tight font-semibold tracking-tight text-balance">
            La salle de jeux,
            <span className="bg-gradient-to-r from-accent-soft to-electric bg-clip-text text-transparent">
              {" "}
              pilotée au dinar près.
            </span>
          </p>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Sessions PlayStation et billard, ventes, stock, crédit client et caisse : chaque opération
            est horodatée, attribuée à un employé et traçable par le propriétaire.
          </p>

          <ul className="mt-8 space-y-3 text-sm">
            {[
              { icon: Timer, text: "Chronométrage serveur : les pauses ne sont jamais facturées." },
              { icon: Wallet, text: "Caisse attendue calculée automatiquement à la clôture." },
              { icon: ShieldCheck, text: "Rôles et permissions appliqués côté serveur." },
            ].map((item) => (
              <li key={item.text} className="flex items-start gap-3 text-muted">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-accent-soft">
                  <item.icon className="h-3.5 w-3.5" />
                </span>
                {item.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-muted/70">
          © {new Date().getFullYear()} LUNDER · Toutes les données restent la propriété de la salle.
        </p>
      </div>

      <div className="flex w-full items-center justify-center px-5 py-12 lg:w-1/2">
        <div className="animate-rise w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-electric text-white">
              <Gamepad2 className="h-5 w-5" />
            </span>
            <span className="font-display text-lg font-bold tracking-[0.2em]">LUNDER</span>
          </div>

          <h1 className="font-display text-2xl font-semibold tracking-tight">Connexion</h1>
          <p className="mt-1 mb-6 text-sm text-muted">
            Accédez à votre espace de gestion. Contactez le propriétaire si vous n&apos;avez pas de compte.
          </p>

          <LoginForm />

          <p className="mt-8 text-center text-[11px] leading-relaxed text-muted/70">
            Toute connexion, réussie ou échouée, est enregistrée dans le journal d&apos;audit.
          </p>
        </div>
      </div>
    </div>
  );
}
