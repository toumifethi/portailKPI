# Séquences — Portail KPI Productivité

> **Version** : 2.0
> **Étape** : 2 — Architecture technique
> **Dernière mise à jour** : 2026-03-16
> **Statut** : En production (dev)

---

## Sommaire

1. [Authentification SSO (Office 365 / Azure AD)](#1-authentification-sso)
2. [Cycle d'import incrémental](#2-cycle-dimport-incrémental)
3. [Cycle de calcul KPI (après import)](#3-cycle-de-calcul-kpi)
4. [Cycle de consultation du dashboard](#4-cycle-de-consultation-du-dashboard)
5. [Déclenchement d'un import backfill (Admin)](#5-déclenchement-dun-import-backfill)
6. [KPI Formula AST — flux d'évaluation](#6-kpi-formula-ast--flux-dévaluation)
7. [Planification des calculs KPI (kpi_calc_schedules)](#7-planification-des-calculs-kpi)
8. [Synchronisation des champs personnalisés JIRA](#8-synchronisation-des-champs-personnalisés-jira)
9. [Synchronisation des sprints et import des transitions](#9-synchronisation-des-sprints-et-import-des-transitions)
10. [Résolution de scope par profil (scopeResolver)](#10-résolution-de-scope-par-profil)
11. [Configuration des types de retours par projets Jira](#11-configuration-des-types-de-retours-par-projets-jira)
12. [Synchronisation sélective des utilisateurs Jira](#12-synchronisation-sélective-des-utilisateurs-jira)

---

## 1. Authentification SSO

```mermaid
sequenceDiagram
    actor User as Utilisateur
    participant FE as Frontend React
    participant AAD as Azure AD (OIDC)
    participant API as Backend Node.js
    participant DB as MySQL

    User->>FE: Accède à l'application
    FE->>FE: Pas de token en mémoire
    FE->>AAD: Redirect vers /authorize (PKCE)
    AAD->>User: Page de connexion Office 365
    User->>AAD: Saisit ses credentials
    AAD->>FE: Redirect avec authorization code
    FE->>AAD: Échange code contre access_token + id_token
    AAD->>FE: Retourne JWT (access_token, 1h)
    FE->>FE: Stocke le token en mémoire (non localStorage)

    FE->>API: GET /api/me (Bearer JWT)
    API->>AAD: Récupère JWKS (clés publiques, mise en cache 24h)
    API->>API: Valide signature JWT + claims (iss, aud, exp)
    API->>DB: SELECT user + roles WHERE email = jwt.email
    alt Utilisateur trouvé et ACTIF
        DB->>API: User + roles
        API->>FE: 200 { user, roles, permissions }
        FE->>User: Affiche le dashboard
    else Utilisateur non trouvé ou ARCHIVE
        API->>FE: 403 { message: "Compte non autorisé" }
        FE->>User: Page d'erreur "Accès refusé"
    end
```

**Notes :**
- Le token Azure AD expire après 1h. MSAL.js gère le renouvellement silencieux via le refresh token.
- Les clés publiques JWKS sont mises en cache 24h côté backend pour éviter des appels répétés à Azure AD.
- En cas d'expiration mid-session, MSAL.js renouvelle le token silencieusement sans déconnexion.

---

## 2. Cycle d'import incrémental

```mermaid
sequenceDiagram
    participant EVT as EventBridge / Scheduler
    participant API as Backend Node.js
    participant QUEUE as Bull Queue (Redis)
    participant WORKER as Worker Import
    participant SM as Secrets Manager
    participant JIRA as API JIRA Cloud
    participant TEMPO as API Tempo Cloud
    participant DB as MySQL

    EVT->>API: POST /internal/trigger-scheduled-imports
    API->>DB: SELECT clients WHERE status = ACTIVE
    loop Pour chaque client actif
        API->>DB: SELECT last successful import_job for client
        API->>QUEUE: Enqueue job { clientId, type: INCREMENTAL, fromDate: lastImport.completed_at }
        API->>DB: INSERT import_jobs { status: PENDING }
    end

    QUEUE->>WORKER: Dépile job (1 seul par client simultanément)
    WORKER->>DB: UPDATE import_jobs SET status = RUNNING, started_at = NOW()

    WORKER->>SM: GetSecretValue(client.jira_api_token_secret_arn)
    SM->>WORKER: JIRA API token

    loop Pagination JIRA (100 issues / page)
        WORKER->>JIRA: GET /rest/api/3/search?jql=updated>={fromDate}&startAt={cursor}
        alt Succès (200)
            JIRA->>WORKER: Page d'issues
            WORKER->>WORKER: Mappe issues → modèle interne
            WORKER->>WORKER: Normalise estimation (heures ou SP→h)
            WORKER->>WORKER: Résout assignee_user_id (jira_account_id → user.id)
            WORKER->>WORKER: Résout grouping_entity_id (selon config client)
            WORKER->>DB: UPSERT issues (ON DUPLICATE KEY UPDATE)
            WORKER->>DB: UPSERT issue_links
            WORKER->>DB: UPDATE import_jobs SET last_cursor = {cursor}
        else Rate limit (429)
            WORKER->>WORKER: Attente selon Retry-After (ou backoff 30s)
            WORKER->>JIRA: Retry même page
        else Erreur réseau / 5xx
            WORKER->>WORKER: Retry avec backoff (3 tentatives)
            alt Échec après 3 tentatives
                WORKER->>DB: INSERT import_errors { BLOCKING }
                WORKER->>DB: UPDATE import_jobs SET status = FAILED
                Note over WORKER: Import interrompu
            end
        end
    end

    WORKER->>WORKER: Import JIRA terminé

    alt Tempo activé pour ce client
        WORKER->>SM: GetSecretValue(client.tempo_api_token_secret_arn)
        SM->>WORKER: Tempo API token
        loop Pagination Tempo
            WORKER->>TEMPO: GET /4/worklogs?updatedFrom={fromDate}
            TEMPO->>WORKER: Worklogs
            WORKER->>WORKER: Résout issue_id et author_user_id
            WORKER->>DB: UPSERT worklogs (source = TEMPO)
        end
    else Tempo désactivé
        loop Issues importées
            WORKER->>JIRA: GET /rest/api/3/issue/{key}/worklog
            JIRA->>WORKER: Worklogs JIRA natifs
            WORKER->>DB: UPSERT worklogs (source = JIRA)
        end
    end

    WORKER->>DB: Sync jira_users depuis JIRA
    WORKER->>DB: Sync grouping_entities (Epics / Sprints / Composants / Labels selon config)
    WORKER->>DB: Sync issue_sprints (relation N:N issues ↔ sprints)
    opt client.importTransitions = true
        WORKER->>DB: Sync issue_transitions depuis changelog JIRA
    end
    WORKER->>DB: Sync jira_custom_fields et jira_custom_field_options
    WORKER->>DB: UPDATE import_jobs SET status = COMPLETED (ou COMPLETED_WITH_ERRORS), completed_at = NOW()
    WORKER->>QUEUE: Enqueue KPI calculation job { clientId }
```

**Endpoint de référence pour la configuration KPI globale** :
- `GET /api/transitions/statuses/by-jira-connection/:jiraConnectionId`
- Usage : récupérer l'union des `fromStatus` / `toStatus` de tous les clients rattachés à une même connexion JIRA, sans imposer un client unique lors de la définition globale d'un KPI.
- Sécurité : l'API respecte le scope utilisateur ; un profil non admin ne voit que les clients autorisés sur cette connexion.
- Frontend Formula Editor : la connexion JIRA sélectionnée en mode global est mutualisée entre les sections `Périmètre` et `Filtres` pour garantir que les statuts de transition et les champs custom de référence reposent sur la même instance.
- Fallback global : si aucune connexion JIRA n'est choisie, le frontend lit `GET /api/settings` et utilise la clé `kpi.formula.statusInPeriod.globalFallbackStatuses` pour proposer une liste de statuts cibles configurable sans repasser par le code.
- Fenetre glissante `status_in_period` : la règle supporte `slidingWindowMonths` (entier, défaut `1`). Exemple : sur avril, `3` applique `changedAt` entre le 1er février et la fin d'avril, tout en stockant le résultat KPI sur la période d'avril.

---

## 3. Cycle de calcul KPI (après import)

```mermaid
sequenceDiagram
    participant QUEUE as Bull Queue
    participant KPI_ENG as Moteur KPI
    participant DB as MySQL

    QUEUE->>KPI_ENG: Dépile job { clientId }

    KPI_ENG->>DB: SELECT kpi_client_configs WHERE client_id = ? AND is_active = TRUE
    loop Pour chaque KPI actif du client
        KPI_ENG->>DB: SELECT config_override (statuts, types tickets, champs, agrégation)

        alt formula_type = PREDEFINED
            KPI_ENG->>KPI_ENG: Appel de la fonction de calcul prédéfinie
            Note over KPI_ENG: ex. calcRatioEstimeConsomme(config, clientId, period)
            KPI_ENG->>DB: SELECT issues + worklogs filtrés (statuts, types, période)
            KPI_ENG->>KPI_ENG: Calcul par ticket (écart, ratio…)
            KPI_ENG->>KPI_ENG: Agrégation par utilisateur + période (AVG ou SUM)

        else formula_type = FORMULA_AST
            Note over KPI_ENG: Voir séquence 6 pour le détail
            KPI_ENG->>KPI_ENG: FormulaAstCalculator.evaluate(ast, context)

        else formula_type = JQL
            KPI_ENG->>KPI_ENG: Traduit JQL → SQL via le module jql-to-sql
            KPI_ENG->>DB: Exécute SQL traduit (SELECT uniquement, timeout 30s)
            KPI_ENG->>KPI_ENG: Agrège les résultats selon config_override

        else formula_type = SQL
            KPI_ENG->>DB: Exécute SQL custom (connexion read-only, timeout 30s)
            KPI_ENG->>KPI_ENG: Lit les résultats bruts
        end

        KPI_ENG->>DB: UPSERT kpi_results (userId=NULL) — résultat global client

        KPI_ENG->>DB: SELECT collaborateurs actifs (assignees issues résolues + auteurs worklogs)
        loop Pour chaque collaborateur actif
            KPI_ENG->>KPI_ENG: Recalcule le KPI scopé au collaborateur (filtre assigneeJiraAccountId)
            KPI_ENG->>DB: UPSERT kpi_results (userId=N) — résultat par collaborateur × mois
        end
    end

    KPI_ENG->>DB: INSERT audit_logs { action: KPI_COMPUTED, clientId }
```

**Notes :**
- Le moteur KPI s'exécute en mode batch après chaque import réussi.
- **Deux niveaux de résultats** : global (`userId=NULL`) pour le dashboard client, et par collaborateur (`userId=N`) pour la vue collaborateurs.
- Les collaborateurs actifs sont détectés automatiquement (assignees d'issues résolues + auteurs de worklogs sur la période).
- Contrainte unique `(kpiClientConfigId, userId, periodType, periodStart)` → un seul résultat par KPI * collaborateur * mois.
- Si le calcul d'un KPI échoue, les autres KPI du client continuent. L'erreur est loggée et le résultat KPI concerné reste inchangé.
- Endpoint de consultation : `GET /api/dashboard/kpis-by-user?clientId=X&period=YYYY-MM`

---

## 4. Cycle de consultation du dashboard

```mermaid
sequenceDiagram
    actor User as Utilisateur (Dev / CP / DM)
    participant FE as Frontend React
    participant API as Backend Node.js
    participant DB as MySQL

    User->>FE: Accède au dashboard KPI
    FE->>API: GET /api/dashboard?userId=X&period=2025-01&clientId=Y (Bearer JWT)

    API->>API: Valide JWT → extrait userId, email
    API->>DB: SELECT collaborator + profile (JOIN profiles) + collaborator_scopes WHERE email = jwt.email
    API->>API: scopeResolver.resolve(collaborator) → { clientIds, jiraAccountIds, level }

    alt Dev/Viewer (level <= 40) → ses propres données uniquement
        API->>DB: SELECT kpi_results WHERE collaborator_id = ? AND period = ? AND client_id IN (scopedClientIds)
    else CP (level = 60) → son équipe (clients scopés)
        API->>DB: SELECT collaborator_scopes WHERE collaboratorId = CP_id
        API->>DB: SELECT kpi_results WHERE client_id IN (scopedClientIds) AND period = ?
    else DM (level = 80) → périmètre multi-clients
        API->>DB: SELECT collaborator_scopes WHERE collaboratorId = DM_id
        API->>DB: SELECT kpi_results WHERE client_id IN (scopedClientIds) AND period = ?
    else Admin (level = 100) → accès total
        API->>DB: SELECT kpi_results WHERE client_id = ? AND period = ?
    end

    DB->>API: kpi_results []
    API->>DB: SELECT kpi_definitions JOIN kpi_definition_profiles WHERE profileId = collaborator.profileId
    API->>API: Filtre les KPI visibles selon le profil du collaborateur
    API->>API: Formate la réponse (jointure résultats + metadata)
    API->>FE: 200 { kpiData: [...], users: [...], periods: [...] }
    FE->>User: Affiche dashboard adaptatif selon le profil

    alt Drill-down demandé (détail tickets)
        User->>FE: Clique sur un KPI
        FE->>API: GET /api/kpi/{kpiConfigId}/detail?userId=X&period=2025-01
        API->>API: Vérifie droits (même logique scopeResolver)
        API->>DB: SELECT issues WHERE assignee_jira_account_id IN (jiraAccountIds) AND resolved_at BETWEEN period
        API->>DB: SELECT worklogs WHERE issue_id IN (issues)
        DB->>API: Issues + worklogs détaillés
        API->>API: Recalcule les valeurs individuelles (pour affichage détail)
        API->>FE: 200 { tickets: [ { key, summary, estimate, spent, ecart, excluded, reason } ] }
        FE->>User: Affiche liste tickets avec valeurs individuelles
    end
```

**Notes :**
- Les données affichées correspondent au dernier import réussi (indiqué par une mention "Dernière mise à jour : [date]" dans le dashboard).
- Si `is_obsolete = TRUE` sur certains résultats, le frontend affiche un bandeau d'avertissement "Données en cours de recalcul".
- Le drill-down recalcule les valeurs individuelles à la volée (par ticket) pour l'affichage, mais n'écrit pas en base.
- Le filtrage des KPI visibles utilise la table `kpi_definition_profiles` pour n'afficher que les KPI pertinents pour le profil.

---

## 12. Synchronisation sélective des utilisateurs Jira

> Statut: desactive temporairement (rollback des modifications du 27/03/2026).

Le flux de synchronisation sélective des utilisateurs Jira a été retiré temporairement du runtime.
Le mécanisme d'import principal reste disponible via les routes historiques d'import (`/api/imports/trigger`, `/api/imports/:id`, `/api/imports/:id/retry`).

---

## 5. Déclenchement d'un import backfill (Admin)

```mermaid
sequenceDiagram
    actor Admin
    participant FE as Frontend React
    participant API as Backend Node.js
    participant QUEUE as Bull Queue
    participant WORKER as Worker Import
    participant DB as MySQL

    Admin->>FE: Sélectionne client + date de début backfill
    FE->>API: POST /api/admin/imports/backfill { clientId, fromDate }
    API->>API: Valide rôle ADMIN
    API->>DB: SELECT import_jobs WHERE client_id = ? AND status = RUNNING
    alt Import déjà en cours
        API->>FE: 409 { message: "Import déjà en cours pour ce client" }
        FE->>Admin: Message d'avertissement
    else Aucun import en cours
        API->>DB: INSERT import_jobs { type: BACKFILL, status: PENDING, from_date: ? }
        API->>QUEUE: Enqueue job { clientId, type: BACKFILL, fromDate, jobId }
        API->>FE: 202 { jobId, message: "Backfill démarré" }
        FE->>Admin: Affiche indicateur de progression

        loop Progression (polling toutes les 5s ou WebSocket)
            FE->>API: GET /api/admin/imports/{jobId}
            API->>DB: SELECT import_jobs WHERE id = jobId
            DB->>API: { status, issues_fetched, last_cursor }
            API->>FE: 200 { status, progress }
            FE->>Admin: Met à jour la barre de progression
        end

        WORKER->>QUEUE: Dépile job backfill
        Note over WORKER: Même logique que l'import incrémental<br/>mais depuis fromDate jusqu'à maintenant<br/>Traitement par lots de 500 issues<br/>Pause configurable entre lots

        WORKER->>DB: UPDATE import_jobs SET status = COMPLETED
        QUEUE->>QUEUE: Enqueue KPI calculation job
        FE->>Admin: Notification "Backfill terminé — X issues importées"
    end
```

**Notes sur la reprise du backfill :**
- Après chaque lot, le curseur de pagination est sauvegardé dans `import_jobs.last_cursor`.
- Si le worker est interrompu (redémarrage du container, crash), le job reste en état `RUNNING` dans la queue Bull.
- Bull détecte le job "stalled" après un timeout configurable et le remet dans la file.
- Au redémarrage, le worker reprend depuis `last_cursor` (dernier lot validé), évitant de tout reimporter depuis le début.

---

## 6. KPI Formula AST — flux d'évaluation

> **Nouveau en v2.0**

Ce diagramme détaille le processus d'évaluation d'une formule de type `FORMULA_AST` par le `FormulaAstCalculator`.

```mermaid
sequenceDiagram
    participant KPI as Moteur KPI
    participant AST as FormulaAstCalculator
    participant SCOPE as ScopeResolver (formule)
    participant DB as MySQL

    KPI->>AST: evaluate(formulaAst, { clientId, period, collaboratorId? })

    AST->>AST: Parse AST root node (ex: ratio, subtract, if_gt...)

    AST->>SCOPE: Résout le scope rule (ex: resolved_in_period)
    SCOPE->>DB: SELECT issues WHERE clientId = ? AND resolvedAt BETWEEN periodStart AND periodEnd

    opt Scope rule = worklogs_in_period_with_children
        SCOPE->>DB: SELECT issues avec worklogs dans la période + sous-tâches
    end

    opt Scope rule = status_in_period
        SCOPE->>DB: SELECT issues JOIN issue_transitions WHERE toStatus = ? AND transitionedAt BETWEEN period
    end

    opt Scope rule = sprint_in_period
        SCOPE->>DB: SELECT issues JOIN issue_sprints JOIN grouping_entities WHERE entityType = SPRINT AND startDate <= periodEnd AND endDate >= periodStart
    end

    opt Scope rule = combined (AND/OR)
        SCOPE->>SCOPE: Résout chaque sous-scope rule
        SCOPE->>SCOPE: Combine les résultats (intersection AND / union OR)
    end

    SCOPE->>AST: Issues filtrées par scope

    opt Filtres champs personnalisés
        AST->>DB: SELECT jira_custom_fields WHERE jiraFieldId = ?
        AST->>AST: Applique opérateur (equals, in, not_null, between...)
        AST->>AST: Filtre issues par customFields JSON
    end

    opt Filtres labels / components
        AST->>AST: Filtre issues par labels (JSON array)
        AST->>AST: Filtre issues par components (JSON array)
    end

    opt Exclude jiraKeys
        AST->>AST: Exclut les issues dont jiraKey est dans la liste d'exclusion
    end

    opt collaboratorId fourni (calcul par collaborateur)
        AST->>DB: SELECT jira_users WHERE collaboratorId = ?
        AST->>AST: Filtre issues par assigneeJiraAccountId IN (jiraAccountIds)
    end

    AST->>AST: Résout la métrique de base (ex: consomme, estime, nb_issues)
    AST->>AST: Calcule la valeur pour chaque issue retenue
    AST->>AST: Applique la fonction (sum, avg, ratio, round...)
    AST->>AST: Évalue récursivement les nœuds enfants de l'AST
    AST->>KPI: Retourne { value, ticketCount, excludedTicketCount, details[] }
```

**Notes :**
- L'AST est un arbre JSON dont chaque noeud est une fonction ou une métrique.
- L'évaluation est récursive : un noeud `ratio` évalue ses deux enfants (numérateur, dénominateur) avant de calculer le rapport.
- Les filtres (scope, custom fields, labels, excludes) sont appliqués en cascade avant le calcul de la métrique.
- En mode **dry-run**, le même processus s'exécute mais le résultat n'est pas persisté en base. Cela permet de tester une formule sur des données réelles.
- En mode **validation**, seule la structure de l'AST est vérifiée (métriques existantes, fonctions valides, types compatibles) sans exécution.

---

## 7. Planification des calculs KPI (kpi_calc_schedules)

> **Nouveau en v2.0**

Le scheduler vérifie la table `kpi_calc_schedules` chaque minute et déclenche les calculs KPI selon la planification configurée.

```mermaid
sequenceDiagram
    participant CRON as Scheduler (cron every minute)
    participant API as Backend Node.js
    participant DB as MySQL
    participant QUEUE as Bull Queue
    participant KPI_ENG as Moteur KPI

    CRON->>API: Tick (chaque minute)
    API->>DB: SELECT kpi_calc_schedules WHERE isActive = true AND nextRunAt <= NOW()

    loop Pour chaque schedule éligible
        API->>API: Résout la période selon periodMode
        Note over API: CURRENT_MONTH → 1er jour du mois courant → dernier jour<br/>PREVIOUS_MONTH → 1er jour du mois précédent → dernier jour<br/>CURRENT_QUARTER → 1er jour du trimestre → dernier jour<br/>CUSTOM → dates fixes de la config

        alt kpiClientConfigId est spécifié
            API->>QUEUE: Enqueue job { clientId, kpiClientConfigId, periodStart, periodEnd }
        else kpiClientConfigId est NULL → tous les KPI actifs
            API->>DB: SELECT kpi_client_configs WHERE clientId = ? AND isActive = true
            loop Pour chaque config KPI
                API->>QUEUE: Enqueue job { clientId, kpiClientConfigId, periodStart, periodEnd }
            end
        end

        API->>DB: UPDATE kpi_calc_schedules SET lastRunAt = NOW(), nextRunAt = computeNextRun(cronExpression)
    end

    QUEUE->>KPI_ENG: Dépile job { clientId, kpiClientConfigId, periodStart, periodEnd }
    Note over KPI_ENG: Même logique que le cycle de calcul KPI (séquence 3)<br/>mais avec période explicite au lieu de "mois courant"
    KPI_ENG->>DB: UPSERT kpi_results
    KPI_ENG->>DB: INSERT audit_logs { action: KPI_SCHEDULED_CALC }
```

**Notes :**
- Le scheduler tourne indépendamment de l'import. Il permet de recalculer les KPI à intervalles réguliers sans attendre un nouvel import.
- `periodMode = PREVIOUS_MONTH` est utile pour le calcul en début de mois des KPI du mois écoulé (données complètes).
- Un même client peut avoir plusieurs schedules (ex: calcul quotidien du mois courant + calcul mensuel du mois précédent).

---

## 8. Synchronisation des champs personnalisés JIRA

> **Nouveau en v2.0**

La phase `syncCustomFields` fait partie de l'import et récupère les métadonnées des champs personnalisés JIRA ainsi que leurs options.

```mermaid
sequenceDiagram
    participant WORKER as Worker Import
    participant JIRA as API JIRA Cloud
    participant DB as MySQL

    Note over WORKER: Phase syncCustomFields (pendant l'import)

    WORKER->>JIRA: GET /rest/api/3/field
    JIRA->>WORKER: Liste de tous les champs (standard + custom)

    WORKER->>WORKER: Filtre les champs custom (id commence par "customfield_")

    loop Pour chaque champ personnalisé
        WORKER->>DB: UPSERT jira_custom_fields { jiraConnectionId, jiraFieldId, name, type }

        alt Type = select ou multiselect
            WORKER->>JIRA: GET /rest/api/3/field/{fieldId}/context
            JIRA->>WORKER: Contextes du champ

            loop Pour chaque contexte
                WORKER->>JIRA: GET /rest/api/3/field/{fieldId}/context/{contextId}/option
                JIRA->>WORKER: Liste des options

                loop Pour chaque option
                    WORKER->>DB: UPSERT jira_custom_field_options { jiraCustomFieldId, jiraOptionId, value, position }
                end
            end
        end
    end

    WORKER->>DB: UPDATE jira_custom_fields SET lastSyncAt = NOW()
    Note over WORKER: Les champs et options sont maintenant disponibles<br/>pour le moteur Formula AST (filtres custom fields)
```

**Notes :**
- La synchronisation des champs personnalisés est effectuée à chaque import pour détecter les nouveaux champs ou les changements d'options.
- Les champs supprimés dans JIRA sont marqués `isActive = false` (soft delete) plutôt que supprimés, pour préserver la cohérence des formules AST existantes.
- Les options sont indexées par `(jiraCustomFieldId, jiraOptionId)` pour un accès rapide lors du filtrage.

---

## 9. Synchronisation des sprints et import des transitions

> **Nouveau en v2.0**

### 9.1 Synchronisation des sprints

```mermaid
sequenceDiagram
    participant WORKER as Worker Import
    participant JIRA as API JIRA Cloud (Agile)
    participant DB as MySQL

    Note over WORKER: Phase syncSprints (pendant l'import)

    WORKER->>DB: SELECT projects WHERE clientId = ?

    loop Pour chaque projet du client
        WORKER->>JIRA: GET /rest/agile/1.0/board?projectKeyOrId={projectKey}
        JIRA->>WORKER: Liste des boards

        loop Pour chaque board
            WORKER->>JIRA: GET /rest/agile/1.0/board/{boardId}/sprint
            JIRA->>WORKER: Liste des sprints { id, name, state, startDate, endDate }

            loop Pour chaque sprint
                WORKER->>DB: UPSERT grouping_entities { clientId, jiraId=sprintId, name, entityType=SPRINT, startDate, endDate, state }
            end
        end
    end

    Note over WORKER: Phase syncIssueSprints (après import des issues)

    loop Pour chaque issue importée ayant un champ sprint
        WORKER->>WORKER: Extrait les sprint IDs depuis issue.fields.sprint + issue.fields.closedSprints
        loop Pour chaque sprint de l'issue
            WORKER->>DB: SELECT grouping_entities WHERE jiraId = sprintId AND entityType = SPRINT
            WORKER->>DB: UPSERT issue_sprints { issueId, groupingEntityId }
        end
    end
```

### 9.2 Import des transitions (changelog)

```mermaid
sequenceDiagram
    participant WORKER as Worker Import
    participant JIRA as API JIRA Cloud
    participant DB as MySQL

    Note over WORKER: Phase syncTransitions (si client.importTransitions = true)

    WORKER->>DB: SELECT clients WHERE id = ? AND importTransitions = true

    alt importTransitions = true
        loop Pour chaque issue importée
            WORKER->>JIRA: GET /rest/api/3/issue/{key}?expand=changelog
            JIRA->>WORKER: Issue avec changelog complet

            WORKER->>WORKER: Filtre les changelog items où field = "status"

            loop Pour chaque transition de statut dans le changelog
                WORKER->>DB: UPSERT issue_transitions { issueId, fromStatus, toStatus, authorJiraAccountId, transitionedAt }
            end
        end
    else importTransitions = false
        Note over WORKER: Skip — transitions non activées pour ce client
    end
```

**Notes :**
- Les sprints sont rattachés aux issues via une relation N:N (`issue_sprints`) car une issue peut traverser plusieurs sprints (report, déplacement).
- Les données de sprint (startDate, endDate, state) sont stockées dans `grouping_entities` avec `entityType = SPRINT`.
- Les transitions sont utilisées par le scope rule `status_in_period` du moteur Formula AST pour déterminer si une issue était dans un statut donné pendant une période.
- L'import des transitions est optionnel (flag `clients.importTransitions`) car il nécessite un appel API supplémentaire par issue (changelog), ce qui peut ralentir l'import.

---

## 10. Résolution de scope par profil (scopeResolver)

## 11. Configuration des types de retours par projets Jira

```mermaid
sequenceDiagram
    actor Admin as Administrateur
    participant FE as Frontend Admin Clients
    participant API as Backend Node.js
    participant DB as MySQL
    participant JIRA as API JIRA Cloud

    Admin->>FE: Ouvre la modale d'édition client
    FE->>API: GET /api/clients/:id/issue-types
    API->>DB: SELECT client + jiraConnection + projets actifs

    alt Aucun projet actif
        API->>FE: { issueTypes: [], hasProjects: false, message }
        FE->>Admin: Message "Ajoutez un projet JIRA avant de configurer les types"
    else Projets actifs trouvés
        loop Pour chaque projet actif
            API->>JIRA: GET /rest/api/3/project/{projectKey}
            JIRA->>API: projectId
            API->>JIRA: GET /rest/api/3/issuetype/project?projectId={projectId}
            JIRA->>API: issueTypes[] du projet
        end
        API->>API: Union + déduplication + tri alphabétique
        API->>FE: { issueTypes, hasProjects: true, message: null }
        FE->>Admin: Active les sélecteurs Type retour interne/client
    end
```

**Notes :**
- Les types retournés proviennent de l'union des types d'issues autorisés sur les projets Jira actifs du client.
- En création de client (avant ajout de projet), les sélecteurs de type retour restent désactivés et invitent l'admin à ajouter un projet d'abord.

> **Nouveau en v2.0**

Le `scopeResolver` est invoqué à chaque requête API pour déterminer les données accessibles au collaborateur authentifié.

```mermaid
sequenceDiagram
    participant API as Backend Node.js
    participant SR as scopeResolver
    participant DB as MySQL

    API->>SR: resolve(collaboratorId)

    SR->>DB: SELECT collaborators JOIN profiles WHERE collaborators.id = ?
    DB->>SR: { collaborator, profile: { code, level } }

    alt level = 100 (Admin)
        SR->>SR: scope = { clientIds: ALL, jiraAccountIds: ALL, isAdmin: true }
        Note over SR: Aucun filtre — accès total

    else level >= 60 (DM=80, CP=60)
        SR->>DB: SELECT collaborator_scopes WHERE collaboratorId = ? AND scopeType = 'CLIENT'
        DB->>SR: [ { scopeId: clientId1 }, { scopeId: clientId2 }, ... ]
        SR->>SR: clientIds = scopes.map(s => s.scopeId)

        SR->>DB: SELECT jira_users WHERE collaboratorId = ?
        DB->>SR: [ { jiraAccountId: 'abc-123' }, ... ]
        SR->>SR: ownJiraAccountIds = jiraUsers.map(u => u.jiraAccountId)

        alt level = 80 (DM)
            SR->>SR: scope = { clientIds, jiraAccountIds: ALL_IN_CLIENTS, isAdmin: false }
            Note over SR: Voit toutes les données de ses clients scopés
        else level = 60 (CP)
            SR->>SR: scope = { clientIds, jiraAccountIds: ALL_IN_CLIENTS, isAdmin: false }
            Note over SR: Même accès que DM mais vue "Mon équipe"
        end

    else level <= 40 (Dev=40, Viewer=20)
        SR->>DB: SELECT collaborator_scopes WHERE collaboratorId = ? AND scopeType = 'CLIENT'
        DB->>SR: [ { scopeId: clientId1 }, ... ]
        SR->>SR: clientIds = scopes.map(s => s.scopeId)

        SR->>DB: SELECT jira_users WHERE collaboratorId = ?
        DB->>SR: [ { jiraAccountId: 'abc-123' }, { jiraAccountId: 'def-456' } ]
        SR->>SR: jiraAccountIds = jiraUsers.map(u => u.jiraAccountId)

        SR->>SR: scope = { clientIds, jiraAccountIds, isAdmin: false }
        Note over SR: Ne voit que ses propres issues et worklogs<br/>(filtre par assigneeJiraAccountId / authorJiraAccountId)
    end

    SR->>API: Retourne scope { clientIds[], jiraAccountIds[], isAdmin }

    Note over API: Le scope est utilisé pour filtrer :<br/>- kpi_results (WHERE clientId IN ... AND collaboratorId = ...)<br/>- issues (WHERE assigneeJiraAccountId IN ...)<br/>- worklogs (WHERE authorJiraAccountId IN ...)
```

**Notes :**
- Le scopeResolver est un composant central invoqué par tous les endpoints API de consultation.
- Pour DM et CP, `jiraAccountIds = ALL_IN_CLIENTS` signifie qu'ils voient les données de tous les collaborateurs affectés à leurs clients, pas seulement les leurs.
- Pour Dev et Viewer, le filtre `jiraAccountIds` est strict : seules les issues assignées au collaborateur et les worklogs qu'il a saisis sont visibles.
- La différence entre CP et DM est principalement au niveau de l'affichage dashboard (vue "Mon équipe" vs vue multi-clients), pas au niveau du scope technique.
- Le scope est résolu une fois par requête et passé en paramètre aux services métier (KPI, issues, worklogs).

---

## 11. Mode debug KPI — flux de capture des traces SQL

Ce flux décrit comment un administrateur active le mode debug sur un KPI client, déclenche un recalcul, et consulte les traces SQL générées.

```mermaid
sequenceDiagram
    actor Admin
    participant UI as Frontend
    participant API as Backend API
    participant Engine as KPI Engine
    participant DB as Base de données

    Note over Admin: Étape 1 — Activer le debug
    Admin->>UI: Toggle "Debug ON" sur un KPI
    UI->>API: PATCH /api/kpi/configs/:id { debugMode: true }
    API->>DB: UPDATE kpi_client_configs SET debug_mode = true
    API-->>UI: 200 OK

    Note over Admin: Étape 2 — Recalculer
    Admin->>UI: Clic "Recalculer"
    UI->>API: POST /api/kpi/recalculate { clientId }
    API-->>UI: 202 Accepted (jobLogId)

    API->>Engine: runKpiCalculationForClient(clientId)

    loop Pour chaque KPI config du client
        Engine->>DB: Lire kpiClientConfig (incluant debugMode)
        alt debugMode = true
            Engine->>Engine: Créer QueryCollector
            Engine->>Engine: context._queryCollector = collector

            loop Pour chaque métrique de la formule
                Engine->>Engine: collector.startMetric(metricId)
                Engine->>DB: prisma.issue.findMany({ where, select })
                Engine->>Engine: collector.addQuery(model, action, where, select, duration)
                Engine->>Engine: collector.endMetric(rowCount, value)
            end

            Engine->>DB: Vérifier limite (AppSetting kpi.debug.maxTracesPerConfig)
            Engine->>DB: Purge FIFO si nécessaire
            Engine->>DB: INSERT kpi_debug_traces (metrics, sql, filtres, résultat)
        else debugMode = false
            Note over Engine: Calcul normal sans capture
        end
        Engine->>DB: UPSERT kpi_results
    end

    Note over Admin: Étape 3 — Consulter les traces
    Admin->>UI: Clic "Voir traces"
    UI->>API: GET /api/kpi/debug-traces?kpiClientConfigId=42
    API->>DB: SELECT * FROM kpi_debug_traces WHERE ...
    API-->>UI: Traces avec SQL, métriques, résultats
    UI->>Admin: Affichage modal avec accordéon par collaborateur

    Note over Admin: Étape 4 — Désactiver le debug
    Admin->>UI: Toggle "Debug OFF"
    UI->>API: PATCH /api/kpi/configs/:id { debugMode: false }
    API->>DB: UPDATE kpi_client_configs SET debug_mode = false
```

**Paramètres configurables (table `app_settings`)** :

| Clé | Défaut | Description |
|-----|--------|-------------|
| `kpi.debug.maxTracesPerConfig` | `10` | Nombre max de traces conservées par config KPI (FIFO) |
| `kpi.debug.purgeOnDisable` | `true` | Purger les traces quand debugMode passe à false |
| `kpi.debug.maxCollaboratorsTraced` | `0` | 0 = tous, sinon limite le nombre de collaborateurs tracés |
