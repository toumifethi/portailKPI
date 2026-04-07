# Règles métier — Portail KPI Productivité

> **Version** : 1.3
> **Étape** : 1 — Cahier des charges et spécifications fonctionnelles
> **Statut** : À valider

---

## Sommaire

1. [Équipes et projets JIRA](#1-équipes-et-projets-jira)
2. [Affectation collaborateur ↔ client](#2-affectation-collaborateur--client)
3. [Lien Chef de projet ↔ Epic](#3-lien-chef-de-projet--epic)
4. [Gestion des utilisateurs et statuts](#4-gestion-des-utilisateurs-et-statuts)
5. [Moteur de calcul des KPI](#5-moteur-de-calcul-des-kpi)
6. [KPI "Respect des charges"](#6-kpi-respect-des-charges)
7. [KPI "Qualité"](#7-kpi-qualité)
8. [Source du temps consommé](#8-source-du-temps-consommé)
9. [Mécanisme d'import](#9-mécanisme-dimport)
10. [Calcul et stockage des résultats KPI](#10-calcul-et-stockage-des-résultats-kpi)
11. [Extensibilité et versioning des formules KPI](#11-extensibilité-et-versioning-des-formules-kpi)
12. [Seuils d'alerte KPI](#12-seuils-dalerte-kpi)
13. [Archivage d'un contexte client](#13-archivage-dun-contexte-client)
14. [KPI "Tickets sans estimation"](#14-kpi-tickets-sans-estimation)
15. [KPI "Tickets développés avec IA"](#15-kpi-tickets-développés-avec-ia)
16. [Vue cross-client (évolution KPI tous contextes)](#16-vue-cross-client-évolution-kpi-tous-contextes)
17. [Périmètre du Delivery Manager](#17-périmètre-du-delivery-manager)

---

## 1. Équipes et projets JIRA

**RMG-001** — Un projet JIRA au sein d'une instance client correspond à une équipe dans l'application.

**RMG-002** — Les membres d'une équipe sont synchronisés automatiquement depuis l'API JIRA à chaque import (endpoint `/rest/api/3/user/assignable/multiProjectSearch` ou équivalent).

**RMG-003** — L'Admin peut ajouter manuellement des membres à une équipe. Ces ajouts sont préservés lors des resynchronisations ultérieures (la synchronisation JIRA n'écrase pas les ajouts manuels).

**RMG-004** — L'Admin peut retirer un membre d'une équipe. Un membre retiré manuellement n'est pas réajouté automatiquement par la synchronisation, sauf réactivation explicite.

**RMG-005** — Un collaborateur archivé n'est pas réactivé automatiquement par la synchronisation JIRA, même s'il est toujours présent dans l'instance JIRA.

**RMG-006** — Un même collaborateur peut appartenir à plusieurs équipes, sur un ou plusieurs clients. Les KPI sont calculés séparément par combinaison (collaborateur × client × équipe).

---

## 2. Affectation collaborateur ↔ client

**RMG-007** — Un collaborateur est automatiquement associé à un client si des tickets lui sont assignés dans l'instance JIRA de ce client.

**RMG-008** — L'association automatique est recalculée à chaque import incrémental. Si un collaborateur n'a plus de ticket assigné depuis N mois (N configurable), l'association peut être marquée comme inactive sans être supprimée.

**RMG-009** — L'Admin peut forcer une association ou en créer une manuellement, indépendamment des données JIRA.

**RMG-010** — Les associations manuelles sont préservées lors des synchronisations automatiques.

---

## 3. Lien Chef de projet ↔ Epic

**RMG-011** — Le lien entre un Chef de projet et un Epic est défini via un champ JIRA personnalisé, configurable par client (nom du champ + type attendu).

**RMG-012** — La valeur de ce champ est récupérée lors de l'import et stockée dans la base interne.

**RMG-013** — Si le champ n'est pas renseigné sur un Epic, l'Epic n'est rattaché à aucun Chef de projet. Il n'apparaît pas dans les vues CP.

**RMG-014** — Un Epic peut être rattaché à un seul Chef de projet à la fois (valeur du champ = un utilisateur).

**RMG-015** — Si la valeur du champ ne correspond à aucun utilisateur connu dans l'application, l'Epic est ignoré pour les vues CP et une alerte est levée dans les logs d'import.

---

## 4. Gestion des utilisateurs et statuts

Un collaborateur peut se trouver dans l'un des états suivants :

| Statut       | Description                                                                 |
|--------------|-----------------------------------------------------------------------------|
| `ACTIF`      | Présent dans JIRA, peut se connecter, ses KPI sont calculés                 |
| `MANUEL`     | Ajouté manuellement, sans compte JIRA connu, ne peut pas se connecter via SSO si pas de compte Office 365 |
| `SANS_SAISIE`| Actif mais sans worklog récent (dépassement du seuil de N jours configurable) |
| `ARCHIVE`    | A quitté le projet, accès désactivé, données historiques conservées         |

**RMG-016** — Le passage à l'état `SANS_SAISIE` est calculé automatiquement après chaque import. Il ne bloque pas l'accès à l'application.

**RMG-017** — L'archivage est une action manuelle (Admin uniquement). Un utilisateur archivé ne peut plus se connecter.

**RMG-018** — La réactivation d'un utilisateur archivé est une action manuelle (Admin uniquement).

**RMG-019** — Les données historiques (KPI, worklogs) d'un utilisateur archivé sont conservées indéfiniment et consultables par les rôles autorisés via un filtre explicite "Afficher archivés".

---

## 5. Moteur de calcul des KPI

Trois modes de définition sont disponibles, au choix par KPI :

### Mode 1 — Formule prédéfinie

**RMG-020** — L'Admin sélectionne un type de formule dans un catalogue et configure ses paramètres. Le catalogue contient au minimum :

| Type de formule              | Description                                                              |
|------------------------------|--------------------------------------------------------------------------|
| `RATIO_ESTIME_CONSOMME`      | (temps_consommé - estimation_initiale) / estimation_initiale × 100       |
| `RATIO_RETOURS`              | sum(temps_retours_liés) / estimation_initiale_ticket_principal × 100     |
| `COUNT_BY_STATUS`            | Nombre de tickets dans un statut donné sur la période                    |
| `SUM_FIELD`                  | Somme d'un champ numérique sur les tickets filtrés                       |
| `AVG_FIELD`                  | Moyenne d'un champ numérique sur les tickets filtrés                     |

**RMG-021** — Les paramètres configurables par formule incluent : champs source, statuts cibles, types de tickets inclus/exclus, prise en compte des sous-tâches, règle d'agrégation sur la période (somme ou moyenne).

### Mode 2 — Requête JQL

**RMG-022** — L'Admin écrit une requête JQL définissant les issues à prendre en compte pour ce KPI.

**RMG-023** — La requête JQL est stockée en base et appliquée sur les données locales lors du calcul. Le support JQL est limité aux clauses pouvant être traduites en SQL sur le modèle de données interne (cf. documentation des clauses supportées — à produire en Étape 4).

**RMG-024** — Les clauses JQL non supportées en mode local sont signalées à l'Admin lors de la sauvegarde de la configuration.

**RMG-025** — L'Admin configure une règle d'agrégation sur les résultats (count, sum sur un champ, avg sur un champ).

### Mode 3 — Requête SQL

**RMG-026** — L'Admin écrit une requête SQL en lecture seule (`SELECT` uniquement) sur la base interne.

**RMG-027** — Toute requête contenant des mots-clés de modification (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `CREATE`) est rejetée à la sauvegarde.

**RMG-028** — La requête SQL s'exécute dans un contexte de lecture seule (utilisateur de base de données avec droits `SELECT` uniquement).

**RMG-029** — Un timeout d'exécution est configuré pour les requêtes SQL de KPI (valeur par défaut : 30 secondes).

---

## 6. KPI "Respect des charges"

**RMG-030** — Périmètre : tickets dont le statut est dans la liste des statuts "terminé" configurée pour ce client, sur la période d'analyse.

**RMG-031** — Le ticket doit être assigné au collaborateur concerné (champ `assignee` JIRA).

**RMG-032** — Calcul par ticket :
```
écart_ticket (%) = (temps_consommé - estimation_initiale) / estimation_initiale × 100
```

**RMG-033** — Si `estimation_initiale = 0` ou `null`, le ticket est **exclu** du calcul et signalé dans le rapport d'import comme "ticket sans estimation".

**RMG-034** — Si `temps_consommé = 0` ou `null`, le ticket est inclus dans le calcul (écart = -100%).

**RMG-035** — Agrégation sur la période (configurable par client) : moyenne des écarts par défaut, ou somme.

**RMG-036** — Prise en compte des sous-tâches (configurable par client) :
- Si activée : les temps des sous-tâches sont agrégés avec le ticket parent avant calcul de l'écart
- Si désactivée : seul le ticket parent est pris en compte

**RMG-037** — Les types de tickets exclus (configuration client) sont ignorés, même s'ils sont dans un statut "terminé".

---

## 7. KPI "Qualité"

**RMG-038** — Définition : mesure le pourcentage du temps consacré aux corrections de retours par rapport à l'estimation initiale du ticket principal.

**RMG-039** — Types de retours pris en charge :
- **Retour interne** : issu des tests d'intégration (type de ticket configurable par client)
- **Retour client** : issu de la recette client (type de ticket configurable par client)

**RMG-040** — Un ticket de retour est lié à son ticket principal via un lien JIRA. Le type de lien est configurable par client (ex. : "is caused by", "duplicates", etc.).

**RMG-041** — Calcul par ticket principal terminé :
```
ratio_qualité_ticket (%) = sum(temps_consommé des tickets de retour liés) / estimation_initiale_ticket_principal × 100
```

**RMG-041bis** — **Rattachement des retours au développeur initial.** Le temps passé sur un ticket de retour est toujours imputé au développeur ayant réalisé le ticket principal, quelle que soit la personne qui a effectivement traité le retour.

- Pour déterminer ce développeur initial, l'application lit un champ JIRA configurable par client sur le ticket principal (ex. : `assignee`, ou un champ personnalisé `customfield_XXXXX`).
- Ce champ est distinct de l'assignee courant du ticket de retour.
- Si le champ configuré est absent ou vide sur le ticket principal, le retour est rattaché à l'assignee courant du ticket principal. Si celui-ci est également absent, le retour est **exclu** du calcul et signalé dans le rapport d'import.
- Si la valeur du champ ne correspond à aucun utilisateur connu dans l'application, le retour est exclu et une alerte est levée dans les logs d'import.

**RMG-042** — Seuls les liens directs (niveau 1) sont pris en compte, sauf configuration spécifique.

**RMG-043** — Si le ticket principal n'a pas d'estimation initiale, il est exclu du calcul (même règle que RMG-033).

**RMG-044** — Agrégation par collaborateur sur la période : moyenne des ratios par défaut.

**RMG-045** — Le KPI est calculé séparément pour les retours internes et les retours clients, avec possibilité d'un KPI global (somme des deux).

---

## 8. Source du temps consommé

**RMG-046** — La source du temps consommé dépend de la configuration du client :

| Configuration client | Source de données                                           |
|----------------------|-------------------------------------------------------------|
| Tempo activé         | Entrées Tempo (API Tempo Cloud) — worklogs Tempo            |
| Tempo désactivé      | Worklogs JIRA natifs (`/rest/api/3/issue/{id}/worklog`)     |

**RMG-047** — Si Tempo est activé, les worklogs JIRA natifs ne sont pas utilisés pour les calculs KPI (éviter le double comptage).

**RMG-048** — L'estimation initiale est toujours issue d'un champ JIRA (natif ou personnalisé), configurable par client. Par défaut : champ `timeoriginalestimate` (en secondes dans l'API JIRA).

**RMG-049** — Si l'estimation est en Story Points, une règle de conversion (points → heures) doit être configurée par client pour que le calcul soit homogène avec le temps consommé en heures.

---

## 9. Mécanisme d'import

### Import incrémental

**RMG-050** — Récupère les tickets créés ou modifiés depuis la date de fin du dernier import réussi pour ce client.

**RMG-051** — Requête JIRA : JQL `project IN (...) AND updated >= "YYYY-MM-DD HH:mm"`, paginée (100 résultats max par page).

**RMG-052** — Pour chaque ticket récupéré, l'import inclut : métadonnées, champs configurés, worklogs (JIRA ou Tempo), liens JIRA, historique de statuts.

**RMG-053** — Dédoublonnage par upsert : la clé métier est la clé JIRA (`{project_key}-{issue_number}`).

**RMG-054** — Si Tempo est activé, les entrées Tempo sont récupérées séparément pour la même fenêtre temporelle via l'API Tempo Cloud.

### Import backfill

**RMG-055** — Même logique que l'incrémental, avec une date de début configurable manuellement.

**RMG-056** — Traitement par lots pour les gros volumes (ex. : 500 issues par lot, avec pause configurable entre lots pour respecter le rate limit JIRA).

**RMG-057** — La progression est tracée en base (nombre d'issues traitées, dernier curseur de pagination).

**RMG-058** — En cas d'interruption, le backfill peut reprendre depuis le dernier curseur enregistré.

### Import planifié

**RMG-059** — Exécuté automatiquement selon le planning configuré par client (ex. : nuit entre 2h et 4h, heure Paris).

**RMG-060** — Si un import est déjà en cours pour un client, le déclenchement suivant est ignoré et une alerte est levée.

**RMG-061** — Un verrou (mutex) par client garantit qu'un seul import s'exécute simultanément pour ce client.

---

## 10. Calcul et stockage des résultats KPI

**RMG-062** — Les résultats KPI sont précalculés et stockés dans la table `kpi_results`. Le dashboard ne recalcule pas à la volée.

**RMG-063** — Le calcul est déclenché automatiquement à la fin de chaque import réussi pour les KPI actifs du client concerné.

**RMG-064** — Les résultats sont calculés par granularité mensuelle au minimum.

**RMG-065** — Un recalcul manuel peut être déclenché par l'Admin (pour un client, un KPI, une période donnés).

**RMG-066** — Si la configuration d'un KPI est modifiée, les résultats existants restent en base jusqu'à un recalcul. Un indicateur "résultats obsolètes" est affiché pour les périodes concernées.

---

## 11. Extensibilité et versioning des formules KPI

### Fusion de la configuration (config merge)

**RMG-104** — La configuration effective utilisée lors du calcul d'un KPI pour un client est le résultat d'une **fusion (deep merge)** de deux sources, dans cet ordre de priorité :

1. `kpi_definitions.base_config` — configuration par défaut définie au niveau du KPI (valeurs communes à tous les clients)
2. `kpi_client_configs.config_override` — surcharge spécifique à ce client (les clés présentes ici écrasent celles de `base_config`)

En cas de conflit sur une même clé, **la valeur du client gagne toujours**. Les clés absentes du `config_override` conservent la valeur de `base_config`.

**Exemple :**
```
base_config          : { done_statuses: ["Done"], aggregation_rule: "AVG", include_subtasks: false }
config_override      : { done_statuses: ["Done","Closed","Resolved"], include_subtasks: true }
→ final_config       : { done_statuses: ["Done","Closed","Resolved"], aggregation_rule: "AVG", include_subtasks: true }
```

**RMG-105** — Le schéma des clés acceptables dans `base_config` et `config_override` est documenté dans `kpi_definitions.config_schema` (JSON Schema). Lors de la sauvegarde d'un `config_override`, le backend valide les clés par rapport à ce schéma. Une clé inconnue déclenche une erreur de validation explicite.

### Surcharge de formule par client (formula override)

**RMG-106** — Pour les KPI de type `PREDEFINED`, il est possible de définir une **formule de remplacement complète** (SQL `SELECT`) spécifique à un (KPI × client) donné, sans créer un nouveau KPI distinct. Ce SQL est stocké dans `kpi_client_configs.formula_override`.

- Quand `formula_override` est renseigné, le moteur KPI **court-circuite** le calculator prédéfini et exécute directement ce SQL.
- Les mêmes contraintes que le mode SQL libre s'appliquent : `SELECT` uniquement, lecture seule, timeout 30s.
- La modification de `formula_override` est une action Admin uniquement, tracée dans `audit_logs` (date, auteur, ancienne valeur, nouvelle valeur).
- Ce mécanisme est prévu pour des adaptations ponctuelles nécessitant une correction de formule sans déploiement de code. Il ne remplace pas la création d'un KPI dédié en mode SQL pour les cas structurels.

### Versioning des formules

**RMG-107** — Chaque `kpi_client_configs` porte un champ `formula_version` (chaîne de version, ex. : `"1.0"`, `"1.1"`). Ce champ est incrémenté dans les cas suivants :
- Modification du `config_override` qui change la logique de calcul (ex. : modification des `done_statuses`, de l'`aggregation_rule`)
- Ajout ou modification du `formula_override`
- Déploiement d'une correction dans le code du calculator prédéfini correspondant (incrémenté manuellement par le développeur en charge)

**RMG-108** — Chaque enregistrement dans `kpi_results` stocke la `formula_version` en vigueur au moment du calcul. Cela permet, lors de la consultation de l'historique, d'identifier les résultats produits par des versions différentes de la formule et d'afficher un avertissement si plusieurs versions coexistent sur une même plage de temps.

**RMG-109** — Toute incrémentation de `formula_version` déclenche automatiquement le marquage `is_obsolete = TRUE` sur les résultats `kpi_results` existants pour ce (KPI × client). Un recalcul est nécessaire pour produire des résultats cohérents avec la nouvelle version.

**RMG-110** — L'historique des changements de formule est consultable dans la table `kpi_formula_versions` : date du changement, auteur, type de changement (`CONFIG_OVERRIDE` / `FORMULA_OVERRIDE` / `CODE_UPDATE`), description courte, version avant / après.

---

## 12. Seuils d'alerte KPI

**RMG-067** — Des seuils vert / orange / rouge sont configurables par KPI et par client.

**RMG-068** — Les seuils s'appliquent à la valeur calculée du KPI pour un collaborateur sur une période.

**RMG-069** — Le dépassement d'un seuil rouge génère une alerte visible dans le tableau de bord Admin et dans la vue DM.

**RMG-070** — Les seuils sont optionnels. En l'absence de seuil configuré, aucun indicateur coloré n'est affiché.

---

## 12. Archivage d'un contexte client

**RMG-075** — Un contexte client peut être archivé par un Admin. L'archivage stoppe immédiatement les imports planifiés pour ce client.

**RMG-076** — Un client ne peut pas être archivé si un import est en cours (`status = RUNNING`). L'Admin doit annuler ou attendre la fin du job avant d'archiver.

**RMG-077** — Un client archivé n'apparaît plus dans les listes de sélection par défaut (dashboard, configuration d'import, planification). Un filtre explicite "Afficher les clients archivés" permet d'y accéder.

**RMG-078** — Toutes les données associées à un client archivé sont conservées en base : tickets, worklogs, membres, résultats KPI, historique d'imports. Aucune suppression n'est opérée.

**RMG-079** — Les résultats KPI d'un client archivé restent consultables dans les vues historiques et les exports.

**RMG-080** — Un client archivé peut être réactivé par un Admin. À la réactivation, les imports reprennent en mode incrémental à partir de la date de réactivation (pas de backfill automatique).

**RMG-081** — L'archivage est tracé : date d'archivage, utilisateur ayant effectué l'action, motif optionnel (champ libre).

---

## 13. KPI "Tickets sans estimation"

**RMG-082** — Le KPI "Tickets sans estimation" compte les tickets dont l'estimation initiale est absente (`null` ou `0`) et dont le statut appartient à la liste des statuts "en cours" configurée pour ce KPI par client.

**RMG-083** — Les statuts "en cours" sont sélectionnables parmi les statuts disponibles dans l'instance JIRA du client. La liste est récupérée dynamiquement à la configuration.

**RMG-084** — Le KPI est calculé par collaborateur (tickets assignés) et par période (mensuel par défaut).

**RMG-085** — La valeur est un entier (nombre de tickets). Une valeur secondaire optionnelle peut exprimer le pourcentage par rapport au total de tickets en cours sur la période.

**RMG-086** — L'évolution dans le temps (graphique mensuel sur N mois) est stockée dans `kpi_results` comme tout autre KPI.

**RMG-087** — Un drill-down vers la liste des tickets concernés est disponible : clé JIRA, titre, statut, assigné, date de création.

---

## 14. KPI "Tickets développés avec IA"

**RMG-088** — Le KPI "Tickets développés avec IA" est basé sur la valeur d'un champ JIRA personnalisé (champ custom), configurable par client (nom technique du champ, ex. : `customfield_12345`).

**RMG-089** — Pour chaque valeur possible du champ IA (récupérée dynamiquement depuis les données importées), l'Admin configure une règle de comptage :
- `COMPTE_COMME_IA` : la valeur est considérée comme "développé avec IA"
- `EXCLUT` : la valeur exclut le ticket du comptage total (ex. : non applicable)
- `NON_IA` : la valeur est considérée comme "développé sans IA"
- Un ticket dont le champ est vide (`null`) est traité comme `NON_IA` par défaut, sauf configuration contraire.

**RMG-090** — La valeur principale du KPI est un pourcentage :
```
kpi_ia (%) = (tickets avec IA / (total tickets terminés - tickets exclus)) × 100
```
La valeur brute (entier, nombre de tickets avec IA) est stockée en parallèle dans `kpi_results`.

**RMG-091** — Le périmètre de calcul porte sur les tickets dont le statut est dans la liste des statuts "terminé" configurée pour ce client (même liste que le KPI "Respect des charges").

**RMG-092** — Si le champ IA configuré n'est pas présent dans l'instance JIRA d'un client (champ absent de `/rest/api/3/field`), le KPI est automatiquement désactivé pour ce client lors de la configuration et un avertissement est affiché.

**RMG-093** — Un drill-down vers la liste des tickets avec la valeur brute du champ IA est disponible pour permettre l'audit des résultats.

---

## 15. Vue cross-client (évolution KPI tous contextes)

**RMG-094** — Une vue "évolution cross-client" permet d'afficher un graphique multi-courbes pour un KPI donné, avec une courbe par client sélectionné, sur une période configurable.

**RMG-095** — Le périmètre de la vue cross-client dépend du rôle :
- Admin : tous les clients actifs (et archivés si filtre activé)
- Delivery Manager : les clients appartenant à son périmètre

**RMG-096** — Des filtres d'exclusion sont applicables au calcul de la vue cross-client. Ces filtres opèrent sur les données locales importées :
- Exclure un ou plusieurs statuts JIRA (les tickets dans ces statuts sont ignorés du calcul)
- Exclure un ou plusieurs collaborateurs nommément (leurs tickets sont exclus)
- Exclure un ou plusieurs types de tickets
- Exclure les clients archivés (activé par défaut)

**RMG-097** — Les filtres actifs sont affichés explicitement dans l'interface ("Calcul excluant : statut 'In Review', collaborateur 'Tom DUPUIS'"). Un résumé textuel est inclus dans les exports.

**RMG-098** — L'ensemble des filtres d'une vue cross-client peut être sauvegardé comme "vue nommée" par utilisateur. Une vue sauvegardée est accessible depuis un menu dédié et modifiable ou supprimable.

**RMG-099** — Les données affichées proviennent de `kpi_results`. Si un filtre d'exclusion ne correspond à aucune donnée disponible pour un client donné sur la période, la courbe de ce client est absente du graphique (pas de valeur `0` artificielle).

---

## 16. Périmètre du Delivery Manager

**RMG-100** — Le périmètre d'un Delivery Manager est défini manuellement par l'Admin. Il peut inclure une combinaison de : clients, équipes (projets JIRA), collaborateurs individuels.

**RMG-101** — Un Delivery Manager ne voit que les données (KPI, membres, équipes) appartenant à son périmètre.

**RMG-102** — Un Delivery Manager peut modifier le rôle applicatif (`Développeur` ↔ `Chef de projet`) des membres de son périmètre uniquement.

**RMG-103** — Les modifications de rôle effectuées par un DM sont tracées dans les logs d'audit avec la date, l'auteur et le changement effectué.
