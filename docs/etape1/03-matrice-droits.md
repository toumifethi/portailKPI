# Matrice des droits d'accès — Portail KPI Productivité

> **Version** : 1.0
> **Étape** : 1 — Cahier des charges et spécifications fonctionnelles
> **Statut** : À valider

---

## Légende

| Symbole | Signification                                    |
|---------|--------------------------------------------------|
| ✅      | Accès complet                                    |
| 🔵      | Accès restreint (précisé dans les notes)         |
| ❌      | Accès interdit                                   |

---

## 1. Accès aux données KPI

| Fonctionnalité                                   | Développeur       | Chef de projet     | Delivery Manager   | Admin |
|--------------------------------------------------|-------------------|--------------------|--------------------|-------|
| Voir ses propres KPI                             | ✅                | ✅                 | ✅                 | ✅    |
| Voir les KPI de son équipe                       | ❌                | 🔵 propre équipe   | 🔵 périmètre       | ✅    |
| Voir les KPI par Epic                            | ❌                | 🔵 propres Epics   | 🔵 périmètre       | ✅    |
| Voir les KPI agrégés par client                  | ❌                | 🔵 propre client   | 🔵 périmètre       | ✅    |
| Voir les KPI agrégés par équipe                  | ❌                | 🔵 propre équipe   | 🔵 périmètre       | ✅    |
| Voir l'évolution mensuelle (propre)              | ✅                | ✅                 | ✅                 | ✅    |
| Voir l'évolution mensuelle (équipe / périmètre)  | ❌                | 🔵 propre équipe   | 🔵 périmètre       | ✅    |
| Drill-down jusqu'aux tickets (propres)           | ✅                | ✅                 | ✅                 | ✅    |
| Drill-down jusqu'aux tickets (équipe)            | ❌                | 🔵 propre équipe   | 🔵 périmètre       | ✅    |
| Voir les KPI d'un collaborateur archivé          | ❌                | ❌                 | 🔵 périmètre       | ✅    |

---

## 2. Exports

| Fonctionnalité                        | Développeur         | Chef de projet        | Delivery Manager      | Admin |
|---------------------------------------|---------------------|-----------------------|-----------------------|-------|
| Exporter ses propres KPI (CSV/XLS/PDF)| ✅                  | ✅                    | ✅                    | ✅    |
| Exporter les KPI de son équipe        | ❌                  | 🔵 propre équipe      | 🔵 périmètre          | ✅    |
| Exporter les KPI de tout le périmètre | ❌                  | ❌                    | ✅                    | ✅    |

---

## 3. Gestion des utilisateurs

| Fonctionnalité                                     | Développeur | Chef de projet | Delivery Manager                   | Admin |
|----------------------------------------------------|-------------|----------------|------------------------------------|-------|
| Voir la liste des utilisateurs actifs (propre équipe) | ❌       | 🔵 propre équipe | 🔵 périmètre                      | ✅    |
| Voir tous les utilisateurs (actifs + archivés)     | ❌          | ❌             | ❌                                 | ✅    |
| Ajouter manuellement un utilisateur                | ❌          | ❌             | ❌                                 | ✅    |
| Modifier le rôle d'un utilisateur (Dev ↔ CP)       | ❌          | ❌             | 🔵 membres de son périmètre        | ✅    |
| Modifier le rôle Admin ou DM                       | ❌          | ❌             | ❌                                 | ✅    |
| Archiver un utilisateur                            | ❌          | ❌             | ❌                                 | ✅    |
| Réactiver un utilisateur archivé                   | ❌          | ❌             | ❌                                 | ✅    |
| Voir les collaborateurs sans saisie récente        | ❌          | 🔵 propre équipe | 🔵 périmètre                      | ✅    |

---

## 4. Gestion des équipes

| Fonctionnalité                                  | Développeur | Chef de projet | Delivery Manager | Admin |
|-------------------------------------------------|-------------|----------------|------------------|-------|
| Voir les équipes (liste)                        | ❌          | 🔵 propres équipes | 🔵 périmètre  | ✅    |
| Ajouter / retirer un membre d'une équipe        | ❌          | ❌             | ❌               | ✅    |
| Archiver un membre d'une équipe                 | ❌          | ❌             | ❌               | ✅    |

---

## 5. Configuration des clients JIRA

| Fonctionnalité                                       | Développeur | Chef de projet | Delivery Manager | Admin |
|------------------------------------------------------|-------------|----------------|------------------|-------|
| Voir la liste des instances JIRA configurées         | ❌          | ❌             | ❌               | ✅    |
| Ajouter / modifier une instance JIRA                 | ❌          | ❌             | ❌               | ✅    |
| Configurer le mapping des champs JIRA par client     | ❌          | ❌             | ❌               | ✅    |
| Configurer les statuts "terminé" par client          | ❌          | ❌             | ❌               | ✅    |
| Configurer les types de tickets par client           | ❌          | ❌             | ❌               | ✅    |
| Activer / désactiver une instance JIRA               | ❌          | ❌             | ❌               | ✅    |

---

## 6. Configuration des KPI

| Fonctionnalité                                            | Développeur | Chef de projet | Delivery Manager | Admin |
|-----------------------------------------------------------|-------------|----------------|------------------|-------|
| Voir la liste des KPI configurés                          | ❌          | ❌             | ❌               | ✅    |
| Créer un KPI (formule prédéfinie / JQL / SQL)             | ❌          | ❌             | ❌               | ✅    |
| Modifier la configuration d'un KPI                        | ❌          | ❌             | ❌               | ✅    |
| Activer / désactiver un KPI par client                    | ❌          | ❌             | ❌               | ✅    |
| Dupliquer une configuration KPI                           | ❌          | ❌             | ❌               | ✅    |
| Configurer les seuils d'alerte (vert / orange / rouge)    | ❌          | ❌             | ❌               | ✅    |

---

## 7. Gestion des imports

| Fonctionnalité                                         | Développeur | Chef de projet | Delivery Manager | Admin |
|--------------------------------------------------------|-------------|----------------|------------------|-------|
| Voir l'historique des imports                          | ❌          | ❌             | ❌               | ✅    |
| Déclencher un import incrémental manuel                | ❌          | ❌             | ❌               | ✅    |
| Déclencher un import backfill (historique)             | ❌          | ❌             | ❌               | ✅    |
| Rejouer un import échoué                               | ❌          | ❌             | ❌               | ✅    |
| Configurer la planification des imports                | ❌          | ❌             | ❌               | ✅    |
| Voir les détails d'erreur d'un import                  | ❌          | ❌             | ❌               | ✅    |
| Annuler un import en cours                             | ❌          | ❌             | ❌               | ✅    |

---

## 8. Supervision et alertes

| Fonctionnalité                                          | Développeur | Chef de projet | Delivery Manager | Admin |
|---------------------------------------------------------|-------------|----------------|------------------|-------|
| Tableau de bord de santé du système                     | ❌          | ❌             | ❌               | ✅    |
| Voir les alertes KPI de son périmètre                   | ❌          | ❌             | 🔵 périmètre     | ✅    |
| Voir les logs d'audit (modifications de rôles, etc.)    | ❌          | ❌             | ❌               | ✅    |

---

## 9. Synthèse des restrictions par rôle

### Développeur
- Accès strictement limité à ses propres données
- Aucun accès aux données d'autres collaborateurs, même dans la même équipe
- Aucun accès aux fonctions d'administration

### Chef de projet
- Accès aux données des collaborateurs de ses équipes uniquement (périmètre = ses projets JIRA assignés)
- Pas d'accès aux fonctions d'administration
- Ne peut pas modifier les rôles

### Delivery Manager
- Accès aux données de l'ensemble de son périmètre (défini par l'Admin)
- Peut modifier les rôles `Développeur` et `Chef de projet` au sein de son périmètre uniquement
- Pas d'accès aux écrans d'administration (configuration JIRA, KPI, imports)

### Admin
- Accès complet sans restriction
- Seul rôle pouvant créer, archiver, réactiver des utilisateurs
- Seul rôle pouvant configurer les instances JIRA, les KPI et les imports
- Seul rôle pouvant attribuer le rôle Admin ou Delivery Manager
