# Contrat du système — Garanties et invariants

**Version :** 0.5 · **Date :** 31 octobre 2026 · **Source :** PRD et SRS

Les promesses que le système tient envers ses utilisateurs, et les règles qui ne doivent jamais se rompre, indépendamment de la technologie.

## 1. Garanties

### G-01 — Seuls les agents autorisés accèdent aux fonctions protégées
Toute opération protégée exige un compte pré-inscrit, activé avec second facteur, authentifié, avec une session unique active et les permissions nécessaires. En cas de doute, l'accès est refusé.

### G-02 — Le serveur ne lit pas le contenu des conversations
Messages, pièces jointes et accusés de lecture sont chiffrés sur l'appareil émetteur. Le serveur, sa base, son cache et son stockage de fichiers ne détiennent que des données chiffrées et aucune clé.

### G-03 — Les pièces jointes sont protégées avant transmission
Le fichier est chiffré localement ; sa clé voyage uniquement dans un message protégé destiné aux participants autorisés.

### G-04 — Une révocation coupe l'accès côté serveur en 5 secondes au plus
Après validation, la session de l'agent est invalidée, ses requêtes sont refusées et sa connexion temps réel est fermée. L'état « révoqué » prime sur toute file de distribution.

### G-05 — La révocation retire l'agent cryptographiquement et son état est suivi
Chaque groupe de l'agent a un état de retrait : en attente, terminé ou échec. « Terminé » n'existe qu'après le changement effectif de la clé du groupe. Un retrait non terminé est visible de l'administration.

### G-06 — L'administration ne donne pas accès aux contenus
L'Administrateur gère comptes, activations, révocations et audit. Aucune fonction d'administration ne permet de déchiffrer une conversation.

### G-07 — Journaux et caches ne contiennent pas de contenu privé
Identifiants techniques, horodatages, résultats d'opérations : oui. Texte, fichiers, clés, secrets : jamais.

### G-08 — Un accusé « Lu » est authentique
Il est produit et signé par l'appareil du destinataire, chiffré de bout en bout ; l'émetteur en vérifie la signature. Le serveur ne peut ni en fabriquer ni en modifier un.

### G-09 — La classification est appliquée par l'application, et ses limites sont annoncées
Le niveau d'un message voyage dans le message chiffré. L'application limite le transfert, l'export et la durée de vie selon le niveau, et indique qu'elle ne peut empêcher les captures ni les photos.

### G-10 — Présence et annuaire n'exposent que le nécessaire
La présence est volatile (non conservée dans la base) et visible des seuls interlocuteurs ; l'annuaire montre nom, ministère et fonction, jamais le matricule.

### G-11 — Les erreurs ne deviennent pas des succès silencieux
Un message est « envoyé » seulement après accusé du serveur, « distribué » après remise à l'appareil ; une révocation n'est « terminée » qu'après confirmation de chaque étape.

### G-12 — Les limites s'appliquent à tous les chemins d'accès
Débit, taille et concurrence sont contrôlés pour toute requête, y compris répétée, administrative ou après reconnexion.

### G-13 — Les secrets cryptographiques restent sur l'appareil
Les clés privées ne sont jamais envoyées ; l'état de chiffrement stocké localement est protégé par une clé non extractible du navigateur.

## 2. Invariants

- **INV-001 :** le serveur ne possède jamais la clé privée d'un agent ni la clé de déchiffrement d'un groupe.
- **INV-002 :** aucun contenu de message, de fichier ou d'accusé de lecture n'est persisté ni transité en clair dans PostgreSQL, Redis, MinIO ou les journaux. Seules des données d'annuaire strictement nécessaires (nom, matricule, ministère, fonction, catégorie) sont conservées en clair côté serveur, fictives pendant le sprint.
- **INV-003 :** l'état « révoqué » d'une session dans Redis est prioritaire et écrase toute file de distribution.
- **INV-004 (appareil unique) :** un agent ne détient qu'une seule session valide à la fois ; une nouvelle ouverture ferme la précédente.
- **INV-005 :** un membre n'est ajouté à un groupe que si son attestation d'enrôlement est valide.
- **INV-006 :** aucun secret n'est écrit dans les journaux.
- **INV-007 :** le cache n'est jamais l'unique source de vérité d'une permission ; il est rechargé depuis la base au démarrage et invalidé à chaque révocation.
- **INV-008 :** la présence n'est pas écrite dans PostgreSQL.
- **INV-009 :** un accusé « Lu » n'est affiché que si sa signature est vérifiée.
- **INV-010 :** les opérations d'administration sensibles sont auditées.
- **INV-011 :** un groupe n'existe qu'après validation par un parrain habilité ; tant qu'il est actif, il conserve au moins un parrain, et un groupe sans parrain est gelé.

## 3. Actions interdites

Le système NE DOIT PAS :
- accepter une inscription publique non pré-validée ;
- fabriquer ou modifier un protocole cryptographique ;
- donner à l'Administrateur un moyen caché de lecture ;
- écrire contenus, clés ou secrets dans les journaux ;
- faire confiance au seul cache pour une permission ;
- annoncer une révocation complète tant que le retrait cryptographique n'est pas confirmé ;
- revendiquer une valeur légale de l'accusé de lecture sans avis juridique ;
- prétendre bloquer captures d'écran ou photographies ;
- supprimer définitivement un compte, même révoqué (le contenu serveur suit sa politique de purge, le compte reste une trace) ;
- dépendre d'un service tiers pour fonctionner.

## 4. Limites et hypothèses

- Le chiffrement ne masque pas toutes les métadonnées : le serveur voit qui écrit à quel groupe, quand, la taille approximative, qui est en ligne. Elles sont minimisées et documentées (`06_architecture_decisions.md`, §9 « Métadonnées visibles par le serveur »).
- Les clés étant dans le navigateur, un script malveillant injecté dans la page peut les utiliser tant que la page est ouverte ; une clé non extractible empêche seulement de les copier. Une politique de sécurité de contenu stricte est prévue.
- L'effacement des données locales à la révocation est une tentative, pas une garantie : un navigateur hors ligne ou verrouillé peut y échapper. La protection réelle est le retrait cryptographique.
- Un seul appareil par agent : après perte ou changement de navigateur, l'historique local n'est pas transférable ; la récupération d'un appareil ou d'un second facteur passe par l'Administrateur, jamais en libre-service.
- La présence indique qu'une session est connectée, pas que l'agent est disponible.
- « Distribué » est une information du serveur, non probante ; seul « Lu » est signé.
- La protection d'un poste dépend de son verrouillage et de sa sécurité physique.
- Le parrainage ne dépend ni du ministère, ni de la structure, ni d'un périmètre : un parrain habilité peut valider un groupe réunissant des agents de plusieurs ministères. Le contrôle repose sur la matrice des postes et sur la journalisation de chaque validation, non sur une frontière géographique.

## 5. Critère de cohérence

Toute nouvelle fonctionnalité est évaluée contre ces garanties et invariants. Si elle les contredit, elle est refusée, redessinée, ou accompagnée d'une décision documentée.
