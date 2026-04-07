# Écrans Dashboard — Portail KPI Productivité

> **Version** : 2.0
> **Étape** : 3 — UX / Maquettes
> **Dernière mise à jour** : 2026-03-16
> **Statut** : En production (dev)

---

## Sommaire

1. [Page de connexion](#1-page-de-connexion)
2. [Page de connexion — mode dev](#2-page-de-connexion--mode-dev)
3. [Dashboard adaptatif par profil](#3-dashboard-adaptatif-par-profil)
4. [Dashboard Admin / DM](#4-dashboard-admin--dm)
5. [Dashboard CP — "Mon équipe"](#5-dashboard-cp--mon-équipe)
6. [Dashboard Dev / Viewer — "Mes KPIs"](#6-dashboard-dev--viewer--mes-kpis)
7. [Sidebar adaptative](#7-sidebar-adaptative)
8. [Vue KPI par entité de regroupement (Epic / Composant…)](#8-vue-kpi-par-entité-de-regroupement)
9. [Vue KPI par client](#9-vue-kpi-par-client)
10. [Drill-down détail tickets d'un KPI](#10-drill-down--détail-tickets-dun-kpi)

---

## 1. Page de connexion

**Accessible à :** tous (non authentifié)
**Route :** `/login`

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│                                                                      │
│              ┌────────────────────────────────────────┐             │
│              │                                        │             │
│              │         [Logo DECADE]                  │             │
│              │                                        │             │
│              │    Portail KPI Productivité            │             │
│              │    ────────────────────────────────    │             │
│              │                                        │             │
│              │    Connectez-vous avec votre           │             │
│              │    compte professionnel                │             │
│              │                                        │             │
│              │    ┌──────────────────────────────┐   │             │
│              │    │  [⊞]  Se connecter avec      │   │             │
│              │    │       Microsoft 365           │   │             │
│              │    └──────────────────────────────┘   │             │
│              │                                        │             │
│              │    ─────────────────────────────────   │             │
│              │    Accès réservé aux collaborateurs    │             │
│              │    DECADE. Contactez votre Admin si    │             │
│              │    vous ne pouvez pas vous connecter.  │             │
│              │                                        │             │
│              └────────────────────────────────────────┘             │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Comportement :**
- Un seul bouton d'action → délégation complète à Azure AD (MSAL.js)
- En cas de compte non enregistré dans l'application, affichage d'un message d'erreur inline :
  `"Votre compte n'est pas enregistré. Contactez votre administrateur."`
- Pas de formulaire email/password — SSO uniquement
- Fond neutre sobre, pas de distractions visuelles

---

## 2. Page de connexion — mode dev

> **Nouveau en v2.0** — Disponible uniquement en environnement de développement.

**Accessible à :** développeurs (env: development)
**Route :** `/login`

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│              ┌────────────────────────────────────────┐             │
│              │                                        │             │
│              │         [Logo DECADE]                  │             │
│              │    Portail KPI Productivité            │             │
│              │    ────────────────────────────────    │             │
│              │                                        │             │
│              │    MODE DÉVELOPPEMENT                  │             │
│              │    Sélectionnez un collaborateur :     │             │
│              │                                        │             │
│              │    ── Admin ──────────────────────     │             │
│              │    ○ Alice DURAND (Admin)              │             │
│              │                                        │             │
│              │    ── Delivery Manager ───────────     │             │
│              │    ○ Bob MARTIN (DM)                   │             │
│              │                                        │             │
│              │    ── Chef de Projet ─────────────     │             │
│              │    ○ Claire PETIT (CP)                 │             │
│              │    ○ David LEROY (CP)                  │             │
│              │                                        │             │
│              │    ── Développeur ────────────────     │             │
│              │    ○ Emma BERNARD (Dev)                │             │
│              │    ○ François ROUX (Dev)               │             │
│              │                                        │             │
│              │    ── Lecteur ────────────────────     │             │
│              │    ○ Gérard BLANC (Viewer)             │             │
│              │                                        │             │
│              │    ┌──────────────────────────────┐   │             │
│              │    │  Se connecter                 │   │             │
│              │    └──────────────────────────────┘   │             │
│              │                                        │             │
│              └────────────────────────────────────────┘             │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Comportement :**
- La liste des collaborateurs est chargée depuis la base et groupée par profil (`profiles.label`)
- La sélection d'un collaborateur simule une connexion SSO (pas de token Azure AD)
- Permet de tester rapidement le dashboard avec différents profils et périmètres
- Le bouton "Se connecter avec Microsoft 365" reste disponible en dessous (optionnel)

---

## 3. Dashboard adaptatif par profil

> **Nouveau en v2.0** — Le dashboard s'adapte automatiquement au profil du collaborateur connecté.

Le contenu, la navigation et les KPI affichés dépendent du `profiles.level` du collaborateur :

| Profil | Level | Dashboard principal | KPI visibles | Vue |
|---|---|---|---|---|
| **Admin** | 100 | KPIs globaux + heatmap équipe + évolution | Tous les KPI | Vue complète multi-clients |
| **DM** | 80 | KPIs globaux + heatmap équipe + évolution | Tous les KPI | Scopé aux clients DM |
| **CP** | 60 | KPIs équipe + heatmap "Mon équipe" + évolution | KPI filtrés par `kpi_definition_profiles` | Scopé aux clients CP |
| **Dev** | 40 | "Mes KPIs" personnels par client + évolution | KPI filtrés par `kpi_definition_profiles` | Scopé à ses propres données |
| **Viewer** | 20 | "Mes KPIs" personnels (lecture seule) | KPI filtrés par `kpi_definition_profiles` | Scopé à ses propres données |

**Filtrage des KPI :** la table `kpi_definition_profiles` détermine quels KPI sont visibles pour chaque profil. Un KPI non lié au profil du collaborateur n'apparaît pas sur son dashboard.

---

## 4. Dashboard Admin / DM

**Accessible à :** Admin (tous), DM (périmètre scopé)
**Route :** `/dashboard`

```
┌──────────────────────────────────────────────────────────────────────┐
│ [≡ Logo]   Dashboard                        [Changer de profil]      │
│                                              [👤 Alice DURAND ▾]     │
├────────────┬─────────────────────────────────────────────────────────┤
│            │  Bonjour, Alice !          Données au 15/03 – 02h14 [↻] │
│ 📊 Tableau │                                                          │
│ de bord ◀  │  [Mois ▾] [ < ]  Mars 2026  [ > ]    [↓ Exporter ▾]   │
│            │  ─────────────────────────────────────────────────────  │
│ 👥 Équipes │                                                          │
│            │  KPI GLOBAUX                                             │
│ 🏢 Clients │  ┌──────────────────┐ ┌──────────────────┐             │
│            │  │ Respect charges  │ │ Qualité          │             │
│ ⚙️ Admin   │  │                  │ │                  │             │
│            │  │    +2,3 %  🟢    │ │    14,1 %  🟠    │             │
│            │  │ ▲ +1,1 pts       │ │ ▼ -2,3 pts       │             │
│            │  │ 142 tickets      │ │ 118 tickets      │             │
│            │  └──────────────────┘ └──────────────────┘             │
│            │                                                          │
│            │  ─────────────────────────────────────────────────────  │
│            │  HEATMAP ÉQUIPE — Collaborateur × KPI                   │
│            │  ┌──────────────────────────────────────────────────┐  │
│            │  │                 │ Resp.charges │ Qualité │ Bugs  │  │
│            │  │─────────────────│──────────────│─────────│───────│  │
│            │  │ Jean DUPONT     │   -4,2 % 🟢  │ 12,3 % 🟢│ 2  🟢│  │
│            │  │ Sophie MARTIN   │   +2,1 % 🟢  │  8,7 % 🟢│ 0  🟢│  │
│            │  │ Lucas BERNARD   │  +22,4 % 🔴  │ 41,2 % 🔴│ 8  🔴│  │
│            │  │ Emma PETIT      │   -1,8 % 🟢  │  5,4 % 🟢│ 1  🟢│  │
│            │  └──────────────────────────────────────────────────┘  │
│            │                                                          │
│            │  Légende : 🟢 Vert (OK)  🟠 Orange (attention)  🔴 Rouge  │
│            │                                                          │
│            │  ─────────────────────────────────────────────────────  │
│            │  ÉVOLUTION — Respect des charges (tous clients)          │
│            │                                                          │
│            │  %  │  Client A ── Client B ── Client C ──              │
│            │ 20  │                      ╱                             │
│            │ 10  │         ╱\          ╱                              │
│            │  0  │────────╱──\────────╱──────────                    │
│            │-10  │            \      ╱                                │
│            │-20  │             \────╱                                 │
│            │     └──────────────────────────────────                  │
│            │       Oct   Nov   Déc   Jan   Fév   Mar                  │
│            │                                                          │
└────────────┴─────────────────────────────────────────────────────────┘
```

**Composants :**
- **KPI Globaux** : cartes synthétiques avec valeur, tendance (vs mois précédent), nombre de tickets, indicateur RAG (couleur)
- **Heatmap équipe** : tableau croisé collaborateur x KPI avec coloration RAG (rouge/orange/vert) basée sur les seuils définis dans `kpi_client_configs` ou `kpi_definitions.defaultThresholds`
- **Graphique d'évolution** : courbes par client sur les 6 derniers mois, sélecteur de KPI

**Bandeau Admin (uniquement pour le profil Admin) :**
```
┌─────────────────────────────────────────────────────────────────────┐
│ SANTÉ SYSTÈME   ✅ 3 clients OK   ⚠️ 1 avertissement   ❌ 0 erreur  │
│                                                    [Voir le détail] │
└─────────────────────────────────────────────────────────────────────┘
```

**Différence Admin vs DM :**
- Admin voit **tous les clients** + le bandeau santé système
- DM voit uniquement les clients de son périmètre (résolu via `collaborator_scopes`)

---

## 5. Dashboard CP — "Mon équipe"

**Accessible à :** Chef de Projet (périmètre scopé)
**Route :** `/dashboard`

```
┌──────────────────────────────────────────────────────────────────────┐
│ [≡ Logo]   Dashboard                        [Changer de profil]      │
│                                              [👤 Claire PETIT ▾]     │
├────────────┬─────────────────────────────────────────────────────────┤
│            │  Bonjour, Claire !        Données au 15/03 – 02h14 [↻] │
│ 📊 Tableau │                                                          │
│ de bord ◀  │  [Mois ▾] [ < ]  Mars 2026  [ > ]    [↓ Exporter ▾]   │
│            │  Client : [Client A ▾]                                   │
│ 👥 Mon     │  ─────────────────────────────────────────────────────  │
│   équipe   │                                                          │
│            │  KPI ÉQUIPE — CLIENT A                                   │
│ 📋 Mes     │  ┌──────────────────┐ ┌──────────────────┐             │
│   Epics    │  │ Respect charges  │ │ Qualité          │             │
│            │  │                  │ │                  │             │
│            │  │    +4,6 %  🟢    │ │    16,9 %  🟠    │             │
│            │  │ ▲ +2,0 pts       │ │ ▼ -1,5 pts       │             │
│            │  │ 67 tickets       │ │ 52 tickets       │             │
│            │  └──────────────────┘ └──────────────────┘             │
│            │                                                          │
│            │  ─────────────────────────────────────────────────────  │
│            │  MON ÉQUIPE — HEATMAP                                   │
│            │  ┌──────────────────────────────────────────────────┐  │
│            │  │                 │ Resp.charges │ Qualité │ Bugs  │  │
│            │  │─────────────────│──────────────│─────────│───────│  │
│            │  │ Jean DUPONT     │   -4,2 % 🟢  │ 12,3 % 🟢│ 2  🟢│  │
│            │  │ Sophie MARTIN   │   +2,1 % 🟢  │  8,7 % 🟢│ 0  🟢│  │
│            │  │ Lucas BERNARD   │  +22,4 % 🔴  │ 41,2 % 🔴│ 8  🔴│  │
│            │  │ Emma PETIT      │   -1,8 % 🟢  │  5,4 % 🟢│ 1  🟢│  │
│            │  │─────────────────│──────────────│─────────│───────│  │
│            │  │ MOYENNE ÉQUIPE  │  +4,6 %  🟢  │ 16,9 % 🟠│ 2,8🟠│  │
│            │  └──────────────────────────────────────────────────┘  │
│            │                                                          │
│            │  ─────────────────────────────────────────────────────  │
│            │  ÉVOLUTION MENSUELLE — Mon équipe                       │
│            │                                                          │
│            │  KPI : [Respect des charges ▾]                           │
│            │                                                          │
│            │       J.Dupont ── S.Martin ── L.Bernard ── E.Petit ──   │
│            │  30 │                  ╱ L.Bernard                       │
│            │  20 │                ╱                                   │
│            │  10 │──────────────╱─────────────────                   │
│            │   0 │   ╲──────╱                                         │
│            │ -10 │                                                    │
│            │     └───────────────────────────────────                 │
│            │      Oct    Nov    Déc    Jan    Fév    Mar              │
│            │                                                          │
└────────────┴─────────────────────────────────────────────────────────┘
```

**Comportement :**
- Le CP voit les KPI de son équipe scopée (collaborateurs travaillant sur ses clients)
- La heatmap "Mon équipe" montre les mêmes collaborateurs avec coloration RAG
- Le sélecteur de client en haut permet de filtrer par client (si le CP a plusieurs clients)
- Les KPI affichés sont filtrés par `kpi_definition_profiles` pour le profil CP
- Clic sur un collaborateur dans la heatmap → drill-down vers les KPI individuels

---

## 6. Dashboard Dev / Viewer — "Mes KPIs"

**Accessible à :** Dev (lecture + détail), Viewer (lecture seule)
**Route :** `/dashboard`

```
┌──────────────────────────────────────────────────────────────────────┐
│ [≡ Logo]   Dashboard                        [Changer de profil]      │
│                                              [👤 Emma BERNARD ▾]     │
├────────────┬─────────────────────────────────────────────────────────┤
│            │  Bonjour, Emma !          Données au 15/03 – 02h14 [↻] │
│ 📊 Mes     │                                                          │
│   KPIs ◀   │  [Mois ▾] [ < ]  Mars 2026  [ > ]    [↓ Exporter ▾]   │
│            │  ─────────────────────────────────────────────────────  │
│            │                                                          │
│            │  MES KPI — CLIENT A                                      │
│            │  ┌──────────────────┐ ┌──────────────────┐             │
│            │  │ Respect charges  │ │ Qualité          │             │
│            │  │                  │ │                  │             │
│            │  │    -4,2 %  🟢    │ │    12,3 %  🟢    │             │
│            │  │ ▲ +1,3 pts       │ │ ▼ -0,8 pts       │             │
│            │  │ 23 tickets       │ │ 18 tickets       │             │
│            │  └──────────────────┘ └──────────────────┘             │
│            │                                                          │
│            │  ÉVOLUTION PERSONNELLE — Client A                       │
│            │  ┌────────────────────────────────────────────┐        │
│            │  │  %   Respect des charges ──  Qualité ──    │        │
│            │  │  20 │              ╱                        │        │
│            │  │  10 │─────────────                          │        │
│            │  │   0 │    ╱\       ╲ ╱                       │        │
│            │  │ -10 │───╱──\───────╱──────────              │        │
│            │  │     └──────────────────────────             │        │
│            │  │      Oct  Nov  Déc  Jan  Fév  Mar           │        │
│            │  └────────────────────────────────────────────┘        │
│            │                                                          │
│            │  ─────────────────────────────────────────────────────  │
│            │  MES KPI — CLIENT B                                      │
│            │  ┌──────────────────┐ ┌──────────────────┐             │
│            │  │ Respect charges  │ │ Qualité          │             │
│            │  │                  │ │                  │             │
│            │  │    +18,5 % 🔴    │ │    34,1 %  🔴    │             │
│            │  │ ▼ -3,2 pts       │ │ ▲ +5,0 pts       │             │
│            │  │ 11 tickets       │ │  9 tickets       │             │
│            │  └──────────────────┘ └──────────────────┘             │
│            │                                                          │
│            │  ÉVOLUTION PERSONNELLE — Client B                       │
│            │  ┌────────────────────────────────────────────┐        │
│            │  │  ...                                        │        │
│            │  └────────────────────────────────────────────┘        │
│            │                                                          │
└────────────┴─────────────────────────────────────────────────────────┘
```

**Comportement :**
- Le Dev/Viewer voit uniquement **ses propres KPI** (filtrés par `jiraAccountIds` via le scopeResolver)
- Un bloc par client avec ses KPI personnels + graphique d'évolution
- Les KPI affichés sont filtrés par `kpi_definition_profiles` pour le profil Dev/Viewer
- Chaque carte KPI est cliquable → drill-down tickets (Dev peut voir le détail, Viewer en lecture seule)
- Pas de heatmap équipe (le Dev ne voit pas les données des autres)

**Différence Dev vs Viewer :**
- Dev : peut cliquer sur les KPI pour voir le drill-down tickets détaillé
- Viewer : vue identique mais sans accès au drill-down (lecture seule)

---

## 7. Sidebar adaptative

> **Nouveau en v2.0** — La sidebar s'adapte au profil du collaborateur connecté.

Les éléments du menu latéral sont filtrés en fonction du `profiles.level` :

| Élément menu | Admin (100) | DM (80) | CP (60) | Dev (40) | Viewer (20) |
|---|---|---|---|---|---|
| Tableau de bord | Oui | Oui | Oui | - | - |
| Mes KPIs | - | - | - | Oui | Oui |
| Équipes / Mon équipe | Oui | Oui | Oui ("Mon équipe") | - | - |
| Clients | Oui | Oui | - | - | - |
| Mes Epics | - | - | Oui | - | - |
| Administration | Oui | - | - | - | - |

**Bouton "Changer de profil" (mode dev uniquement) :**

```
┌────────────┐
│ [👤]        │
│ Changer de │
│   profil   │
└────────────┘
```

- Visible uniquement en environnement de développement
- Permet de basculer rapidement entre les profils sans se déconnecter
- Au clic, affiche la liste des collaborateurs groupés par profil (même interface que la page login dev)
- Utile pour tester les différentes vues du dashboard pendant le développement

---

## 8. Vue KPI par entité de regroupement

**Accessible à :** Chef de projet (propres entités), Delivery Manager (périmètre), Admin (toutes)
**Route :** `/dashboard/grouping/:entityId`

> Le libellé "Epic" s'adapte selon la configuration du client (Composant, Label, Sprint, etc.)

```
┌──────────────────────────────────────────────────────────────────────┐
│ [≡ Logo]  Dashboard > Client A > Epics             [🔔] [👤 Marie ▾] │
├────────────┬─────────────────────────────────────────────────────────┤
│            │  Mes Epics — CLIENT A                                    │
│ 📊 Tableau │  ─────────────────────────────────────────────────────  │
│ de bord    │                                                          │
│ 👤 Mes KPI │  [Mois ▾] [ < ]  Mars 2026  [ > ]      [↓ Exporter ▾]  │
│ 👥 Équipes │  ─────────────────────────────────────────────────────  │
│ 📋 Mes Epics◀                                                         │
│            │  ┌─────────────────────────────────────────────────┐   │
│            │  │ ▼ ALPHA-001 — Module Authentification           │   │
│            │  │   ┌────────────────┐  ┌────────────────┐        │   │
│            │  │   │ Resp. charges  │  │ Qualité        │        │   │
│            │  │   │   -6,1 %  🟢   │  │  15,4 %   🟠   │        │   │
│            │  │   │ 31 tickets     │  │ 31 tickets     │        │   │
│            │  │   └────────────────┘  └────────────────┘        │   │
│            │  │                                                  │   │
│            │  │   DÉTAIL DES TICKETS (31 terminés en Mars)       │   │
│            │  │   ┌──────────────────────────────────────────┐  │   │
│            │  │   │ Ticket       │ Assigné à    │ Écart       │  │   │
│            │  │   │ ALPHA-123    │ J. DUPONT    │ -12 %  🟢   │  │   │
│            │  │   │ ALPHA-124    │ S. MARTIN    │  +3 %  🟢   │  │   │
│            │  │   │ ALPHA-125    │ J. DUPONT    │ +45 %  🔴   │  │   │
│            │  │   │ ...          │              │             │  │   │
│            │  │   └──────────────────────────────────────────┘  │   │
│            │  └─────────────────────────────────────────────────┘   │
│            │                                                          │
│            │  ┌─────────────────────────────────────────────────┐   │
│            │  │ ▶ ALPHA-002 — Module Facturation     [Déplier]  │   │
│            │  └─────────────────────────────────────────────────┘   │
│            │                                                          │
│            │  ┌─────────────────────────────────────────────────┐   │
│            │  │ ▶ ALPHA-003 — Reporting               [Déplier] │   │
│            │  └─────────────────────────────────────────────────┘   │
│            │                                                          │
└────────────┴─────────────────────────────────────────────────────────┘
```

**Interactions :**
- Chaque Epic/entité est un accordéon (repliable/déployable)
- Dans le détail : tableau des tickets de l'Epic avec leur contribution au KPI
- Clic sur un ticket → lien vers JIRA (nouvel onglet)
- Clic sur le nom d'un collaborateur → vue KPI individuelle

---

## 9. Vue KPI par client

**Accessible à :** Delivery Manager (périmètre), Admin (tous)
**Route :** `/dashboard/client/:clientId`

```
┌──────────────────────────────────────────────────────────────────────┐
│ [≡ Logo]  Dashboard > Vue Clients                [🔔] [👤 DM ▾]     │
├────────────┬─────────────────────────────────────────────────────────┤
│            │  Vue par client — Mon périmètre                          │
│ 📊 Tableau │  ─────────────────────────────────────────────────────  │
│ de bord    │                                                          │
│ 👤 Mes KPI │  [Mois ▾] [ < ]  Mars 2026  [ > ]      [↓ Exporter ▾]  │
│ 👥 Équipes │  KPI :  [Respect des charges ▾]                          │
│ 🏢 Clients ◀│  ─────────────────────────────────────────────────────  │
│            │                                                          │
│            │  SYNTHÈSE PAR CLIENT                                     │
│            │  ┌────────────────────────────────────────────────────┐ │
│            │  │ Client        │ Respect charges │ Qualité │ Équipes│ │
│            │  │───────────────│─────────────────│─────────│────────│ │
│            │  │ Client A      │   +4,6 %   🟢   │ 16,9 % 🟠│   2    │ │
│            │  │ Client B      │  +12,3 %   🟠   │ 28,4 % 🔴│   1    │ │
│            │  │ Client C      │   -2,1 %   🟢   │  9,2 % 🟢│   3    │ │
│            │  └────────────────────────────────────────────────────┘ │
│            │                                                          │
│            │  ─────────────────────────────────────────────────────  │
│            │  ÉVOLUTION MENSUELLE — Respect des charges               │
│            │                                                          │
│            │   Client A ── Client B ── Client C ──                    │
│            │  15 │              ╱ Client B                            │
│            │  10 │─────────────╱──────────────────                   │
│            │   5 │   ╲────────╱                                       │
│            │   0 │                        ╲                           │
│            │  -5 │                         ╲──────                   │
│            │     └───────────────────────────────────                 │
│            │      Oct    Nov    Déc    Jan    Fév    Mar              │
│            │                                                          │
│            │  ─────────────────────────────────────────────────────  │
│            │  DÉTAIL PAR ÉQUIPE — CLIENT A    [Voir toutes les équipes]│
│            │  ┌────────────────────────────────────────────────────┐ │
│            │  │ Équipe      │ Resp. charges │ Qualité │ Membres    │ │
│            │  │─────────────│───────────────│─────────│────────────│ │
│            │  │ ALPHA       │  +4,2 %   🟢  │ 16,1 % 🟠│  5 actifs  │ │
│            │  │ BETA        │  +5,1 %   🟢  │ 17,8 % 🟠│  4 actifs  │ │
│            │  └────────────────────────────────────────────────────┘ │
└────────────┴─────────────────────────────────────────────────────────┘
```

**Interactions :**
- Clic sur un client dans le tableau → vue détaillée du client (équipes + collaborateurs)
- Clic sur une équipe → vue KPI de l'équipe (`/dashboard/team/:projectId`)
- Sélecteur de KPI en haut pour changer le KPI affiché dans le tableau et le graphique

---

## 10. Drill-down — Détail tickets d'un KPI

**Accessible à :** tous les rôles sauf Viewer (sur leurs propres données ou périmètre)
**Route :** `/dashboard/kpi/:kpiConfigId/detail?userId=X&period=2026-03`

```
┌──────────────────────────────────────────────────────────────────────┐
│ [≡ Logo]  Dashboard > Emma BERNARD > Respect des charges — Mars 2026 │
├────────────┬─────────────────────────────────────────────────────────┤
│            │  ← Retour     Respect des charges — Emma BERNARD        │
│            │               Client A — Mars 2026                      │
│            │  ─────────────────────────────────────────────────────  │
│            │                                                          │
│            │  RÉSUMÉ                                                  │
│            │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│            │  │ Valeur KPI   │  │ Tickets pris │  │ Exclus       │  │
│            │  │  -4,2 %  🟢  │  │ en compte    │  │              │  │
│            │  │              │  │     23       │  │      3       │  │
│            │  └──────────────┘  └──────────────┘  └──────────────┘  │
│            │                                                          │
│            │  TICKETS PRIS EN COMPTE (23)     [↓ Exporter ▾]         │
│            │  ┌──────────────────────────────────────────────────┐   │
│            │  │ Ticket    │ Titre        │ Estimé │ Consommé │ Écart│
│            │  │───────────│──────────────│────────│──────────│──────│
│            │  │ ALPH-123 ↗│ Connexion    │ 8h     │ 7h       │-12 %🟢│
│            │  │ ALPH-124 ↗│ Token refresh│ 4h     │ 4,2h     │ +5 %🟢│
│            │  │ ALPH-125 ↗│ Page login   │ 6h     │ 8,7h     │+45 %🔴│
│            │  │ ALPH-126 ↗│ SSO Azure    │ 12h    │ 11h      │ -8 %🟢│
│            │  │ ...       │              │        │          │      │
│            │  └──────────────────────────────────────────────────┘   │
│            │                                                          │
│            │  TICKETS EXCLUS DU CALCUL (3)    [Afficher ▾]           │
│            │  ┌──────────────────────────────────────────────────┐   │
│            │  │ Ticket    │ Titre        │ Raison d'exclusion    │   │
│            │  │───────────│──────────────│───────────────────────│   │
│            │  │ ALPH-130 ↗│ Fix CSS nav  │ Estimation manquante  │   │
│            │  │ ALPH-131 ↗│ Retour recette│ Type exclu (Retour)  │   │
│            │  │ ALPH-132 ↗│ Fix typo     │ Estimation manquante  │   │
│            │  └──────────────────────────────────────────────────┘   │
└────────────┴─────────────────────────────────────────────────────────┘
```

**Interactions :**
- `↗` sur chaque ticket → ouvre le ticket dans JIRA (nouvel onglet)
- Tri par colonne (clic sur l'en-tête)
- Les tickets exclus sont masqués par défaut, affichables via "Afficher"
- Les tickets avec un fort écart positif sont surlignés en rouge pâle
- Export du tableau (tickets inclus + exclus) en CSV / Excel / PDF
- Bouton "← Retour" ramène à la vue précédente sans perdre les filtres de période
