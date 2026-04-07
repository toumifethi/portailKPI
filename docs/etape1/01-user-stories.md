# User Stories — Portail KPI Productivité

> **Version** : 1.2
> **Étape** : 1 — Cahier des charges et spécifications fonctionnelles
> **Statut** : À valider

---

## Sommaire

- [Rôle : Admin](#rôle--admin)
- [Rôle : Développeur](#rôle--développeur)
- [Rôle : Chef de projet](#rôle--chef-de-projet)
- [Rôle : Delivery Manager](#rôle--delivery-manager)

---

## Rôle : Admin

### US-ADM-001 — Ajouter une instance JIRA client
**En tant qu'Admin**, je souhaite ajouter une nouvelle instance JIRA Cloud (URL, email de service, API token) afin de permettre à l'application d'importer les données de ce client.

**Critères d'acceptation :**
- Je peux saisir l'URL de l'instance JIRA Cloud
- Je peux saisir un email et un API token pour l'authentification
- Je peux activer ou désactiver l'intégration Tempo pour ce client
- Si Tempo est activé, je peux saisir un token Tempo dédié (distinct du token JIRA)
- L'application teste la connexion avant de sauvegarder
- En cas d'échec, un message d'erreur explicite est affiché (ex. : "401 - Token invalide")

---

### US-ADM-002 — Modifier une instance JIRA client
**En tant qu'Admin**, je souhaite modifier les paramètres d'une instance JIRA existante (credentials, activation Tempo, statut actif/inactif) afin de maintenir la configuration à jour.

**Critères d'acceptation :**
- Toute modification des credentials déclenche un test de connexion automatique
- La désactivation d'une instance stoppe les imports sans supprimer les données historiques

---

### US-ADM-003 — Configurer le mapping des champs JIRA par client
**En tant qu'Admin**, je souhaite configurer les champs JIRA utilisés pour chaque KPI d'un client donné afin de m'adapter aux spécificités de chaque instance.

**Critères d'acceptation :**
- La liste des champs disponibles est récupérée dynamiquement via l'API JIRA (`/rest/api/3/field`)
- Je peux configurer :
  - le champ "estimation initiale" (ex. : `story_points`, `timeoriginalestimate`)
  - le champ "temps consommé" (ex. : `timespent` ou champ personnalisé)
  - le champ JIRA liant un Epic à un Chef de projet (champ personnalisé)
  - le(s) type(s) de lien JIRA utilisé(s) pour les retours (KPI Qualité)
- La configuration est sauvegardée par client

---

### US-ADM-004 — Configurer les statuts "terminé" par client
**En tant qu'Admin**, je souhaite définir quels statuts JIRA sont considérés comme "terminé" pour un client donné afin de déclencher le calcul correct du KPI "Respect des charges".

**Critères d'acceptation :**
- La liste des statuts est récupérée depuis l'API JIRA de l'instance cliente
- Je peux sélectionner un ou plusieurs statuts
- La configuration est modifiable à tout moment

---

### US-ADM-005 — Configurer les types de tickets par client
**En tant qu'Admin**, je souhaite configurer les types de tickets à inclure ou exclure des calculs KPI pour un client donné afin de refléter les règles métier spécifiques.

**Critères d'acceptation :**
- La liste des types de tickets est récupérée depuis l'API JIRA de l'instance
- Je peux configurer des listes d'inclusion et d'exclusion par KPI
- Exemple : exclure le type "Retour" du KPI "Respect des charges"

---

### US-ADM-006 — Créer un KPI avec formule prédéfinie
**En tant qu'Admin**, je souhaite créer un KPI en sélectionnant un type de formule prédéfini et en configurant ses paramètres afin de mettre en place rapidement un calcul standard.

**Critères d'acceptation :**
- Je sélectionne un type de formule dans un catalogue prédéfini (ex. : "Écart estimation/consommé", "Ratio retours/estimation", "Comptage par statut")
- Je configure les paramètres : champs source, statuts cibles, types de tickets, règle d'agrégation (somme, moyenne)
- Je peux activer/désactiver ce KPI par client
- Je peux définir des seuils d'alerte (vert / orange / rouge) par client

---

### US-ADM-007 — Créer un KPI avec requête JQL
**En tant qu'Admin**, je souhaite créer un KPI en définissant une requête JQL afin de couvrir des besoins de filtrage non disponibles dans les formules prédéfinies.

**Critères d'acceptation :**
- Je peux saisir une requête JQL dans un éditeur dédié
- L'application valide la syntaxe JQL avant sauvegarde
- Je configure la règle d'agrégation sur les issues retournées (count, sum, avg)
- Je peux tester la requête et voir un aperçu des résultats (calculés sur les données locales)
- Une documentation des limitations JQL supportées en mode local est accessible

---

### US-ADM-008 — Créer un KPI avec requête SQL
**En tant qu'Admin**, je souhaite créer un KPI en définissant une requête SQL sur la base interne afin de produire des indicateurs complexes croisant plusieurs entités.

**Critères d'acceptation :**
- Seules les requêtes `SELECT` sont acceptées (les requêtes `INSERT`, `UPDATE`, `DELETE`, `DROP` sont rejetées)
- Je peux tester la requête et voir un aperçu des résultats
- Une documentation des tables et colonnes disponibles est accessible dans l'interface
- La requête est validée avant sauvegarde (syntaxe + lecture seule)

---

### US-ADM-009 — Activer / désactiver un KPI par client
**En tant qu'Admin**, je souhaite activer ou désactiver un KPI pour un client donné afin de n'afficher que les indicateurs pertinents pour ce contexte.

---

### US-ADM-010 — Dupliquer une configuration KPI
**En tant qu'Admin**, je souhaite dupliquer la configuration d'un KPI depuis un client source vers un ou plusieurs clients cibles afin de gagner du temps lors de la configuration d'instances similaires.

**Critères d'acceptation :**
- La duplication crée une copie modifiable (elle ne lie pas les configurations)
- Les champs spécifiques au client cible doivent être revalidés après duplication

---

### US-ADM-011 — Voir et gérer les utilisateurs
**En tant qu'Admin**, je souhaite voir la liste complète des utilisateurs (actifs, manuels, archivés) avec leur rôle, leurs clients et leur statut afin de superviser les accès.

**Critères d'acceptation :**
- Filtres disponibles : rôle, client, statut (actif / manuel / sans saisie / archivé)
- Pour chaque utilisateur : nom, email, rôle, équipes associées, date dernière saisie JIRA, statut
- Accès à la fiche détaillée d'un utilisateur

---

### US-ADM-012 — Modifier le rôle d'un utilisateur
**En tant qu'Admin**, je souhaite modifier le rôle applicatif d'un utilisateur (Développeur, Chef de projet, Delivery Manager, Admin) afin d'adapter ses droits d'accès.

---

### US-ADM-013 — Ajouter manuellement un utilisateur
**En tant qu'Admin**, je souhaite ajouter manuellement un utilisateur non présent dans JIRA afin de l'identifier dans l'application (notamment pour le relancer en cas d'absence de saisie).

**Critères d'acceptation :**
- Je saisis : nom, prénom, email, rôle applicatif
- Je peux associer cet utilisateur à une ou plusieurs équipes / clients
- L'utilisateur est marqué avec le statut `MANUEL`
- L'utilisateur ne peut pas se connecter via SSO s'il n'a pas de compte Office 365 correspondant

---

### US-ADM-014 — Archiver un utilisateur
**En tant qu'Admin**, je souhaite archiver un utilisateur ayant quitté un projet afin de le retirer des vues actives tout en conservant son historique.

**Critères d'acceptation :**
- L'utilisateur archivé ne peut plus se connecter à l'application
- Ses données historiques (KPI, worklogs) sont conservées et consultables via un filtre "Afficher archivés"
- L'archivage est réversible (réactivation par Admin uniquement)
- La synchronisation JIRA ne réactive pas automatiquement un utilisateur archivé

---

### US-ADM-015 — Gérer les équipes (membres et surcharges)
**En tant qu'Admin**, je souhaite voir la liste des équipes synchronisées depuis JIRA et pouvoir y ajouter, retirer ou archiver des membres manuellement afin de refléter la réalité opérationnelle.

**Critères d'acceptation :**
- Chaque équipe correspond à un projet JIRA d'une instance client
- Les membres synchronisés depuis JIRA sont affichés avec un indicateur "JIRA"
- Les membres ajoutés manuellement sont affichés avec un indicateur "Manuel"
- Les ajouts et modifications manuels sont préservés lors des resynchronisations ultérieures

---

### US-ADM-016 — Déclencher un import incrémental manuel
**En tant qu'Admin**, je souhaite déclencher manuellement un import incrémental pour un client donné afin de forcer une mise à jour immédiate sans attendre l'import planifié.

**Critères d'acceptation :**
- Je sélectionne le client cible
- L'import démarre immédiatement en arrière-plan
- Je peux suivre l'avancement en temps réel
- Je suis notifié dans l'application à la fin de l'import (succès ou erreur)

---

### US-ADM-017 — Déclencher un import backfill (historique)
**En tant qu'Admin**, je souhaite déclencher un import historique pour un client en spécifiant une date de début afin de charger les données antérieures à la mise en production.

**Critères d'acceptation :**
- Je sélectionne un client et une date de début
- L'application affiche une estimation du volume à importer si possible
- Le job s'exécute en arrière-plan, paginé, sans bloquer les autres imports
- La progression est visible (nombre d'issues traitées / total estimé)
- Je peux annuler un backfill en cours
- Je suis notifié à la fin du job

---

### US-ADM-018 — Consulter l'historique des imports
**En tant qu'Admin**, je souhaite consulter l'historique complet des imports (date, client, type, statut, volume, erreurs) afin de superviser la santé des synchronisations.

**Critères d'acceptation :**
- Filtres : client, type d'import (incrémental / backfill / planifié), statut, période
- Pour chaque import : date de début, date de fin, durée, nombre d'issues importées, nombre d'erreurs
- Accès au détail des erreurs pour un import donné

---

### US-ADM-019 — Rejouer un import échoué
**En tant qu'Admin**, je souhaite relancer un import ayant échoué en un clic afin de récupérer rapidement après une indisponibilité temporaire.

---

### US-ADM-019bis — Archiver un contexte client
**En tant qu'Admin**, je souhaite archiver un contexte client (instance JIRA + données associées) afin de le retirer des vues actives tout en conservant son historique consultable.

**Critères d'acceptation :**
- L'archivage d'un client stoppe immédiatement ses imports planifiés
- Le client archivé n'apparaît plus dans les sélecteurs par défaut (dashboard, filtres, planification)
- Les données historiques (KPI, tickets, worklogs, membres) sont intégralement conservées
- Un filtre "Afficher les clients archivés" permet de retrouver et de consulter leurs données
- La réactivation d'un client archivé est possible (Admin uniquement) ; les imports reprennent en incrémental depuis la date de réactivation
- L'archivage est traçable (date, auteur, motif optionnel)
- Il n'est pas possible d'archiver un client ayant un import en cours (le job doit être terminé ou annulé d'abord)

---

### US-ADM-020 — Configurer la planification des imports
**En tant qu'Admin**, je souhaite configurer les horaires d'import automatique (heure, fréquence) pour chaque client afin d'optimiser la fraîcheur des données.

**Critères d'acceptation :**
- Je peux définir une ou plusieurs plages horaires par client
- La planification par défaut est commune à tous les clients (ex. : nuit entre 2h et 4h)
- Un client peut avoir une planification différente si besoin

---

### US-ADM-021 — Identifier les collaborateurs sans saisie récente
**En tant qu'Admin**, je souhaite voir la liste des collaborateurs n'ayant pas enregistré de temps sur JIRA depuis N jours (N configurable) afin de les relancer.

**Critères d'acceptation :**
- Filtre par client, équipe, rôle
- Affichage : nom, équipe, client, date de dernière saisie, nombre de jours sans saisie
- Export CSV de la liste

---

### US-ADM-022 — Configurer le KPI "Tickets sans estimation"
**En tant qu'Admin**, je souhaite configurer un KPI mesurant le nombre de tickets en cours sans estimation initiale afin de piloter la complétude des chiffrages.

**Critères d'acceptation :**
- Je sélectionne les statuts JIRA considérés comme "en cours" pour ce KPI (liste dynamique récupérée depuis l'API JIRA)
- Je configure les types de tickets inclus (ex. : Story, Bug) et exclus (ex. : Sub-task)
- La valeur du KPI est un entier : nombre de tickets correspondant aux critères sur la période
- L'évolution dans le temps est disponible (graphique mensuel)
- Les seuils d'alerte (vert / orange / rouge) sont configurables par client
- La configuration est sauvegardée dans le catalogue KPI et peut être activée/désactivée par client
- Un drill-down vers la liste des tickets concernés est disponible

---

### US-ADM-023 — Configurer le KPI "Tickets développés avec IA"
**En tant qu'Admin**, je souhaite configurer un KPI mesurant la part des tickets développés avec assistance IA afin de suivre l'adoption des outils IA dans les équipes.

**Critères d'acceptation :**
- Je saisis le nom du champ JIRA personnalisé qui porte l'information IA (ex. : `customfield_12345`)
- Je configure les règles de comptage : pour chaque valeur possible du champ (ex. : "Oui", "Partiel", "Non", vide), je choisis si elle est comptée comme "avec IA" ou non
- La valeur du KPI est un pourcentage : `(tickets avec IA / total tickets terminés sur la période) × 100` ; une valeur brute (entier) est également disponible
- L'évolution dans le temps est disponible (graphique mensuel)
- Si le champ IA n'est pas présent dans l'instance JIRA d'un client, le KPI est automatiquement désactivé pour ce client avec un message explicatif
- Les seuils d'alerte sont configurables par client
- Un drill-down vers la liste des tickets avec la valeur du champ IA est disponible

---

### US-ADM-024 — Vue évolution KPI tous contextes clients confondus
**En tant qu'Admin**, je souhaite consulter l'évolution d'un KPI donné sur tous les clients (ou une sélection) en une seule vue afin d'effectuer des comparaisons transversales.

**Critères d'acceptation :**
- Je sélectionne un KPI, une période, et optionnellement un sous-ensemble de clients
- Le graphique affiche une courbe par client sélectionné
- Filtres disponibles pour affiner le périmètre de calcul :
  - Exclure certains statuts JIRA du calcul
  - Exclure certains collaborateurs nommément
  - Exclure certains types de tickets
  - Exclure les clients archivés (activé par défaut)
- Les filtres sont sauvegardables comme vue nommée (persistance par utilisateur)
- Export CSV/Excel/PDF du graphique et des données brutes

---

### US-ADM-026 — Tableau de bord de santé du système
**En tant qu'Admin**, je souhaite voir un tableau de bord récapitulatif de l'état des imports, des erreurs en cours et des alertes KPI afin de superviser l'ensemble du système.

**Critères d'acceptation :**
- Résumé par client : dernier import (date, statut), prochain import planifié, nombre d'erreurs actives
- Alertes KPI actives (seuils dépassés) avec lien vers le détail
- Collaborateurs sans saisie (résumé chiffré avec lien vers la liste)

---

## Rôle : Développeur

### US-DEV-001 — Se connecter via SSO Office 365
**En tant que Développeur**, je souhaite me connecter avec mon compte Office 365 afin d'accéder à mes KPI sans gérer un mot de passe supplémentaire.

**Critères d'acceptation :**
- La connexion s'effectue via le flux OIDC Azure AD
- Si mon compte n'est pas enregistré dans l'application, l'accès est refusé avec un message clair
- La session est maintenue selon la durée configurée (ex. : 8h, renouvelable)

---

### US-DEV-002 — Voir mes KPI par client
**En tant que Développeur**, je souhaite voir mes KPI pour chaque client sur lequel j'interviens afin d'avoir une vue d'ensemble de mes performances.

**Critères d'acceptation :**
- Les KPI sont organisés par client
- Pour chaque KPI : valeur courante, indicateur visuel (vert / orange / rouge selon les seuils configurés), tendance (hausse / baisse / stable vs mois précédent)
- Les clients sans données sur la période sélectionnée sont grisés ou masquables
- Vue sur la période courante par défaut (mois en cours)

---

### US-DEV-003 — Consulter l'évolution mensuelle de mes KPI
**En tant que Développeur**, je souhaite voir l'évolution mensuelle de chaque KPI sur les N derniers mois afin de comprendre ma progression dans le temps.

**Critères d'acceptation :**
- Graphique d'évolution (courbe) sur 3, 6 ou 12 mois (sélectionnable)
- Valeur mensuelle affichée sur le graphe
- Possibilité de comparer deux KPI ou deux périodes

---

### US-DEV-004 — Filtrer mes KPI par période
**En tant que Développeur**, je souhaite filtrer mes KPI sur une période personnalisée (mois, trimestre, année, plage libre) afin d'analyser des intervalles spécifiques.

---

### US-DEV-005 — Consulter le détail des tickets pris en compte dans un KPI
**En tant que Développeur**, je souhaite pouvoir consulter la liste des tickets ayant servi au calcul d'un KPI afin de comprendre et vérifier le résultat.

**Critères d'acceptation :**
- Drill-down depuis la valeur d'un KPI vers la liste des tickets correspondants
- Pour chaque ticket : clé JIRA (avec lien vers JIRA), titre, statut, estimation initiale, temps consommé, écart calculé
- Tickets exclus du calcul visibles avec la raison d'exclusion (ex. : "estimation manquante")

---

### US-DEV-006 — Exporter mes KPI
**En tant que Développeur**, je souhaite exporter mes KPI en CSV, Excel ou PDF afin de les partager ou les archiver.

**Critères d'acceptation :**
- Export disponible sur la vue courante (KPI résumé) et sur la vue détail tickets
- Le PDF reproduit fidèlement la mise en page du dashboard
- L'export respecte le filtre de période actif

---

## Rôle : Chef de projet

### US-CP-001 — Voir les KPI de mon équipe par client
**En tant que Chef de projet**, je souhaite voir les KPI de chaque développeur de mon équipe pour le client concerné afin de piloter la performance.

**Critères d'acceptation :**
- Vue tableau : un développeur par ligne, les KPI actifs en colonnes
- Indicateurs visuels par seuil (vert / orange / rouge)
- Si je gère plusieurs équipes sur plusieurs clients, un sélecteur client est disponible
- Je ne vois que les collaborateurs de mes équipes

---

### US-CP-002 — Consulter les KPI consolidés par Epic
**En tant que Chef de projet**, je souhaite voir les KPI agrégés au niveau des Epics que je pilote afin d'évaluer la performance globale d'un périmètre fonctionnel.

**Critères d'acceptation :**
- Seuls les Epics pour lesquels je suis désigné (via le champ JIRA configuré) sont affichés
- KPI agrégés sur l'ensemble des tickets de l'Epic (tickets terminés sur la période)
- Drill-down : je peux développer une Epic pour voir les tickets et leur KPI individuel
- Epics sans champ CP renseigné : non visibles (ou visibles dans un onglet séparé si je suis Admin)

---

### US-CP-003 — Consulter l'évolution mensuelle des KPI de mon équipe
**En tant que Chef de projet**, je souhaite voir l'évolution mensuelle des KPI pour chaque développeur de mon équipe afin de suivre les tendances dans le temps.

**Critères d'acceptation :**
- Vue grille : développeur × mois, avec valeur du KPI dans chaque cellule
- Mise en couleur par seuil
- Filtre par KPI et par période

---

### US-CP-004 — Consulter en détail les KPI d'un développeur
**En tant que Chef de projet**, je souhaite accéder à la vue détaillée des KPI d'un développeur de mon équipe (jusqu'au niveau ticket) afin de préparer un entretien ou identifier un besoin d'accompagnement.

**Critères d'acceptation :**
- Je ne peux consulter que les développeurs de mes équipes
- Vue identique à la vue "Développeur" mais accessible depuis ma vue équipe

---

### US-CP-005 — Identifier les collaborateurs sans saisie
**En tant que Chef de projet**, je souhaite voir quels membres de mon équipe n'ont pas enregistré de consommé récemment afin de les relancer.

**Critères d'acceptation :**
- Liste filtrée sur mon équipe uniquement
- Affichage : nom, date de dernière saisie, nombre de jours sans saisie

---

### US-CP-006 — Exporter les KPI de mon équipe
**En tant que Chef de projet**, je souhaite exporter les KPI de mon équipe en CSV, Excel ou PDF afin de préparer un reporting.

---

## Rôle : Delivery Manager

### US-DM-001 — Voir les KPI de l'ensemble de mon périmètre
**En tant que Delivery Manager**, je souhaite voir les KPI de tous les collaborateurs (développeurs et chefs de projet) de mon périmètre afin d'avoir une vision transverse de la performance.

**Critères d'acceptation :**
- Mon périmètre est défini par l'Admin (liste de clients, équipes ou collaborateurs)
- Vue tableau avec filtre par rôle, client, équipe, période
- Indicateurs visuels par seuil

---

### US-DM-002 — Voir les KPI consolidés par client
**En tant que Delivery Manager**, je souhaite voir les KPI agrégés par client afin de comparer la performance entre projets.

---

### US-DM-003 — Voir les KPI consolidés par équipe
**En tant que Delivery Manager**, je souhaite voir les KPI agrégés par équipe (projet JIRA) afin d'identifier les équipes en difficulté.

---

### US-DM-004 — Consulter l'évolution mensuelle sur mon périmètre
**En tant que Delivery Manager**, je souhaite voir l'évolution mensuelle de chaque KPI pour chaque collaborateur de mon périmètre afin de suivre les tendances globales.

**Critères d'acceptation :**
- Vue heatmap ou grille : collaborateur × mois
- Filtre par KPI, client, équipe, période

---

### US-DM-005 — Gérer les rôles des membres de mon équipe
**En tant que Delivery Manager**, je souhaite modifier le rôle applicatif des membres de mon périmètre (Développeur ↔ Chef de projet) afin de refléter les évolutions organisationnelles sans solliciter l'Admin.

**Critères d'acceptation :**
- Le DM peut modifier uniquement les rôles `Développeur` et `Chef de projet`
- Le DM ne peut pas se promouvoir lui-même ni modifier le rôle d'un autre DM ou d'un Admin
- Les modifications sont tracées dans les logs d'audit

---

### US-DM-006 — Identifier les collaborateurs sans saisie
**En tant que Delivery Manager**, je souhaite voir les collaborateurs de mon périmètre n'ayant pas saisi de consommé récemment afin de coordonner les relances avec les chefs de projet.

---

### US-DM-007 — Vue évolution KPI tous clients de mon périmètre
**En tant que Delivery Manager**, je souhaite consulter l'évolution d'un KPI sur l'ensemble des clients de mon périmètre en une seule vue afin de comparer la performance entre projets.

**Critères d'acceptation :**
- Graphique multi-courbes : une courbe par client de mon périmètre
- Je peux exclure un ou plusieurs clients du graphique
- Filtres disponibles : exclure certains statuts JIRA, collaborateurs, types de tickets
- Les filtres actifs sont affichés de manière explicite ("Calcul excluant : Tom DUPUIS, statut In Progress")
- Export du graphique et des données en CSV/Excel/PDF

---

### US-DM-008 — Exporter les données KPI de mon périmètre
**En tant que Delivery Manager**, je souhaite exporter les KPI de mon périmètre en CSV, Excel ou PDF afin de préparer des revues de performance.
