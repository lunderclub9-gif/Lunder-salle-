# LUNDER — Phase 1 : socle applicatif et caisse

**Statut :** implémenté et vérifié localement (base PostgreSQL réelle).
**Date :** 19 novembre 2026.

---

## 1. Ce qui est livré

| Domaine | Contenu |
|---|---|
| Socle | Next.js 15 (App Router), React 19, TypeScript strict, Tailwind CSS v4, PostgreSQL 18 + Drizzle ORM, migrations SQL versionnées |
| Interface | Français uniquement, thème sombre LUNDER (charbon, violet, cyan), responsive mobile/tablette/desktop, animations discrètes |
| Authentification | Connexion par identifiant/mot de passe (scrypt), sessions serveur en base + cookie `HttpOnly`, expiration 12 h, limitation des tentatives (5 / 15 min + verrouillage après 8 échecs), journalisation des connexions |
| Rôles | Propriétaire, Gérant, Caissier, Technicien, Lecteur + table de permissions par rôle et surcharges par utilisateur, contrôlées côté serveur dans chaque action |
| Protection du propriétaire | Compte propriétaire principal unique (index partiel), non rétrogradable/non désactivable par un autre compte, mot de passe réinitialisable uniquement par lui-même |
| Appareils | CRUD, statuts (Disponible, Occupé, Réservé, En pause, En maintenance, Hors service), tarification horaire/match/fixe, incrément, minimum facturable, arrondi, historique de statut |
| Sessions | Démarrage, pause, reprise, fin, transfert ; tarif figé au démarrage ; horodatage serveur ; temps en pause non facturé ; une seule session active par appareil (index unique partiel) ; historique d'événements ; idempotence de la clôture |
| Encaissement | Facture unique, lignes session + produits, remise (%) motivée et plafonnée, paiements partiels et mixtes, crédit client en solde restant, déduction de stock atomique, ticket + facture imprimables |
| Clients | Fiche, historique de factures, grand livre de crédit, plafond, blocage, remboursement partiel en espèces |
| Caisse | Une caisse ouverte par employé, fonds de départ, caisse attendue calculée, clôture avec écart motivé, historique, clôture d'un collègue réservée aux rôles autorisés |
| Tableau de bord | Ventes / encaissements / marge brute / crédit en cours, sessions actives, à encaisser, caisses ouvertes, alertes stock, meilleures ventes, série temporelle, répartition des statuts |
| Audit | Journal append-only de toutes les actions sensibles (acteur, action, entité, avant/après, motif, IP, user-agent) |
| Exploitation | `owner:create`, seed idempotent, base PostgreSQL locale embarquée, migrations, tests |

---

## 2. Décisions techniques notables

1. **fuseau `Africa/Algiers`** appliqué dans toutes les agrégations de date (`at time zone`) pour que « aujourd'hui » corresponde à la salle.
2. **Montants en centimes (`BIGINT`)** et calculs serveur uniquement ; le client affiche, il ne décide pas.
3. **Transactions PostgreSQL + verrous de ligne** (`SELECT … FOR UPDATE`) sur client, produit, session, caisse ; contrôles de plafond et de stock également exprimés en SQL conditionnel (`balance_cents + ? <= credit_limit_cents`, `stock_quantity >= ?`).
4. **Idempotence** : clé unique par utilisateur pour l'encaissement, contrainte unique `sessions_one_active_per_device`, double clôture de session sans double débit.
5. **Aucune suppression financière** : annulation d'une facture = statut `cancelled`, stock restitué, crédit annulé par écriture `reversal` liée, motif obligatoire.
6. **Remboursements d'espèces reportés en Phase 2** : l'annulation est refusée si la facture contient un encaissement espèces/carte/mobile/virement. Cela évite un écart de caisse non tracé — décision explicite, pas un oubli.
7. **Le crédit est désactivé par défaut** et reste soumis à trois conditions : paramètre global, activation par client, plafond suffisant.
8. **Les tarifs des appareils sont à 0 DA** à l'installation ; le tableau de bord alerte tant qu'ils ne sont pas configurés. Aucun prix métier n'est inventé.
9. **Impression** : routes dédiées 58 mm / 80 mm et A4 via CSS `@media print` — aucune dépendance native, aucun risque de double transaction à l'impression.
10. **Scrypt** (natif Node, sans dépendance) plutôt qu'un paquet natif, pour rester déployable sur Vercel sans compilation.

## 3. Modèle de données Phase 1

`business_settings`, `users`, `role_permissions`, `user_permissions`, `auth_sessions`, `login_attempts`, `devices`, `device_status_history`, `customers`, `shifts`, `cash_movements`, `sessions`, `session_events`, `product_categories`, `products`, `stock_movements`, `invoices`, `invoice_items`, `payments`, `credit_transactions`, `audit_logs`, `idempotency_keys`.

Contraintes structurantes : propriétaire principal unique, une session active par appareil, une caisse ouverte par employé, numéro de facture unique, montants et quantités en entiers.

## 4. Vérifications exécutées

| Commande | Résultat |
|---|---|
| `npx tsc --noEmit` | 0 erreur |
| `npm run build` | succès (18 routes) |
| `npx vitest run` | **46 tests / 46 réussis** sur PostgreSQL 18 réel |

Couverture des scénarios financiers (PRD §13.2, partiel Phase 1) :

- facture entièrement payée, mixte espèces/carte, entièrement à crédit, paiement partiel + crédit ;
- plafond de crédit dépassé → aucune écriture (rollback vérifié) ;
- vente sans confirmation de crédit refusée ;
- stock insuffisant → facture, paiements et mouvements annulés ;
- annulation d'une facture à crédit : stock restitué, dette annulée, écriture de reversal ;
- annulation d'une facture encaissée refusée (remboursement Phase 2) ;
- numérotation de factures unique et séquentielle ;
- caisse attendue (espèces seules), écart motivé, clôture figée, clôture d'un collègue refusée puis autorisée au propriétaire ;
- **concurrence** : dernière unité de stock vendue une seule fois ; deux crédits simultanés ne dépassent jamais le plafond ;
- sessions : double démarrage refusé, tarif figé, pause exclue, double clôture idempotente, transfert sans remise à zéro ;
- contraintes base : propriétaire unique, session active unique, caisse unique, mots de passe hachés en scrypt.

Vérification d'exécution réelle : serveur de développement démarré, les 11 pages authentifiées renvoient **200** avec une session valide et aucune erreur applicative.

## 5. Limites connues / reporté

- **Pas de test de bout en bout par navigateur** : les parcours ont été vérifiés au niveau services (mêmes fonctions que les actions serveur) et par rendu des pages, pas par clics automatisés.
- **Remboursements** d'une facture déjà encaissée : Phase 2.
- **Dépenses, retraits/dépôts de caisse, handover** : Phase 2 (tables déjà présentes pour `cash_movements`).
- **Stock** : réception d'achat, inventaire physique, pertes, conversion carton → unité : Phase 3.
- **Paiement en crédit d'une facture impayée existante** n'est pas proposé : le crédit se décide au moment de l'encaissement.
- **Réauthentification/MFA** du propriétaire et sauvegardes : Phase 2.
- **Hors-ligne** : non implémenté, non revendiqué.

## 6. Mise en route

```bash
npm install
npm run db:dev                     # PostgreSQL 18 local embarqué (port 5432)
cp .env.example .env.local         # renseigner DATABASE_URL
npm run db:migrate                 # applique les migrations versionnées
SEED_DEMO=1 npm run db:seed        # jeu de base (+ catalogue indicatif si SEED_DEMO=1)
OWNER_USERNAME=... OWNER_PASSWORD=... npm run owner:create
npm run dev                        # http://localhost:3000
```

Production : fournir `DATABASE_URL` (PostgreSQL managé) dans les variables d'environnement de l'hébergeur, exécuter `npm run db:migrate` puis créer le propriétaire. Aucun secret ne doit être versionné.

> Les prix du catalogue de démonstration sont **indicatifs** et ne constituent pas des tarifs officiels. Ils ne sont créés que si `SEED_DEMO=1`.
