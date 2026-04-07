# Ecran Transitions de statut

> **Version** : 1.0
> **Etape** : 3 -- UX / Maquettes
> **Derniere mise a jour** : 2026-04-03
> **Statut** : En production (dev)

---

## Description

Page de consultation des transitions de statut des issues Jira, importees depuis le changelog Jira. Permet de visualiser l'historique des changements de statut avec des filtres avances.

**Route** : `/transitions`
**Acces** : minLevel 40 (Dev et superieur)

---

## Filtres disponibles

| Filtre | Type | Description |
|--------|------|-------------|
| Client | Select | Selection du client (tous par defaut) |
| Cle Jira | Texte | Recherche par cle de ticket (ex: PROJ-123) |
| Assigne a | MultiSelect | Filtrer par collaborateur assigne |
| De (statut) | MultiSelect | Statut de depart de la transition |
| Vers (statut) | MultiSelect | Statut d'arrivee de la transition |
| Type | MultiSelect | Type de ticket (Story, Bug, Task, etc.) |
| Depuis | Date | Date de debut de la periode |
| Jusqu'au | Date | Date de fin de la periode |
| Reinitialiser | Bouton | Remet tous les filtres a zero |

Les listes de statuts (De/Vers) sont alimentees dynamiquement depuis les transitions presentes en base pour le client selectionne.

---

## Colonnes du tableau

| Colonne | Description |
|---------|-------------|
| Cle | Cle Jira du ticket (ex: PROJ-123) |
| Client / Projet | Nom du client et du projet Jira |
| Resume | Titre du ticket (tronque avec tooltip) |
| Type | Badge colore par type (Epic, Story, Bug, Task, Sub-task) |
| Assigne | Nom du collaborateur ou tiret si non assigne |
| De | Statut avant la transition (badge colore) |
| Vers | Statut apres la transition (badge colore) |
| Date | Date et heure de la transition (format FR) |

---

## Pagination

- 50 resultats par page
- Navigation Precedent / Suivant
- Affichage "Page X / Y"
- Compteur total de transitions

---

## Architecture technique

### Backend

- **Route** : `GET /api/transitions` -- liste paginee avec filtres
- **Route** : `GET /api/transitions/statuses` -- valeurs distinctes de fromStatus/toStatus
- **Fichier** : `src/backend/src/api/routes/transitions.ts`
- **Enregistrement** : `app.use('/api/transitions', transitionsRouter)` dans `app.ts`

### Frontend

- **Page** : `src/frontend/src/pages/TransitionsPage.tsx`
- **API** : `transitionsApi` dans `src/frontend/src/api/endpoints.ts`
- **Type** : `TransitionRow` dans `src/frontend/src/types/index.ts`
- **Navigation** : Entree "Transitions" dans la sidebar (icone ⇄)
