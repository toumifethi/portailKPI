# Étape 1 — Cahier des charges et spécifications fonctionnelles

> **Projet** : Portail KPI Productivité
> **Version** : 1.0
> **Date** : 2026-03-15
> **Statut** : À valider

---

## Livrables

| Fichier | Contenu |
|---------|---------|
| [01-user-stories.md](./01-user-stories.md) | User stories exhaustives par rôle (Admin, Développeur, Chef de projet, Delivery Manager) |
| [02-regles-metier.md](./02-regles-metier.md) | Règles métier détaillées (équipes, KPI, imports, calculs, seuils) |
| [03-matrice-droits.md](./03-matrice-droits.md) | Matrice des droits d'accès par rôle et fonctionnalité |
| [04-hypotheses.md](./04-hypotheses.md) | Hypothèses fonctionnelles à valider avant l'Étape 2 |
| [05-cas-erreur.md](./05-cas-erreur.md) | Cas particuliers et gestion des erreurs (imports, KPI, données, auth) |

---

## Résumé des décisions clés

| Sujet | Décision retenue |
|-------|-----------------|
| Définition d'une équipe | 1 projet JIRA = 1 équipe, avec ajouts/overrides manuels |
| Affectation collaborateur ↔ client | Auto depuis JIRA (tickets assignés) + override manuel |
| Lien CP ↔ Epic | Champ JIRA personnalisé, configurable par client |
| Moteur de formules KPI | 3 modes par KPI : formule prédéfinie / JQL / SQL |
| Source temps consommé (hors Tempo) | Worklogs JIRA natifs (`timespent`) |
| Gestion des rôles | Manuellement par Admin + DM pour son périmètre (Dev ↔ CP) |
| Import historique | Mode backfill distinct + mode incrémental avec date de départ |

---

## Points à valider avant l'Étape 2

Voir [04-hypotheses.md](./04-hypotheses.md) — 13 hypothèses à confirmer, notamment :

- **H-001** : Mapping 1 projet JIRA = 1 équipe (cas d'exception ?)
- **H-002** : Unité des estimations (heures vs Story Points par client)
- **H-004** : Acceptation de la limitation JQL en mode local
- **H-008** : Accès Azure AD pour l'App Registration OIDC
- **H-013** : Type de projets JIRA par instance (classic vs next-gen)
