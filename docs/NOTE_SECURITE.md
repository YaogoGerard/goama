# Note de sécurité — Goama

**Statut : logiciel en développement, non certifié pour un déploiement institutionnel.** Les contrôles d'identité et d'autorisation côté serveur sont présents et renforcés (sessions uniques vérifiées à chaque requête, TOTP chiffré au repos, WebSockets contrôlant l'origine et la charge). Le modèle est strictement mono-appareil : un appareil actif par agent.

Le flux de distribution Olm/Megolm (publication de clés signées, sessions Olm, enveloppes individuelles, import des clés Megolm) est implémenté côté client et backend. Le modèle de confiance TOFU ne remplace pas une vérification hors bande des empreintes, qui reste à construire. En conséquence, Goama ne doit pas être utilisée avec des données administratives réelles tant que la validation de bout en bout et une revue indépendante n'ont pas été effectuées.

## Règles de déploiement

- Utiliser HTTPS/WSS derrière un reverse proxy durci ; configurer une liste explicite d'origines HTTPS.
- Fournir un `JWT_SECRET` aléatoire d'au moins 32 caractères et une `TOTP_ENCRYPTION_KEY` dédiée de 32 octets hexadécimaux, distincte du secret JWT.
- Protéger et sauvegarder `TOTP_ENCRYPTION_KEY` hors de la base et du dépôt. Sa perte rend les secrets TOTP chiffrés irrécupérables.
- En production, injecter `ADMIN_TOTP_SECRET` par un gestionnaire de secrets ; le secret ne doit pas être écrit dans les logs.
- Garder PostgreSQL sur un réseau privé, sauvegarder les données et contrôler l'accès aux journaux.
- Ne jamais envoyer une clé Megolm brute au backend.
- Ne pas considérer la révocation serveur comme une rotation cryptographique terminée.
- N'utiliser que des comptes et contenus fictifs tant que le flux Olm/Megolm n'a pas été testé entre navigateurs, que les identités n'ont pas été vérifiées hors bande et qu'une revue indépendante n'a pas été effectuée.

Le détail du protocole et ses règles sont dans `13_protocole_olm_megolm.md`. Voir également `TECHNOLOGIES_LICENCES.md` pour les licences des composants cryptographiques.
