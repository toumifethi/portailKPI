# Cas particuliers et gestion des erreurs — Portail KPI Productivité

> **Version** : 1.0
> **Étape** : 1 — Cahier des charges et spécifications fonctionnelles
> **Statut** : À valider

---

## Sommaire

1. [Erreurs liées aux imports JIRA](#1-erreurs-liées-aux-imports-jira)
2. [Erreurs liées à l'API Tempo](#2-erreurs-liées-à-lapi-tempo)
3. [Erreurs liées à la configuration des KPI](#3-erreurs-liées-à-la-configuration-des-kpi)
4. [Données incomplètes ou incohérentes](#4-données-incomplètes-ou-incohérentes)
5. [Doublons et concurrence](#5-doublons-et-concurrence)
6. [Erreurs liées à l'authentification et aux droits](#6-erreurs-liées-à-lauthentification-et-aux-droits)
7. [Stratégie générale de reprise sur incident](#7-stratégie-générale-de-reprise-sur-incident)

---

## 1. Erreurs liées aux imports JIRA

### CE-IMP-001 — API JIRA indisponible (timeout ou erreur 5xx)

**Description :** L'API JIRA ne répond pas ou retourne une erreur serveur lors d'un appel d'import.

**Comportement attendu :**
- L'import marque le lot en erreur avec le code HTTP reçu et le timestamp
- Mécanisme de retry automatique : 3 tentatives avec backoff exponentiel (attente : 1 min, 5 min, 15 min)
- Si les 3 tentatives échouent, l'import est marqué `ECHOUE` et une alerte est levée dans le tableau de bord Admin
- L'Admin peut relancer manuellement l'import une fois l'API rétablie
- Les données partiellement importées avant l'erreur sont conservées en base (reprise depuis le dernier curseur)

---

### CE-IMP-002 — Token JIRA invalide ou expiré (erreur 401 / 403)

**Description :** Le token d'authentification JIRA est rejeté par l'API.

**Comportement attendu :**
- L'import est immédiatement interrompu (pas de retry, car le retry ne résoudrait pas le problème)
- L'import est marqué `ECHOUE` avec le message "Authentification JIRA échouée (401)"
- Une alerte critique est affichée dans le tableau de bord Admin
- L'instance JIRA est automatiquement désactivée pour éviter de saturer l'API JIRA avec des appels non autorisés
- L'Admin doit mettre à jour les credentials et réactiver l'instance manuellement

---

### CE-IMP-003 — Rate limiting JIRA (erreur 429 - Too Many Requests)

**Description :** L'API JIRA renvoie un code 429 indiquant que la limite de taux d'appels est atteinte.

**Comportement attendu :**
- L'import respecte l'en-tête `Retry-After` si présent (pause avant reprise)
- Si l'en-tête est absent, backoff exponentiel appliqué (attente : 30s, 2 min, 5 min)
- Un compteur de throttling est tracé dans les logs d'import
- Si le rate limiting persiste au-delà de 3 tentatives sur un lot, le lot est suspendu et l'import reprend au prochain cycle planifié

---

### CE-IMP-004 — Résultats de pagination JIRA tronqués ou incohérents

**Description :** La pagination JIRA retourne un total de résultats incohérent entre les pages, ou la dernière page est vide alors que des items étaient attendus.

**Comportement attendu :**
- L'import continue jusqu'à épuisement des pages retournées par l'API
- Une alerte non bloquante est enregistrée dans les logs d'import ("Pagination potentiellement incomplète")
- L'Admin peut déclencher un recalcul ou un backfill sur la période concernée

---

### CE-IMP-005 — Champ JIRA configuré introuvable dans l'instance

**Description :** Un champ configuré dans le mapping client (ex. : champ estimation, champ Epic owner) n'existe pas ou n'est plus disponible dans l'instance JIRA.

**Comportement attendu :**
- L'import se poursuit mais les tickets concernés sont importés sans la valeur du champ manquant
- Chaque ticket affecté est signalé dans les logs d'import avec l'identifiant du champ manquant
- Une alerte de configuration est levée dans le tableau de bord Admin ("Champ `custom_field_xxxxx` introuvable — mapping invalide pour client X")
- Les KPI dépendant de ce champ affichent un indicateur "données incomplètes" dans le dashboard

---

### CE-IMP-006 — Instance JIRA désactivée manuellement

**Description :** Un import planifié ou manuel est déclenché pour une instance marquée comme inactive.

**Comportement attendu :**
- L'import est refusé immédiatement avec le message "Instance désactivée — import ignoré"
- Aucun appel API n'est effectué

---

## 2. Erreurs liées à l'API Tempo

### CE-TEMPO-001 — API Tempo indisponible

**Description :** L'API Tempo Cloud ne répond pas lors de la récupération des worklogs.

**Comportement attendu :**
- Même stratégie de retry que CE-IMP-001
- L'import JIRA se poursuit normalement (les deux sont indépendants)
- Les résultats KPI pour ce client sont marqués comme "partiels" jusqu'à la prochaine récupération Tempo réussie

---

### CE-TEMPO-002 — Token Tempo invalide ou expiré

**Description :** Le token Tempo Cloud est rejeté par l'API Tempo.

**Comportement attendu :**
- Même comportement que CE-IMP-002 (alerte critique, désactivation Tempo pour ce client, action Admin requise)
- L'import JIRA du client continue sans les données Tempo

---

### CE-TEMPO-003 — Worklog Tempo sans correspondance de ticket en base

**Description :** Un worklog Tempo référence un ticket (`issue_id`) qui n'existe pas encore dans la base interne (l'issue n'a pas encore été importée).

**Comportement attendu :**
- Le worklog est mis en file d'attente de réconciliation
- Il est rattaché à son ticket lors du prochain import où le ticket est importé
- Si après 3 imports le ticket est toujours absent, le worklog est signalé dans les logs ("Worklog orphelin — ticket introuvable")

---

## 3. Erreurs liées à la configuration des KPI

### CE-KPI-001 — Requête JQL invalide (syntaxe incorrecte)

**Description :** La requête JQL d'un KPI ne peut pas être parsée ou traduite.

**Comportement attendu :**
- La configuration est sauvegardée avec le statut `INVALIDE`
- Le KPI invalide n'est pas calculé lors des imports
- L'Admin voit un indicateur d'erreur sur la configuration avec le message de syntaxe détaillé
- Le KPI invalide n'est pas affiché dans les dashboards (ou affiché avec le mention "Configuration invalide")

---

### CE-KPI-002 — Requête SQL non autorisée (écriture détectée)

**Description :** La requête SQL d'un KPI contient des instructions autres que `SELECT`.

**Comportement attendu :**
- La sauvegarde est bloquée immédiatement avec le message "Requête non autorisée : seules les requêtes SELECT sont acceptées"
- Aucune donnée n'est modifiée en base

---

### CE-KPI-003 — Requête SQL en timeout d'exécution

**Description :** La requête SQL d'un KPI dépasse le timeout d'exécution configuré (par défaut : 30s).

**Comportement attendu :**
- Le calcul du KPI est interrompu et marqué en erreur pour la période concernée
- Un message d'alerte est enregistré dans les logs d'audit
- Les résultats précédents (dernière période calculée avec succès) restent affichés avec une indication "dernière mise à jour : [date]"

---

### CE-KPI-004 — Configuration KPI avec champ manquant

**Description :** Un KPI référence un champ (estimation, temps consommé, etc.) qui n'est plus configuré dans le mapping client.

**Comportement attendu :**
- Le KPI est marqué `INVALIDE` automatiquement
- Une alerte de configuration est levée dans le tableau de bord Admin
- Le KPI invalide n'est pas recalculé jusqu'à correction de la configuration

---

### CE-KPI-005 — Statut "terminé" introuvable dans l'instance JIRA

**Description :** Un statut configuré comme "terminé" pour un client n'existe plus dans l'instance JIRA (workflow modifié côté JIRA).

**Comportement attendu :**
- Une alerte de configuration est levée : "Statut `[nom]` introuvable dans l'instance `[client]`"
- Les tickets dont le statut correspond à d'autres statuts configurés restent calculés normalement
- L'Admin doit mettre à jour la configuration des statuts

---

## 4. Données incomplètes ou incohérentes

### CE-DATA-001 — Ticket sans estimation initiale

**Description :** Un ticket terminé n'a pas d'estimation initiale (champ vide, null ou 0).

**Comportement attendu :**
- Le ticket est **exclu** du calcul du KPI "Respect des charges"
- Il est listé dans le détail du KPI avec la mention "Exclu — estimation manquante"
- Un compteur "tickets exclus" est affiché dans la vue détail pour permettre à l'utilisateur d'apprécier la représentativité du KPI

---

### CE-DATA-002 — Ticket sans assignee

**Description :** Un ticket terminé n'est assigné à aucun utilisateur JIRA.

**Comportement attendu :**
- Le ticket est importé en base
- Il n'est attribué à aucun collaborateur pour le calcul des KPI
- Il est visible dans les logs d'import sous la catégorie "tickets non attribués"

---

### CE-DATA-003 — Epic sans champ Chef de projet renseigné

**Description :** Un Epic n'a pas de valeur dans le champ personnalisé désignant le Chef de projet.

**Comportement attendu :**
- L'Epic est importée en base
- Elle n'est associée à aucun Chef de projet
- Elle n'apparaît dans aucune vue Chef de projet
- Elle est visible dans la vue Admin avec la mention "Epic sans CP assigné"

---

### CE-DATA-004 — Valeur du champ Chef de projet ne correspondant à aucun utilisateur connu

**Description :** Le champ JIRA de liaison Epic ↔ CP contient une valeur (email ou identifiant) qui ne correspond à aucun utilisateur enregistré dans l'application.

**Comportement attendu :**
- L'Epic est importée mais non rattachée à un Chef de projet
- Une alerte est levée dans les logs d'import : "Epic [clé] — valeur du champ CP `[valeur]` ne correspond à aucun utilisateur connu"
- L'Admin peut créer l'utilisateur manquant et déclencher un recalcul

---

### CE-DATA-005 — Worklog enregistré par un utilisateur inconnu de l'application

**Description :** Un worklog JIRA ou Tempo est enregistré par un compte JIRA qui n'existe pas dans l'application (utilisateur non synchronisé, compte de service, etc.).

**Comportement attendu :**
- Le worklog est importé en base avec la référence de l'identifiant JIRA
- Il n'est associé à aucun collaborateur de l'application
- Il est visible dans les logs d'import sous "worklogs non attribués"
- Ces worklogs ne sont pas pris en compte dans les KPI

---

### CE-DATA-006 — Ticket de retour sans lien vers un ticket principal

**Description :** Un ticket de type "retour interne" ou "retour client" n'a pas de lien JIRA vers un ticket principal.

**Comportement attendu :**
- Le ticket est importé en base
- Il n'est pas inclus dans le calcul du KPI "Qualité" (pas de ticket parent identifiable)
- Il est signalé dans les logs d'import : "Ticket de retour [clé] sans ticket parent lié"

---

## 5. Doublons et concurrence

### CE-DUP-001 — Import lancé deux fois simultanément pour le même client

**Description :** Deux imports (planifié + manuel, ou deux planifiés) se déclenchent en même temps pour le même client.

**Comportement attendu :**
- Un verrou (mutex) par client est acquis avant le démarrage de l'import
- Si le verrou est déjà pris, le second import est mis en file d'attente
- Une alerte est levée dans les logs : "Import en attente — un import est déjà en cours pour le client [X]"

---

### CE-DUP-002 — Ticket modifié entre deux imports (upsert)

**Description :** Un ticket déjà importé est modifié dans JIRA entre deux imports.

**Comportement attendu :**
- L'import suivant récupère le ticket modifié (champ `updated` JIRA >= date du dernier import)
- La mise à jour en base se fait par upsert (clé primaire = clé JIRA)
- Un historique des modifications est conservé dans une table d'audit si des champs critiques (estimation, statut) ont changé

---

### CE-DUP-003 — Backfill chevauchant des données déjà importées

**Description :** Un backfill est lancé sur une période partiellement ou totalement déjà importée.

**Comportement attendu :**
- L'upsert garantit l'absence de duplication (les enregistrements existants sont mis à jour, pas dupliqués)
- Les résultats KPI des périodes concernées sont recalculés après le backfill

---

## 6. Erreurs liées à l'authentification et aux droits

### CE-AUTH-001 — Utilisateur SSO non enregistré dans l'application

**Description :** Un utilisateur s'authentifie avec succès via Office 365 mais son compte n'existe pas dans l'application.

**Comportement attendu :**
- L'accès à l'application est refusé
- Un message clair est affiché : "Votre compte n'est pas enregistré dans l'application. Contactez votre administrateur."
- La tentative de connexion est tracée dans les logs d'audit (email, date, heure)

---

### CE-AUTH-002 — Tentative d'accès à une ressource non autorisée

**Description :** Un utilisateur tente d'accéder à une URL ou une donnée hors de son périmètre (ex. : un Développeur essaie d'accéder aux KPI d'un autre collaborateur).

**Comportement attendu :**
- Le backend retourne une erreur `403 Forbidden`
- Le frontend affiche un message générique : "Vous n'avez pas les droits nécessaires pour accéder à cette ressource."
- La tentative est tracée dans les logs d'audit

---

### CE-AUTH-003 — Token SSO expiré en cours de session

**Description :** Le token JWT Azure AD de l'utilisateur expire pendant sa session.

**Comportement attendu :**
- Le frontend détecte l'expiration du token (via le refresh token ou une réponse 401 du backend)
- Si un refresh token est disponible, le token est renouvelé silencieusement
- Si le renouvellement échoue, l'utilisateur est redirigé vers la page de connexion avec le message : "Votre session a expiré. Veuillez vous reconnecter."

---

### CE-AUTH-004 — Delivery Manager tente de modifier un rôle hors de son périmètre

**Description :** Un Delivery Manager soumet une modification de rôle pour un utilisateur n'appartenant pas à son périmètre.

**Comportement attendu :**
- Le backend retourne une erreur `403 Forbidden`
- L'action est tracée dans les logs d'audit

---

## 7. Stratégie générale de reprise sur incident

| Situation                             | Stratégie                                                                          |
|---------------------------------------|------------------------------------------------------------------------------------|
| API JIRA indisponible (temporaire)    | Retry avec backoff exponentiel (3 tentatives) → alerte Admin → reprise manuelle    |
| Token invalide (JIRA ou Tempo)        | Arrêt immédiat + alerte critique + désactivation automatique → action Admin requise |
| Rate limiting                         | Respect du `Retry-After` → backoff → reprise au prochain cycle                    |
| Import partiel (erreur en cours)      | Conservation des données importées + reprise depuis le dernier curseur             |
| Backfill interrompu                   | Mécanisme de reprise depuis le dernier curseur enregistré                          |
| Calcul KPI échoué (SQL timeout)       | Derniers résultats affichés + indicateur "données obsolètes" + alerte Admin        |
| Configuration invalide                | KPI marqué `INVALIDE` + non calculé + alerte Admin + affichage dashboard dégradé   |
| Concurrence d'imports                 | Mutex par client + file d'attente                                                  |
| Utilisateur non trouvé dans la base   | Accès refusé + message clair + log d'audit                                         |
