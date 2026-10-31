# SRS — Spécification des exigences du système

**Version :** 0.5 · **Date :** 31 octobre 2026 · **Statut :** brouillon à valider · **Source :** `01_requirements_prd.md`

## 1. Convention

Priorités : **P0** indispensable à la démonstration (moins d'une semaine, équipe de 3) · **P1** si le temps le permet · **P2** conçu, non implémenté.

Les exigences emploient **DOIT**, **NE DOIT PAS**, **DEVRAIT**, **PEUT** (RFC 2119). Chaque exigence exprime une idée testable et porte sa **nature** (règle métier, invariant, politique, processus) et la **garantie** du contrat (`03_design_contract_invariants.md`) qu'elle sert ; « — » signale une exigence sans garantie (fonctionnement ou exploitation).

## 2. Acteurs

**AGENT** (compte activé, session unique ; catégorie, poste officiel — sa fonction — et ministère distincts) · **ADMINISTRATEUR** (pré-inscrit, révoque, consulte le journal ; ni accès aux contenus, ni action sur les groupes) · **SERVICE** (composant interne, pas un utilisateur) · **NON_ENRÔLÉ** (aucun droit).

## 3. Contraintes

Une **contrainte** est une limitation imposée à la conception ; elle n'est pas une exigence à prouver par développement.

| ID | Contrainte | Origine |
|---|---|---|
| C-01 | Chiffrement de bout en bout par un protocole open source éprouvé (MLS via OpenMLS) ; aucune cryptographie développée par l'équipe (élimination) | Hackathon |
| C-02 | Aucun message en clair côté serveur (élimination) | Hackathon |
| C-03 | Hébergement souverain, sans service tiers indispensable, installation en une commande (Docker Compose) | Hackathon |
| C-04 | Seuls des agents enrôlés, authentification forte, gestion des rôles | Hackathon |
| C-05 | Révocation immédiate de l'agent sur tous ses appareils (ici : appareil unique) | Hackathon |
| C-06 | Métadonnées visibles par le serveur documentées, avec mesures de réduction | Hackathon |
| C-07 | Code sous licence OSI avec fichier LICENSE ; chaque technologie citée avec sa licence et son lien ; niveau d'engagement « Créer » | Hackathon |
| C-08 | Données et comptes fictifs uniquement ; aucun test d'intrusion sur un système réel | Hackathon |
| C-09 | Dépôt public avec commits progressifs, README en français de 2 pages au plus, comptes de démonstration, fichiers de déploiement | Hackathon |
| C-10 | Dossier : fiche équipe, note de pré-projet (2 p.), note de sécurité (2 p.), dépôt, vidéo de 3 min (échange chiffré, révocation, innovation) | Hackathon |
| C-11 | Entretien : chaque membre explique le code de chiffrement et d'authentification ; épreuves tirées au sort | Hackathon |
| C-12 | Stack : client web Vue.js 3 + Vite avec OpenMLS en WebAssembly, API Fastify (monolithe modulaire), PostgreSQL, Redis, BullMQ, MinIO, tableau de bord Vue.js 3, Docker Compose | Équipe |
| C-13 | Un seul appareil par agent | Équipe |
| C-14 | Moins d'une semaine, équipe de 3 | Équipe |
| C-15 | Pas de plan B si OpenMLS en WebAssembly échoue (risque accepté, R-01) | Équipe |

## 4. Exigences

### Identité et sessions

| ID | Prio | Exigence | Nature | Garantie |
|---|---|---|---|---|
| REQ-ID-001 | P0 | Le système DOIT refuser l'activation d'un compte dont le matricule n'a pas été pré-inscrit par l'Administrateur. | Règle métier | G-01 |
| REQ-ID-002 | P0 | Un code d'activation DOIT être à usage unique, envoyé sur l'adresse professionnelle de l'agent, et expirer 24 heures après son envoi. | Règle métier | G-01 |
| REQ-ID-003 | P0 | L'activation DOIT exiger l'enregistrement d'un second facteur TOTP. | Politique | G-01 |
| REQ-ID-004 | P0 | Une ouverture de session DOIT exiger le secret personnel de l'agent et un code TOTP valide. | Politique | G-01 |
| REQ-ID-005 | P1 | Le système DOIT verrouiller un compte pendant 15 minutes après 5 codes TOTP erronés consécutifs. | Politique | G-12 |
| REQ-ID-006 | P0 | Un agent DOIT avoir une seule session valide à la fois ; l'ouverture d'une nouvelle session DOIT fermer la précédente. | Invariant | G-01 |
| REQ-ID-007 | P0 | Le système DOIT vérifier à chaque opération protégée que le compte et la session sont actifs. | Invariant | G-01 |
| REQ-ID-008 | P0 | Le système DOIT enregistrer séparément la catégorie de l'agent (P, A, B, C, D, E), son poste officiel et son ministère, et en déduire sa capacité de parrainage (`01_requirements_prd.md`, §3). | Règle métier | G-01 |
| REQ-ID-009 | P1 | Le système DOIT traiter la perte de l'appareil ou du second facteur par la révocation de l'agent et l'émission d'un nouveau code d'activation par l'Administrateur, sans libre-service. | Processus | G-04 |

### Autorisation et rôles

| ID | Prio | Exigence | Nature | Garantie |
|---|---|---|---|---|
| REQ-AUTHZ-001 | P0 | Chaque opération protégée DOIT vérifier identité, statut du compte et permission en un point de contrôle unique. | Invariant | G-01 |
| REQ-AUTHZ-002 | P0 | Le système DOIT limiter les droits à deux rôles techniques : l'agent utilise la messagerie, l'Administrateur pré-inscrit, révoque et consulte le journal. | Règle métier | G-06 |
| REQ-AUTHZ-003 | P0 | L'Administrateur NE DOIT PAS obtenir la capacité de déchiffrer les conversations. | Invariant | G-06 |
| REQ-AUTHZ-004 | P0 | Le système DOIT refuser toute opération dont l'autorisation est absente, invalide ou impossible à vérifier. | Invariant | G-01 |
| REQ-AUTHZ-005 | P0 | Seul un agent dont le **poste officiel** confère la capacité de parrainage DOIT pouvoir créer un groupe ; la catégorie seule NE DOIT PAS suffire. | Règle métier | G-01 |
| REQ-AUTHZ-006 | P0 | Un agent sans capacité de parrainage DOIT pouvoir adresser une demande de création de groupe à un parrain. | Processus | G-01 |
| REQ-AUTHZ-007 | P2 | Le système PEUT proposer un rôle d'auditeur en lecture seule du journal. | Politique | G-06 |

### Groupes et parrainage

Un groupe n'existe qu'après validation par un parrain. Le créateur et le parrain le gèrent ensemble.

| ID | Prio | Exigence | Nature | Garantie |
|---|---|---|---|---|
| REQ-GRP-001 | P0 | Une demande de création de groupe DOIT être validée par un parrain ; le groupe n'existe qu'après cette validation, et le parrain en devient membre avec le rôle de parrain. | Processus | G-01 |
| REQ-GRP-002 | P0 | La validation NE DOIT PAS dépendre du ministère, de la structure ni d'un périmètre du demandeur : un parrain habilité valide la demande de tout agent actif, y compris pour un groupe interministériel. | Règle métier | G-01 |
| REQ-GRP-003 | P0 | Seuls des agents actifs de l'annuaire DOIVENT pouvoir être membres d'un groupe. | Règle métier | G-01 |
| REQ-GRP-004 | P0 | Le créateur et le parrain DOIVENT pouvoir gérer le groupe : ajouter et retirer des membres, renommer le groupe, promouvoir un membre en co-parrain ou le rétrograder, et supprimer le groupe. Tout changement de membres produit un nouveau commit MLS et un nouvel epoch. | Processus | G-01, G-05 |
| REQ-GRP-005 | P0 | L'Administrateur NE DOIT disposer d'aucune opération sur les groupes : ni création, ni validation, ni lecture, ni retrait de membre, ni suspension. | Invariant | G-06 |
| REQ-GRP-006 | P1 | Le nom d'un groupe NE DOIT PAS être stocké en clair côté serveur ; il voyage dans les messages chiffrés du groupe. | Invariant | G-02 |
| REQ-GRP-007 | P1 | Un agent DOIT pouvoir quitter volontairement un groupe ; le départ produit un commit MLS émis par son propre appareil. | Processus | G-05 |
| REQ-GRP-008 | P1 | Le parrain DOIT pouvoir suspendre un groupe — publications et changements de membres gelés, état et données conservés — puis le reprendre. | Processus | G-01 |
| REQ-GRP-009 | P1 | Un groupe DOIT conserver au moins un parrain ; si le dernier parrain quitte ou est révoqué, le groupe est gelé et signalé au tableau de bord, sans intervention de l'Administrateur. | Invariant | G-05, G-11 |

### Messages

| ID | Prio | Exigence | Nature | Garantie |
|---|---|---|---|---|
| REQ-MSG-001 | P0 | Un agent actif DOIT pouvoir envoyer un message à un autre agent ou à un groupe auquel il appartient. | Processus | G-01 |
| REQ-MSG-002 | P0 | Le contenu d'un message DOIT être chiffré sur l'appareil émetteur avant sa transmission. | Invariant | G-02 |
| REQ-MSG-003 | P0 | Le serveur NE DOIT PAS détenir les clés permettant de déchiffrer un message. | Invariant | G-02 |
| REQ-MSG-004 | P0 | Le client DOIT conserver les messages reçus, en clair, dans une base locale chiffrée par une clé non extractible, car le protocole ne permet pas de les déchiffrer deux fois. | Invariant | G-13 |
| REQ-MSG-005 | P0 | L'application DOIT afficher l'état d'un message : envoyé (accusé du serveur) puis distribué (remis à l'appareil du destinataire). | Processus | G-11 |
| REQ-MSG-006 | P1 | Le client DEVRAIT générer un identifiant unique par message pour éviter les doublons après une reprise. | Invariant | G-11 |
| REQ-MSG-007 | P1 | Le serveur DEVRAIT supprimer un message chiffré 30 jours au plus après son dépôt. | Politique | G-07 |

### Pièces jointes

| ID | Prio | Exigence | Nature | Garantie |
|---|---|---|---|---|
| REQ-FILE-001 | P0 | Une pièce jointe DOIT être chiffrée (AES-GCM) sur l'appareil émetteur avant son envoi. | Invariant | G-03 |
| REQ-FILE-002 | P0 | La clé d'une pièce jointe DOIT être transmise uniquement dans un message chiffré destiné aux participants autorisés. | Invariant | G-03 |
| REQ-FILE-003 | P0 | Le stockage de fichiers NE DOIT contenir que la version chiffrée d'une pièce jointe. | Invariant | G-03 |
| REQ-FILE-004 | P0 | Le système DOIT refuser une pièce jointe de plus de 25 Mo. | Politique | G-12 |
| REQ-FILE-005 | P1 | Le client DEVRAIT garder un fichier déchiffré en mémoire seulement, sans l'écrire sur disque. | Politique | G-03 |
| REQ-FILE-006 | P1 | Le client DEVRAIT reprendre un téléversement interrompu à l'endroit de l'interruption. | Processus | G-11 |
| REQ-FILE-007 | P1 | Le client DEVRAIT informer que les captures d'écran et les copies externes ne peuvent pas être empêchées. | Politique | G-09 |

### Accusés de lecture à valeur probante

| ID | Prio | Exigence | Nature | Garantie |
|---|---|---|---|---|
| REQ-RCPT-001 | P0 | Quand l'agent affiche un message reçu en 1-1, le client DOIT envoyer un accusé « Lu » sous forme de message chiffré signé par l'appareil du destinataire. | Processus | G-08 |
| REQ-RCPT-002 | P0 | Le serveur NE DOIT PAS pouvoir créer ni modifier un accusé de lecture. | Invariant | G-08 |
| REQ-RCPT-003 | P0 | Le client émetteur DOIT vérifier la signature d'un accusé avant d'afficher « Lu ». | Invariant | G-08 |
| REQ-RCPT-004 | P0 | Au sprint, le système NE DOIT PAS émettre d'accusé « Lu » dans les groupes. | Règle métier | G-08 |
| REQ-RCPT-005 | P2 | Le système PEUT exporter une preuve de lecture signée. | Processus | G-08 |
| REQ-RCPT-006 | P1 | L'application DEVRAIT indiquer que « Lu » atteste l'affichage par un appareil enrôlé, sans valeur légale garantie. | Politique | G-08 |

### Annuaire et présence

| ID | Prio | Exigence | Nature | Garantie |
|---|---|---|---|---|
| REQ-DIR-001 | P0 | Le système DOIT permettre de rechercher un agent par ministère et par fonction. | Processus | G-10 |
| REQ-DIR-002 | P0 | Le client DOIT envoyer un signal de présence toutes les 15 secondes, et la présence DOIT expirer 40 secondes après le dernier signal. | Politique | G-10 |
| REQ-DIR-003 | P0 | La présence NE DOIT PAS être écrite dans la base PostgreSQL ; elle DOIT être conservée uniquement dans Redis. | Invariant | G-10 |
| REQ-DIR-004 | P1 | La présence DEVRAIT être visible uniquement des agents ayant une conversation ou un groupe en commun. | Politique | G-10 |
| REQ-DIR-005 | P1 | Un changement de présence DEVRAIT être diffusé par publication Redis aux serveurs concernés. | Processus | G-10 |
| REQ-DIR-006 | P1 | L'annuaire NE DOIT PAS afficher le matricule aux agents. | Invariant | G-10 |
| REQ-DIR-007 | P2 | L'agent PEUT masquer sa présence. | Politique | G-10 |

### Classification

| ID | Prio | Exigence | Nature | Garantie |
|---|---|---|---|---|
| REQ-CLS-001 | P0 | Chaque message DOIT porter un niveau (Normal, Diffusion restreinte, Confidentiel), transporté dans le message chiffré. | Règle métier | G-09 |
| REQ-CLS-002 | P0 | Le client DOIT désactiver le transfert, la copie et l'export d'un message Diffusion restreinte ou Confidentiel. | Politique | G-09 |
| REQ-CLS-003 | P0 | Le client DOIT supprimer un message Confidentiel à l'expiration du délai choisi par son auteur, 7 jours au plus. | Politique | G-09 |
| REQ-CLS-004 | P1 | Le client DEVRAIT afficher un filigrane portant le nom du destinataire sur un message Confidentiel. | Politique | G-09 |
| REQ-CLS-005 | P0 | L'application DOIT indiquer que la classification est appliquée par l'application et ne peut empêcher captures ni photographies. | Politique | G-09 |

### Révocation

| ID | Prio | Exigence | Nature | Garantie |
|---|---|---|---|---|
| REQ-REV-001 | P0 | L'Administrateur DOIT pouvoir révoquer un agent. | Processus | G-04 |
| REQ-REV-002 | P0 | Après validation, le serveur DOIT invalider la session, inscrire le jeton sur liste noire et fermer la connexion temps réel en 5 secondes au plus. | Invariant | G-04 |
| REQ-REV-003 | P0 | L'état révoqué dans Redis DOIT primer sur toute file de distribution. | Invariant | G-04 |
| REQ-REV-004 | P0 | La révocation DOIT déclencher le retrait cryptographique de l'agent dans chaque groupe concerné, émis par le premier membre en ligne. | Processus | G-05 |
| REQ-REV-005 | P0 | Le système DOIT suivre séparément le statut du compte, l'invalidation de session et le retrait cryptographique de chaque groupe (en attente, terminé ou échec). | Invariant | G-05 |
| REQ-REV-006 | P0 | Le tableau de bord DOIT afficher tout retrait cryptographique non terminé. | Processus | G-11 |
| REQ-REV-007 | P1 | À la coupure, le client DEVRAIT tenter d'effacer ses données locales, sans que cela soit garanti. | Politique | G-05 |
| REQ-REV-008 | P1 | Les membres d'un groupe DEVRAIENT être informés du retrait d'un membre, sans donnée inutile. | Politique | G-05 |

### Audit

| ID | Prio | Exigence | Nature | Garantie |
|---|---|---|---|---|
| REQ-AUD-001 | P0 | Le système DOIT journaliser pré-inscription, activation, révocation, début, fin ou échec d'un retrait cryptographique, et 5 échecs d'authentification consécutifs. | Politique | G-07 |
| REQ-AUD-002 | P0 | Les journaux NE DOIVENT contenir ni texte de message, ni contenu de fichier, ni secret, ni clé. | Invariant | G-07 |
| REQ-AUD-003 | P1 | L'accès au journal DEVRAIT être réservé à l'Administrateur. | Politique | G-06 |
| REQ-AUD-004 | P1 | Le journal DEVRAIT être conservé 90 jours. | Politique | G-07 |

### Protection contre les abus

| ID | Prio | Exigence | Nature | Garantie |
|---|---|---|---|---|
| REQ-ABUSE-001 | P0 | Le serveur DOIT limiter les tentatives de connexion à 5 par minute et par adresse IP. | Politique | G-12 |
| REQ-ABUSE-002 | P1 | Le serveur DOIT limiter l'envoi de messages à 60 par minute et par session. | Politique | G-12 |
| REQ-ABUSE-003 | P1 | Le serveur DOIT limiter la récupération de KeyPackages à 30 par minute et par demandeur. | Politique | G-12 |
| REQ-ABUSE-004 | P0 | Tout dépassement de limite DOIT produire un refus 429 avec l'en-tête Retry-After, sans détail interne. | Politique | G-12 |
| REQ-ABUSE-005 | P1 | Le serveur DOIT refuser un message de plus de 64 Ko. | Politique | G-12 |
| REQ-ABUSE-006 | P1 | Les compteurs de limitation DOIVENT être partagés entre instances via Redis. | Invariant | G-12 |
| REQ-ABUSE-007 | P1 | Le serveur DOIT limiter les opérations d'administration à 30 par minute. | Politique | G-12 |

### Sécurité

| ID | Prio | Exigence | Nature | Garantie |
|---|---|---|---|---|
| REQ-SEC-001 | P0 | La confidentialité DOIT reposer sur MLS (RFC 9420) via OpenMLS compilé en WebAssembly, avec la seule suite 0x0001 (X25519, AES-128-GCM, Ed25519). | Invariant | G-02 |
| REQ-SEC-003 | P0 | Les clés privées DOIVENT rester sur l'appareil et ne jamais être envoyées au serveur. | Invariant | G-13 |
| REQ-SEC-004 | P0 | L'état de chiffrement persistant DOIT être stocké dans IndexedDB, chiffré par une clé WebCrypto non extractible. | Invariant | G-13 |
| REQ-SEC-005 | P0 | Toutes les communications DOIVENT utiliser TLS 1.2 ou plus. | Invariant | G-02 |
| REQ-SEC-006 | P0 | Les clients DOIVENT refuser d'ajouter un membre dont l'attestation d'enrôlement est absente ou invalide. | Invariant | G-01 |
| REQ-SEC-007 | P0 | Le serveur NE DOIT stocker aucun message ni fichier en clair, ni dans PostgreSQL, ni dans Redis, ni dans le stockage de fichiers. | Invariant | G-02 |
| REQ-SEC-008 | P0 | Le projet DOIT documenter les métadonnées visibles par le serveur et les mesures de réduction. | Politique | G-07 |
| REQ-SEC-009 | P1 | L'application web DEVRAIT appliquer une politique de sécurité de contenu stricte, sans script tiers. | Politique | G-13 |
| REQ-SEC-010 | P1 | Les identifiants de groupe DOIVENT être aléatoires et les adresses IP conservées 7 jours au plus. | Politique | G-07 |
| REQ-SEC-011 | P1 | Les dépendances de sécurité DEVRAIENT être identifiées avec une version figée. | Politique | — |
| REQ-SEC-012 | P1 | Le fichier WebAssembly et le code client DEVRAIENT être servis depuis le serveur de l'État avec contrôle d'intégrité. | Politique | G-13 |

### Fiabilité

| ID | Prio | Exigence | Nature | Garantie |
|---|---|---|---|---|
| REQ-REL-001 | P0 | Une erreur NE DOIT PAS être présentée comme un succès. | Invariant | G-11 |
| REQ-REL-002 | P1 | Une indisponibilité du réseau DOIT être signalée, et les messages DEVRAIENT être mis en file locale et envoyés au retour du réseau. | Processus | G-11 |
| REQ-REL-003 | P1 | Après une coupure, le client DEVRAIT se reconnecter automatiquement et rattraper ses messages par numéro de séquence. | Processus | G-11 |

### Exploitation et performance

| ID | Prio | Exigence | Nature | Garantie |
|---|---|---|---|---|
| REQ-OPS-001 | P0 | Le système DOIT s'installer avec la seule commande `docker compose up -d`, migrations comprises. | Politique | — |
| REQ-OPS-002 | P0 | Les secrets DOIVENT être séparés du dépôt public. | Politique | G-07 |
| REQ-OPS-003 | P0 | Le cache NE DOIT PAS être l'unique source de vérité des permissions ; la liste des sessions révoquées DOIT être rechargée depuis la base au démarrage. | Invariant | G-04 |
| REQ-OPS-004 | P0 | Toute révocation DOIT invalider immédiatement le cache d'autorisation concerné. | Invariant | G-04 |
| REQ-OPS-005 | P1 | Le serveur DEVRAIT exposer /healthz et /readyz sans contenu privé. | Politique | — |
| REQ-OPS-006 | P1 | Le serveur d'application DEVRAIT être sans état, afin que plusieurs instances fonctionnent ensemble via Redis. | Invariant | — |
| REQ-OPS-007 | P1 | Le serveur DEVRAIT exposer des métriques de fonctionnement (connexions, débit, latence, erreurs, refus 429). | Politique | — |
| REQ-OPS-008 | P1 | La procédure de sauvegarde et de restauration chiffrées de la base DEVRAIT être documentée. | Processus | — |
| REQ-OPS-009 | P1 | Sur la machine de démonstration, le serveur DEVRAIT tenir 500 connexions simultanées et 50 messages par seconde (hypothèse à mesurer). | Politique | — |
| REQ-OPS-010 | P2 | Le système PEUT viser 5 000 connexions simultanées et 250 messages par seconde. | Politique | — |
| REQ-OPS-011 | P1 | Les tâches asynchrones (distribution, purge, expiration des codes d'activation) DEVRAIENT reprendre après un redémarrage. | Processus | G-11 |
| REQ-OPS-012 | P0 | Sur une installation vierge, le système DOIT fournir une commande d'amorçage qui crée le premier compte Administrateur (mot de passe provisoire à changer à la première connexion) ; un second appel DOIT être refusé. | Politique | G-01 |
| REQ-OPS-013 | P0 | Le système NE DOIT PAS fournir d'opération de suppression définitive de compte ; un compte révoqué reste en base avec son statut, son appareil révoqué et les retraits cryptographiques passés restent des traces, et l'annuaire reste consultable de l'Administrateur. | Invariant | G-07 |

## 5. Hypothèses de travail

Hypothèses adoptées pour le sprint, à relire avant tout usage réel.

| ID | Hypothèse |
|---|---|
| H-01 | L'Administrateur pré-inscrit chaque agent (matricule, nom, ministère, fonction, catégorie) ; la vérification d'identité se fait hors système ; le code d'activation est envoyé sur l'adresse professionnelle de l'agent et expire 24 h après son envoi |
| H-02 | Un groupe n'est créé que par un agent dont le poste officiel confère le parrainage, ou après validation de sa demande par un tel agent ; le parrainage ne dépend ni du ministère, ni de la structure, ni d'un périmètre |
| H-03 | Conservation serveur : 30 jours au plus ; conservation locale : jusqu'à suppression ou expiration |
| H-04 | Pièces jointes : 25 Mo au plus ; images, PDF, documents bureautiques courants |
| H-05 | Révocation avec membres hors ligne : le serveur bloque l'agent immédiatement ; le retrait cryptographique est émis par le premier membre en ligne ; alerte à l'Administrateur si le retrait reste en attente plus de 24 h |
| H-06 | Un navigateur révoqué hors ligne garde ses données locales jusqu'à sa reconnexion, où il est refusé et tente de les effacer |
| H-07 | Après perte ou changement de navigateur, le nouvel appareil ne lit pas l'historique précédent |
| H-08 | Annuaire : nom, ministère, fonction visibles des agents ; matricule visible du seul Administrateur ; ces données nominatives sont autorisées en base (fictives pendant le sprint) |
| H-09 | Présence : signal toutes les 15 s, expiration à 40 s, visible des interlocuteurs et membres de groupes communs |
| H-10 | L'accusé « Lu » atteste l'affichage par un appareil enrôlé ; aucune valeur légale n'est affirmée sans avis juridique |
| H-11 | La classification ne peut pas bloquer les captures dans un navigateur ; le filigrane est dissuasif |
| H-12 | Environnement d'exécution du serveur : Node.js LTS (compatibilité de Fastify et BullMQ), confirmé par la décision de l'équipe |
| H-13 | Licences à vérifier avant dépôt : Redis (une licence OSI existe depuis Redis 8 ; Valkey en alternative compatible), MinIO (licence et état du projet) |
| H-14 | Navigateurs ciblés : versions récentes de Chrome, Edge et Firefox (WebAssembly, WebCrypto, IndexedDB) |
| H-15 | Interface en français au sprint (le mooré n'est pas retenu) |
| H-16 | Disponibilité au mieux sur une machine unique, sans engagement |

## 6. Cas d'erreur à traiter

- Matricule inconnu, code expiré ou réutilisé, second facteur invalide, compte verrouillé, session fermée par une autre session.
- Révocation avec membres hors ligne ; échec du retrait cryptographique ; avis de révocation perdu.
- Accusé de lecture falsifié ou non signé ; attestation absente ou invalide.
- Message ou fichier trop volumineux ; transfert interrompu ; limite de débit dépassée ; réseau coupé.
- Redis redémarré ou vide ; instance perdue ; tâche asynchrone interrompue.
- Fichier WebAssembly altéré ou non chargé ; stockage du navigateur effacé.

## 7. Synthèse

103 exigences : **62 P0**, 37 P1, 4 P2 ; 8 sans garantie associée (fonctionnement et exploitation). 71 tests dans `07_acceptance_tests.md` ; chaque exigence P0 et P1 est couverte (matrice vérifiée par script).

Plus de la moitié des P0 sont des refus ou des vérifications à faible coût ; le coût principal est concentré dans le chiffrement en WebAssembly, la révocation en deux temps et les accusés de lecture signés.
