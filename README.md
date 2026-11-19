# LUNDER

Application de gestion d'une salle de jeux (PlayStation, snacks, boissons) : sessions et
facturation à l'heure, encaissement, crédit client, stock, achats fournisseurs, réservations,
maintenance, rapports et analytique.

Interface en français, montants en dinars algériens (DZD), fuseau `Africa/Algiers`.

## Stack

- **Next.js 15** (App Router, Server Components, Server Actions) et **React 19**
- **TypeScript** strict
- **Tailwind CSS v4** et composants maison (`src/components/ui.tsx`)
- **PostgreSQL** + **Drizzle ORM** (migrations versionnées)
- **Vitest** pour les tests (base PostgreSQL embarquée, jetable)
- `lucide-react` pour les icônes, `recharts` pour les graphiques, `zod` pour la validation

## Démarrage

Prérequis : Node.js 20 ou plus, npm.

```bash
npm install
cp .env.example .env.local   # puis renseigner DATABASE_URL
```

### Base de données locale

Le projet embarque un PostgreSQL de développement (aucun droit root requis) :

```bash
npm run db:dev      # démarre PostgreSQL sur 127.0.0.1:5432, base "lunder"
npm run db:migrate  # applique les migrations de src/db/migrations
npm run db:seed     # paramètres, catégories, permissions par rôle (idempotent)
```

`SEED_DEMO=1 npm run db:seed` ajoute un catalogue de démonstration (prix indicatifs,
jamais des tarifs officiels).

### Compte propriétaire

Aucun mot de passe n'est versionné. Le premier compte se crée par variables
d'environnement, jamais en clair dans le dépôt :

```bash
OWNER_USERNAME=... OWNER_PASSWORD='...' OWNER_NAME='...' npm run owner:create
```

### Lancer l'application

```bash
npm run dev     # http://localhost:3000
```

L'application redirige vers `/connexion` tant qu'aucune session n'est ouverte.

## Scripts

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement (0.0.0.0:3000) |
| `npm run build` / `npm start` | Build de production et serveur |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` / `npm run test:watch` | Tests Vitest (base embarquée, pas besoin de serveur) |
| `npm run db:dev` | PostgreSQL local embarqué |
| `npm run db:generate` | Génère une migration Drizzle depuis le schéma |
| `npm run db:migrate` | Applique les migrations |
| `npm run db:seed` | Données de base idempotentes |
| `npm run owner:create` | Crée le propriétaire principal |

## Modules

- **Exploitation** : tableau de bord (CA, encaissements, crédit, alertes de stock), sessions de jeu
  avec calcul à l'heure/forfait/match, réservations avec contrôle de chevauchement, encaissement,
  factures, clients, caisse (ouverture/clôture, mouvements, transfert).
- **Gestion** : produits, stock et mouvements (ajustement, annulation d'achat), appareils,
  maintenance, équipe et permissions par rôle, journal d'audit, dépenses, fournisseurs, achats et
  réception, rapports.
- **Rapports** : CA par jour, top produits, dépenses, dettes clients/fournisseurs, valeur du stock,
  exports CSV (séparateur `;`, BOM UTF-8 pour Excel FR), impression A4 du bon de commande et tickets.
- **Analytique** (`/analytique`) : tendances multi-périodes (jour/semaine/mois) avec comparaison à la
  période précédente, rétention et réachat des clients identifiés, rotation et couverture du stock,
  produits dormants.
- **Fidélité** (désactivée par défaut) : points gagnés au taux configuré dans `/parametres`, échange
  en remise au moment de l'encaissement, historique par client et contre-passation automatique à
  l'annulation d'une facture. Calculs en entiers, aucune règle de valeur imposée.
- **Demandes client par QR** (`/demandes`) : lien public propre à la salle (`/demande/[jeton]`),
  formulaire sans compte, file d'attente staff avec prise en charge, limitation par IP et par
  appareil. Le jeton se révoque et se régénère depuis la page ; impression du QR dans
  `/imprimer/demande`.
- **Rappels WhatsApp** (désactivés par défaut) : consentement horodaté par client, message de rappel
  de solde préparé côté serveur puis ouvert via un lien `wa.me`. Aucun envoi automatique, chaque
  préparation est journalisée.

## Règles de conception

- **Argent** : uniquement des entiers en centimes (`BIGINT`), jamais de flottant monétaire.
  Formatage via `src/lib/money.ts`.
- **Autorisation** : vérifiée côté serveur et en base (`src/lib/permissions.ts`), pas seulement dans
  l'UI. Chaque action serveur commence par `requirePermission`.
- **Intégrité financière** : écritures dans des transactions, verrous `SELECT … FOR UPDATE`, journal
  de crédit, clés d'idempotence, audit append-only.
- **Aucune suppression financière** : une correction est une contre-passation, un remboursement ou
  une annulation avec motif obligatoire.
- **Pas de règle métier inventée** : les tarifs d'appareils démarrent à 0, le crédit est désactivé
  par défaut et doit être configuré dans `/parametres`.

## Structure

```
src/
  app/                 routes (App Router), actions serveur
    (app)/             espace authentifié avec navigation
    actions/           server actions par domaine
    rapports/          rapports + export CSV
    imprimer/          vues d'impression (ticket, facture, bon de commande)
  components/          UI partagée (shell, tableaux, cartes, graphiques)
  db/                  schéma Drizzle, client, migrations
  lib/
    services/          logique métier testable (ventes, stock, achats, rapports, analytique…)
    auth.ts            sessions, permissions, garde d'accès
tests/                 tests Vitest (services)
scripts/               migration, seed, propriétaire, base de dev
docs/                  PRD et notes d'implémentation
```

## Tests

```bash
npm test
```

Vitest démarre sa propre base PostgreSQL embarquée (`tests/global-setup.ts`), applique les
migrations, puis chaque test réinitialise les tables. Aucune donnée de production n'est touchée.

## Documentation

- `docs/LUNDER_PRD_v2.md` — exigences produit et découpage en phases
- `docs/PHASE0_AUDIT.md` — audit initial
- `docs/PHASE1_IMPLEMENTATION.md` — notes de la première phase

## Hors périmètre à ce stade

Mode hors-ligne et synchronisation : l'architecture de cache local et les règles de conflit
(ventes concurrentes, stock, caisse) restent à définir avant d'être implémentées.

WhatsApp reste volontairement manuel : aucun fournisseur externe (API WhatsApp Business) n'est
branché, le serveur ne fait que préparer un message et un lien `wa.me` vérifié par un employé.
