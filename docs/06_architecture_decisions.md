# Décisions d'architecture

**Version :** 0.5 · **Date :** 31 octobre 2026
Ce document choisit les technologies **après** les composants (`04_transition_req_to_arch.md`) et les modèles (`05_modeling_uml_c4.md`). Il reprend le document d'architecture initial de l'équipe et en corrige plusieurs points (§6).

## 1. Des composants aux technologies

| Composant | Réalisation |
|---|---|
| Cœur cryptographique (client) | Client web Vue.js 3 + Vite ; OpenMLS compilé en WebAssembly ; IndexedDB et WebCrypto |
| Identité et accès, Conversations et relais, Fichiers, Présence et annuaire, Garde-fous | Modules de l'API Fastify (monolithe modulaire) : `auth`, `agents`, `messaging`, `media`, `presence`, `guard` |
| Administration | Tableau de bord Vue.js 3, séparé du client |
| Données | PostgreSQL (comptes, sessions, blobs chiffrés, audit) · Redis (présence, révocation, compteurs, publication) · MinIO (fichiers chiffrés) |
| Tâches asynchrones | BullMQ (purges, expiration des codes, alertes de retrait en attente) |
| Frontal | Caddy (TLS, répartition, limite par IP) |

## 2. Technologies et licences

À revérifier une par une avant le dépôt ; chaque technologie est citée avec son lien dans le README du dépôt (C-07).

| Technologie | Rôle | Licence attendue | Remarque |
|---|---|---|---|
| OpenMLS (Rust) | Protocole MLS, RFC 9420 | MIT | Compilé en WebAssembly (wasm-bindgen) |
| Vue.js 3, Vite, Tailwind CSS | Client et tableau de bord | MIT | |
| Fastify, @fastify/websocket, @fastify/rate-limit | API, temps réel, limitation | MIT | |
| Node.js (LTS) | Exécution du serveur | MIT | Confirmé par l'équipe (H-12) |
| BullMQ, ioredis | Tâches, client Redis | MIT | |
| Redis | Présence, révocation, compteurs | **À vérifier** | Une licence OSI existe depuis Redis 8 ; Valkey (BSD) est une alternative compatible |
| PostgreSQL | Base de données | PostgreSQL License | |
| MinIO | Fichiers chiffrés | **À vérifier** | Licence et état du projet à relire ; repli possible : volume de fichiers |
| Caddy | Frontal TLS | Apache-2.0 | |
| otpauth | Codes TOTP (RFC 6238) | MIT | |
| Docker Compose | Installation | Apache-2.0 | |

## 3. Décisions

| ID | Décision | Pourquoi | Conséquence |
|---|---|---|---|
| ADR-01 | Client **web** avec OpenMLS en WebAssembly | Choix de l'équipe ; pas d'installation | Aucun paquet officiel prêt à l'emploi trouvé : il faut compiler ou retenir une liaison ; premier prototype à réussir (R-01) |
| ADR-02 | Clés privées et état MLS dans **IndexedDB**, chiffrés par une clé WebCrypto **non extractible** | `localStorage` est lisible par tout script de la page | La clé ne peut pas être copiée, mais utilisée par un script injecté : politique de contenu stricte (REQ-SEC-009) |
| ADR-03 | **Monolithe modulaire** | Une équipe de 3, moins d'une semaine | Frontières par module ; les modules suivent les groupes de `04` |
| ADR-04 | **Redis** pour présence, liste noire des sessions, compteurs et publication | Données volatiles, forte fréquence | Pas la source de vérité : rechargé depuis PostgreSQL (INV-007) |
| ADR-05 | **BullMQ** pour les tâches différées | Reprise après redémarrage | Toute tâche de distribution contrôle d'abord l'état « révoqué » dans Redis (REQ-REV-003) |
| ADR-06 | **MinIO** pour les fichiers chiffrés | Choix de l'équipe | Licence à relire (H-13) |
| ADR-07 | **Session unique** par agent | Choix de l'équipe : un seul appareil | Une nouvelle session ferme l'ancienne ; changement de navigateur = nouvel appareil sans historique (H-07) |
| ADR-08 | Révocation en **deux temps** | Coupure serveur immédiate + retrait MLS réel | Le serveur ne peut pas commiter : un membre en ligne émet le retrait (REQ-REV-004) |
| ADR-09 | « Lu » = **message MLS applicatif signé** | Non falsifiable par le serveur | Preuve technique, pas de valeur légale affirmée (H-10) |
| ADR-10 | « Distribué » = information du **serveur** | Évite un second message signé par message | Non probante ; seule « Lu » l'est (G-08) |
| ADR-11 | **Attestation d'enrôlement** : signature standard (Ed25519) de la clé d'enrôlement sur matricule, appareil, clé publique et expiration ; clé publique épinglée dans le client | Empêche un serveur compromis d'ajouter un faux membre (REQ-SEC-006) | Assemblage de primitives standard, pas un nouveau protocole ; à justifier face à C-01 (R-04). Alternative : credentials X.509 de MLS |
| ADR-12 | La **capacité de parrainage** se déduit du **poste officiel**, et **aucune contrainte de ministère ni de périmètre** n'est appliquée à la validation d'une demande de groupe | Le contrôle tient au poste et à la traçabilité, pas à une frontière géographique ; l'interministériel devient un cas ordinaire | Un parrain habilité valide pour tout agent actif : le rayon d'action est large, la matrice des postes et l'audit de chaque validation sont la seule barrière (R-11) |
| ADR-13 | **Gestion de groupe** partagée entre le **créateur** et le **parrain** : membres, nom, co-parrains, suppression ; départ volontaire, suspension et reprise ; un groupe sans parrain est gelé | Parité avec les usages attendus d'une messagerie de groupe, sans donner à l'administration de prise sur les conversations | Le **nom du groupe n'est pas stocké en clair côté serveur** : il voyage dans les messages chiffrés (REQ-GRP-006), au prix d'un renommage qui coûte un message. Lien d'invitation public, icône de groupe et restriction d'envoi sont hors périmètre |
| ADR-14 | **Amorçage** : le premier compte Administrateur est créé par une **commande d'amorçage** sur installation vierge, mot de passe provisoire à changer à la première connexion (REQ-OPS-012) | Une installation vierge n'a aucun utilisateur existant pour pré-inscrire ; l'auto-enrôlement serait une porte ouverte permanente | La commande doit être refusée dès qu'un Administrateur existe ; test T-070 |
| ADR-15 | **Code d'activation par e-mail professionnel, 24 h** (REQ-ID-002 ; le code à usage unique devient une ligne `CODE_ACTIVATION` hachée) | Alternative plus légère que la remise en main propre, allège l'Administrateur ; la compromission de la boîte professionnelle reste limitée par le TOTP et le secret personnel | Si la boîte est compromise avant l'activation, l'attaquant doit encore vaincre le second facteur ; l'e-mail ne sert qu'au premier enrôlement, jamais à la récupération (REQ-ID-009) |
| ADR-16 | Le second facteur est récupéré **par l'Administrateur** (révocation puis nouvel enrôlement) ; **aucun code de secours en libre-service** (REQ-ID-009) | Un canal e-mail de secours compromettrait le compte sans le second facteur | La perte d'appareil exige un passage par l'Administrateur, goulot assumé pour une institution |
| ADR-17 | **Aucune suppression définitive de compte** (REQ-OPS-013) : un compte révoqué reste en base comme trace ; seul le contenu chiffré serveur est purgé à 30 jours ; journaux d'audit conservés 90 jours | Cohérent avec la revocabilité et la journalisation ; évite tout débat sur la purge de l'identité | Face au quota : la base d'agents ne décroît jamais, mais la purge des contenus limite le volume |
| ADR-18 | Périmètre du hackathon : **tout le P0 d'abord, l'intégralité du P1 ensuite**, aucun P2 | Le socle de sécurité est démontré entièrement avant toute extension | Si le temps manque, on retire les P1 un à un, jamais les éléments de socle (R-07) |

## 4. Protocoles clés

**Activation.** L'Administrateur pré-inscrit l'agent ; le serveur génère un secret TOTP et un code d'activation à usage unique, envoyé sur l'adresse professionnelle de l'agent et expiré 24 h après l'envoi (REQ-ID-002). L'agent saisit matricule et code, choisit son secret personnel (haché côté serveur) et enregistre le TOTP. Le navigateur crée sa paire de clés, dépose ses KeyPackages et reçoit son attestation. En exploitation, un compte Administrateur est créé par la commande d'amorçage (REQ-OPS-012) ; une installation vierge n'est utilisable qu'après cet appel.

**Connexion.** Secret personnel + code TOTP. Une nouvelle session ferme l'ancienne. Le jeton n'est pas transmis dans l'adresse de la connexion temps réel (elle serait journalisée) mais dans le premier message.

**Messages et fichiers.** Voir M-04 (`05`). Les fichiers sont chiffrés en AES-GCM avec une clé aléatoire, transférés à MinIO, et la clé voyage dans un message MLS.

**Présence.** Signal toutes les 15 secondes ; clé Redis `presence:<agent>` avec expiration à 40 secondes ; publication d'un changement aux instances concernées ; visible des seuls interlocuteurs (REQ-DIR-002 à 005).

**Révocation.** Voir M-06 (`05`) : liste noire dans Redis et fermeture de la connexion (5 s au plus), puis avis aux membres et retrait MLS, avec suivi d'état par groupe.

**Groupes.** Un agent dont le poste confère le parrainage crée le groupe et en devient parrain ; sinon il adresse une demande, que valide un parrain habilité — sans égard au ministère ni au périmètre. Le groupe n'existe qu'après validation. Créateur et parrain gèrent ensuite les membres, le nom et les co-parrains : chaque changement de membres produit un commit MLS, le renommage passe par un message chiffré, et un groupe qui perd son dernier parrain est gelé.

**Classification.** Le niveau est un champ du message chiffré ; le client applique les restrictions et l'expiration (M-08).

## 5. Montée en charge

| Palier | Dispositif | Cible |
|---|---|---|
| Sprint | 1 instance API, PostgreSQL, Redis, MinIO, Caddy sur une machine | 500 connexions, 50 msg/s (REQ-OPS-009, hypothèse à mesurer) |
| Suivant (P2) | Plusieurs instances API ; Redis assure compteurs et publication communs ; PgBouncer | 5 000 connexions, 250 msg/s |

Coût de la présence : à 15 s, 500 agents produisent environ 33 signaux par seconde, 5 000 agents environ 333. L'intervalle de 4 secondes du document initial aurait donné 1 250 par seconde à 5 000 agents, au détriment des réseaux lents.

L'API est sans état (REQ-OPS-006) ; l'ordre des messages est tenu par un numéro de séquence par groupe attribué en transaction ; un seul commit par epoch est accepté (`409` sinon).

## 6. Écarts avec le document d'architecture initial

| Point initial | Décision retenue | Raison |
|---|---|---|
| Clés dans `sessionStorage` et `localStorage` | IndexedDB + clé WebCrypto non extractible | Réduire l'exposition des clés |
| Révocation = coupure + vidage du navigateur | Coupure serveur **et** retrait cryptographique MLS ; effacement local en simple tentative | Un navigateur peut empêcher l'effacement |
| Présence toutes les 4 s, visible de tous | Toutes les 15 s, visible des seuls interlocuteurs | Bande passante et métadonnées |
| « Distribué » via un accusé binaire entre clients | Information du serveur, non probante | Un accusé non signé est falsifiable |
| « Lu » à « valeur légale » | Preuve technique, valeur légale non affirmée | Nécessite un avis juridique |
| Invariant : aucune métadonnée nominative en clair en base | Données d'annuaire nécessaires autorisées (fictives) ; contenu jamais en clair | Le whitelisting et l'annuaire en ont besoin |
| Pas de plan B pour le chiffrement | Inchangé, mais consigné comme risque R-01 | Décision de l'équipe |
| Absence de limitation de débit | Limites de débit (§7) | Exigence demandée |
| Phrase parasite finale (« For medical advice… ») | Supprimée | Résidu d'un outil IA |

## 7. Limitation de débit

Deux couches : Caddy limite les connexions par adresse IP ; Fastify applique des compteurs par identité, **stockés dans Redis** pour rester cohérents avec plusieurs instances (REQ-ABUSE-006).

| Point d'accès | Clé | Limite |
|---|---|---|
| Connexion | IP | 5 / min |
| Code TOTP erroné | compte | 5 échecs, puis verrouillage 15 min |
| Envoi de message | session | 60 / min |
| Récupération de KeyPackages | demandeur | 30 / min |
| Opérations d'administration | Administrateur | 30 / min |
| Message | taille | 64 Ko au plus |
| Pièce jointe | taille | 25 Mo au plus |
| Transferts simultanés | session | 3 |
| Connexion temps réel | session | 1 |

Réponse : `429` avec `Retry-After`, sans détail interne ; le client attend avec un recul exponentiel.

## 8. Cache

| Donnée | Où | Durée de vie | Remarque |
|---|---|---|---|
| Sessions révoquées, jetons sur liste noire | Redis | jusqu'à purge | Vérité dans PostgreSQL ; rechargé au démarrage ; invalidé à chaque révocation |
| Présence | Redis | 40 s après le dernier signal | Jamais en PostgreSQL |
| Compteurs de limitation | Redis | fenêtre | Partagés entre instances |
| Routage connexion → instance | Redis | durée de la connexion | Publication |
| Annuaire (recherche) | Redis | 60 s | Invalidé à chaque modification |

**Jamais en cache** : contenu des messages, secrets TOTP, secrets personnels.
**Côté client** : MLS détruit les clés de déchiffrement après usage ; le client garde donc le texte clair dans sa base locale chiffrée (REQ-MSG-004), purgée selon la classification.

## 9. Métadonnées visibles par le serveur

| Visible malgré le chiffrement | Mesure de réduction |
|---|---|
| Quel agent écrit à quel groupe, et quand | Identifiants de groupe aléatoires ; aucun contenu en journal |
| Membres d'un groupe | Nécessaire à la livraison ; limite assumée |
| Taille approximative des messages | Remplissage (padding), à vérifier dans la liaison WebAssembly |
| Qui est en ligne | Présence volatile, visible des seuls interlocuteurs, jamais en base |
| Adresse IP | Conservée 7 jours au plus |
| Nom, ministère, fonction, catégorie, matricule | Données d'annuaire nécessaires ; matricule réservé à l'Administrateur ; fictives au sprint |
| Fréquence et nombre de fichiers | Limite assumée |

## 10. Déploiement et exploitation

```yaml
services:
  caddy:  { image: caddy:2, ports: ["443:443"] }          # sert aussi client et tableau de bord
  api:    { build: ./backend, depends_on: [db, redis, minio] }
  db:     { image: postgres:17, volumes: [pgdata:/var/lib/postgresql/data] }
  redis:  { image: redis:8 }                               # ou valkey, selon H-13
  minio:  { image: minio/minio, volumes: [objets:/data] }  # à relire (H-13)
volumes: { pgdata: {}, objets: {} }
```

- Installation : `docker compose up -d` ; migrations au démarrage (REQ-OPS-001). Secrets via Docker secrets (REQ-OPS-002).
- Santé : `/healthz` (processus vivant), `/readyz` (PostgreSQL et Redis joignables). Métriques : connexions, débit, latence, erreurs, 429.
- Sauvegarde : export chiffré de PostgreSQL et copie du volume de fichiers ; restauration à tester.
- Politique de contenu stricte et intégrité du fichier WebAssembly servis par Caddy (REQ-SEC-009, 012).

## 11. Risques

| ID | Risque | Impact | Mesure |
|---|---|---|---|
| R-01 | OpenMLS en WebAssembly ne fonctionne pas, **sans plan B** (décision de l'équipe) | Critique : sans chiffrement de bout en bout, le projet est éliminé | Faire ce prototype en premier ; un signal d'échec tardif ne laisse aucune marge |
| R-02 | Clés dans le navigateur exposées à un script injecté | Élevé | Politique de contenu, aucun script tiers, intégrité, clé non extractible ; limite assumée |
| R-03 | Licences de Redis et MinIO | Moyen | Relecture avant dépôt ; Valkey ou volume de fichiers en repli |
| R-04 | L'attestation d'enrôlement jugée « cryptographie maison » | Élevé (élimination) | Justifier : signature standard, aucun protocole nouveau ; sinon credentials X.509 |
| R-05 | Présence : charge et métadonnées | Moyen | 15 s, visibilité limitée, jamais en base |
| R-06 | Accusé « Lu » présenté comme preuve légale | Moyen | Aucune valeur légale affirmée |
| R-07 | 62 exigences P0 pour 3 personnes en moins d'une semaine | Élevé | Plus de la moitié sont des refus ou vérifications à faible coût ; si le temps manque, retirer les P1 d'abord, puis réduire les innovations avant le socle |
| R-08 | Captures d'écran non bloquées | Faible | Dit à l'utilisateur ; filigrane dissuasif |
| R-09 | Compatibilité Fastify, WebSocket et BullMQ avec le runtime retenu | Moyen | Node.js LTS ; test d'intégration dès le début |
| R-10 | Perte de l'historique en cas de changement de navigateur | Faible | Assumé (appareil unique) |
| R-11 | Parrainage sans contrainte de périmètre : un parrain habilité peut créer un groupe réunissant des agents de tout ministère | Moyen | Matrice des postes stricte (7 postes habilités sur 13) ; chaque validation est auditée avec l'identité du parrain (REQ-AUD-001) ; limite annoncée |
