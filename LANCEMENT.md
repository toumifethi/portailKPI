# Portail KPI Productivité — Guide de lancement

## Prérequis

| Outil | Version minimale | Téléchargement |
|---|---|---|
| Docker Desktop | 4.x | https://www.docker.com/products/docker-desktop |
| Git | 2.x | https://git-scm.com |

> Aucun autre outil n'est nécessaire (Node.js, MySQL, Redis sont fournis par Docker).

---

## Lancement en développement local (mode dev sans Azure AD)

### 1. Cloner le projet

```bash
git clone <url-du-repo>
cd 1PortailKPI
```

### 2. Lancer la stack complète

```bash
docker compose -f docker-compose.dev.yml up --build
```

Le premier démarrage prend **3 à 5 minutes** (téléchargement des images Docker).
Les démarrages suivants prennent **~30 secondes**.

### 3. Accéder à l'application

| Service | URL | Description |
|---|---|---|
| **Frontend** | http://localhost:5173 | Interface web |
| **Backend API** | http://localhost:3000/health | Health check |
| **Prisma Studio** | voir section ci-dessous | Explorateur de base de données |

L'application démarre directement connectée en tant que **Dev Admin** (badge jaune `DEV` visible dans le header). Aucune authentification Azure AD n'est requise en mode dev.

---

## Commandes utiles

### Arreter la stack

```bash
docker compose -f docker-compose.dev.yml down
```

### Voir les logs d'un service

```bash
# Tous les services
docker compose -f docker-compose.dev.yml logs -f

# Backend uniquement
docker compose -f docker-compose.dev.yml logs -f backend

# Frontend uniquement
docker compose -f docker-compose.dev.yml logs -f frontend
```

### Relancer un seul service apres modification

```bash
docker compose -f docker-compose.dev.yml up --build backend
```

### Ouvrir Prisma Studio (explorateur base de données)

```bash
docker compose -f docker-compose.dev.yml exec backend npx prisma studio
```

Accessible sur http://localhost:5555

### Reinitialiser la base de données

```bash
# Supprimer les volumes (efface toutes les données)
docker compose -f docker-compose.dev.yml down -v

# Relancer
docker compose -f docker-compose.dev.yml up --build
```

> Attention : `down -v` est destructif (suppression complete des donnees locales). A utiliser uniquement avec validation explicite.

### Appliquer manuellement le schema Prisma (non destructif)

```bash
docker compose -f docker-compose.dev.yml exec backend npx prisma db push
```

### Lancer le seed manuellement (uniquement si necessaire)

```bash
docker compose -f docker-compose.dev.yml exec backend npx prisma db seed
```

### Lancer les tests unitaires

```bash
docker compose -f docker-compose.dev.yml exec backend npm test
```

---

## Structure des services Docker (mode dev)

```
docker-compose.dev.yml
├── mysql     → MySQL 8.0          (port 3306)
├── redis     → Redis 7            (port 6379)
├── backend   → Node.js + ts-node-dev (port 3000, hot-reload)
└── frontend  → Vite dev server    (port 5173, hot-reload)
```

Le hot-reload est actif : toute modification dans `src/backend/src/` ou `src/frontend/src/` est répercutée automatiquement sans redémarrer les conteneurs.

---

## Données de démarrage (seed)

Le seed de dev n'est plus lance automatiquement au demarrage du backend. Il peut etre lance manuellement si necessaire. Le seed ajoute notamment :

| Donnée | Valeur |
|---|---|
| Utilisateur admin | admin@dev.local |
| Client de démo | "Client Démo" (id=1) |
| Projet de démo | DEMO |
| KPIs configurés | Ratio Estimé/Consommé, Taux de Retours, Tickets sans estimation, Tickets avec IA |
| Résultats | 6 mois de données simulées |

---

## Lancement en production (avec Azure AD)

### 1. Configurer les variables d'environnement

```bash
cp .env.example .env
```

Editer `.env` et renseigner :

```env
DATABASE_URL="mysql://portailkpi:<mot-de-passe>@<host>:3306/portailkpi"
REDIS_URL="redis://<host>:6379"
AZURE_AD_TENANT_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
AZURE_AD_CLIENT_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
VITE_AZURE_AD_TENANT_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
VITE_AZURE_AD_CLIENT_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### 2. Lancer

```bash
docker compose up --build
```

---

## Résolution des problèmes courants

### Le backend ne démarre pas ("database connection failed")

MySQL n'est pas encore prêt. Attendre que le healthcheck passe (30–60 secondes) puis relancer :
```bash
docker compose -f docker-compose.dev.yml restart backend
```

### Le port 3306 ou 5173 est déjà utilisé

Modifier le mapping dans `docker-compose.dev.yml` :
```yaml
ports:
  - "3307:3306"   # changer le port hôte
```

### Erreur "ENOSPC: no space left" ou "disk full"

Nettoyer les images Docker inutilisées :
```bash
docker system prune -f
```

### Voir la version de l'API en cours

```bash
curl http://localhost:3000/health
```

Réponse attendue : `{"status":"ok","timestamp":"..."}`
