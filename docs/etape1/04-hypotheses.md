# Hypothèses fonctionnelles — Portail KPI Productivité

> **Version** : 1.1
> **Étape** : 1 — Cahier des charges et spécifications fonctionnelles
> **Dernière mise à jour** : 2026-03-15

---

## Statut de validation

| ID | Hypothèse | Statut |
|----|-----------|--------|
| H-001 | Un projet JIRA = une équipe | ✅ Validée |
| H-002 | Estimations en heures (avec conversion SP si nécessaire) | ✅ Validée |
| H-003 | Champ CP sur les Epics de type "Utilisateur JIRA" | ⏳ À confirmer par client |
| H-004 | JQL appliqué sur données locales | ✅ Validée |
| H-005 | Périmètre DM configuré par Admin | ✅ Validée |
| H-006 | KPI séparés par combinaison collaborateur × client | ✅ Validée |
| H-007 | Tokens Tempo distincts des tokens JIRA | ⏳ À confirmer par client |
| H-008 | SSO via Azure AD / OIDC | ✅ Validée |
| H-009 | Planification imports mutualisée par défaut | ✅ Validée |
| H-010 | Pas de saisie de temps dans l'application | ✅ Validée |
| H-011 | Pas de politique de purge en v1 | ✅ Validée |
| H-012 | Niveau de consolidation CP configurable par client | ✅ Validée (décision prise) |
| H-013 | Gestion Classic / Next-gen : configuration explicite par projet | ✅ Validée (Option B) |

---

## H-001 — Un projet JIRA = une équipe (mapping 1-1)

**Statut : ✅ Validée**

**Décision :** Un projet JIRA correspond à une équipe. Les membres sont synchronisés depuis l'API JIRA avec possibilité d'ajout/surcharge manuelle par l'Admin.

---

## H-002 — Les estimations sont exprimées en heures

**Statut : ✅ Validée**

**Décision :**
- La cible est l'expression des estimations en heures pour tous les clients.
- Si un client utilise les Story Points, une règle de conversion (SP → heures) est configurable par client dans l'interface d'administration.
- La règle de conversion est un ratio simple : `1 SP = N heures` (N configurable par client).
- Si aucune règle de conversion n'est définie pour un client utilisant les SP, les tickets correspondants sont exclus des calculs et signalés dans les logs.

---

## H-003 — Le champ Chef de projet sur les Epics est de type "Utilisateur JIRA"

**Statut : ⏳ À confirmer client par client**

**Hypothèse :** Le champ JIRA personnalisé liant un Epic (ou entité de regroupement) à un Chef de projet est de type `User` (utilisateur JIRA).

**Impact si différent :** Si le champ est de type texte libre, une logique de correspondance (matching par nom ou email) devra être implémentée, avec un risque d'erreur d'association.

**Action requise :** Confirmer le type du champ personnalisé pour chaque client concerné avant le démarrage de l'Étape 4.

---

## H-004 — Les requêtes JQL sont appliquées sur les données locales

**Statut : ✅ Validée**

**Décision :** Les requêtes JQL des KPI en mode "JQL" sont traduites en SQL et exécutées sur la base interne. Les fonctions JQL avancées non traduisibles (ex. : `issueFunction in`, `subtasksOf()`, fonctions de plugins tiers) ne sont pas supportées. Le catalogue des clauses JQL supportées sera fourni en Étape 4.

---

## H-005 — Le périmètre d'un Delivery Manager est défini par l'Admin

**Statut : ✅ Validée**

**Décision :** Le périmètre d'un Delivery Manager est configuré manuellement par l'Admin (liste de clients, équipes, collaborateurs). Pas de synchronisation automatique depuis Azure AD.

---

## H-006 — Les KPI sont calculés séparément par combinaison collaborateur × client

**Statut : ✅ Validée**

**Décision :** Les KPI d'un collaborateur travaillant sur N clients sont calculés séparément par client. Il n'existe pas de vue KPI cross-clients agrégée dans la v1.

---

## H-007 — Les tokens Tempo sont distincts des tokens JIRA

**Statut : ⏳ À confirmer par client**

**Hypothèse :** L'API Tempo Cloud utilise un token dédié, distinct du token JIRA. Les deux sont configurés séparément.

**Action requise :** Vérifier le mécanisme d'authentification Tempo Cloud pour chaque client concerné (token propre Tempo vs OAuth mutualisé).

---

## H-008 — L'authentification SSO est gérée via Azure AD / OIDC

**Statut : ✅ Validée**

**Décision :** SSO Office 365 via OIDC / Azure AD. L'accès Azure AD pour créer l'App Registration est disponible. Le backend valide les tokens JWT émis par Azure AD.

---

## H-009 — La planification des imports est mutualisée par défaut

**Statut : ✅ Validée**

**Décision :** Par défaut, tous les clients partagent le même horaire d'import automatique. Une planification individuelle par client est possible si besoin.

---

## H-010 — L'application ne gère pas la saisie des temps

**Statut : ✅ Validée**

**Décision :** L'application est en lecture seule vis-à-vis de JIRA/Tempo. La gestion des relances se limite à l'identification des collaborateurs sans saisie.

---

## H-011 — Pas de politique de purge des données en v1

**Statut : ✅ Validée**

**Décision :** Toutes les données importées sont conservées sans limite de durée en v1. Une politique de rétention pourra être définie en v2 si nécessaire.

---

## H-012 — Le niveau de consolidation pour les Chefs de projet est configurable par client

**Statut : ✅ Validée (décision prise)**

**Contexte :** Les clients n'utilisent pas tous les Epics JIRA comme niveau de regroupement. Certains utilisent des composants, des labels, des versions, etc.

**Décision :** Le niveau de consolidation est configurable par client. Les options disponibles sont :

| Type de regroupement | Champ JIRA source | Notes |
|----------------------|-------------------|-------|
| Epic | `parent` (next-gen) ou `Epic Link` (classic) | Défaut recommandé |
| Composant | `components` | Champ natif JIRA (multi-valeurs) |
| Label | `labels` | Champ natif JIRA (multi-valeurs) |
| Version (fixVersion) | `fixVersions` | Champ natif JIRA |
| Champ personnalisé | `customfield_XXXXX` | À configurer par client |

**Conséquences sur le modèle de données :**
- L'entité "GroupingEntity" (anciennement "Epic") devient générique et configurable par client.
- Chaque instance client déclare son `grouping_type` et le champ JIRA source associé.
- Le lien ticket → entité de regroupement est résolu lors de l'import selon ce mapping.
- Les vues "par Epic" dans l'application affichent le libellé configuré (ex. : "par Composant" pour les clients utilisant les composants).

---

## H-013 — Gestion des types de projets JIRA (Classic vs Next-gen)

**Statut : ⏳ En attente de décision**

**Contexte :**
JIRA Cloud propose deux architectures de projets avec des structures de champs différentes :

| | JIRA Classic (company-managed) | JIRA Next-gen (team-managed) |
|---|---|---|
| Lien Epic → Ticket | Champ `Epic Link` (`customfield_10014`) | Champ `parent` (natif) |
| Lien Sous-tâche → Parent | Champ `parent` | Champ `parent` |
| Détection | Champ `issuetype.subtask` + présence du champ custom | `project.style = "next-gen"` |

**Impact :**
- Si un client utilise exclusivement des projets Classic, le mapping s'appuie sur `Epic Link`.
- Si un client utilise exclusivement des projets Next-gen, le mapping s'appuie sur `parent`.
- Si les deux coexistent dans une même instance, l'application doit détecter le type à la volée pour chaque projet.

**Options proposées :**

| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| **A — Auto-détection par projet** (recommandée) | Transparente pour l'Admin, s'adapte automatiquement | Légèrement plus complexe à implémenter |
| **B — Configuration explicite par projet** | Simple à implémenter | Charge de configuration sur l'Admin, risque d'erreur |

**Recommandation :** Option A (auto-détection) — lors du premier import d'un projet, l'application détecte le style via l'API JIRA (`GET /rest/api/3/project/{projectIdOrKey}`, champ `style`) et stocke cette information. L'Admin peut surcharger manuellement si la détection automatique est incorrecte.

**Action requise :** Valider l'option A ou choisir l'option B.
