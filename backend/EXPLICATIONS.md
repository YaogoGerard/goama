# EXPLICATIONS — Backend Goama

> **À qui s'adresse ce document ?** À chaque membre de l'équipe. Le règlement du sprint
> est double sur ce point : les assistants IA sont « autorisés et encouragés », MAIS
> « comprendre chaque ligne de code et chaque mécanisme de sécurité » est OBLIGATOIRE,
> et l'épreuve « Explication du code » est ÉLIMINATOIRE (le jury désigne qui répond).
> Ce document est votre matériau de préparation : lisez-le en entier, puis relisez le
> code avec lui à côté. **Ne gardez dans le repo que du code que vous savez expliquer.**

---

## Sommaire

1. [Démarrer en 6 commandes](#1-démarrer-en-6-commandes)
2. [Vue d'ensemble : le serveur est un relais aveugle](#2-vue-densemble--le-serveur-est-un-relais-aveugle)
3. [Tour des fichiers](#3-tour-des-fichiers)
4. [Les mécanismes de sécurité, un par un](#4-les-mécanismes-de-sécurité-un-par-un)
5. [Le chiffrement de bout en bout : qui fait quoi](#5-le-chiffrement-de-bout-en-bout--qui-fait-quoi)
6. [Fiche jury : les épreuves en direct](#6-fiche-jury--les-épreuves-en-direct)
7. [10 questions probables du jury et comment y répondre](#7-10-questions-probables-du-jury-et-comment-y-répondre)
8. [Référence rapide de l'API](#8-référence-rapide-de-lapi)
9. [Écarts assumés du sprint](#9-écarts-assumés-du-sprint)
10. [Limites connues (pour la note de sécurité)](#10-limites-connues-pour-la-note-de-sécurité)

---

## 1. Démarrer en 6 commandes

```bash
npm install                  # dépendances
docker compose up -d         # PostgreSQL + API compilée, UNE commande (exigence §3)
docker compose exec api npx prisma migrate deploy   # (fait automatiquement au boot)
docker compose exec api npm run db:seed             # comptes fictifs
docker compose exec api npm run bootstrap:admin     # OU le seed : l'un des deux seulement
npm run dev                  # (développement local) API sur http://localhost:8080
npm run demo                 # déroule le flux complet contre l'API (démo vidéo)
npm test                     # les 12 tests de sécurité (bonus +2)
```

Développement local sans Docker : installez PostgreSQL, créez une base `goama`,
copiez `.env.example` en `.env`, puis `npx prisma migrate deploy && npm run db:seed && npm run dev`.

---

## 2. Vue d'ensemble : le serveur est un relais aveugle

```
   Navigateur A (client Vue + OpenMLS/WASM)        Navigateur B
   ┌─────────────────────────────┐              ┌─────────────────────────────┐
   │ clés MLS : IndexedDB        │              │ clés MLS : IndexedDB        │
   │ chiffrées (WebCrypto)       │              │                             │
   └──────────┬──────────────────┘              └──────────┬──────────────────┘
              │  blobs chiffrés (base64)                   │
              ▼        REST + WebSocket                    ▼
   ┌───────────────────────────────────────────────────────────────────────┐
   │  API Fastify (ce dépôt) — LE SERVEUR NE Possède AUCUNE CLÉ MLS        │
   │  ├─ auth      : enrôlement, TOTP, sessions, JWT                       │
   │  ├─ messaging : relais de blobs, séquence, epochs, groupes            │
   │  ├─ agents    : annuaire, révocation, présence                        │
   │  ├─ media     : blobs de fichiers chiffrés (volume local)             │
   │  └─ jobs      : purge 30 j / audit 90 j                               │
   └──────────────┬────────────────────────────────────────────────────────┘
                  │ SQL (données d'annuaire + blobs opaques)
                  ▼
   ┌────────────────────────┐
   │ PostgreSQL             │  → inspection du jury : AUCUN message en clair
   └────────────────────────┘
```

**La phrase à retenir :** *« Le serveur authentifie des agents, distribue des blobs
chiffrés et applique un ordre total par groupe ; il ne possède aucune clé MLS et ne
peut donc lire ni les messages, ni les fichiers, ni même le nom des groupes. »*

---

## 3. Tour des fichiers

| Fichier | Rôle | Points de sécurité |
|---|---|---|
| `src/config.ts` | Variables d'environnement validées par Zod | charge `.env` local ; alerte si `JWT_SECRET` par défaut |
| `src/app.ts` | Assemblage : plugins, **gardes**, routes, erreurs | `requireAuth` (3 vérifications), rate-limit, réponses d'erreur unifiées |
| `src/server.ts` | Démarrage, purge périodique, arrêt propre | écoute `0.0.0.0:8080`, SIGTERM géré |
| `src/types.ts` | Types JWT/gardes partagés | `jti` = id de session |
| `src/lib/crypto.ts` | scrypt, SHA-256, aléatoire | **Aucune crypto maison** : primitives standard Node |
| `src/lib/totp.ts` | Second facteur (RFC 6238) | bibliothèque `otpauth` (MIT) |
| `src/lib/validation.ts` | Validation Zod de chaque corps | 400 avant tout contact avec la base |
| `src/auth/service.ts` | Pré-inscription → activation → connexion → déconnexion | code 24 h haché, scrypt, session unique, 401 générique |
| `src/auth/routes.ts` | Routes `/auth/*` | `/auth/connexion` limitée à 5/min |
| `src/messaging/service.ts` | Groupes, messages, **séquence** | `SELECT … FOR UPDATE`, 409 `epoch_perime` |
| `src/messaging/ws.ts` | Passerelle WebSocket | **jeton au 1er message, jamais dans l'URL** ; 4001/4003 |
| `src/messaging/relay.ts` | Registre mémoire des sockets | pousse des blobs, ne lit rien |
| `src/agents/service.ts` | **Révocation en deux temps** | statut, sessions, KeyPackages, sockets fermées |
| `src/agents/routes.ts` | Annuaire, révocation, présence | matricule jamais exposé ; présence jamais en base |
| `src/media/routes.ts` | Blobs de fichiers chiffrés | 25 Mo max, SHA-256 d'intégrité, clé jamais côté serveur |
| `src/jobs/purge.ts` | Purge contenus 30 j, audit 90 j | comptes jamais supprimés (REQ-OPS-13) |
| `prisma/schema.prisma` | Schéma de données | **aucune colonne de contenu en clair ni de nom de groupe** |
| `prisma.config.ts` | Config Prisma 7 (migrations) | URL depuis l'environnement |
| `seed/seed.ts` | Comptes fictifs de démonstration | 100 % fictif, exigé par le règlement §4 |
| `scripts/bootstrap-admin.ts` | Amorçage du 1er admin | **refusé si un admin existe** (ADR-14, T-070) |
| `tests/*.test.ts` | 3 épreuves du jury en tests réels | bonus +2 du règlement |

---

## 4. Les mécanismes de sécurité, un par un

### 4.1 Enrôlement et code d'activation (ADR-15, REQ-ID-002)

**Le flux.** L'Administrateur pré-inscrit l'agent (`POST /auth/pre-inscriptions`) →
le serveur crée l'agent au statut `PRE_INSCRIT` et un code de 8 caractères → le code
n'est renvoyé **qu'une seule fois** dans la réponse HTTP (par e-mail professionnel
dans le produit réel) → l'agent l'échange contre son compte (`POST /auth/activation`).

**Pourquoi c'est sûr.**
- Le code est stocké **haché** (SHA-256) : si la base fuit, le code est inutilisable.
- **Usage unique** : la colonne `usedAt` est remplie à l'activation.
- **24 h** : `expiresAt`, vérifié à chaque tentative.
- **Anti-énumération** : matricule inconnu, statut non pré-inscrit et code faux
  renvoient le **même** `{ "erreur": "code_invalide" }` — un intrus ne peut pas
  sonder quels matricules existent.

**Où le montrer :** `src/auth/service.ts` → `preInscrire()` et `activer()`.

### 4.2 Le second facteur : TOTP (RFC 6238)

**Le flux.** À l'activation, le serveur génère un secret aléatoire (base32) et le
renvoie avec son URI `otpauth://` que le client transforme en QR code. À chaque
connexion, l'agent saisit le code à 6 chiffres de son application d'authentification.

**Pourquoi c'est sûr.** Le code change toutes les 30 s et ne transite jamais par un
canal réutilisable ; la vérification tolère ±30 s de dérive (`window: 1`). Bibliothèque
**`otpauth` (MIT)** — RFC 6238, standard de l'écosystème, **aucune crypto maison**.

**Où le montrer :** `src/lib/totp.ts` (20 lignes, lisez-les à voix haute si besoin).

### 4.3 Le secret personnel : scrypt + sel + comparaison en temps constant

**Le flux.** À l'activation, l'agent choisit son secret. Le serveur ne stocke que
`scrypt$<sel>$<empreinte>` — jamais le secret.

**Pourquoi c'est sûr.**
- **scrypt** est un KDF lent volontairement coûteux en mémoire : les attaques par
  force brute sur GPU deviennent très chères.
- Le **sel** aléatoire de 16 octets rend les tables précalculées inutiles.
- **timingSafeEqual** compare en temps constant : impossible de deviner un caractère
  en chronométrant les réponses.

**Où le montrer :** `src/lib/crypto.ts` → `hasherSecret()` / `verifierSecret()`.

### 4.4 JWT et session unique (ADR-07)

**Le flux.** À la connexion, une ligne `Session` est créée ; le JWT porte
`{ sub: agentId, jti: sessionId, role }` et expire dans 12 h. **Avant de créer la
nouvelle session, toutes les sessions actives de l'agent sont révoquées** : une seule
connexion vivante par agent, donc un seul appareil.

**Pourquoi c'est sûr.** Un JWT signé n'est PAS une preuve d'accès : la garde vérifie
la session en base à CHAQUE requête. Fermer la session tue le jeton instantanément —
c'est le mécanisme qui rend la révocation immédiate possible.

**Où le montrer :** `src/auth/service.ts` → `connecter()`, et `src/app.ts` → garde.

### 4.5 La chaîne `requireAuth` — trois verrous sur chaque requête

`src/app.ts` :

1. **JWT** : signature (JWT_SECRET) + expiration — un jeton contrefait meurt ici (401).
2. **AGENT** : existe et statut ≠ `REVOQUE` — la révocation est annoncée clairement
   (`agent_revoque`).
3. **SESSION** : existe, non révoquée, non expirée (`session_fermee`).

Les routes d'administration ajoutent `requireAdmin` (403 `droits_admin_requis`).

### 4.6 La WebSocket authentifiée par son premier message (REQ-OPS-005)

**Pourquoi pas `?token=` dans l'URL ?** Une URL est journalisée par Caddy, les
proxys et l'historique : le jeton y finirait en clair. Ici, la socket doit envoyer
`{"type":"auth","jeton":"…"}` en **premier message**, sinon fermeture **4001** après
5 s max. Ensuite, la socket ne fait que RECEVOIR des notifications : l'envoi de
messages passe toujours par REST (séquence en transaction).

**Où le montrer :** `src/messaging/ws.ts` (entièrement commenté).

### 4.7 Séquence par groupe et epochs — l'ordre inattaquable (doc 05, M-04)

**Le problème.** Deux agents envoient simultanément : qui est le message n° 42 ?

**La solution** (`src/messaging/service.ts` → `posterMessage()`) : une transaction
PostgreSQL verrouille la ligne du groupe (`SELECT … FOR UPDATE`) ; pendant ce temps
personne d'autre ne peut calculer `seq = max(seq)+1`. Chaque message déclare aussi
son **epoch** MLS ; s'il ne correspond pas à l'epoch courant du groupe → **409
`epoch_perime`** : un client dépassé ne peut pas fragmenter l'état du groupe.

**Ce que ça garantit :** ordre TOTAL par groupe, sans trou ni doublon — tous les
clients rejouent les blobs dans l'ordre des `seq` et retombent sur le même état MLS.

### 4.8 La révocation en deux temps (ADR-08) — l'épreuve centrale

**Temps 1 — coupure serveur (centralisé, immédiat)** — `src/agents/service.ts` :
statut → `REVOQUE`, toutes les sessions révoquées (les JWT vivants deviennent
inertes), KeyPackages supprimés (plus ajoutable nulle part), sorties de tous les
groupes, sockets WebSocket notifiées puis **fermées (code 4003)**.

**Temps 2 — retrait cryptographique MLS (distribué, par les clients)** : le serveur
ne peut PAS produire un commit MLS (il n'a pas les clés — et c'est voulu). Les
membres en ligne reçoivent `membre_retire` et l'un d'eux émet le **retrait MLS** :
l'agent révoqué ne peut plus déchiffrer les NOUVEAUX messages même s'il gardait une
copie de l'ancien état du groupe.

**Pourquoi deux temps ?** La coupure serveur est instantanée mais insuffisante
(l'agent a peut-être déjà l'historique) ; le retrait MLS est complet mais prend
quelques secondes (il doit passer par un membre). Ensemble : immédiat ET définitif.

### 4.9 Minimisation des métadonnées — le tableau à connaître par cœur

| Le serveur VOIT (inévitable) | Mesure de réduction | Où |
|---|---|---|
| Qui est membre de quel groupe | nécessaire à la livraison — **limite assumée** | `GroupMember` |
| Quel agent écrit dans quel groupe, quand | ids de groupe aléatoires ; **aucun contenu** ni dans la base ni dans les logs | `Message` |
| Taille approximative des messages | padding côté client (OpenMLS) — à vérifier au branchement | — |
| Qui est en ligne | présence EN MÉMOIRE, visible des seuls membres de ses groupes, **jamais en base** | `relay.ts` |
| Adresse IP | rate-limit ; non stockée | — |
| Annuaire (nom, ministère, fonction) | données fictives au sprint ; matricule réservé à l'admin | `Agent` |

| Le serveur NE VOIT PAS | Preuve |
|---|---|
| Contenu des messages | `Message.content` = base64 opaque ; test `tests/db-sans-clair.test.ts` |
| Nom des groupes | **aucune colonne** ; voyage chiffré dans un message `nom_groupe` (REQ-GRP-006) |
| Contenu des fichiers ni leurs clés | blob AES-GCM côté client ; clé dans un message MLS `media_cle` |
| Secrets personnels / codes d'activation | scrypt + SHA-256 uniquement |

### 4.10 « Aucune cryptographie développée par l'équipe » — la liste exacte

Tout ce que ce serveur fait en cryptographie est **standard, éprouvé, sourcé** :

| Besoin | Primitive / bibliothèque | Licence |
|---|---|---|
| Hachage des secrets personnels | `crypto.scryptSync` (Node) | MIT (Node.js) |
| Comparaison en temps constant | `crypto.timingSafeEqual` (Node) | MIT |
| Hachage des codes d'activation, intégrité fichiers | SHA-256 (Node) | MIT |
| Aléa cryptographique | `crypto.randomBytes` (Node) | MIT |
| Second facteur | `otpauth` (RFC 6238) | MIT |
| Jetons de session | `@fastify/jwt` (HS256) | MIT |
| **Chiffrement de bout en bout** | **OpenMLS (RFC 9420), côté CLIENT en WebAssembly** | MIT / Apache-2.0 |

Le serveur n'implémente **aucun** algorithme cryptographique : il valide, hache,
signe (JWT) et relaie. C'est votre réponse si le jury pose la question piège.

---

## 5. Le chiffrement de bout en bout : qui fait quoi

**Le backend ne chiffre jamais un message.** Il est le relais aveugle du protocole
MLS (RFC 9420) que le client (Vue 3 + OpenMLS/WASM) exécute intégralement :

| Étape MLS | Qui | Via le backend |
|---|---|---|
| Génération des clés | client (IndexedDB + WebCrypto non extractible) | — |
| Publication des KeyPackages | client | `POST /key-packages` (stocke, opaque) |
| Récupération du KeyPackage d'un tiers | client | `GET /key-packages/:agentId` |
| Création du groupe (epoch 0) | client | `POST /groupes` (l'id sert d'adresse de livraison) |
| Ajout d'un membre (commit + Welcome) | client | `POST /groupes/:id/messages` kind `mls_commit` |
| Message applicatif | client | idem, kind `mls_app` |
| Accusé de lecture SIGNÉ par l'appareil | client | kind `recu_lu` — preuve technique (ADR-09) |
| Nom du groupe | client | kind `nom_groupe` — jamais en clair côté serveur |
| Clé d'un fichier chiffré | client | kind `media_cle` |

**À retenir pour le jury :** « Le serveur ne peut pas tricher : même compromis, il ne
peut ni lire les messages, ni fabriquer un faux accusé (signé par l'appareil), ni
ajouter un membre à un groupe (il n'a pas de KeyPackage valide ni de clé d'epoch). »

---

## 6. Fiche jury : les épreuves en direct

> Trois épreuves tirées au sort parmi cinq, 35 points. Préparez les cinq.

### Épreuve A — « Le serveur ne lit rien »
**Démo :** envoyez un message depuis le client, puis :
```bash
docker compose exec db psql -U goama -d goama -c 'SELECT content FROM "Message" LIMIT 5;'
docker compose exec db psql -U goama -d goama -c '\dt'   # pas de table "nom_de_groupe"
docker compose logs api | tail -20                        # aucun contenu dans les logs
```
Montrez aussi le **trafic réseau** (onglet Réseau du navigateur) : tout ce qui passe
est du base64. **Preuve automatisée :** `npm test` → `db-sans-clair.test.ts`.

### Épreuve B — « Révocation »
**Scénario 60 secondes :** agent A connecté dans un groupe → l'Administrateur révoque
(`POST /agents/:id/revoquer` via le dashboard) → l'écran de A tombe immédiatement
(socket fermée 4003) → B envoie un message → A ne peut PAS se reconnecter
(401 `agent_revoque`). Montrez `tests/revocation.test.ts` en appui.
**Expliquez les deux temps** (§4.8) : coupure serveur + retrait MLS par un membre.

### Épreuve C — « Intrus »
Montrez les rejets en cascade : connexion inconnue (401 générique), activation sans
pré-inscription (même message que « code faux »), ajout d'un non-enrôlé à un groupe
(400 `agent_non_enrole`), lecture d'un groupe sans en être membre (403
`membre_requis`), WebSocket sans auth (4001). **Preuve automatisée :**
`tests/intrus.test.ts`.

### Épreuve D — « Explication du code »
Le jury désigne une fonction liée au chiffrement ou à l'authentification. Les cinq
fonctions à connaître **par cœur** (lignes en main) :
1. `src/lib/crypto.ts` — `hasherSecret()` / `verifierSecret()` (scrypt, sel, timing)
2. `src/lib/totp.ts` — `verifierCodeTotp()` (RFC 6238)
3. `src/auth/service.ts` — `connecter()` (2 facteurs + session unique)
4. `src/app.ts` — `fabriquerRequireAuth()` (les 3 verrous)
5. `src/agents/service.ts` — `revoquerAgent()` (les 2 temps)

### Épreuve E — « Innovation »
Votre accusé de lecture à valeur probante : le destinataire signe le reçu avec sa
clé d'appareil enrôlée (OpenMLS, kind `recu_lu`) ; le serveur le relaie sans pouvoir
le falsifier. Valeur **technique**, pas légale affirmée (R-06 — restez prudents).

---

## 7. 10 questions probables du jury et comment y répondre

1. **« Où sont les clés privées ? »** — Dans IndexedDB du navigateur, chiffrées par
   une clé WebCrypto **non extractible** (ADR-02). Jamais sur le serveur.
2. **« Que voit le serveur si vous le compromettez ? »** — L'annuaire, le graphe
   social (qui est dans quel groupe, quand), les tailles. Pas le contenu. §4.9.
3. **« Pourquoi MLS et pas Signal ? »** — MLS (RFC 9420) gère nativement les groupes
   de taille variable par epochs et TreeKEM, standard IETF, bibliothèque Rust
   éprouvée (OpenMLS) compilée en WebAssembly. Le règlement autorise les deux.
4. **« Comment garantissez-vous l'ordre des messages ? »** — Numéro de séquence par
   groupe attribué en transaction avec `SELECT … FOR UPDATE` + contrôle d'epoch (409).
5. **« Un admin peut-il lire les messages ? »** — Non. Il gère l'identité
   (pré-inscription, révocation) et l'annuaire ; il n'a aucune clé MLS.
6. **« Que se passe-t-il si le serveur de la DB est volé ? »** — L'attaquant obtient
   des blobs illisibles, des hash scrypt et des hash de codes. Il peut supprimer
   (perte de service, pas de confidentialité) — d'où les sauvegardes chiffrées.
7. **« Pourquoi un seul appareil ? »** — Décision assumée (ADR-07) : réduit la
   surface (pas de synchronisation multi-appareils des clés) et simplifie la
   traçabilité probante. Le prix : changer de navigateur = nouvelle session vide.
8. **« L'accusé de lecture est-il une preuve légale ? »** — C'est une preuve
   TECHNIQUE signée par l'appareil enrôlé. La valeur légale nécessiterait un avis
   juridique — nous ne l'affirmons pas (R-06, cohérent avec notre doc 06).
9. **« Et si OpenMLS/WASM ne marchait pas ? »** — C'est notre risque n° 1 (R-01),
   identifié dès le cadrage ; le prototype est notre priorité absolue, avant toute
   autre fonctionnalité.
10. **« Pourquoi Fastify et pas NestJS/Django ? »** — Monolithe modulaire léger,
    schémas de validation typés, WebSocket natif : adapté à une équipe de 3 en 7
    jours (ADR-03), sans sacrifier la structure en modules.

---

## 8. Référence rapide de l'API

| Méthode et chemin | Qui | Effet |
|---|---|---|
| `GET /healthz` · `GET /readyz` | tous | vivant · base joignable |
| `POST /auth/pre-inscriptions` | ADMIN | crée un agent + code 24 h (répondu une fois) |
| `POST /auth/activation` | agent pré-inscrit | code + secret → `{ totpSecret, uri }` |
| `POST /auth/connexion` | agent | secret + TOTP → JWT (session unique) |
| `POST /auth/deconnexion` | agent | révoque la session courante |
| `GET /agents` | agent | annuaire (sans matricule) |
| `POST /agents/:id/revoquer` | ADMIN | révocation immédiate (2 temps) |
| `GET /presence` | agent | membres en ligne de ses groupes |
| `POST /groupes` | agent | crée un groupe (parrain = créateur) |
| `GET /groupes` | agent | ses groupes |
| `GET /groupes/:id/membres` | membre | membres du groupe |
| `POST /groupes/:id/membres` | PARRAIN | ajoute un agent ACTIF |
| `DELETE /groupes/:id/membres/:agentId` | PARRAIN | retire un membre |
| `POST /groupes/:id/messages` | membre | blob `{ epoch, kind, content }` → `{ seq }` |
| `GET /groupes/:id/messages?apresSeq=n` | membre | rattrapage (ordre seq, max 200) |
| `POST /key-packages` | agent | publie un KeyPackage MLS (base64 ≤ 16 Ko) |
| `GET /key-packages/:agentId` | agent | KeyPackages d'un tiers (pour l'ajout MLS) |
| `POST /media` · `GET /media/:id` · `DELETE /media/:id` | membre | blobs de fichiers chiffrés |
| `GET /ws` | socket | 1er message `{"type":"auth","jeton":"…"}` puis pings |

**Codes d'erreur** : `400 corps_invalide`, `400 code_invalide`, `400 agent_non_enrole`,
`401 jeton_absent_ou_invalide`, `401 session_fermee`, `401 agent_revoque`,
`401 identifiants_invalides`, `403 droits_admin_requis`, `403 parrain_requis`,
`403 membre_requis`, `409 matricule_deja_enrole`, `409 epoch_perime`,
`413 fichier_trop_lourd`, `429 trop_de_requetes`.

---

## 9. Écarts assumés du sprint

Transparence = crédibilité. Voici ce que ce scaffold simplifie **volontairement**
par rapport à la doc d'architecture (`06_architecture_decisions.md`) :

| Décision doc 06 | Sprint | Reprise en finale |
|---|---|---|
| Redis (présence, blacklist, compteurs) | en mémoire, une instance | ADR-04, P2 |
| MinIO | volume Docker local (repli prévu §2) | ADR-06 |
| BullMQ | `setInterval` (purge) | ADR-05 |
| Matrice des postes pour le parrainage | **Implémentée** : `src/lib/parrainage.ts` vérifie le poste officiel (REQ-AUTHZ-005 P0) | — |
| Frontal Caddy + TLS | exposition directe du port API | §10 de la doc 06 |
| Padding systématique des messages | à vérifier dans la liaison OpenMLS | §9 de la doc 06 |

**Ces écarts sont à citer dans la note de pré-projet et la note de sécurité :**
montrer qu'on les connaît vaut mieux que se faire prendre.

---

## 10. Limites connues (pour la note de sécurité)

1. **Clés dans le navigateur** : protégées par une clé WebCrypto non extractible et
   une politique de contenu stricte, mais un script injecté avec succès pourrait les
   *utiliser* (pas les copier). Limite structurelle d'un client web — assumée (R-02).
2. **Captures d'écran** : non bloquables côté serveur ; filigrane dissuasif côté
   client (R-08).
3. **Métadonnées de graphe** : le serveur voit l'appartenance aux groupes —
   nécessaire à la livraison (§4.9).
4. **Un seul processus API** : une indisponibilité du process coupe le relais (les
   messages chiffrés restent dans PostgreSQL, les clients rattrapent au retour).
5. **Pas de plan B cryptographique** : si OpenMLS/WASM échoue, le socle E2EE est
   perdu (R-01) — d'où la priorité du prototype.
6. **JWT_SECRET et comptes de démo** : les secrets du dépôt sont FICTIFS et pour la
   démonstration uniquement ; chaque installation réelle régénère tout (activation +
   `bootstrap:admin`).

---

*Document généré pour l'équipe Goama — sprint pré-hackathon 2026 (MTDPCE/DGTD).
Relisez le code : chaque fichier est commenté dans le même esprit que ce document.*
