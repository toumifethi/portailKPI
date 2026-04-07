# Portail KPI Productivité — Guide Utilisateur

**DECADE — Usage interne**

---

## Sommaire

0. [Démarrage rapide — Premier client et premier import](#0-démarrage-rapide--premier-client-et-premier-import)
1. [Présentation générale](#1-présentation-générale)
2. [Connexion et accès](#2-connexion-et-accès)
3. [Navigation et en-tête](#3-navigation-et-en-tête)
4. [Tableau de bord KPI](#4-tableau-de-bord-kpi)
5. [Évolution KPI](#5-évolution-kpi)
6. [Vue cross-client](#6-vue-cross-client)
7. [Imports JIRA](#7-imports-jira)
8. [Administration — Utilisateurs](#8-administration--utilisateurs)
9. [Administration — Clients](#9-administration--clients)
10. [Administration — Configuration KPI](#10-administration--configuration-kpi)
11. [Rôles et droits d'accès](#11-rôles-et-droits-daccès)
12. [Comprendre les indicateurs RAG](#12-comprendre-les-indicateurs-rag)
13. [Questions fréquentes](#13-questions-fréquentes)

---

---

## 0. Démarrage rapide — Premier client et premier import

Ce chapitre guide un administrateur qui configure le portail pour la première fois, de la création du client jusqu'à l'affichage des premiers KPI.

**Durée estimée :** 15 à 30 minutes selon l'accessibilité de votre instance JIRA.

**Rôle requis :** Administrateur

---

### Étape 0 — Prérequis : récupérer le token API JIRA

Le portail se connecte à JIRA Cloud via un token API personnel. Ce token doit appartenir à un compte JIRA ayant accès en lecture à tous les projets à synchroniser.

**Comment créer un token API JIRA :**

1. Connectez-vous à **https://id.atlassian.com/manage-profile/security/api-tokens**
2. Cliquez sur **Create API token**
3. Donnez-lui un nom reconnaissable (ex : `PortailKPI-DECADE`)
4. Copiez le token généré — **il n'est affiché qu'une seule fois**

Conservez également :
- L'**URL de votre instance JIRA** : `https://votre-entreprise.atlassian.net`
- L'**email du compte** associé au token : `prenom.nom@decade.fr`

> **Bonne pratique :** Créez un compte JIRA dédié (ex. `portailkpi@decade.fr`) plutôt qu'un compte nominatif. Si le collaborateur quitte l'entreprise, le portail continuera à fonctionner.

---

### Étape 1 — Créer le client dans le portail

Un **client** dans le portail représente une instance JIRA (= un client DECADE ou une entité organisationnelle distincte).

1. Allez dans **Admin → Clients**
2. Cliquez sur le bouton **+ Nouveau** en haut du panneau gauche
3. Un assistant en 3 étapes s'ouvre :

**Étape 1/3 — Informations générales**
Saisissez le nom du client (ex. : "ACME Corp"). Cliquez sur **Suivant →**.

**Étape 2/3 — Connexion JIRA**
Renseignez les trois champs :

| Champ | Exemple |
|---|---|
| URL de l'instance JIRA | `https://monentreprise.atlassian.net` |
| Email du compte JIRA | `portailkpi@monentreprise.fr` |
| Token API JIRA | `ATATT3x…` (copié depuis Atlassian) |

Cliquez sur **Tester la connexion** — l'assistant vérifie immédiatement que les credentials sont valides.

**Étape 3/3 — Confirmation**
- Si le test est **vert** ✓ : cliquez sur **✓ Créer le client**
- Si le test est **rouge** ✗ : cliquez sur **← Modifier** pour corriger, ou **Retester** après correction

Le client apparaît immédiatement dans la liste et est sélectionnable dans l'en-tête.

---

### Étape 2 — Vérifier la connexion JIRA (optionnel)

Vous pouvez retester la connexion à tout moment depuis la fiche client :

1. Cliquez sur le client dans le panneau gauche
2. Cliquez sur **Tester la connexion**

Si vous obtenez une erreur, vérifiez :
- Que l'URL JIRA est correcte (pas de `/` en fin d'URL)
- Que l'email correspond bien au propriétaire du token
- Que le token n'a pas expiré ou été révoqué dans Atlassian

---

### Étape 3 — Sélectionner les projets JIRA à synchroniser

1. Allez dans **Imports JIRA**
2. Dans le panneau gauche, section **Projets JIRA**, cliquez sur **+ Ajouter un projet**
3. Le portail interroge JIRA et affiche les projets accessibles
4. Sélectionnez le projet, renseignez une date de début d'historique (ex. `2024-01-01`), cliquez **Ajouter**
5. Répétez pour chaque projet à inclure

> **Conseil :** Commencez avec une date d'historique récente (ex. 6 mois) pour valider le fonctionnement. Vous pourrez élargir ensuite. Plus l'historique est long, plus le premier import sera long.

---

### Étape 3bis — Importer les utilisateurs JIRA

1. Dans **Imports JIRA**, section **Membres JIRA → Utilisateurs**
2. Cliquez sur **↓ Synchroniser les membres**
3. Les comptes JIRA sont créés comme utilisateurs du portail avec le rôle Lecteur
4. Allez dans **Admin → Utilisateurs** pour élever les rôles si nécessaire
5. Mettez à jour `DEV_USER_EMAIL` dans `docker-compose.dev.yml` avec votre email réel

---

### Étape 5 — Configurer les KPI

Les 4 KPI standards sont déjà disponibles dans le catalogue. Il suffit de les activer pour le client et d'ajuster les statuts JIRA de votre workflow.

Chaque client JIRA utilise ses propres noms de statuts (ex. "En cours", "In Progress", "En développement"). Le portail doit savoir lesquels correspondent à chaque état.

**Configuration minimale par KPI :**

| KPI | Paramètre clé | Valeur typique |
|---|---|---|
| Ratio Estimé/Consommé | `done_statuses` | `["Done", "Terminé", "Closed"]` |
| Taux de Retours | `done_statuses`, `return_label` | `["Done"]`, `"RETOUR"` |
| Tickets sans Estimation | `in_progress_statuses` | `["En cours", "In Progress"]` |
| Tickets avec IA | `ai_field_id` | ID du champ JIRA personnalisé |

**Via l'API :**

```bash
# Activer un KPI pour le client (remplacer {kpiDefinitionId} par l'ID du KPI)
curl -X POST http://localhost:3000/api/kpi/configs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-bypass-token" \
  -d '{
    "clientId": {id},
    "kpiDefinitionId": 1,
    "configOverride": {
      "done_statuses": ["Done", "Terminé", "Closed"]
    }
  }'
```

Pour connaître les ID des KPI disponibles :
```bash
curl http://localhost:3000/api/kpi/definitions \
  -H "Authorization: Bearer dev-bypass-token"
```

---

### Étape 6 — Configurer les seuils d'alerte (optionnel)

Définissez à partir de quelles valeurs un KPI passe en orange ou rouge :

1. Allez dans **Admin → Config KPI**
2. Sélectionnez le client dans l'en-tête
3. Cliquez sur **Configurer les seuils** sur chaque KPI
4. Renseignez les seuils et enregistrez

**Valeurs de départ suggérées :**

| KPI | Seuil Orange | Seuil Rouge |
|---|---|---|
| Ratio Estimé/Consommé | 85% | 70% |
| Taux de Retours | 15% | 25% |
| Tickets sans Estimation | 3 tickets | 8 tickets |
| Tickets avec IA | 20% | 10% |

Ces valeurs sont indicatives — ajustez-les selon les objectifs de votre équipe.

---

### Étape 7 — Déclencher le premier import

Le premier import récupère l'intégralité de l'historique depuis la `importFromDate` définie à l'étape 4.

1. Sélectionnez le client dans l'en-tête
2. Allez dans **Imports JIRA**
3. Cliquez sur **▶ Déclencher un import**
4. Attendez que le statut passe à `COMPLETED`

La durée varie selon le volume de données :
- Quelques centaines de tickets : **1 à 5 minutes**
- Plusieurs milliers de tickets + worklogs : **10 à 30 minutes**

La page se rafraîchit automatiquement toutes les 10 secondes. Vous pouvez fermer l'onglet et revenir plus tard.

**En cas d'erreur (`FAILED`) :**
- Vérifiez que la connexion JIRA est toujours valide (test connexion)
- Consultez le nombre d'erreurs — s'il est > 0 mais le statut est `COMPLETED`, l'import a réussi partiellement (non-bloquant)
- Contactez un administrateur technique si le statut est `FAILED`

---

### Étape 8 — Vérifier le tableau de bord

Après la fin de l'import :

1. Sélectionnez votre client dans l'en-tête
2. Choisissez une période (ex. le mois en cours)
3. Allez dans **Tableau de bord**

Vous devriez voir les cartes KPI avec leurs valeurs. Si une carte affiche `—` (tiret), cela signifie qu'il n'y a pas de données pour ce KPI sur cette période — vérifiez que des tickets existent avec les statuts configurés.

---

### Récapitulatif des étapes

```
[0]    Token API JIRA            → Atlassian (id.atlassian.com)
[1]    Créer le client           → Admin → Clients → + Nouveau (assistant 3 étapes)
[2]    Vérifier la connexion     → Admin → Clients → Tester la connexion
[3]    Sélectionner projets      → Imports JIRA → Panneau gauche → + Ajouter un projet
[3bis] Importer les utilisateurs → Imports JIRA → Synchroniser les membres
[4]    Activer les KPI           → API POST /api/kpi/configs
[5]    Seuils d'alerte           → Admin → Config KPI → Configurer les seuils
[6]    Premier import            → Imports JIRA → Déclencher
[7]    Vérifier                  → Tableau de bord
```

---

## 1. Présentation générale

Le **Portail KPI Productivité** est l'outil interne de DECADE permettant de mesurer et suivre la performance des équipes de développement à partir des données JIRA.

Il centralise quatre indicateurs clés de performance (KPI) :

| KPI | Description |
|---|---|
| **Ratio Estimé/Consommé** | Écart entre le temps estimé et le temps réellement passé sur les tickets |
| **Taux de Retours** | Part du temps consacré aux tickets de retour (bugs, corrections) |
| **Tickets sans Estimation** | Nombre de tickets en cours qui n'ont pas d'estimation de charge |
| **Tickets développés avec IA** | Pourcentage de tickets réalisés avec assistance d'un outil IA |

Les données sont importées depuis JIRA Cloud et peuvent être visualisées par client, par période, et comparées entre plusieurs clients.

---

## 2. Connexion et accès

### Accès standard (production)
L'application utilise l'authentification **Azure Active Directory** de DECADE. Aucun mot de passe supplémentaire n'est nécessaire — connectez-vous avec votre compte Microsoft habituel (`prenom.nom@decade.fr`).

À la première connexion, votre compte est créé automatiquement avec le rôle **Lecteur**. Un administrateur doit ensuite élever votre rôle si nécessaire.

### Accès développement local
En environnement de développement, vous êtes automatiquement connecté en tant que **Dev Admin**. Un badge jaune **DEV** s'affiche dans l'en-tête pour l'indiquer.

---

## 3. Navigation et en-tête

L'en-tête en haut de page contient les contrôles globaux qui affectent toutes les vues :

```
┌─────────────────────────────────────────────────────────────────────┐
│  [Sélecteur client ▼]   [Période ▼]          DEV  Dev Admin  Déconnexion │
└─────────────────────────────────────────────────────────────────────┘
```

### Sélecteur de client
Toutes les pages (sauf Vue cross-client) affichent les données du **client sélectionné**. Commencez toujours par choisir un client dans cette liste déroulante.

> Si la liste est vide, contactez un administrateur — aucun client n'est encore configuré ou vous n'avez pas les droits d'accès.

### Sélecteur de période
Filtre la période d'analyse (mois, trimestre, etc.). La sélection s'applique au tableau de bord et à l'export.

### Menu de navigation (barre latérale gauche)

| Entrée | Accès |
|---|---|
| Tableau de bord | Tous les rôles |
| Évolution KPI | Tous les rôles |
| Vue cross-client | DM, Admin |
| Imports JIRA | Manager, DM, Admin |
| Admin > Utilisateurs | Admin uniquement |
| Admin > Clients | Admin uniquement |
| Admin > Config KPI | Admin uniquement |

---

## 4. Tableau de bord KPI

**Chemin :** Menu → Tableau de bord

C'est la vue principale. Elle affiche les résultats de tous les KPI configurés pour le client sélectionné sur la période choisie.

### Cartes KPI

Chaque KPI est représenté par une carte colorée :

```
┌──────────────────────────────┐
│ Ratio Estimé/Consommé   🟢  │  ← badge RAG (vert / orange / rouge)
│                              │
│         87.3%                │  ← valeur du KPI
│                              │
│ 24 tickets (2 exclus)        │  ← volume analysé
└──────────────────────────────┘
```

La **couleur de bordure supérieure** et le **badge RAG** indiquent si le KPI est dans la cible :
- **Vert** : performance satisfaisante (au-dessus du seuil vert)
- **Orange** : attention requise (entre seuil orange et vert)
- **Rouge** : alerte critique (en-dessous du seuil rouge)
- **Gris** : aucun seuil configuré

Les tickets exclus (affichés entre parenthèses) sont ceux écartés du calcul pour des raisons techniques (estimation manquante, champ non renseigné, etc.).

### Export

Le bouton **Exporter** en haut à droite génère un fichier CSV de tous les KPI affichés, utilisable dans Excel.

---

## 5. Évolution KPI

**Chemin :** Menu → Évolution KPI

Cette vue affiche l'évolution d'un KPI dans le temps sous forme de **graphique en courbe**.

### Utilisation

1. Sélectionnez un client dans l'en-tête
2. Choisissez le KPI à analyser dans le sélecteur de la page
3. Le graphique affiche les 12 derniers mois (ou la période disponible)

Le graphique relie automatiquement les points même si certaines périodes n'ont pas de données (`spanGaps`).

### Lecture du graphique

- L'axe horizontal représente les périodes (mois)
- L'axe vertical représente la valeur du KPI
- Survolez un point pour voir la valeur exacte et la période

---

## 6. Vue cross-client

**Chemin :** Menu → Vue cross-client

**Disponible pour :** Delivery Manager, Administrateur

Cette vue permet de **comparer un KPI sur plusieurs clients simultanément** — utile pour identifier les clients en difficulté ou les bonnes pratiques à généraliser.

### Utilisation

1. Sélectionnez un KPI dans le sélecteur en haut
2. Le graphique affiche automatiquement une courbe par client, chacune dans une couleur différente
3. Cliquez sur un **bouton client** pour l'afficher ou le masquer

### Boutons de filtre clients

```
[● Client A]  [○ Client B]  [● Client C]
   affiché       masqué        affiché
```

Les boutons pleins = client visible. Les boutons vides = client masqué.

---

## 7. Imports JIRA

**Chemin :** Menu → Imports JIRA

**Disponible pour :** Manager, DM, Administrateur

Cette page est organisée en deux panneaux : configuration à gauche, historique à droite.

### Panneau gauche — Configuration

#### Projets JIRA
Liste les projets JIRA associés au client. Pour chaque projet vous voyez la clé, le nom et la date de début d'historique.

**Ajouter un projet :**
1. Cliquez sur **+ Ajouter un projet**
2. Le portail interroge JIRA et affiche la liste des projets accessibles
3. Cliquez sur un projet pour le sélectionner
4. Renseignez optionnellement une **date de début** (les tickets antérieurs ne seront pas importés)
5. Cliquez sur **Ajouter**

**Supprimer un projet :** cliquez sur **×** à droite du projet — il ne sera plus synchronisé (données existantes conservées).

#### Filtre JQL (optionnel)
Saisissez une requête JQL pour restreindre les tickets importés.

Exemples :
```
project = MYPROJ AND updated >= -90d
issuetype in (Story, Bug) AND status != Cancelled
```

Laissez vide pour importer tous les tickets des projets configurés.

#### Membres JIRA → Utilisateurs
Cliquez sur **↓ Synchroniser les membres** pour importer les assignees JIRA comme utilisateurs du portail.

- Les nouveaux utilisateurs reçoivent automatiquement le rôle **Lecteur**
- Les utilisateurs déjà existants sont mis à jour (jiraAccountId)
- Un administrateur peut ensuite élever leur rôle dans **Admin → Utilisateurs**

> C'est cette action qui permet de passer en **Phase 2** du mode dev : renseignez ensuite `DEV_USER_EMAIL` dans `docker-compose.dev.yml` avec votre vrai email pour utiliser vos vrais droits.

### Panneau droit — Historique

Tableau des imports passés avec polling automatique toutes les 10 secondes.

| Colonne | Description |
|---|---|
| **#** | Identifiant de l'import |
| **Déclenchement** | USER (manuel) ou SCHEDULER (planifié) |
| **Statut** | PENDING → IN_PROGRESS → COMPLETED / FAILED |
| **Issues** | Tickets JIRA synchronisés |
| **Worklogs** | Entrées de temps synchronisées |
| **Erreurs** | Erreurs non-bloquantes (rouge si > 0) |

### Déclencher un import
Cliquez sur **▶ Déclencher un import** — le filtre JQL saisi est transmis à l'import.

---

## 8. Administration — Utilisateurs

**Chemin :** Menu → Admin → Utilisateurs

**Disponible pour :** Administrateur uniquement

### Liste des utilisateurs

Le tableau affiche tous les comptes enregistrés avec :
- Email et nom d'affichage
- Rôle actuel (badge bleu)
- Statut (ACTIF, ARCHIVE, etc.)
- Date de dernière connexion

### Modifier le rôle d'un utilisateur

1. Cliquez sur **Modifier** sur la ligne de l'utilisateur
2. Dans la fenêtre, sélectionnez le nouveau rôle
3. Cliquez sur **Enregistrer**

Le changement est immédiat — l'utilisateur verra ses accès mis à jour à sa prochaine action.

### Rôles disponibles

| Rôle | Libellé |
|---|---|
| `ADMIN` | Administrateur |
| `DM` | Delivery Manager |
| `MANAGER` | Manager |
| `VIEWER` | Lecteur |

Voir la section [Rôles et droits](#11-rôles-et-droits-daccès) pour le détail des accès.

---

## 9. Administration — Clients

**Chemin :** Menu → Admin → Clients

**Disponible pour :** Administrateur uniquement

### Liste des clients

Le panneau gauche liste tous les clients. Cliquez sur un client pour afficher sa fiche de configuration dans le panneau droit.

### Fiche client

La fiche affiche :
- Identifiant, statut et date de création
- Bouton **Tester la connexion** : vérifie que les credentials JIRA sont valides et que l'API est joignable
- Bouton **Archiver** : désactive le client (voir ci-dessous)

### Tester la connexion JIRA

Cliquez sur **Tester la connexion**. Une bannière s'affiche :
- **Vert** ✓ : la connexion JIRA est opérationnelle
- **Rouge** ✗ : erreur avec le message d'erreur JIRA

### Archiver un client

L'archivage d'un client :
- Masque le client du sélecteur de l'en-tête
- Désactive tous les imports planifiés
- Conserve l'historique des KPI (données non supprimées)

Pour archiver :
1. Cliquez sur **Archiver**
2. Saisissez un motif (optionnel mais recommandé)
3. Confirmez en cliquant sur **Confirmer l'archivage**

> L'archivage est réversible — contactez un administrateur technique pour réactiver un client.

---

## 10. Administration — Configuration KPI

**Chemin :** Menu → Admin → Config KPI

**Disponible pour :** Administrateur uniquement

### Vue d'ensemble

Cette page liste tous les KPI configurés pour le client sélectionné. Chaque carte affiche :
- Nom du KPI et version de formule (`v1.0`)
- Statut **Actif** / **Inactif**
- Seuils d'alerte actuels (badges orange et rouge)
- Indicateur ⚡ si une **formule personnalisée** (formula_override) est active

### Configurer les seuils d'alerte

Les seuils RAG déterminent quand un KPI passe en orange ou en rouge sur le tableau de bord.

1. Cliquez sur **Configurer les seuils** sur la carte du KPI souhaité
2. Renseignez les valeurs :
   - **Seuil Rouge** : en-dessous de cette valeur, le KPI est en alerte critique
   - **Seuil Orange** : en-dessous de cette valeur (et au-dessus du rouge), le KPI est en vigilance
3. Cliquez sur **Enregistrer**

**Exemple pour le Ratio Estimé/Consommé :**
```
Seuil Rouge  = 70   → KPI rouge si valeur < 70%
Seuil Orange = 85   → KPI orange si valeur < 85%
               (vert si valeur ≥ 85%)
```

Laissez un champ vide pour désactiver le seuil correspondant.

---

## 11. Rôles et droits d'accès

| Fonctionnalité | Lecteur | Manager | DM | Admin |
|---|:---:|:---:|:---:|:---:|
| Tableau de bord | ✓ | ✓ | ✓ | ✓ |
| Évolution KPI | ✓ | ✓ | ✓ | ✓ |
| Export CSV | ✓ | ✓ | ✓ | ✓ |
| Vue cross-client | — | — | ✓ | ✓ |
| Imports JIRA (lecture) | — | ✓ | ✓ | ✓ |
| Déclencher un import | — | ✓ | ✓ | ✓ |
| Gestion utilisateurs | — | — | — | ✓ |
| Gestion clients | — | — | — | ✓ |
| Configuration KPI | — | — | — | ✓ |

---

## 12. Comprendre les indicateurs RAG

**RAG** = Red / Amber (Orange) / Green

Chaque KPI est évalué par rapport aux seuils configurés et affiche un badge de couleur :

| Badge | Couleur | Signification |
|---|---|---|
| 🟢 GREEN | Vert | KPI dans la cible |
| 🟠 ORANGE | Orange | Attention — surveiller |
| 🔴 RED | Rouge | Alerte critique — action requise |
| ⚫ — | Gris | Aucun seuil configuré |

### Logique de calcul

```
Valeur ≥ Seuil Orange   →  🟢 VERT
Seuil Rouge ≤ Valeur < Seuil Orange   →  🟠 ORANGE
Valeur < Seuil Rouge   →  🔴 ROUGE
```

Si aucun seuil n'est défini, le badge reste neutre (gris).

---

## 13. Questions fréquentes

**Le tableau de bord affiche "Aucun résultat KPI pour cette période"**
→ Les données n'ont pas encore été importées pour cette période. Allez dans **Imports JIRA** et déclenchez un import.

**Mon client n'apparaît pas dans la liste déroulante**
→ Soit le client n'est pas encore créé, soit il est archivé, soit vous n'avez pas les droits d'accès. Contactez un administrateur.

**Le KPI "Tickets sans Estimation" affiche un nombre élevé**
→ Cela signifie qu'il y a des tickets en cours sans estimation de charge dans JIRA. L'équipe concernée doit renseigner les estimations sur ces tickets.

**Je vois ⚡ formula_override actif sur un KPI**
→ Une formule SQL personnalisée remplace le calcul standard pour ce KPI sur ce client. Contactez votre administrateur pour plus de détails.

**Les données semblent obsolètes**
→ Déclenchez un import manuel depuis la page **Imports JIRA**. Si les données restent incorrectes après l'import, vérifiez les erreurs dans le tableau d'historique.

**Je ne peux pas accéder à la vue cross-client**
→ Cette vue est réservée aux rôles DM (Delivery Manager) et Administrateur. Contactez un administrateur pour demander une élévation de rôle.

**Comment savoir quelle version de formule est utilisée pour un KPI ?**
→ Dans **Admin → Config KPI**, chaque carte affiche la version (`v1.0`, `v1.1`, etc.) sous le nom du KPI. La version est également enregistrée dans chaque résultat pour assurer la traçabilité.
