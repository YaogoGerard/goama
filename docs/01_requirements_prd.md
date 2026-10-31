# PRD — Goama, messagerie administrative souveraine

**Version :** 0.5 · **Date :** 31 octobre 2026 · **Statut :** brouillon à valider
**Nature :** vision produit et périmètre. Ce document décrit le problème, pas la solution technique.

## 1. Résumé

Goama fournit aux agents de l'administration publique burkinabè autorisés un moyen de communiquer et de partager des documents officiels de manière confidentielle, contrôlée et vérifiable, sur une infrastructure que l'État maîtrise. L'accès dépend d'une identité vérifiée et d'une autorisation active ; le contenu des échanges reste lisible uniquement par les participants.

## 2. Problème

Les agents échangent aujourd'hui des ordres de service, des décrets et des pièces jointes sur des messageries grand public dont les serveurs échappent à l'État. Conséquences :
- la confidentialité des échanges officiels n'est pas garantie ;
- un agent qui part ou perd son matériel garde son accès ;
- rien ne prouve qu'un ordre de service a été lu ;
- il est difficile de savoir qui contacter, dans quel ministère, et s'il est joignable ;
- un message sensible n'est pas traité autrement qu'un message ordinaire.

## 3. Acteurs

Goama connaît **deux utilisateurs**, et un refus.

- **Agent** : pré-inscrit, identité et second facteur vérifiés. Il possède une **catégorie** (P, A, B, C, D, E), un **poste officiel** — sa fonction : Ministre, Directeur Central, Chef de Service, Rédacteur… — et un **ministère**. Ces trois informations sont distinctes et ne se déduisent pas l'une de l'autre. Il consulte l'annuaire, échange des messages et gère les groupes dont il est créateur ou parrain.
- **Administrateur** : pré-inscrit les agents, délivre les codes d'activation, révoque les accès, consulte le journal. Son rôle ne lui donne **pas** le droit de lire les conversations, et il n'intervient **jamais** sur les groupes.
- **Personne non enrôlée** : aucune autorisation ; toute fonction protégée lui est refusée.

### Parrainage

Un groupe n'est créé que par un **parrain** : un agent dont le **poste officiel** confère la capacité de parrainage. Un agent qui ne l'a pas adresse une **demande** à un parrain, qui la valide et rejoint le groupe. Le parrainage ne dépend **ni du ministère, ni de la structure, ni d'un périmètre** : un parrain habilité peut valider la demande de tout agent actif. Créateur et parrain gèrent ensuite le groupe ensemble.

| Poste officiel | Catégorie standard | Parrainage |
|---|---|---:|
| Ministre | Hors catégorie | Oui |
| Directeur de Cabinet | P / A | Oui |
| Secrétaire Général | P / A | Oui |
| Directeur Général | A, échelle 1 | Oui |
| Directeur Central / Sectoriel | A, échelle 1/2 | Oui |
| Inspecteur Technique | A | Oui |
| Chef de Service | A / B | Oui |
| Conseiller Technique | P / A | Non |
| Chargé de Mission | A | Non |
| Chargé d'Études | A | Non |
| Secrétaire Particulier | B / C | Non |
| Administrateur Système / IT | A / B | Non |
| Rédacteur / Agent technique | B / C / D / E | Non |

La capacité de parrainage vient du **poste**, jamais de la catégorie : un Conseiller Technique (P/A) ne parraine pas, un Chef de Service (A/B) parraine. La matrice est une donnée institutionnelle reprise du cadre du projet ; à confirmer avec le statut général de la fonction publique avant tout usage réel.

## 4. Cas d'usage principaux

1. Pré-inscrire un agent (matricule, nom, ministère, fonction, catégorie — le poste officiel en déduit la capacité de parrainage), lui envoyer un code d'activation par e-mail (24 h), activer son compte avec second facteur.
2. Retrouver un agent par ministère et par poste officiel et voir s'il est en ligne.
3. Échanger des messages et des pièces jointes en 1-1 et en groupe.
4. Classer un message (Normal, Diffusion restreinte, Confidentiel) et en limiter la circulation.
5. Savoir si un message 1-1 a été envoyé, distribué et **lu**, avec une preuve de lecture.
6. Révoquer un agent et le retirer des conversations.
7. Consulter le journal d'administration sans accéder au contenu.
8. Demander la création d'un groupe, la faire valider par un parrain, puis gérer le groupe avec lui (membres, nom, co-parrains).

## 5. Fonctionnalités innovantes

| Fonctionnalité | Besoin | Ce qui sera démontré | Limite assumée |
|---|---|---|---|
| **Accusé de lecture à valeur probante** | Prouver qu'un ordre de service a été lu | « Lu » signé par l'appareil du destinataire, que le serveur ne peut ni créer ni modifier | La preuve atteste qu'un appareil enrôlé a affiché le message ; sa valeur légale n'est pas affirmée sans avis juridique |
| **Présence et annuaire par ministère** | Trouver le bon interlocuteur et savoir s'il est joignable | Recherche par ministère et par poste officiel ; état en ligne, visible des seuls interlocuteurs | Découle de la présence : le serveur sait qui est connecté |
| **Classification des messages** | Traiter autrement un message sensible | Trois niveaux ; transfert et export bloqués ; expiration automatique du niveau Confidentiel | Protection assurée par l'application : elle ne peut empêcher une photo de l'écran |

Au sprint, les accusés de lecture concernent les **conversations 1-1** uniquement.

## 6. Objectifs mesurables

Le projet démontre sa valeur si :
- une personne non pré-inscrite ne peut pas activer de compte ;
- deux agents échangent des messages et une pièce jointe chiffrés de bout en bout ;
- l'inspection de la base, du cache, du stockage de fichiers et du trafic ne révèle aucun contenu en clair ;
- une révocation coupe l'accès en **5 secondes au plus** et retire cryptographiquement l'agent des groupes, avec un état visible tant que le retrait n'est pas terminé ;
- un accusé « Lu » est vérifié par l'émetteur et ne peut pas être fabriqué par le serveur ;
- la présence reflète l'état réel à **40 secondes** près ;
- un compte révoqué n'est **jamais supprimé** de la base, tandis que le contenu chiffré de plus de 30 jours part du serveur ;
- l'installation du serveur tient en **une seule commande**, et la commande d'amorçage crée le premier Administrateur sur une installation vierge ;
- les scénarios critiques sont couverts par des tests reproductibles.

## 7. Périmètre

| Niveau | Contenu |
|---|---|
| **Sprint (P0)** | Pré-inscription, activation avec second facteur, session unique, messages 1-1 et groupes, parrainage et validation d'une demande de groupe, gestion du groupe par le créateur et le parrain, chiffrement de bout en bout, serveur aveugle, pièces jointes chiffrées, révocation en deux temps, accusés de lecture 1-1, annuaire et présence, classification, journal d'audit, installation en une commande |
| **Si le temps le permet (P1)** | Départ volontaire, suspension et reprise d'un groupe, gel du groupe sans parrain, filigrane, reprise des transferts, purge automatique, métriques, sauvegarde |
| **Après le sprint (P2)** | Rôle d'auditeur, export d'une preuve de lecture, masquage de présence, passage à 5 000 connexions |

Ordre du hackathon : **tout le P0 d'abord, l'intégralité du P1 ensuite** ; aucun P2. Si le temps manque, les P1 se retirent un à un, jamais les éléments du socle P0.

## 8. Hors périmètre initial

- messagerie ouverte au public ; inscription libre ;
- appels audio et vidéo ;
- plusieurs appareils par agent ;
- accusés de lecture dans les groupes ;
- blocage des captures d'écran et des photos d'écran ;
- lien d'invitation public à un groupe, icône de groupe, restriction d'envoi aux seuls parrains ;
- suppression d'un message pour tous ceux qui l'ont déjà reçu ;
- suppression définitive d'un compte (un compte révoqué reste en base ; le contenu serveur est purgé à 30 jours) ;
- récupération du second facteur en libre-service (l'Administrateur régénère) ;
- archivage légal certifié ;
- effacement à distance de données déjà copiées.

## 9. Principes produit

**Confidentialité** · **Accès contrôlé** · **Révocation explicite** · **Minimisation** (présence et annuaire limités au nécessaire) · **Traçabilité sans contenu** · **Honnêteté** (limites annoncées, aucune preuve revendiquée au-delà de ce qui est vérifiable) · **Résilience** (erreurs et attentes visibles).
