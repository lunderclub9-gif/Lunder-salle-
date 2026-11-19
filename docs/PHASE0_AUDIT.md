# LUNDER — Phase 0 : Audit du dépôt et plan technique

**Date :** 19 novembre 2026
**Référence produit :** `docs/LUNDER_PRD_v2.md` (PRD v3.1)
**Branche :** `main` (dépôt `lunderclub9-gif/Lunder-salle-`)

---

## 1. État réel du dépôt

| Élément | Constat |
|---|---|
| Commits | 2 (`176b9ab` PRD v2, `bb2c5fe` renforcement PRD v3.1) — les deux uniquement documentaires |
| Code applicatif | **Aucun** : pas de `package.json`, pas de `src/`, pas de framework |
| Schéma / migrations | **Aucun** |
| Authentification | **Aucune** |
| Configuration / secrets | **Aucun** fichier d'environnement, aucun `.gitignore` |
| Tests / CI | **Aucun** |
| Branches distantes | `main` uniquement |

**Conclusion :** le projet est **vierge en code**. Il n'existe rien à préserver, corriger ou refactorer : la Phase 0 est donc une phase de cadrage technique, pas de remise en état. Aucune fonctionnalité du PRD n'est implémentée ; le taux de réalisation est de 0 % sur les exigences fonctionnelles.

Cela signifie aussi que les risques de la Phase 0 ne sont pas des bugs existants, mais des **décisions d'architecture** qui conditionnent la conformité financière exigée par le PRD (§13, §16, §23.2). Ces décisions sont fixées ci-dessous.

---

## 2. Décisions d'architecture (et justification)

### 2.1 Stack retenue

| Couche | Choix | Justification |
|---|---|---|
| Application | **Next.js 15 (App Router) + React 19 + TypeScript strict** | Rendu serveur pour les rapports, Server Actions pour les mutations, un seul dépôt front/back, déploiement simple |
| Base de données | **PostgreSQL** | Seule option qui offre des **transactions interactives**, `SELECT … FOR UPDATE`, contraintes `CHECK`, `NUMERIC`/`BIGINT` et verrous de ligne — indispensables pour le plafond de crédit, le stock et la caisse (§8, §9, §23.2) |
| Accès aux données | **Drizzle ORM + drizzle-kit (migrations SQL versionnées)** | SQL explicite et typé, migrations revues à la main, aucune magie de synchronisation de schéma |
| Argent | **Entiers en unités mineures (`BIGINT`, centimes)** + helpers de formatage | Interdit tout calcul flottant (§13.1). Aucun `REAL`/`DOUBLE` dans le schéma |
| Auth | Sessions serveur en base + cookie `HttpOnly`/`SameSite=Lax`, **Argon2id** (repli bcryptjs), limitation des tentatives en base | Le PRD exige des rôles contrôlés **côté serveur**, une limitation de tentatives et une protection du compte propriétaire (§3.1, §18) |
| Validation | **Zod** partagé client/serveur (source de vérité : serveur) | §18 validation des entrées |
| UI | **Tailwind CSS v4** + design system LUNDER, `lucide-react`, `recharts`, `motion` | Direction visuelle §20, animations sobres |
| Impression | Routes d'impression dédiées + CSS `@media print` (58 mm, 80 mm, A4) | Évite toute dépendance native côté serveur et tout risque de double transaction (§7, §19) |
| Exports | CSV/Excel générés côté serveur, PDF via impression navigateur vers A4 | Aucun coût récurrent |
| Tests | **Vitest** sur une base PostgreSQL jetable + tests de concurrence multi-connexions | §13.2 et §23.2 exigent des scénarios financiers et concurrents réels |
| Hébergement | **Vercel** (déjà connecté) + **PostgreSQL managé** (Neon/Supabase — offre gratuite) | Coût nul au démarrage ; base standard donc portable. La mise en ligne nécessitera que le propriétaire fournisse `DATABASE_URL` comme secret, jamais dans le dépôt |

### 2.2 Décisions structurantes

1. **Pas de calcul financier côté client.** Chaque total affiché provient d'une agrégation SQL ou d'un helper serveur testé. Le client n'envoie que des intentions (`sessionId`, `productId`, `quantité`).
2. **Grand livre plutôt que soldes écrasés.** Les soldes client (`credit_accounts.balance`) et caisse sont dérivés du grand livre `credit_transactions` / `payments` / `cash_movements`, avec un solde dénormalisé mis à jour **dans la même transaction** que l'écriture, et une contrainte `CHECK` (ex. `balance <= credit_limit`, `stock >= 0`). Aucune écriture directe d'un solde (§8, §16.1).
3. **Transactions + verrous.** Toute opération financière s'exécute dans `db.transaction()` avec `SELECT … FOR UPDATE` sur la ligne concernée (client, produit, session, shift). Les tests de concurrence le vérifient (§23.2).
4. **Idempotence.** Table `idempotency_keys` (clé unique, empreinte de requête, réponse) pour toute mutation financière : facture, paiement, démarrage/arrêt de session, mouvement de stock (§6, §7, §23.2).
5. **Horodatage serveur uniquement.** Sessions, paiements, mouvements : `now()` de la base, jamais l'horloge du navigateur. Fuseau `Africa/Algiers` pour les regroupements par jour (§6, §13.1).
6. **Rien n'est supprimé.** Ni facture, ni paiement, ni écriture de stock. `deleted_at` réservé aux référentiels (produits, appareils) et aux comptes utilisateurs (désactivation). Les corrections sont des écritures liées (`reversal_of`, motif obligatoire) (§7, §16.1).
7. **Autorisation en base + serveur.** Rôle et permissions vérifiés dans chaque Server Action / route avant toute requête ; en complément, vues/requêtes filtrées par utilisateur et triggers d'audit. L'interface ne fait que masquer (§3, §23.1).
8. **Audit append-only.** Table `audit_logs` alimentée par le serveur (acteur, action, entité, avant/après, motif, IP/user-agent). Aucune route de mise à jour ou de suppression.
9. **Français uniquement.** Toutes les chaînes visibles vivent dans les composants/pages ; aucun texte anglais ou arabe. Les identifiants de code restent en anglais.
10. **Aucune valeur métier inventée.** Les prix, seuils et règles sont des paramètres configurables ; le jeu de données initial crée les 6 PlayStation et la table de billard **sans prix imposé** (prix à 0 = à configurer par le propriétaire), crédit désactivé par défaut, stock négatif interdit (§2, §24).

### 2.3 Écart assumé par rapport au découpage demandé

Le PRD (§22) place la caisse et la clôture de shift dans son MVP, alors que votre Phase 1 ne mentionne pas les shifts. Or **tout paiement doit référencer un shift** pour être auditable et pour alimenter la formule de caisse attendue (§11).

→ **Décision :** la Phase 1 crée la table `shifts` et impose un shift ouvert pour encaisser (ouverture/clôture minimales). La gestion complète (reconciliation, écarts, dépôts/retraits, handover, dépenses) reste dans votre Phase 2. Cela évite une migration douloureuse des paiements historiques plus tard.

---

## 3. Modèle de données prévu

**Référentiels :** `business_settings`, `users`, `roles`, `permissions`, `user_permissions`, `sessions_auth` (sessions de connexion), `login_attempts`, `device_types`, `devices`, `device_status_history`, `product_categories`, `products`, `suppliers`.

**Exploitation :** `sessions` (sessions de jeu), `session_events` (start/pause/resume/transfer/end), `customers`, `invoices`, `invoice_items`, `payments`, `refunds`, `shifts`, `cash_movements`, `cash_handovers`, `reservations`, `maintenance_records`, `notifications`.

**Finance / stock :** `credit_accounts`, `credit_transactions`, `stock_movements`, `purchases`, `purchase_items`, `supplier_payments`, `expenses`, `idempotency_keys`, `audit_logs`, `backup_records`.

Règles de schéma systématiques : clés étrangères explicites, index sur les colonnes de filtre (date, shift, client, appareil, produit), `created_at`/`updated_at`, contraintes `CHECK` sur les montants et quantités, unicité du numéro de facture, unicité d'une session active par appareil (index partiel `WHERE status IN ('running','paused')`), unicité d'un shift ouvert par employé.

### Arborescence cible

```
src/
  app/
    (auth)/connexion/
    (app)/tableau-de-bord/
    (app)/sessions/  (app)/caisse/  (app)/clients/
    (app)/factures/  (app)/produits/  (app)/stock/
    (app)/fournisseurs/  (app)/depenses/  (app)/shifts/
    (app)/reservations/  (app)/maintenance/  (app)/rapports/
    (app)/parametres/  (app)/equipe/  (app)/audit/
    imprimer/ticket/[id]/  imprimer/facture/[id]/  imprimer/rapport/
    api/… (exports, health)
  db/ (schema, migrations, seed)
  lib/ (auth, permissions, money, billing, audit, idempotency, db)
  components/ (ui, layout, sessions, pos, charts)
  tests/ (unitaires, intégration Postgres, concurrence)
```

---

## 4. Checklist exigence → implémentation

Statut de départ : **Absent** pour toutes les lignes (dépôt vierge). La colonne « Phase » suit **votre** découpage.

| Réf. PRD | Exigence | Phase |
|---|---|---|
| §3 | Rôles (Propriétaire, Manager, Caissier, Technicien, Lecteur), permissions serveur, sessions de connexion, limitation des tentatives | 1 |
| §3.1 | Protection du compte propriétaire (non démotion/désactivation par un tiers), réauthentification des actions sensibles | 1 |
| §5 | Appareils configurables, statuts FR, prix horaire/match/session, incrément, arrondi, maintenance | 1 |
| §6 | Sessions : démarrer/pause/reprendre/terminer/prolonger, transfert, tarification figée, horodatage serveur, anti-double démarrage, idempotence | 1 |
| §7 | Factures, lignes produits, remises motivées, paiements partiels et mixtes, statuts, annulation/remboursement | 1 |
| §7 §9 | Vente de produits avec déduction de stock atomique | 1 |
| §8 (partiel) | Fiche client, historique, blocage crédit par défaut (limite = 0) | 1 |
| §4 | Tableau de bord de base : ventes, encaissements, sessions actives, alertes stock | 1 |
| §16 (partiel) | Journal d'audit des actions Phase 1 (auth, sessions, factures, paiements) | 1 |
| §8 | Comptes crédit, plafonds, contrôle atomique, remboursements partiels, ajustements motivés | 2 |
| §11 | Shifts, caisse attendue, comptage, écarts motivés, dépôts/retraits, handover | 2 |
| §12 | Dépenses par catégorie, payées caisse ou externe, approbation | 2 |
| §13 §16.1 | Définitions financières distinctes, corrections par écritures liées, filtres d'anomalies | 2 |
| §9 §10 | Achat/réception, conversion carton→unité, mouvements de stock, inventaire physique, alertes, fournisseurs et paiements | 3 |
| §4 §13 | Rapports avancés, marges, exports CSV/Excel/PDF, écrans d'analyse | 4 |
| §14 §15 | Réservations, maintenance, notifications | 4 |
| §19 | Impression thermique 58/80 mm et A4 | 4 |
| §17 | Hors-ligne et synchronisation (non promis avant tests réels de conflits) | 5 |
| §5 §17 | QR codes, WhatsApp (sous réserve de fournisseur/consentement), fidélité | 5 |
| §18 | Sauvegardes, restauration testée, alertes de sauvegarde | 2 puis continu |

---

## 5. Risques techniques identifiés et parades

1. **Dépassement de plafond de crédit en concurrence** → `SELECT … FOR UPDATE` + `CHECK (balance <= credit_limit)` + test à deux connexions simultanées.
2. **Double facturation sur double clic / retry réseau** → clés d'idempotence + contrainte unique (shift, séquence).
3. **Facturation de session incohérente (pauses, arrondis)** → calcul serveur à partir des `session_events`, règle de tarification figée au démarrage, tests unitaires sur cas limites (pause, prolongation, transfert, arrondi).
4. **Stock négatif / vente de la dernière unité** → `UPDATE … WHERE stock >= qty` + vérification du nombre de lignes affectées, dans la transaction de facturation.
5. **Double comptage revenu / trésorerie / dette** → métriques séparées, jamais de somme commune ; tests §13.2 obligatoires avant de clôturer la Phase 2.
6. **Caisse attendue fausse** → formule unique implémentée une seule fois et testée ; les paiements non-caisse et le crédit créé n'alimentent pas la caisse.
7. **Fuite de secrets** → `.env*` ignoré dès le premier commit, secrets en variables d'hébergement, aucun mot de passe/hash/token dans les logs.
8. **Migrations destructrices** → migrations SQL versionnées, revue du diff, `docs/MIGRATIONS.md` traçant chaque migration ; sauvegarde avant migration de production.

---

## 6. Ordre d'implémentation proposé (Phase 1)

1. Socle : projet Next.js/TypeScript/Tailwind, `.gitignore`, `docs/`, design tokens LUNDER, layout + navigation française.
2. Base : schéma Drizzle du périmètre Phase 1, migration initiale, seed (paramètres, rôles, 6 PlayStation + 1 billard sans prix, propriétaire initial créé par script CLI avec mot de passe fourni hors dépôt).
3. Auth + permissions serveur + protection du propriétaire + limitation des tentatives + sessions de connexion.
4. Appareils et sessions (démarrage/pause/reprise/fin/transfert, facturation, événements).
5. POS, factures, paiements partiels/mixtes, déduction de stock, clients.
6. Shift minimal + caisse attendue de base.
7. Tableau de bord de base + audit.
8. Tests (unitaires tarification/argent, intégration Postgres, concurrence), build, vérification des workflows.

---

## 7. Questions métier à confirmer par le propriétaire (PRD §24)

Ces valeurs ne seront **pas inventées** : elles resteront configurables. Réponses utiles avant la Phase 1 :

1. Prix horaire et incrément de facturation par PlayStation (et arrondi : au supérieur ? à la minute ?).
2. Prix par match et mode de saisie des matchs.
3. Facturation billard : horaire, par partie, ou session fixe.
4. Les clients peuvent-ils partager une session/une facture ?
5. Moyens de paiement réellement acceptés.
6. Qui peut accorder des remises et jusqu'à quel taux.
7. Le crédit client est-il autorisé, avec quel plafond par défaut.
8. Le stock peut-il devenir négatif (par défaut : non).
9. Le mode hors-ligne est-il nécessaire dès la première version (par défaut : non).
10. Coordonnées de l'entreprise, pied de ticket et mentions de facture.

Sans réponse, la Phase 1 utilisera : prix à 0 (à configurer), crédit désactivé, stock négatif interdit, arrondi configurable par appareil.

---

## 8. Livraison / exploitation

- Prévisualisation locale : serveur de développement Next.js exposé dans le panneau navigateur.
- Mise en ligne : Vercel (comptes déjà connectés) + PostgreSQL managé. Le propriétaire devra fournir `DATABASE_URL` et `AUTH_SECRET` comme secrets d'environnement ; je ne les écrirai jamais dans le dépôt ni dans le chat.
- Sauvegardes : activation du PITR/branches du fournisseur PostgreSQL + export logique documenté ; une sauvegarde ne sera déclarée valide qu'après un test de restauration réel sur une base séparée (§18).
