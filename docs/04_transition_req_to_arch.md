# De l'exigence à l'architecture

**Version :** 0.5 · **Date :** 31 octobre 2026
**Chaîne suivie :** Exigence → Garantie → Responsabilité → Structure (composant). Ce document ne choisit ni langage ni framework : la technologie est traitée dans `06_architecture_decisions.md`, comme **conséquence** des composants.

## 1. Étape 1 et 2 — Nature et garantie

La **nature** de chaque exigence (règle métier, invariant, politique, processus) et la **garantie** qu'elle sert figurent dans `02_requirements_srs.md`. Les garanties G-01 à G-13 sont définies dans `03_design_contract_invariants.md`. Huit exigences n'ont pas de garantie (fonctionnement, exploitation) : elles sont des contraintes de réalisation.

## 2. Étape 3 — Une garantie, une responsabilité principale

### 2.1 Responsabilités

| ID | Responsabilité | Elle possède |
|---|---|---|
| R-01 | Identités et sessions | Pré-inscription, activation (code par e-mail, 24 h), second facteur, session unique, statut du compte, création du premier Administrateur par commande d'amorçage |
| R-02 | Contrôle d'accès | Point de décision unique, rôles, catégories, capacité de parrainage déduite du poste officiel, refus par défaut |
| R-03 | Protection cryptographique côté client | Chiffrement, clés, état local chiffré, vérification des attestations |
| R-04 | Relais et livraison | Ordre des messages, files, états « envoyé » et « distribué » |
| R-05 | Groupes, parrainage et révocation | Validation des demandes de groupe, appartenance et rôles de groupe (créateur, parrain, co-parrain), gouvernance (membres, nom, suspension), coordination du retrait cryptographique, suivi d'état |
| R-06 | Pièces jointes | Chiffrement local des fichiers, stockage chiffré, taille |
| R-07 | Présence et annuaire | Signal de présence, expiration, recherche par ministère et fonction |
| R-08 | Classification | Niveaux, restrictions d'usage, expiration côté client |
| R-09 | Accusés de lecture | Production signée et vérification des « Lu » |
| R-10 | Audit | Événements de sécurité sans contenu |
| R-11 | Protection contre les abus | Limites de débit, de taille et de concurrence |
| R-12 | Stockage et cycle de vie | Rétention (30 jours sur le contenu chiffré), purge, aucune suppression de compte, rechargement des états au démarrage |
| R-13 | Administration | Opérations de l'Administrateur et vue de suivi ; aucune opération de suppression de compte |

### 2.2 Garantie → responsable principal (unique)

| Garantie | Responsable principal | Contributeurs | Preuve |
|---|---|---|---|
| G-01 Accès réservé | R-02 Contrôle d'accès | R-01, R-03 (attestations) | T-001, T-007, T-043 |
| G-02 Serveur aveugle | R-03 Cryptographie client | R-04, R-12 | T-015 |
| G-03 Pièces jointes protégées | R-06 Pièces jointes | R-03, R-12 | T-020 |
| G-04 Coupure serveur en 5 s | R-01 Identités et sessions | R-02, R-12 (cache) | T-038, T-039 |
| G-05 Retrait cryptographique suivi | R-05 Groupes et révocation | R-03, R-10, R-13 | T-040, T-041 |
| G-06 Administration sans accès aux contenus | R-02 Contrôle d'accès | R-13, R-10 | T-011 |
| G-07 Journaux et caches sans contenu | R-10 Audit | R-12, R-04 | T-044 |
| G-08 « Lu » authentique | R-09 Accusés de lecture | R-03 | T-025, T-026 |
| G-09 Classification appliquée, limites annoncées | R-08 Classification | R-03 | T-034 à T-036 |
| G-10 Présence et annuaire minimaux | R-07 Présence et annuaire | R-02, R-12 | T-029 à T-032 |
| G-11 Pas de succès silencieux | R-04 Relais et livraison | R-05, R-06 | T-017, T-053 |
| G-12 Limites partout | R-11 Abus | R-02 | T-046, T-047 |
| G-13 Secrets sur l'appareil | R-03 Cryptographie client | R-08 | T-016 |

## 3. Étape 4 — Regroupement par cohésion

On regroupe ce qui change ensemble et on sépare ce qui évolue à des rythmes ou avec des risques différents.

| Groupe | Responsabilités | Pourquoi ensemble | Pourquoi séparé des autres |
|---|---|---|---|
| **A. Identité et accès** | R-01, R-02, R-13 | Rôles, catégories, activation et révocation changent ensemble | Seul groupe qui décide « qui a le droit » |
| **B. Cœur cryptographique client** | R-03, R-08, R-09 | Tout dépend de l'état de chiffrement local ; classification et accusés sont des messages chiffrés | Doit vivre sur l'appareil, hors de portée du serveur |
| **C. Conversations et relais** | R-04, R-05, R-12 | Ordre, livraison, appartenance et rétention manipulent les mêmes données chiffrées | Ne lit jamais le contenu |
| **D. Fichiers** | R-06 | Cycle de vie, taille et stockage propres | Charge et volume très différents des messages |
| **E. Présence et annuaire** | R-07 | Données volatiles, fréquence élevée, aucune persistance | Doit pouvoir s'effondrer sans toucher la messagerie |
| **F. Garde-fous** | R-10, R-11 | S'appliquent à tous les autres, sans contenu privé | Transversal : un seul endroit pour limiter et journaliser |

## 4. Étape 5 — Composants conceptuels

Les groupes deviennent des composants :

| Composant | Rôle | Reçoit / expose |
|---|---|---|
| **Identité et accès** | Décide de l'accès et tient l'état des comptes et sessions | Décisions d'autorisation à tous |
| **Cœur cryptographique** (client) | Chiffre, déchiffre, signe, vérifie, applique la classification | Données chiffrées seulement vers l'extérieur |
| **Conversations et relais** | Ordonne et distribue les données chiffrées, suit la révocation par groupe | Blobs chiffrés, accusés serveur |
| **Fichiers** | Reçoit et sert des fichiers déjà chiffrés | Blobs chiffrés |
| **Présence et annuaire** | Fournit l'état en ligne et la recherche | Présence volatile, fiches d'annuaire |
| **Garde-fous** | Limite, journalise, refuse | Refus 429, événements d'audit |

## 5. Frontières de confiance

| Frontière | Côté de confiance | Côté non fiable |
|---|---|---|
| Appareil ↔ réseau | Cœur cryptographique | Réseau, proxy |
| Réseau ↔ serveur | Identité et accès (après authentification) | Tout client non authentifié |
| Serveur ↔ contenu | — (aucune confiance : il ne lit pas) | Serveur, base, cache, stockage |

## 6. Questions de contrôle

- **Qui porte chaque garantie ?** Voir §2.2 : un responsable principal unique.
- **Où vit chaque règle ?** Règles d'accès dans « Identité et accès » ; règles de contenu dans le « Cœur cryptographique », sur l'appareil.
- **Source de vérité des états ?** Comptes, sessions, appartenances et retraits : PostgreSQL. Présence : Redis. Révocation en cache : Redis, rechargé depuis PostgreSQL.
- **Que se passe-t-il quand le cache est vide ?** Il est reconstruit ; en attendant, les sessions sont refusées (INV-007).

## 7. Lien avec UML et C4

Les composants du §4 sont la base du diagramme de composants et des conteneurs de `05_modeling_uml_c4.md` ; les comportements (activités, séquences) décrivent comment ces responsabilités coopèrent.
