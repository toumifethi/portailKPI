# Principes UX & Design System — Portail KPI Productivité

> **Version** : 1.0
> **Étape** : 3 — UX / Maquettes
> **Statut** : À valider

---

## Sommaire

1. [Principes UX fondamentaux](#1-principes-ux-fondamentaux)
2. [Design system — Tokens visuels](#2-design-system--tokens-visuels)
3. [Layout global de l'application](#3-layout-global-de-lapplication)
4. [Navigation — Structure des routes](#4-navigation--structure-des-routes)
5. [Composants transverses](#5-composants-transverses)
6. [Responsive design](#6-responsive-design)

---

## 1. Principes UX fondamentaux

### Clarté
- Chaque écran a **un objectif principal** clairement identifiable.
- Les libellés sont en français, sans jargon technique, compréhensibles par tous les rôles.
- Les KPI affichent toujours l'unité de mesure (%, heures, nombre de tickets).
- Les données obsolètes ou incomplètes sont explicitement signalées, jamais silencieuses.

### Lisibilité
- Hiérarchie typographique stricte : titre de page → section → valeur → légende.
- Les valeurs KPI sont le point focal de chaque carte : grande taille, police grasse.
- Les tableaux n'affichent jamais plus de colonnes que ce que l'écran peut contenir confortablement.
- Densité de l'information : compacte mais aérée — pas de scrolling horizontal.

### Feedback immédiat
- Tout chargement de données > 300ms déclenche un indicateur de chargement (skeleton ou spinner).
- Toute action utilisateur (sauvegarde, déclenchement d'import) donne un retour visuel dans les 200ms.
- Les erreurs sont affichées en contexte (inline, pas seulement en toast).
- L'état "données en cours de recalcul" est visible sans bloquer la consultation.

### Navigation simple
- Maximum **2 niveaux** de navigation (menu latéral → sous-menu).
- Le fil d'Ariane est toujours visible pour les écrans profonds (drill-down tickets).
- Le retour en arrière est toujours possible sans perte de l'état de filtre.
- Le menu latéral s'adapte au rôle de l'utilisateur : les entrées non accessibles sont masquées.

### Responsive design
- Breakpoints : Mobile (< 768px), Tablette (768–1200px), Desktop (> 1200px).
- Les tableaux de données se transforment en cartes empilées sur mobile.
- Les graphiques restent lisibles sur tablette (réduction de la densité d'axe).
- L'interface d'administration est optimisée pour desktop (manipulation de configurations complexes).

---

## 2. Design system — Tokens visuels

### Palette de couleurs

```
Primaire        #1677FF   (Ant Design Blue — actions, liens, sélections actives)
Succès / Vert   #52C41A   (KPI dans les seuils, statuts OK)
Avertissement   #FAAD14   (KPI en zone orange, alertes non critiques)
Danger / Rouge  #FF4D4F   (KPI hors seuil, erreurs, actions destructives)
Neutre sombre   #141414   (Texte principal)
Neutre moyen    #595959   (Texte secondaire, légendes)
Neutre clair    #F5F5F5   (Fond des cartes, arrière-plan)
Blanc           #FFFFFF   (Fond principal, surfaces)
Bordure         #D9D9D9   (Séparateurs, bordures de composants)
```

### Indicateurs KPI (système RAG)

| Statut | Couleur | Usage |
|--------|---------|-------|
| **Vert** | `#52C41A` | Valeur dans les seuils configurés (bonne performance) |
| **Orange** | `#FAAD14` | Valeur en zone d'alerte (surveillance requise) |
| **Rouge** | `#FF4D4F` | Valeur hors seuil (intervention requise) |
| **Gris** | `#8C8C8C` | Données insuffisantes, KPI non calculé, période sans données |
| **Bleu** | `#1677FF` | Valeur de référence (moyenne équipe, benchmark) |

### Typographie

```
Font family : Inter (Google Fonts) — fallback : -apple-system, sans-serif
Titre de page (H1)      : 24px, weight 600
Titre de section (H2)   : 18px, weight 600
Titre de carte (H3)     : 14px, weight 500, uppercase, letter-spacing 0.5px
Valeur KPI principale   : 36px, weight 700
Valeur KPI secondaire   : 24px, weight 600
Corps de texte          : 14px, weight 400
Texte secondaire        : 12px, weight 400, color Neutre moyen
```

### Espacements (grille de 8px)

```
XS  : 4px    (padding internes légers)
S   : 8px    (espacement entre éléments proches)
M   : 16px   (padding de carte, espacement standard)
L   : 24px   (espacement entre sections)
XL  : 32px   (espacement entre blocs majeurs)
XXL : 48px   (marges de page)
```

---

## 3. Layout global de l'application

```
┌──────────────────────────────────────────────────────────────────────┐
│ TOPBAR                                                               │
│  [≡ Logo]   Fil d'Ariane : Dashboard > Client A > Équipe DEV        │
│                                          [🔔 2]  [👤 Prénom NOM ▾]  │
├────────────┬─────────────────────────────────────────────────────────┤
│            │                                                         │
│  SIDEBAR   │   ZONE DE CONTENU PRINCIPALE                           │
│  (240px)   │                                                         │
│            │   ┌─────────────────────────────────────────────────┐  │
│  [icône]   │   │  Titre de page + actions (filtres, export)      │  │
│  Tableau   │   └─────────────────────────────────────────────────┘  │
│  de bord   │                                                         │
│            │   ┌──────────┐ ┌──────────┐ ┌──────────┐             │
│  [icône]   │   │  Carte   │ │  Carte   │ │  Carte   │             │
│  Mon profil│   │  KPI 1   │ │  KPI 2   │ │  KPI 3   │             │
│            │   └──────────┘ └──────────┘ └──────────┘             │
│  ─────────  │                                                         │
│  ADMIN     │   ┌─────────────────────────────────────────────────┐  │
│            │   │  Graphique / Tableau détaillé                   │  │
│  [icône]   │   │                                                 │  │
│  Clients   │   └─────────────────────────────────────────────────┘  │
│            │                                                         │
│  [icône]   │                                                         │
│  KPI       │                                                         │
│            │                                                         │
│  [icône]   │                                                         │
│  Imports   │                                                         │
│            │                                                         │
│  [icône]   │                                                         │
│  Utilisat. │                                                         │
└────────────┴─────────────────────────────────────────────────────────┘
```

**Topbar :**
- Logo + nom de l'application (gauche)
- Fil d'Ariane cliquable (centre-gauche)
- Cloche de notifications avec badge de comptage (droite)
- Avatar + menu utilisateur : Profil, Déconnexion (droite)

**Sidebar :**
- Largeur 240px (desktop), rétractable à 64px (icônes seules)
- Sur mobile : drawer (panneau glissant)
- Entrées visibles selon le rôle de l'utilisateur connecté
- Indicateur visuel sur l'entrée active

---

## 4. Navigation — Structure des routes

```
/                               → Redirect vers /dashboard

/dashboard                      → Vue d'accueil (résumé tous clients)
/dashboard/me                   → Mes KPI (Dev, CP, DM, Admin)
/dashboard/team/:projectId      → KPI d'une équipe (CP, DM, Admin)
/dashboard/client/:clientId     → KPI d'un client (DM, Admin)
/dashboard/grouping/:entityId   → KPI par entité de regroupement (CP, DM, Admin)
/dashboard/kpi/:kpiConfigId/detail → Drill-down tickets d'un KPI

/admin/users                    → Gestion des utilisateurs (Admin)
/admin/users/:userId            → Fiche utilisateur (Admin)
/admin/clients                  → Gestion des instances JIRA (Admin)
/admin/clients/:clientId        → Configuration d'un client (Admin)
/admin/kpi                      → Catalogue des KPI (Admin)
/admin/kpi/:kpiId               → Configuration d'un KPI (Admin)
/admin/imports                  → Tableau de bord des imports (Admin)
/admin/imports/:jobId           → Détail d'un job d'import (Admin)
/admin/health                   → Tableau de bord de santé système (Admin)

/profile                        → Mon profil (tous rôles)
/login                          → Page de connexion (non authentifié)
/forbidden                      → Page d'erreur 403
```

**Entrées du menu latéral par rôle :**

| Entrée | Dev | CP | DM | Admin |
|--------|-----|----|----|-------|
| Tableau de bord | ✅ | ✅ | ✅ | ✅ |
| Mes KPI | ✅ | ✅ | ✅ | ✅ |
| Mon équipe | ❌ | ✅ | ✅ | ✅ |
| Vue client | ❌ | ❌ | ✅ | ✅ |
| Administration | ❌ | ❌ | ❌ | ✅ |

---

## 5. Composants transverses

### Carte KPI (KpiCard)

```
┌──────────────────────────────────┐
│  Respect des charges        [?]  │
│  ─────────────────────────────── │
│                                  │
│         -4,2 %           ● Vert  │
│         ▲ +1,3 pts vs mois préc. │
│                                  │
│  Basé sur 23 tickets             │
│  3 tickets exclus (sans estim.)  │
└──────────────────────────────────┘
```

**Éléments :**
- Titre du KPI + icône d'aide (tooltip avec définition du KPI)
- Valeur principale (grande, colorée selon seuil RAG)
- Tendance vs période précédente (flèche + delta)
- Indicateur coloré (pastille verte/orange/rouge)
- Sous-texte : nombre de tickets pris en compte + exclus
- Cliquable → ouvre le drill-down tickets

### Sélecteur de période (PeriodSelector)

```
[Mois ▾] [ < ]  Janvier 2025  [ > ]    Comparer avec : [─ Aucun ▾]
```

- Modes : Mois / Trimestre / Année / Plage libre
- Navigation précédent / suivant
- Option de comparaison avec une période antérieure

### Bannière de données obsolètes

```
┌─────────────────────────────────────────────────────────────────────┐
│ ⚠️  Certaines données sont en cours de recalcul suite à une         │
│    modification de configuration. Dernière mise à jour : 14/01 02h  │
└─────────────────────────────────────────────────────────────────────┘
```

### Indicateur de dernière synchronisation

```
Données au 15/01/2025 – 02h14  [↻ Actualiser]
```

### Bouton d'export

```
[↓ Exporter ▾]
  → CSV
  → Excel (.xlsx)
  → PDF
```

---

## 6. Responsive design

### Breakpoints

| Breakpoint | Largeur | Comportement principal |
|------------|---------|----------------------|
| Mobile | < 768px | Sidebar masquée (hamburger), cartes KPI en colonne unique, tableaux en cards |
| Tablette | 768–1200px | Sidebar rétractée (icônes), cartes KPI en 2 colonnes, tableaux simplifiés |
| Desktop | > 1200px | Layout complet, sidebar déployée, cartes KPI en 3–4 colonnes |

### Adaptations par écran

| Écran | Mobile | Tablette | Desktop |
|-------|--------|----------|---------|
| Dashboard | KpiCard en colonne, graphique pleine largeur | 2 cartes par ligne | 3–4 cartes par ligne |
| Tableau équipe | Cards empilées (1 col) | Tableau 3 colonnes | Tableau complet |
| Administration | Non optimisé (alerte recommandant desktop) | Accessible mais dense | Optimisé |
| Drill-down tickets | Liste simplifiée | Tableau 4 colonnes | Tableau complet avec toutes les colonnes |
