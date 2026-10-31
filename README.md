# Goama — Documentation du projet

**Messagerie administrative souveraine, chiffrée de bout en bout**
**Version :** 0.5 — 31 octobre 2026 · **Statut :** base de travail à valider par l'équipe
**Contexte :** Hackathon 226, sprint pré-hackathon 2026 (MTDPCE / DGTD, Burkina Faso) — équipe de 3, moins d'une semaine

## Méthode

Chaîne de la méthode SWE-FOUNDATIONS-BEFORE-CODE : **Exigence → Garantie → Responsabilité → Structure**, puis modèles et architecture. Les identifiants (REQ-…, G-…, INV-…, R-…, T-…) relient chaque étape à la suivante.

## Fichiers

| Fichier | Contenu |
|---|---|
| [`docs/00_foundation_engineering_mindset.md`](docs/00_foundation_engineering_mindset.md) | État d'esprit, définitions, règles propres au projet |
| [`docs/01_requirements_prd.md`](docs/01_requirements_prd.md) | Problème, acteurs, innovations, périmètre |
| [`docs/02_requirements_srs.md`](docs/02_requirements_srs.md) | Contraintes, exigences (nature, garantie, priorité), hypothèses |
| [`docs/03_design_contract_invariants.md`](docs/03_design_contract_invariants.md) | Garanties G-01 à G-13, invariants, interdits, limites |
| [`docs/04_transition_req_to_arch.md`](docs/04_transition_req_to_arch.md) | Responsabilités, regroupement, composants |
| [`docs/05_modeling_uml_c4.md`](docs/05_modeling_uml_c4.md) | Modèles C4 et UML (Mermaid) |
| [`docs/06_architecture_decisions.md`](docs/06_architecture_decisions.md) | Stack, décisions, débit, cache, métadonnées, déploiement, risques |
| [`docs/07_acceptance_tests.md`](docs/07_acceptance_tests.md) | Tests, épreuves du jury, matrice de couverture |
| [`docs/08_interfaces_api.md`](docs/08_interfaces_api.md) | Contrat d'API REST et WebSocket (fusion du brouillon, adapté aux décisions) |
| [`docs/09_data_model.md`](docs/09_data_model.md) | Modèle de données (ERD fusion du brouillon, adapté aux décisions) |
| `docs/design/` | Logos du projet |

## Décisions de l'équipe retenues

| Sujet | Décision |
|---|---|
| Stack | Client web Vue.js 3 + OpenMLS en WebAssembly, API Fastify, PostgreSQL, Redis, BullMQ, MinIO, tableau de bord Vue.js |
| Innovations | Accusés de lecture à valeur probante (1-1), présence et annuaire par ministère, classification des messages |
| Rôles | Deux utilisateurs : l'**Agent** et l'**Administrateur**, plus la personne non enrôlée, qui n'a aucun droit |
| Catégories | P, A, B, C, D, E, et « hors catégorie » ; la **capacité de parrainage** se déduit du **poste officiel**, jamais de la catégorie |
| Parrainage | Un groupe n'est créé que par un parrain habilité, ou après validation de sa demande par un parrain — **sans contrainte de ministère ni de périmètre** |
| Groupes | Créateur **et** parrain gèrent le groupe : membres, nom, co-parrains, suppression ; départ volontaire, suspension, reprise ; un groupe sans parrain est gelé |
| Accusé « Lu » | **Signé par l'appareil enrôlé** (valeur probante technique) |
| Classification | **Étiquette de niveau** (Normal, Diffusion restreinte, Confidentiel) affichée sur le message ; restrictions applicatives, jamais bloquant côté envoi |
| Activation | Code à usage unique **par e-mail professionnel, valable 24 h** |
| Second facteur | Récupération **par l'Administrateur** (révocation puis nouvel enrôlement) ; aucun code de secours en libre-service |
| Appareil | Un seul par agent, une seule session à la fois |
| Révocation | Coupure serveur **immédiate** et retrait cryptographique MLS dès qu'un membre du groupe est en ligne |
| Comptes | **Jamais supprimés** ; contenu chiffré serveur purgé à 30 jours ; journaux conservés 90 jours |
| Étape 0 | Premier Administrateur créé par une **commande d'amorçage** sur installation vierge |
| Périmètre | Ordre du hackathon : tout le **P0** d'abord, l'intégralité du **P1** ensuite, aucun P2 |
| API et ERD | Contrat d'API et modèle de données du dossier `brouillon/` **fusionnés** dans la documentation officielle (docs 08 et 09) |
| Clés | IndexedDB, clé WebCrypto non extractible |
| Risque accepté | Pas de plan B si OpenMLS en WebAssembly échoue |

## Conventions

**DOIT / NE DOIT PAS / DEVRAIT / PEUT** (RFC 2119). **P0** indispensable à la démonstration · **P1** si le temps le permet · **P2** conçu, non implémenté.

## Statut

Cette documentation est une base de cadrage, pas une certification de sécurité. Rien n'y est présenté comme implémenté. Les diagrammes Mermaid n'ont pas été rendus automatiquement. Avant le dépôt, chaque affirmation de sécurité reprise dans les notes doit être vérifiée dans le code et par un test, et les licences (Redis, MinIO en particulier) relues.
