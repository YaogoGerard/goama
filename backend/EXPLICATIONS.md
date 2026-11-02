# Goama — architecture cryptographique du backend

## Principe

- Le navigateur chiffre les messages de groupe avec Megolm (`m.megolm.v1.aes-sha2`) via libolm en WebAssembly.
- Chaque appareil émetteur possède une session Megolm sortante ; les destinataires importent la clé de cette session comme session entrante.
- La clé de session est remise à chaque appareil autorisé via une session Olm authentifiée et vérifiée par signatures Ed25519. Elle ne doit jamais être envoyée en clair au backend.
- Le backend ne voit que des objets chiffrés, des séquences, des identifiants techniques et les métadonnées prévues par le SRS. L'administration ne peut jamais lire les messages.

## Rôle du backend

Le backend assure l'authentification, les règles institutionnelles de création et de gestion des groupes (parrainage, habilitations), le contrôle d'accès, l'ordre des objets et la révocation immédiate des sessions. Les enveloppes `megolm_app` et `megolm_key_share` sont relayées comme contenus opaques. Le champ `epoch` conservé dans l'API et la base est un compteur de génération Goama : il ne fait pas partie du protocole Megolm.

## Fonctions cryptographiques implémentées

- **Publication de clés publiques** (`POST /devices/olm-keys`) : identité Curve25519/Ed25519 et pré-clés à usage unique, chacune signée Ed25519 ; la vérification des signatures est obligatoire (`src/lib/olm-signatures.ts`). Un changement d'identité est refusé ; la réinitialisation du paquet public exige une action administrative auditée.
- **Attribution atomique des pré-clés** (`POST /groupes/:id/olm-keys`) : le serveur consomme au plus une pré-clé par couple émetteur/destinataire (verrou pessimiste + mémorisation `claimedFor`) ; une réclamation répétée du même couple retourne la même pré-clé, sans vider le stock.
- **Distribution de la clé de session** : chaque clé Megolm est enveloppée dans une session Olm dédiée par destinataire et relayée comme `megolm_key_share` (`m.room_key`).
- **Ordre et sessions** : séquence de message contrôlée sous verrou (`@@unique([groupeId, seq])`), refus des enveloppes hors génération de groupe, session unique par agent vérifiée à chaque requête et sur chaque socket.

## Limites connues

- Les identités sont épinglées en TOFU côté clients : la vérification institutionnelle hors bande des empreintes reste à construire (voir `docs/NOTE_SECURITE.md` et `docs/13_protocole_olm_megolm.md`).
- Il n'existe pas d'accusé de réception cryptographique explicite d'import de clé ; la persistance serveur et le rattrapage par séquence assurent le transport différé.
- La bibliothèque `@matrix-org/olm` 3.2.15 est l'ancienne génération libolm ; la mise à niveau vers la pile Matrix WASM (Vodozemac) est inscrite à la feuille de route avant tout déploiement de production.

## Références

- `../docs/02_requirements_srs.md` — exigences métier et sécurité.
- `../docs/03_design_contract_invariants.md` — garanties et invariants.
- `../docs/06_architecture_decisions.md` — ADR-19, protocole retenu.
- `../docs/13_protocole_olm_megolm.md` — fonctionnement détaillé du protocole.
