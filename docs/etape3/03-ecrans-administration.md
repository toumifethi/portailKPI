# Écrans d'administration — Portail KPI Productivité

> **Version** : 1.2
> **Étape** : 3 — UX / Maquettes
> **Statut** : À valider

---

## Sommaire

1. [Tableau de bord de santé système](#1-tableau-de-bord-de-santé-système)
2. [Gestion des utilisateurs](#2-gestion-des-utilisateurs)
3. [Fiche utilisateur](#3-fiche-utilisateur)
4. [Gestion des instances JIRA (clients)](#4-gestion-des-instances-jira--clients)
5. [Configuration d'un client JIRA](#5-configuration-dun-client-jira)
6. [Catalogue des KPI](#6-catalogue-des-kpi)
7. [Configuration d'un KPI pour un client](#7-configuration-dun-kpi-pour-un-client)
8. [Suivi des imports](#8-suivi-des-imports)
9. [Détail d'un job d'import](#9-détail-dun-job-dimport)

---

## 1. Tableau de bord de santé système

**Accessible à :** Admin uniquement
**Route :** `/admin/health`

```
┌──────────────────────────────────────────────────────────────────────┐
│ [≡ Logo]  Administration > Santé système          [🔔2] [👤 Admin ▾] │
├────────────┬─────────────────────────────────────────────────────────┤
│ ⚙️ Admin   │  Santé système            Dernière actualisation: 14:32  │
│  ─────────  │  ─────────────────────────────────────────────────────  │
│  👥 Utilisat│                                                          │
│  🏢 Clients │  ALERTES ACTIVES (2)                                     │
│  📊 KPI     │  ┌─────────────────────────────────────────────────┐   │
│  📥 Imports │  │ ❌ CRITIQUE  Client C — Token JIRA invalide      │   │
│  🩺 Santé ◀ │  │             Depuis le 14/01 à 02h08   [Corriger]│   │
│            │  │                                                  │   │
│            │  │ ⚠️ AVERTIS.  Client B — 14 tickets sans estim.  │   │
│            │  │             Import du 14/01           [Voir]     │   │
│            │  └─────────────────────────────────────────────────┘   │
│            │                                                          │
│            │  ÉTAT DES IMPORTS PAR CLIENT                             │
│            │  ┌──────────────────────────────────────────────────┐  │
│            │  │ Client    │ Dernier import  │ Statut  │ Prochain  │  │
│            │  │───────────│─────────────────│─────────│───────────│  │
│            │  │ Client A  │ 15/01 – 02h14   │ ✅ OK   │ 16/01 02h │  │
│            │  │ Client B  │ 14/01 – 02h08   │ ⚠️ Err  │ 15/01 02h │  │
│            │  │ Client C  │ 13/01 – 02h05   │ ❌ Échec│ Manuel   │  │
│            │  │ Client D  │ 15/01 – 02h22   │ ✅ OK   │ 16/01 02h │  │
│            │  │ ...       │                 │         │           │  │
│            │  └──────────────────────────────────────────────────┘  │
│            │                                   [Déclencher un import] │
│            │                                                          │
│            │  COLLABORATEURS SANS SAISIE  (> 3 jours)   [Configurer] │
│            │  ┌──────────────────────────────────────────────────┐  │
│            │  │ 7 collaborateurs sans saisie             [Voir →] │  │
│            │  └──────────────────────────────────────────────────┘  │
│            │                                                          │
│            │  KPI AVEC DONNÉES OBSOLÈTES                             │
│            │  ┌──────────────────────────────────────────────────┐  │
│            │  │ Client A — Respect des charges   Config modifiée │  │
│            │  │ Recalcul en attente              [Forcer recalcul]│  │
│            │  └──────────────────────────────────────────────────┘  │
└────────────┴─────────────────────────────────────────────────────────┘
```

---

## 2. Gestion des utilisateurs

**Accessible à :** Admin uniquement
**Route :** `/admin/users`

```
┌──────────────────────────────────────────────────────────────────────┐
│ [≡ Logo]  Administration > Utilisateurs           [🔔] [👤 Admin ▾]  │
├────────────┬─────────────────────────────────────────────────────────┤
│ ⚙️ Admin   │  Utilisateurs                   [+ Ajouter un utilisateur]│
│  ─────────  │  ─────────────────────────────────────────────────────  │
│  👥 Utilisat◀                                                         │
│  🏢 Clients │  Rechercher...   [Rôle ▾]  [Statut ▾]  [Client ▾]      │
│  📊 KPI     │  □ Afficher les utilisateurs archivés                   │
│  📥 Imports │  ─────────────────────────────────────────────────────  │
│  🩺 Santé   │  ┌──────────────────────────────────────────────────┐  │
│            │  │ □  Nom ↕          │ Rôle      │ Statut  │ Clients│  │
│            │  │────────────────────│───────────│─────────│────────│  │
│            │  │ □  Jean DUPONT    │ Développeur│ ✅ Actif│ A, B   │  │
│            │  │ □  Sophie MARTIN  │ Développeur│ ✅ Actif│ A      │  │
│            │  │ □  Marie LEROY    │ Chef projet│ ✅ Actif│ A, C   │  │
│            │  │ □  Lucas BERNARD  │ Développeur│ ⚠️ Sans │ B      │  │
│            │  │                   │           │  saisie │        │  │
│            │  │ □  Paul RICHARD   │ Développeur│ ⚠️ Sans │ A      │  │
│            │  │                   │           │  saisie │        │  │
│            │  │ □  Ahmed KARIM    │ DM         │ ✅ Actif│ A,B,C,D│  │
│            │  │ □  Claire BOUT.   │ Manuel     │ ✅ Actif│ B      │  │
│            │  └──────────────────────────────────────────────────┘  │
│            │  5 sélectionnés  [Modifier rôle ▾]  [Archiver]          │
│            │  Affichage 1–7 sur 142          [ < 1 2 3 ... 21 > ]    │
└────────────┴─────────────────────────────────────────────────────────┘
```

**Interactions :**
- Sélection multiple → actions groupées (modifier rôle, archiver)
- Filtres combinables : rôle + statut + client
- Clic sur un nom → fiche utilisateur
- Statut "⚠️ Sans saisie" en fond jaune pâle

---

## 3. Fiche utilisateur

**Accessible à :** Admin (toutes fiches), Delivery Manager (membres de son périmètre)
**Route :** `/admin/users/:userId`

```
┌──────────────────────────────────────────────────────────────────────┐
│ [≡ Logo]  Administration > Utilisateurs > Jean DUPONT  [🔔] [👤 ▾]  │
├────────────┬─────────────────────────────────────────────────────────┤
│ ⚙️ Admin   │  ← Retour à la liste                                     │
│            │                                                          │
│            │  ┌─────────────────────────────────────────────────┐   │
│            │  │  👤  Jean DUPONT                [Archiver]       │   │
│            │  │      jean.dupont@decade.fr                       │   │
│            │  │      Compte JIRA : jdupont@clientA.net           │   │
│            │  │      Statut : ✅ Actif                           │   │
│            │  │      Dernière saisie JIRA : 15/01/2025           │   │
│            │  └─────────────────────────────────────────────────┘   │
│            │                                                          │
│            │  RÔLE APPLICATIF                                         │
│            │  ┌─────────────────────────────────────────────────┐   │
│            │  │  Rôle actuel :  [Développeur          ▾]        │   │
│            │  │                              [Enregistrer]       │   │
│            │  └─────────────────────────────────────────────────┘   │
│            │                                                          │
│            │  ÉQUIPES & CLIENTS                                       │
│            │  ┌─────────────────────────────────────────────────┐   │
│            │  │ Équipe          │ Client    │ Source │ Statut    │   │
│            │  │─────────────────│───────────│────────│───────────│   │
│            │  │ ALPHA           │ Client A  │ JIRA   │ ✅ Actif  │   │
│            │  │ PROJET BETA     │ Client B  │ JIRA   │ ✅ Actif  │   │
│            │  │ SUPPORT         │ Client A  │ Manuel │ ✅ Actif  │   │
│            │  └─────────────────────────────────────────────────┘   │
│            │                     [+ Ajouter à une équipe]            │
│            │                                                          │
│            │  JOURNAL D'AUDIT (modifications récentes)               │
│            │  ┌─────────────────────────────────────────────────┐   │
│            │  │ 15/01 14:12  Rôle modifié : Dev → CP  par Admin  │   │
│            │  │ 10/01 09:33  Ajouté à équipe SUPPORT  par Admin  │   │
│            │  └─────────────────────────────────────────────────┘   │
└────────────┴─────────────────────────────────────────────────────────┘
```

---

## 4. Gestion des instances JIRA (clients)

**Accessible à :** Admin uniquement
**Route :** `/admin/clients`

```
┌──────────────────────────────────────────────────────────────────────┐
│ [≡ Logo]  Administration > Clients JIRA           [🔔] [👤 Admin ▾]  │
├────────────┬─────────────────────────────────────────────────────────┤
│ ⚙️ Admin   │  Clients JIRA                  [+ Ajouter une instance]  │
│            │  ─────────────────────────────────────────────────────  │
│  👥 Utilisat│  ┌──────────────────────────────────────────────────┐  │
│  🏢 Clients ◀  │ Nom       │ URL JIRA             │ Tempo │ Statut │  │
│  📊 KPI     │  │───────────│──────────────────────│───────│────────│  │
│  📥 Imports │  │ Client A  │ aclient.atlassian.net│ ✅    │ ✅ Actif│  │
│  🩺 Santé   │  │ Client B  │ bclient.atlassian.net│ ❌    │ ✅ Actif│  │
│            │  │ Client C  │ cclient.atlassian.net│ ✅    │ ❌ Inact│  │
│            │  │ Client D  │ dclient.atlassian.net│ ❌    │ ✅ Actif│  │
│            │  └──────────────────────────────────────────────────┘  │
│            │                                                          │
│            │  Cliquez sur un client pour le configurer.              │
└────────────┴─────────────────────────────────────────────────────────┘
```

---

## 5. Configuration d'un client JIRA

**Accessible à :** Admin uniquement
**Route :** `/admin/clients/:clientId`

```
┌──────────────────────────────────────────────────────────────────────┐
│ [≡ Logo]  Admin > Clients > Client A                [🔔] [👤 Admin ▾]│
├────────────┬─────────────────────────────────────────────────────────┤
│            │  ← Retour     Configuration — Client A                  │
│            │                                                          │
│            │  [Connexion JIRA]  [Mapping des champs]  [Projets]       │
│            │  [KPI actifs]      [Import]                               │
│            │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│            │                                                          │
│            │  ONGLET 1 — CONNEXION JIRA                               │
│            │  ┌─────────────────────────────────────────────────┐   │
│            │  │ Nom du client          [Client A              ]  │   │
│            │  │ URL JIRA Cloud         [https://aclient.atl...]  │   │
│            │  │ Email de service       [service@decade.fr     ]  │   │
│            │  │ API Token JIRA         [••••••••••••  Modifier]  │   │
│            │  │                                                  │   │
│            │  │ Intégration Tempo      [●──] Activé             │   │
│            │  │ API Token Tempo        [••••••••••••  Modifier]  │   │
│            │  │                                                  │   │
│            │  │              [Tester la connexion]  [Enregistrer]│   │
│            │  └─────────────────────────────────────────────────┘   │
│            │  ✅ Connexion JIRA OK — Testée le 15/01 à 14h30         │
│            │                                                          │
│            │  ONGLET 2 — MAPPING DES CHAMPS                          │
│            │  ┌─────────────────────────────────────────────────┐   │
│            │  │ Champ "Estimation initiale"                       │   │
│            │  │   [timeoriginalestimate — Original Estimate   ▾] │   │
│            │  │                                                  │   │
│            │  │ Unité d'estimation       ● Heures  ○ Story Points│   │
│            │  │ Si Story Points :                                │   │
│            │  │   1 SP =  [─────]  heures                       │   │
│            │  │                                                  │   │
│            │  │ Niveau de regroupement CP                         │   │
│            │  │   [Epic                                       ▾] │   │
│            │  │                                                  │   │
│            │  │ Champ JIRA "Chef de projet sur Epic"             │   │
│            │  │   [customfield_10040 — CP Owner               ▾] │   │
│            │  │                                                  │   │
│            │  │ Type retour interne      [Issue Type unique   ▾] │   │
│            │  │ Type retour client       [Issue Type unique   ▾] │   │
│            │  │  (options chargées depuis la connexion JIRA)    │   │
│            │  │                                                  │   │
│            │  │              [Recharger les champs]  [Enregistrer]│   │
│            │  └─────────────────────────────────────────────────┘   │
│            │                                                          │
│            │  ONGLET 3 — PROJETS (ÉQUIPES)                           │
│            │  ┌─────────────────────────────────────────────────┐   │
│            │  │ [+ Ajouter un projet]   [↻ Synchroniser depuis JIRA]│   │
│            │  │                                                  │   │
│            │  │ Clé     │ Nom           │ Type      │ Statut    │   │
│            │  │─────────│───────────────│───────────│───────────│   │
│            │  │ ALPHA   │ Projet Alpha  │ [Classic▾]│ ✅ Actif  │   │
│            │  │ BETA    │ Projet Beta   │ [NextGen▾]│ ✅ Actif  │   │
│            │  │ SUPPORT │ Support TMA   │ [Classic▾]│ ✅ Actif  │   │
│            │  └─────────────────────────────────────────────────┘   │
└────────────┴─────────────────────────────────────────────────────────┘
```

**Comportement UX attendu (création et édition client) :**
- `Type retour interne` et `Type retour client` sont des sélecteurs à choix unique.
- Les options sont alimentées dynamiquement par l'union des types d'issues autorisés sur les projets Jira actifs du client.
- Un bouton `Rafraichir les types Jira` permet de forcer la mise à jour immédiate de la liste sans recharger la page.
- Si la connexion JIRA est changée alors qu'un type retour est déjà choisi, une confirmation est demandée avant réinitialisation des sélections.
- Si aucun projet n'est encore associé au client, les sélecteurs sont désactivés avec un message d'incitation à ajouter d'abord un projet Jira.
- Le mécanisme UI de `Sync utilisateurs Jira` est retire temporairement (rollback technique du 27/03/2026).
- Chaque ligne indique clairement si le compte est déjà présent en base (`deja en BDD`).
- Un bouton `Exclure` par utilisateur alimente la table d'exclusion par connexion pour ne plus reproposer ce compte dans l'écran de sélection.
- La synchronisation applique un upsert sur `jira_users` et affiche un récapitulatif (créés/mis à jour/ignorés).

**Comportement UX attendu (éditeur de formule KPI) :**
- En définition globale, la sélection de connexion JIRA est partagée entre `Périmètre` et `Filtres` pour éviter qu'une formule mélange des statuts de transition issus d'une instance et des champs custom issus d'une autre.
- Pour la règle `Transitionees vers un statut cible`, si aucune connexion JIRA n'est choisie, l'éditeur affiche les statuts configurés dans l'App Setting `kpi.formula.statusInPeriod.globalFallbackStatuses`.
- Pour la règle `Transitionees vers un statut cible`, l'éditeur expose `Fenetre glissante (mois)` (minimum `1`, maximum `36`) pour configurer le nombre de mois analysés sans changer la périodicité mensuelle du KPI affiché.
- Si ni connexion ni App Setting ne sont disponibles, l'éditeur affiche un message d'action clair au lieu d'une liste vide silencieuse.

---

## 6. Config KPI — KPIs du client + catalogue

**Accessible à :** Admin uniquement
**Route :** `/admin/kpi-config`

La page est structurée en deux sections et s'appuie sur le client sélectionné dans la barre latérale.

### 6.1 — KPIs de ce client

```
┌──────────────────────────────────────────────────────────────────────┐
│ [≡ Logo]  Config KPI                              [🔔] [👤 Admin ▾]  │
├────────────┬─────────────────────────────────────────────────────────┤
│ …          │  Configuration des KPI                [+ Nouveau KPI]   │
│  ⚙️ Config  ◀  Gérez les KPI actifs pour ce client et configurez       │
│    KPI     │  leurs intervalles de seuil.                             │
│            │  ─────────────────────────────────────────────────────  │
│            │                                                          │
│            │  KPIs de ce client                                       │
│            │  ┌──────────────────────────────────────────────────┐  │
│            │  │  Respect des charges                  [Actif  ●] │  │
│            │  │  Part du temps estimé vs consommé · v1.0          │  │
│            │  │  🔴 ≤ 60   🟠 ≥ 60 et ≤ 80   🟢 ≥ 80            │  │
│            │  │  [✏️ Configurer les seuils]                       │  │
│            │  ├──────────────────────────────────────────────────┤  │
│            │  │  Taux de Retours                      [Actif  ●] │  │
│            │  │  Part du temps passé sur les retours · v1.0       │  │
│            │  │  🔴 ≥ 20   🟠 ≥ 10 et ≤ 20   🟢 ≤ 10            │  │
│            │  │  [✏️ Configurer les seuils]                       │  │
│            │  ├──────────────────────────────────────────────────┤  │
│            │  │  Tickets sans Estimation             [Inactif ○] │  │
│            │  │  Nombre de tickets en cours sans estimation       │  │
│            │  │  Aucun seuil configuré                            │  │
│            │  │  [✏️ Configurer les seuils]                       │  │
│            │  └──────────────────────────────────────────────────┘  │
│            │                                                          │
│            │  Catalogue — KPIs disponibles                            │
│            │  ┌──────────────────────────────────────────────────┐  │
│            │  │  Tickets développés avec IA   système             │  │
│            │  │  Pourcentage de tickets IA · PREDEFINED           │  │
│            │  │                                   [+ Assigner]    │  │
│            │  └──────────────────────────────────────────────────┘  │
└────────────┴─────────────────────────────────────────────────────────┘
```

**Interactions :**
- Le badge **Actif / Inactif** est cliquable → toggle immédiat (PATCH `isActive`)
- **"✏️ Configurer les seuils"** ouvre la modal ci-dessous
- **"+ Assigner"** ajoute le KPI à ce client (crée un `KpiClientConfig`)
- **"+ Nouveau KPI"** ouvre la modal de création
- Dans l'éditeur de formule guidée, la règle `Transitionees vers un statut cible` charge les statuts de transition dynamiquement.
- En configuration client, la liste est chargée depuis les transitions du client courant.
- En définition globale, l'admin choisit une connexion JIRA de référence et la liste est chargée via l'union des statuts des clients rattachés à cette connexion.

---

## 7. Modal — Seuils d'alerte par intervalle

**Déclenchée depuis :** bouton "Configurer les seuils" d'un `KpiClientConfig`

```
┌──────────────────────────────────────────────────────────────┐
│  Seuils d'alerte                                             │
│  Respect des charges — chaque borne est optionnelle          │
│  ─────────────────────────────────────────────────────────   │
│                                                              │
│  🔴 Rouge   min ≥ [──────]   max ≤ [  60  ]   → ≤ 60       │
│  🟠 Orange  min ≥ [  60  ]   max ≤ [  80  ]   → ≥ 60 et ≤ 80│
│  🟢 Vert    min ≥ [  80  ]   max ≤ [──────]   → ≥ 80        │
│                                                              │
│  Priorité : Rouge > Orange > Vert.                           │
│  Le premier intervalle correspondant est appliqué.           │
│                                                              │
│              [Annuler]              [Enregistrer]            │
└──────────────────────────────────────────────────────────────┘
```

**Règles de saisie :**

| Niveau | Borne min (≥) | Borne max (≤) | Comportement si vide |
|--------|--------------|--------------|----------------------|
| 🔴 Rouge | optionnelle | optionnelle | pas de borne inférieure / supérieure |
| 🟠 Orange | optionnelle | optionnelle | idem |
| 🟢 Vert | optionnelle | optionnelle | idem |

Exemple — KPI en pourcentage, seuils asymétriques :
- Rouge : max ≤ 60 → rouge si valeur ≤ 60 %
- Orange : min ≥ 60, max ≤ 80 → orange si 60 % < valeur ≤ 80 %
- Vert : min ≥ 80 → vert si valeur > 80 %

---

## 7bis. Modal — Créer un nouveau KPI

**Déclenchée depuis :** bouton "+ Nouveau KPI" de la page Config KPI

```
┌──────────────────────────────────────────────────────────────┐
│  Nouveau KPI                                                 │
│  ─────────────────────────────────────────────────────────   │
│  Nom *                                                       │
│  [───────────────────────────────────────────────────────]   │
│                                                              │
│  Description                                                 │
│  [───────────────────────────────────────────────────────]   │
│  [───────────────────────────────────────────────────────]   │
│                                                              │
│  Unité           Type de formule *                           │
│  [%            ] [Prédéfinie              ▾]                 │
│                                                              │
│  Type prédéfini  (si formule = Prédéfinie)                   │
│  [RATIO_RETOURS                                          ]   │
│  Identifiant interne du calculator                           │
│                                                              │
│              [Annuler]              [Créer]                  │
└──────────────────────────────────────────────────────────────┘
```

**Champs :**

| Champ | Obligatoire | Description |
|-------|-------------|-------------|
| Nom | Oui | Libellé affiché dans l'interface |
| Description | Non | Description métier courte |
| Unité | Non | Ex. : `%`, `h`, `pts` — affiché sur les cartes KPI |
| Type de formule | Oui | `Prédéfinie` / `JQL` / `SQL` |
| Type prédéfini | Non | Identifiant du calculator backend (ex. : `RATIO_RETOURS`). Laisser vide pour un KPI custom sans logique prédéfinie. |

---

## 8. Suivi des imports

**Accessible à :** Admin uniquement
**Route :** `/admin/imports`

```
┌──────────────────────────────────────────────────────────────────────┐
│ [≡ Logo]  Administration > Imports               [🔔2] [👤 Admin ▾]  │
├────────────┬─────────────────────────────────────────────────────────┤
│            │  Suivi des imports                                       │
│            │  ─────────────────────────────────────────────────────  │
│            │                                                          │
│            │  [Client ▾]  [Type ▾]  [Statut ▾]  [Période ▾]         │
│            │                                                          │
│            │  ACTIONS RAPIDES                                         │
│            │  [▶ Déclencher un import]  [📥 Lancer un backfill]       │
│            │                                                          │
│            │  ─────────────────────────────────────────────────────  │
│            │  ┌──────────────────────────────────────────────────┐  │
│            │  │ Date/heure      │ Client  │ Type   │Statut │Issues│  │
│            │  │─────────────────│─────────│────────│───────│──────│  │
│            │  │ 15/01 02h14     │Client A │ Planif.│ ✅    │ 234  │  │
│            │  │ 15/01 02h08     │Client B │ Planif.│ ⚠️    │ 189  │  │
│            │  │ 15/01 02h01     │Client D │ Planif.│ ✅    │  67  │  │
│            │  │ 14/01 14h32     │Client A │ Manuel │ ✅    │  12  │  │
│            │  │ 14/01 02h05     │Client C │ Planif.│ ❌    │   0  │  │
│            │  │ 12/01 10h00     │Client B │Backfill│ ✅    │4 821 │  │
│            │  └──────────────────────────────────────────────────┘  │
│            │  Affichage 1–6 sur 248          [ < 1 2 3 ... 42 > ]   │
│            │                                                          │
│            │  [❌ Relancer l'import Client C]                         │
└────────────┴─────────────────────────────────────────────────────────┘
```

**Modal — Déclencher un import :**
```
┌────────────────────────────────────────────────┐
│  Déclencher un import manuel                   │
│  ─────────────────────────────────────────────  │
│  Client :   [Client A                       ▾] │
│  Type :     ● Import incrémental               │
│             ○ Import backfill (historique)      │
│                                                │
│  (si backfill)  Date de début :  [──/──/────]  │
│                                                │
│            [Annuler]    [Démarrer l'import]    │
└────────────────────────────────────────────────┘
```

---

## 9. Détail d'un job d'import

**Accessible à :** Admin uniquement
**Route :** `/admin/imports/:jobId`

```
┌──────────────────────────────────────────────────────────────────────┐
│ [≡ Logo]  Admin > Imports > #142 — Client B      [🔔] [👤 Admin ▾]  │
├────────────┬─────────────────────────────────────────────────────────┤
│            │  ← Retour     Import #142 — Client B                    │
│            │               15/01/2025 – 02h08   ⚠️ Terminé avec err. │
│            │  ─────────────────────────────────────────────────────  │
│            │                                                          │
│            │  ┌──────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│            │  │ Type │  │ Durée    │  │ Issues   │  │ Worklogs │  │
│            │  │Planif│  │ 4min 12s │  │   189    │  │   1 243  │  │
│            │  └──────┘  └──────────┘  └──────────┘  └──────────┘  │
│            │                                                          │
│            │  ERREURS NON BLOQUANTES (14)                [↓ Export]  │
│            │  ┌──────────────────────────────────────────────────┐  │
│            │  │ Code               │ Entité    │ Message          │  │
│            │  │────────────────────│───────────│──────────────────│  │
│            │  │ MISSING_ESTIMATE   │ BETA-234  │ Estimation manq. │  │
│            │  │ MISSING_ESTIMATE   │ BETA-235  │ Estimation manq. │  │
│            │  │ UNKNOWN_USER       │ Worklog   │ User xyz inconnu │  │
│            │  │ ...                │           │                  │  │
│            │  └──────────────────────────────────────────────────┘  │
│            │                                                          │
│            │  PROGRESSION PAR PHASE                                  │
│            │  ✅ Membres du projet   (synchronisés : 12)             │
│            │  ✅ Entités de regroup. (importées : 8 Epics)           │
│            │  ✅ Issues              (upsertées : 189)               │
│            │  ✅ Worklogs JIRA       (upsertés : 1 243)              │
│            │  ✅ Calcul KPI          (déclenché)                     │
└────────────┴─────────────────────────────────────────────────────────┘
```

---

## 10. Mode Debug KPI

### 10.1 Toggle debug sur la carte KPI client

Chaque carte KPI dans la section "KPIs du client" dispose d'un bouton **Debug** permettant d'activer/désactiver le mode debug.

```
┌─────────────────────────────────────────────────────────────────┐
│ Taux de dépassement                                   [Actif]  │
│ Description du KPI...                                          │
│ FORMULA_AST · unite : %                                        │
│ 🔴 Rouge >= 20   🟠 Orange >= 10 et <= 20   🟢 Vert <= 10     │
│                                                                 │
│ [Configurer les seuils] [Personnaliser la formule]              │
│ [Debug ON] [Voir traces]                          [Supprimer]   │
└─────────────────────────────────────────────────────────────────┘
```

- **Debug** (toggle) : Active/désactive la capture SQL pour ce KPI. Quand actif, le bouton affiche "Debug ON" en violet.
- **Voir traces** : Visible uniquement quand le debug est ON. Ouvre la modal de consultation des traces.

### 10.2 Modal — Traces debug

Modal accessible via le bouton "Voir traces". Affiche les requêtes SQL et métriques intermédiaires des derniers calculs.

```
┌──────────────────────────────────────────────────────────────────┐
│  Traces debug — Taux de dépassement              [Purger] [x]   │
│  Requetes SQL et metriques intermediaires des derniers calculs   │
│                                                                  │
│  Periode : mars 2026                                             │
│  ─────────────────────────────────────────────────────────────── │
│  ▶ Global    │ Resultat: 14.75 │ 47 tickets │ 01/04 14:32       │
│  ▼ Ahmed B.  │ Resultat: 22.30 │ 14 tickets │ 01/04 14:32       │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Formule: (consomme + temps_restant - estime) / estime * 100│ │
│  │                                                             │ │
│  │ Filtres: scopeRule=resolved_in_period, issueTypes=[...]     │ │
│  │                                                             │ │
│  │ ┌─ consomme ─────────────────────────────────────────────┐ │ │
│  │ │ SELECT time_spent_seconds, original_estimate_hours     │ │ │
│  │ │ FROM issues WHERE client_id = 1 AND ...                │ │ │
│  │ │ Lignes: 14 │ Duree: 12ms │ Valeur: 187.5h             │ │ │
│  │ └───────────────────────────────────────────────────────  ┘ │ │
│  │                                                             │ │
│  │ ┌─ temps_restant ────────────────────────────────────────┐ │ │
│  │ │ SELECT ... │ Lignes: 14 │ Valeur: 42.0h               │ │ │
│  │ └────────────────────────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  ▶ Sophie M. │ Resultat: 5.12 │ 18 tickets │ 01/04 14:32       │
└──────────────────────────────────────────────────────────────────┘
```

**Interactions** :
- Chaque ligne collaborateur est un accordéon (clic pour déplier/replier)
- Le calcul "Global" (collaboratorId = null) est mis en avant
- Bouton "Purger" : supprime toutes les traces de ce KPI (avec confirmation)
- Les requêtes SQL sont affichées en monospace avec coloration syntaxique légère
