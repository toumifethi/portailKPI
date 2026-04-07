# Étape 2 — Architecture technique

> **Projet** : Portail KPI Productivité
> **Version** : 1.0
> **Date** : 2026-03-15
> **Statut** : À valider

---

## Livrables

| Fichier | Contenu |
|---------|---------|
| [01-architecture-globale.md](./01-architecture-globale.md) | Architecture AWS, composants, choix technologiques, décisions architecturales |
| [02-modele-donnees.md](./02-modele-donnees.md) | Diagrammes ER, description des 18 entités, DDL SQL complet |
| [03-sequences.md](./03-sequences.md) | Séquences SSO, import incrémental, calcul KPI, consultation dashboard, backfill |
| [04-gestion-erreurs-technique.md](./04-gestion-erreurs-technique.md) | Retry/backoff, états des jobs, timeouts, reprise sur incident, logging, alertes |

---

## Résumé des choix architecturaux

| Sujet | Décision |
|-------|----------|
| Frontend | React 18 + TypeScript + Ant Design + Recharts, hébergé S3/CloudFront |
| Backend | Node.js 20 + Express + TypeScript + Prisma (ORM), sur ECS Fargate |
| Base de données | MySQL 8.0 sur AWS RDS Multi-AZ |
| File de jobs | Bull (Redis sur ElastiCache) — 1 queue par client |
| Auth | Azure AD OIDC / JWT — stateless, validé via JWKS |
| Secrets | AWS Secrets Manager — tokens JIRA/Tempo jamais en clair en base |
| Planification | AWS EventBridge (ou node-cron en v1 local) |
| Observabilité | Winston (logs JSON) + AWS CloudWatch |
| Calcul KPI | Précalculé après chaque import, stocké dans `kpi_results` |
| Entité de regroupement | Générique (`grouping_entities`) — Epic / Composant / Label / Version / Champ custom |

---

## Décisions validées (2026-03-15)

| Point | Décision |
|-------|----------|
| Bibliothèque UI | ✅ **Ant Design** |
| File de jobs | ✅ **Bull + Redis** (ElastiCache) |
| Config KPI | ✅ **JSON hybride** — tables distinctes pour statuts "terminé" et types de tickets, JSON pour le reste |
| Granularité KPI | ✅ **MONTHLY / QUARTERLY / YEARLY** suffisant pour v1 |
| Secrets | ✅ **AWS Secrets Manager** |
