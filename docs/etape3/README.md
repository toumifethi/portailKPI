# Étape 3 — UX / Maquettes

> **Projet** : Portail KPI Productivité
> **Version** : 1.0
> **Date** : 2026-03-15
> **Statut** : À valider

---

## Livrables

| Fichier | Contenu |
|---------|---------|
| [01-principes-ux.md](./01-principes-ux.md) | Principes UX, design system (couleurs, typo, espacement), layout global, navigation, responsive |
| [02-ecrans-dashboard.md](./02-ecrans-dashboard.md) | Connexion, dashboard synthèse, vue collaborateur, équipe, grouping, client, drill-down tickets |
| [03-ecrans-administration.md](./03-ecrans-administration.md) | Santé système, gestion utilisateurs, fiche utilisateur, config client JIRA, KPI, suivi imports |
| [04-ecran-transitions.md](./04-ecran-transitions.md) | Écran de consultation des transitions de statut des issues Jira |

---

## Récapitulatif des écrans

| Écran | Route | Rôles |
|-------|-------|-------|
| Connexion | `/login` | Tous |
| Dashboard synthèse | `/dashboard` | Tous |
| Mes KPI | `/dashboard/me` | Tous |
| KPI équipe | `/dashboard/team/:id` | CP, DM, Admin |
| KPI grouping (Epic…) | `/dashboard/grouping/:id` | CP, DM, Admin |
| KPI client | `/dashboard/client/:id` | DM, Admin |
| KPI par collaborateur (KPIs formels) | `/collaborateurs` | CP, DM, Admin |
| Drill-down tickets | `/dashboard/kpi/:id/detail` | Tous |
| Santé système | `/admin/health` | Admin |
| Gestion utilisateurs | `/admin/users` | Admin |
| Fiche utilisateur | `/admin/users/:id` | Admin, DM |
| Clients JIRA | `/admin/clients` | Admin |
| Config client | `/admin/clients/:id` | Admin |
| Catalogue KPI | `/admin/kpi` | Admin |
| Config KPI | `/admin/kpi/:id` | Admin |
| Suivi imports | `/admin/imports` | Admin |
| Détail import | `/admin/imports/:id` | Admin |
| Transitions de statut | `/transitions` | Dev, CP, DM, Admin |

Note: la page `/collaborateurs` affiche uniquement les KPIs formels (l'onglet "Métriques directes" a été retire).
La table KPI par collaborateur inclut une ergonomie "fort volume": colonne collaborateur figee, entetes figes, selection des KPI visibles, recherche de KPI et tri par colonne KPI.

---

## Points à valider avant l'Étape 4

1. **Navigation** : le menu latéral avec les entrées par rôle convient-il ? Faut-il un en-tête différent selon le rôle ?
2. **Tableau équipe** : souhaitez-vous une vue heatmap (collaborateur × mois × KPI) en plus du tableau mensuel ?
3. **Export PDF** : le PDF doit-il reproduire la mise en page dashboard (graphiques inclus) ou uniquement les données tabulaires ?
4. **Notifications** : les alertes (token invalide, sans saisie…) doivent-elles aussi être envoyées par email, ou uniquement in-app ?
5. **Langue** : les libellés de statuts JIRA dans l'interface sont-ils affichés tels quels (en anglais, comme dans JIRA) ou traduits en français ?
