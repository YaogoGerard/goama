# Déploiement sécurisé — Goama

**Statut :** procédure opératoire proposée, à valider sur l'infrastructure cible avant production. La réussite des builds ne constitue ni une homologation ni une certification de sécurité.

## 0. Contrôles locaux déjà exécutés

- Suite backend PostgreSQL isolée : **13 fichiers, 39 tests passés**, migrations appliquées sur une base temporaire.
- Scénario live Chromium à trois agents : création du groupe, trois messages croisés, deux transferts de fichiers et téléchargements vérifiés ; **aucune erreur navigateur**.
- `/healthz`, `/readyz`, CSP et en-têtes de sécurité vérifiés sur les frontends locaux.
- Les contrôles ci-dessus ne remplacent pas une restauration sur stockage externe, un test de charge, une revue cryptographique ou une homologation institutionnelle.

## 1. Prérequis et topologie

### Démonstration locale

Pour essayer Goama sur la même machine, lance `docker compose up --build -d` : aucun `.env` ni dossier de secrets n'est requis au départ, le premier démarrage génère les secrets et écrit le fichier `.env` non versionné (autorisations 600) avec les identifiants des comptes fictifs. Compose démarre l'API et les interfaces, puis son service `setup` crée un administrateur et deux agents fictifs : un poste habilité au parrainage (« Chef de Service ») et un poste non habilité (« Rédacteur »). À la fin du démarrage, le service `setup` affiche ces comptes avec leur mot de passe et leur secret TOTP (également conservés dans `.identifiants-demo`, non versionné, autorisations 600) ; ces identifiants de démonstration n'apparaissent jamais dans les journaux de l'API ni dans les journaux d'audit. Ne réutilise pas ces comptes ou secrets ailleurs. Les agents créent leurs clés d'appareil lors de leur première connexion.

Pour arrêter sans supprimer les données, utilise `docker compose down`.

La suite de cette procédure décrit le paramétrage sécurisé d'une installation destinée à être administrée ; la démonstration locale n'autorise pas l'utilisation de données réelles.

- Docker Engine et Docker Compose v2 à jour, avec prise en charge des secrets Compose file-backed.
- Un domaine HTTPS et un reverse proxy TLS administré, configuré pour supprimer les `X-Forwarded-*` reçus du client puis définir lui-même les valeurs fiables.
- PostgreSQL persistant, volume média persistant, sauvegardes hors hôte et supervision des services.
- Un administrateur institutionnel désigné et un canal hors bande sûr pour lui remettre son secret TOTP.

Le réseau Compose utilise `172.30.0.0/24` et des adresses fixes pour les Nginx internes : web `172.30.0.10`, admin `172.30.0.11`, API `172.30.0.12`, PostgreSQL `172.30.0.13`. Le subnet ne doit pas chevaucher un réseau existant ; en cas de conflit, modifier ensemble le subnet et ces adresses dans `docker-compose.yml`. `TRUST_PROXY` doit inclure les adresses exactes des proxies qui parlent à Fastify, et éventuellement celles des proxies amont si leur chaîne `X-Forwarded-For` doit être parcourue. N'utiliser ni `*`, ni `true`, ni une plage plus large que nécessaire.

Les ports publiés sont liés à `127.0.0.1` par défaut. L'exposition publique doit passer par le frontal TLS. Les URLs publiques doivent être HTTPS. Les cookies de renouvellement exigent un déploiement same-site compatible avec `SameSite=Strict`; conserver les frontends et le chemin API sous le même site registrable.

## 2. Préparer les secrets

Depuis la racine du dépôt, créer les fichiers hors Git et limiter leur lecture à l'identité de déploiement :

```sh
install -d -m 700 secrets
umask 077
openssl rand -hex 64 > secrets/jwt_secret
openssl rand -hex 32 > secrets/totp_encryption_key
openssl rand -hex 32 > secrets/group_request_encryption_key
openssl rand -base64 36 | tr -d '\n' > secrets/postgres_password
openssl rand -base64 36 | tr -d '\n' > secrets/admin_password
python3 - <<'PY' > secrets/admin_totp_secret
import base64, secrets
print(base64.b32encode(secrets.token_bytes(20)).decode().rstrip('='))
PY
chmod 600 secrets/*
```

Le secret `admin_totp_secret` est à importer dans l'application TOTP de l'administrateur par un canal contrôlé. Ne le copier ni dans un ticket, ni dans un dépôt, ni dans les journaux ou une conversation non sécurisée. Les secrets JWT/TOTP/GroupRequest ne sont pas interchangeables et doivent être sauvegardés avec une procédure de rotation documentée : remplacer une clé de chiffrement sans ré-envelopper les données existantes rendrait les secrets stockés illisibles.

Créer ou compléter le fichier `.env` à la racine du dépôt avec les variables ci-dessus. Ce fichier est ignoré par Git : ne pas le commiter. Protéger ses permissions :

```sh
chmod 600 .env
```

Renseigner `ADMIN_MATRICULE`, `TRUST_PROXY`, `CORS_ORIGIN`, `PUBLIC_WEB_URL`, `PUBLIC_ADMIN_URL`, `PUBLIC_API_URL` et les chemins secrets. Les chemins `./secrets/...` sont relatifs au fichier Compose. `TRUST_PROXY` doit au minimum contenir les adresses Nginx fixes `172.30.0.10,172.30.0.11`; ajouter précisément le frontal amont selon le chemin réseau réel et tester l'adresse vue par l'API. Les valeurs d'exemple de domaine doivent être remplacées.

## 3. Vérifier et lancer

```sh
docker compose --env-file .env config -q
docker compose --env-file .env build
docker compose --env-file .env up -d
docker compose --env-file .env ps
docker compose --env-file .env logs --since=10m api
```

Vérifier `/healthz` et `/readyz`, les en-têtes HTTP, les certificats TLS, les cookies, les origines CORS, les quotas et la présence d'un seul compte `ADMIN` attendu. Les logs ne doivent contenir ni mot de passe, ni secret TOTP, ni JWT, ni contenu de message. Le bootstrap ne crée aucun compte de démonstration. En cas d'absence d'un secret obligatoire ou d'une configuration de production invalide, l'API doit refuser de démarrer.

Ne pas exécuter une mise à jour de production avant d'avoir pris et vérifié une sauvegarde et appliqué les migrations sur une copie restaurée. Les migrations ajoutées dans cette branche doivent être validées avec `prisma migrate deploy` sur une base de test représentative.

## 4. Sauvegarde et restauration — scripts livrés, répétition obligatoire

La stratégie de production doit sauvegarder de manière cohérente :

1. PostgreSQL (dump logique et/ou sauvegarde physique/PITR, avec rétention et chiffrement) ;
2. le volume de blobs médias ;
3. les secrets de chiffrement nécessaires, dans un coffre distinct avec accès restreint ;
4. les configurations et versions d'images déployées.

Les scripts `scripts/backup-production.sh` et `scripts/restore-production.sh` fournissent un flux initial de sauvegarde/restauration. `age` doit être installé sur l'hôte ; le backup exige une clé publique `AGE_RECIPIENT`, le restore une identité privée protégée `AGE_IDENTITY_FILE`.

```sh
AGE_RECIPIENT="age1..." ./scripts/backup-production.sh
AGE_IDENTITY_FILE=/chemin/coffre/backup.agekey ./scripts/restore-production.sh ./backups --confirm
```

Les archives sont chiffrées avant d'être écrites, accompagnées d'un manifest et d'une somme SHA-256. Le script de restauration remplace destructivement la base et les fichiers médias : l'exécuter uniquement sur un environnement isolé, après sauvegarde de son état actuel et contrôle humain du dossier sélectionné. Les secrets applicatifs ne sont pas inclus ; ils doivent être sauvegardés séparément dans un coffre institutionnel.

Les sauvegardes doivent être externalisées hors du nœud Docker, conservées selon une politique institutionnelle, surveillées et protégées contre l'effacement par un compte compromis. Une restauration complète doit être répétée et chronométrée, puis vérifier les références média, les comptes et la capacité de déchiffrer les secrets TOTP et demandes de groupe. **Les scripts sont ajoutés mais aucune restauration réelle n'a été exécutée ici : ce contrôle reste bloquant avant l'ouverture aux utilisateurs réels.**

## 5. Exploitation, journalisation et incidents

- Centraliser les logs d'audit et techniques dans une destination restreinte, protégée contre l'altération, avec horodatage synchronisé, alertes, contrôle d'accès et rétention approuvée. Le nettoyage applicatif à 90 jours ne remplace pas une politique institutionnelle d'archivage.
- Alerter sur les échecs d'authentification, verrouillages, erreurs 5xx, limites 429, rotations `EN_ATTENTE` anciennes ou `ECHEC`, manque d'espace et indisponibilité PostgreSQL/stockage.
- Surveiller `/readyz`; `/healthz` n'indique que la disponibilité du processus, pas celle de la base.
- Préparer une procédure d'incident : révocation, rotation des secrets, conservation des preuves, restauration et notification institutionnelle.
- Scanner les dépendances, les images et la chaîne de build ; conserver les SBOM et artefacts vérifiés. Épingler les images de production par digest après validation.

## 6. Limites bloquantes connues

- Les événements WebSocket inter-instances utilisent PostgreSQL `LISTEN/NOTIFY`, les présences sont matérialisées par heartbeat et les compteurs Fastify sont atomiques et partagés dans PostgreSQL. Ce chemin multi-instance est implémenté, mais il n'a pas encore été validé sous charge, pendant une partition réseau ou lors d'un basculement de connexion ; ces scénarios restent bloquants avant réplication horizontale de production.
- Le mécanisme TOFU ne réalise pas encore la vérification institutionnelle hors bande des empreintes. La comparaison des empreintes doit être intégrée au parcours utilisateur et auditée.
- Les reçus de rotation sont enregistrés après import déclaré par le client authentifié. Ils suivent les couples émetteur/destinataire et empêchent de déclarer `TERMINE` avant tous les reçus, mais ne constituent pas une preuve indépendante que le navigateur a correctement exécuté le déchiffrement. Le protocole et les hypothèses de confiance nécessitent des tests adversariaux et une revue indépendante.
- Les tests multi-navigateurs, les tests concurrents sur PostgreSQL, les scénarios de panne filesystem et les tests de restauration n'ont pas encore été validés dans un environnement d'intégration complet.
- La CSP doit être testée sur les navigateurs supportés avec la version finale de libolm/WASM et l'inventaire des ressources. Les warnings du bundler `@matrix-org/olm` doivent faire l'objet d'une revue.
- Une revue cryptographique indépendante est impérative. Aucun statut de conformité ou de sécurité institutionnelle ne peut être revendiqué avant cette revue et la clôture des bloqueurs ci-dessus.

**Règle d'exploitation : ne pas connecter de données administratives réelles tant que les contrôles bloquants de la section 6 et la restauration de la section 4 ne sont pas clos et démontrés.**
