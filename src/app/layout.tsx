import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "LUNDER — Gestion de salle de jeux",
    template: "%s · LUNDER",
  },
  description:
    "LUNDER : gestion des sessions de jeu, des ventes, du stock et de la caisse de votre salle.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#07070b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
