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

**Blocage de sécurité connu :** l’échange de clés de session Megolm entre agents (un appareil par agent) doit être enveloppé dans une session Olm authentifiée. Le moteur fournit les primitives d'import/export, mais l'enrôlement des clés Curve25519/Ed25519, les pré-clés à usage unique, la négociation Olm, la distribution aux agents autorisés et les accusés de réception ne sont pas encore reliés au backend. En conséquence, cette livraison n’est pas une messagerie E2EE multi-membre opérationnelle et ne doit pas être utilisée avec des données réelles. Il est interdit de transmettre `sessionKey` en clair au serveur.

## Rotation et révocation

Une session sortante doit tourner au plus tard après 100 messages ou 7 jours, et immédiatement après un départ/révocation. Chaque agent restant doit recevoir la nouvelle clé par Olm ; un agent retiré ne doit jamais la recevoir. La révocation serveur immédiate est indépendante et reste obligatoire.

## Vérifications

```bash
npm run build
npm run test:e2e
```

Les tests E2E UI ne remplacent pas les tests cryptographiques de bout en bout. Avant activation, ajouter des tests avec deux comptes distincts sur leurs appareils uniques : partage Olm vérifié, messages Megolm, anti-rejeu, rotation, retrait et impossibilité pour l’ancien membre de déchiffrer les messages postérieurs.
