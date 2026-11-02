# Goama — frontend

Client web Vue 3 + TypeScript + Vite. Le chiffrement des messages de groupe est basé sur **Megolm** (`m.megolm.v1.aes-sha2`) via le paquet WebAssembly `@matrix-org/olm`.

## Démarrage

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Le backend est attendu sur `http://localhost:8080` par défaut. `VITE_API_URL` permet de remplacer cette adresse. En production, privilégier HTTPS et une origine commune via reverse proxy.

## Cryptographie

- `src/crypto/megolm.ts` : sessions Megolm sortantes/entrantes, chiffrement/déchiffrement, rotation (100 messages ou 7 jours), import/export de clés de session.
- `src/db/` : cache applicatif local distinct des sessions cryptographiques.
- Les pickles libolm sont chiffrés par AES-GCM avant stockage IndexedDB ; la clé WebCrypto est non extractible.
- Les fichiers restent chiffrés par clé AES-GCM aléatoire par fichier ; cette clé doit être incluse dans un message Megolm.

Le flux multi-agent est raccordé au backend : identités et pré-clés signées, sessions Olm, distribution Megolm par destinataire et accusés de réception après import local. Le serveur ne reçoit jamais `sessionKey` en clair. Un scénario live avec trois navigateurs indépendants a validé la création du groupe, trois messages croisés et deux transferts de fichiers chiffrés.

## Rotation et révocation

Une session sortante doit tourner au plus tard après 100 messages ou 7 jours, et immédiatement après un départ/révocation. Chaque agent restant doit recevoir la nouvelle clé par Olm ; un agent retiré ne doit jamais la recevoir. La révocation serveur immédiate est indépendante et reste obligatoire.

## Vérifications

```bash
npm run build
npm run test:e2e
```

Le scénario live et les tests E2E UI ne remplacent pas une revue cryptographique indépendante ni les tests adversariaux. Avant activation institutionnelle, compléter la vérification hors bande des empreintes TOFU, la révocation avec membre hors ligne, l’anti-rejeu et la preuve qu’un membre retiré ne peut pas déchiffrer les messages postérieurs.
