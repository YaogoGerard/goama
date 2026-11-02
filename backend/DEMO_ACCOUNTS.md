# Provisionnement des comptes Goama

Les anciens comptes de démonstration ont été supprimés du mécanisme d'amorçage. Aucun identifiant, mot de passe ou secret TOTP fictif n'est fourni ou généré par le projet.

En production, un seul administrateur initial est provisionné au premier démarrage lorsque `ADMIN_MATRICULE` et les secrets `ADMIN_PASSWORD` et `ADMIN_TOTP_SECRET` sont explicitement fournis. Ils sont montés via Docker Secrets et ne sont jamais affichés dans les journaux. Les agents ordinaires sont ensuite pré-inscrits individuellement via l'administration et activent leur propre TOTP.

**Les anciennes valeurs de démonstration présentes dans l'historique Git ne doivent jamais être utilisées.** Si elles ont été copiées dans un environnement accessible, considérez-les comme compromises et supprimez les comptes correspondants.

Voir [`../docs/DEPLOIEMENT_SECURITE.md`](../docs/DEPLOIEMENT_SECURITE.md) pour la procédure de création et de protection des secrets.
