# Tests d'acceptation

**Version :** 0.5 · **Date :** 31 octobre 2026 · Mode : **A** automatisable, **M** manuel. Compléter préconditions, résultats observés et preuves au fil du travail.

| ID | Scénario | Résultat attendu | Exigences | Mode |
|---|---|---|---|---|
| T-001 | Un matricule non pré-inscrit tente d'activer un compte, avec et sans code inventé | Activation refusée ; aucun accès protégé | REQ-ID-001, REQ-AUTHZ-004 | A |
| T-002 | Réutiliser un code d'activation ; l'utiliser après 24 h (horloge simulée) ; vérifier l'envoi sur l'adresse professionnelle | Les deux refusés ; rien n'est créé ; le code n'est remis que par e-mail | REQ-ID-002 | A |
| T-003 | Activer un compte sans enregistrer le second facteur | Activation impossible | REQ-ID-003 | A |
| T-004 | Se connecter sans code TOTP, avec un faux code, puis avec le bon | Les deux premiers refusés ; le troisième réussit | REQ-ID-004 | A |
| T-005 | Saisir 6 codes TOTP erronés, puis le bon ; avancer l'horloge de 15 min | Compte verrouillé même avec le bon code, puis de nouveau utilisable | REQ-ID-005 | A |
| T-006 | Ouvrir une session dans un second navigateur | La première session est fermée immédiatement | REQ-ID-006 | A |
| T-007 | Appeler une route protégée avec une session révoquée, expirée ou sans jeton | Refus ; le contrôle passe par un point unique | REQ-ID-007, REQ-AUTHZ-001, REQ-AUTHZ-004 | A |
| T-008 | Lire la fiche d'un agent | Catégorie, poste officiel et ministère sont trois champs distincts ; la capacité de parrainage en est déduite | REQ-ID-008 | A |
| T-009 | Perte d'appareil : l'Administrateur révoque l'agent et émet un nouveau code | Ancienne session bloquée ; nouvel appareil activé ; pas de libre-service | REQ-ID-009 | M |
| T-010 | Un agent appelle une route d'administration ; l'Administrateur fait de même | Agent : 403 ; Administrateur : accepté | REQ-AUTHZ-002 | A |
| T-011 | L'Administrateur inspecte la base, le dashboard et les outils d'administration | Aucun contenu en clair, aucune clé, aucun outil de déchiffrement | REQ-AUTHZ-003 | M |
| T-012 | Créer un groupe avec un agent de poste habilité, puis avec un agent de poste non habilité (dont un Conseiller Technique, catégorie P/A) | Création acceptée pour le premier ; refusée pour les autres, quelle que soit la catégorie | REQ-AUTHZ-005 | A |
| T-013 | Un agent non habilité soumet une demande de groupe ; un parrain la refuse | Demande enregistrée, refus notifié au demandeur, aucun groupe créé | REQ-AUTHZ-006, REQ-GRP-001 | A |
| T-014 | Alice envoie un message 1-1 à Bob | Bob le déchiffre à l'identique | REQ-MSG-001, REQ-MSG-002 | A |
| T-015 | **Le serveur ne lit rien** : envoyer une phrase connue (message, fichier, accusé) ; chercher dans PostgreSQL, Redis, MinIO et une capture réseau | Aucune occurrence ; aucune clé privée côté serveur | REQ-MSG-003, REQ-SEC-007 | A |
| T-016 | Recevoir un message ; tenter d'exporter la clé WebCrypto ; copier la base IndexedDB | L'export de la clé échoue ; la base copiée est illisible sans elle ; le message reste lisible dans l'application | REQ-MSG-004, REQ-SEC-003, REQ-SEC-004 | M |
| T-017 | Envoyer un message, observer les états | « Envoyé » après accusé du serveur ; « Distribué » après remise à l'appareil | REQ-MSG-005 | A |
| T-018 | Couper le réseau pendant un envoi, puis le rétablir | Aucun doublon grâce à l'identifiant unique | REQ-MSG-006 | A |
| T-019 | Avancer l'horloge de 31 jours | Messages chiffrés de plus de 30 jours supprimés | REQ-MSG-007 | A |
| T-020 | Envoyer une pièce jointe ; inspecter MinIO et le trafic | Seul le chiffré est stocké ; la clé n'apparaît que dans un message chiffré ; le destinataire déchiffre | REQ-FILE-001, REQ-FILE-002, REQ-FILE-003 | A |
| T-021 | Envoyer un fichier de 25 Mo, puis 25 Mo + 1 octet, puis un message de 65 Ko | Le premier passe ; les autres sont refusés | REQ-FILE-004, REQ-ABUSE-005 | A |
| T-022 | Ouvrir une pièce jointe, fermer la fenêtre | Le fichier déchiffré n'est écrit nulle part sur disque | REQ-FILE-005 | M |
| T-023 | Couper le réseau au milieu d'un téléversement de 20 Mo | Reprise au point d'interruption ; empreinte intacte | REQ-FILE-006 | M |
| T-024 | Ouvrir une pièce jointe et un message classifié | L'avertissement sur les captures est affiché | REQ-FILE-007, REQ-CLS-005 | M |
| T-025 | Alice ouvre un message de Bob en 1-1 | Bob voit « Lu » après vérification de la signature de l'accusé | REQ-RCPT-001, REQ-RCPT-003 | A |
| T-026 | Le serveur injecte un faux accusé « Lu » ou en modifie un | Le client le rejette ; « Lu » n'est pas affiché | REQ-RCPT-002 | A |
| T-027 | Lire un message dans un groupe | Aucun accusé « Lu » émis | REQ-RCPT-004 | A |
| T-028 | Consulter l'aide de l'accusé « Lu » | Texte : atteste l'affichage par un appareil enrôlé, sans valeur légale garantie | REQ-RCPT-006 | M |
| T-029 | Rechercher des agents par ministère puis par fonction ; lire une fiche d'annuaire côté agent | Seuls les agents correspondants ; le matricule n'est pas affiché | REQ-DIR-001, REQ-DIR-006 | A |
| T-030 | Se connecter, puis couper le navigateur sans se déconnecter | Présence mise à jour toutes les 15 s ; « hors ligne » au plus 40 s après le dernier signal | REQ-DIR-002 | A |
| T-031 | Vérifier la base PostgreSQL après plusieurs connexions | La présence est partagée dans PostgreSQL et aucune donnée de présence ne contient de contenu de message ou de clé | REQ-DIR-003 | A |
| T-032 | Un agent sans conversation commune demande la présence d'un autre | Présence non visible | REQ-DIR-004 | A |
| T-033 | Deux instances de l'API ; un agent connecté à l'une, son interlocuteur à l'autre | Le changement de présence est visible depuis l'autre instance via PostgreSQL | REQ-DIR-005, REQ-OPS-006 | A |
| T-034 | Envoyer un message Confidentiel ; inspecter le serveur | Le niveau est lisible chez le destinataire ; le serveur ne le voit pas | REQ-CLS-001 | A |
| T-035 | Tenter de transférer, copier ou exporter un message restreint ou confidentiel | Actions indisponibles | REQ-CLS-002 | M |
| T-036 | Message Confidentiel avec expiration de 1 min ; essayer 8 jours | Supprimé à l'expiration ; plus de 7 jours refusé | REQ-CLS-003 | A |
| T-037 | Ouvrir un message Confidentiel | Filigrane avec le nom du destinataire | REQ-CLS-004 | M |
| T-038 | **Révocation** : l'Administrateur révoque un membre pendant une conversation de groupe | Session invalidée ; connexion fermée et requêtes refusées en 5 s au plus | REQ-REV-001, REQ-REV-002 | A |
| T-039 | Révoquer un agent alors que des messages sont encore en file pour lui | Aucun message ne lui est livré après la révocation | REQ-REV-003 | A |
| T-040 | Après révocation, un membre en ligne reçoit l'avis ; envoyer un message au groupe | Nouvelle session Megolm créée et clé distribuée par Olm aux appareils restants ; le révoqué ne peut pas déchiffrer | REQ-REV-004 | A |
| T-041 | Révoquer alors qu'aucun autre membre n'est en ligne | État « retrait en attente » visible au tableau de bord ; rotation et partage Olm effectués à la première reconnexion d’un appareil autorisé | REQ-REV-005, REQ-REV-006 | M |
| T-042 | Observer le navigateur révoqué ; observer le groupe | Tentative d'effacement local ; les membres sont informés du retrait | REQ-REV-007, REQ-REV-008 | M |
| T-043 | **Intrus** : un agent non enrôlé tente de rejoindre un groupe ; un client reçoit un ajout sans attestation valide | Refus serveur et refus client ; événement journalisé | REQ-SEC-006 | A |
| T-044 | Pré-inscrire, activer, révoquer, échouer 5 connexions ; inspecter journaux d'audit et journaux techniques | Tous les événements présents ; aucun texte, fichier, secret ni clé | REQ-AUD-001, REQ-AUD-002 | A |
| T-045 | Lire le journal avec un agent ; avancer l'horloge de 91 jours | Agent refusé ; entrées de plus de 90 jours purgées | REQ-AUD-003, REQ-AUD-004 | A |
| T-046 | 6 tentatives de connexion en 1 min depuis une IP | La 6e : 429 avec Retry-After, sans détail interne | REQ-ABUSE-001, REQ-ABUSE-004 | A |
| T-047 | 61 messages en 1 min ; 31 demandes de clé de session Megolm ; 31 opérations d'administration ; 2 instances de l'API | Dépassements refusés (429) ; compteurs PostgreSQL cumulés sur les deux instances, sans fenêtre de contournement au basculement. | REQ-ABUSE-002, REQ-ABUSE-003, REQ-ABUSE-006, REQ-ABUSE-007 | A |
| T-048 | Vérifier le protocole et la distribution de clés | Megolm `m.megolm.v1.aes-sha2` + partage de clé via Olm authentifié ; aucune clé brute côté serveur | REQ-SEC-001 | A |
| T-049 | Connexion en clair puis en TLS 1.1 | Refusée | REQ-SEC-005 | A |
| T-050 | Comparer la liste des métadonnées documentée (`06_architecture_decisions.md` §9) avec la base PostgreSQL et les journaux | Aucune métadonnée non documentée | REQ-SEC-008 | M |
| T-051 | Examiner les en-têtes HTTP, les scripts chargés, l'empreinte du fichier WebAssembly | Politique de contenu stricte ; aucun script tiers ; intégrité contrôlée | REQ-SEC-009, REQ-SEC-012 | A |
| T-052 | Créer 100 groupes ; avancer l'horloge de 8 jours ; lister les versions de dépendances | Identifiants non séquentiels ; IP de plus de 7 jours purgées ; versions figées | REQ-SEC-010, REQ-SEC-011 | A |
| T-053 | Provoquer une erreur 500 pendant un envoi | Échec affiché, jamais présenté comme un succès | REQ-REL-001 | A |
| T-054 | Couper le réseau, envoyer 3 messages, rétablir | Réseau signalé ; messages en file puis envoyés dans l'ordre ; rattrapage par séquence | REQ-REL-002, REQ-REL-003 | M |
| T-055 | Sur une machine vierge, préparer les secrets et la configuration d'exploitation puis lancer `docker compose --env-file .env up -d` | Tous les services sains ; migrations appliquées ; seul l'administrateur explicitement provisionné existe ; aucun secret dans les journaux | REQ-OPS-001, REQ-OPS-002 | M |
| T-056 | Scanner le dépôt à la recherche de secrets ; démarrer l'API sans secret | Aucun secret dans le dépôt ; échec contrôlé avec message explicite | REQ-OPS-002 | A |
| T-057 | Révoquer un agent ; redémarrer l'API et vérifier PostgreSQL | Le révoqué reste refusé ; l'état d'autorisation est rechargé depuis PostgreSQL et invalidé dès la révocation | REQ-OPS-003, REQ-OPS-004 | A |
| T-058 | Appeler /healthz et /readyz, puis arrêter PostgreSQL | /healthz répond ; /readyz répond 503 | REQ-OPS-005 | A |
| T-059 | Lire /metrics après une activité de test | Connexions, débit, latence, erreurs et 429 présents | REQ-OPS-007 | A |
| T-060 | Suivre la procédure de sauvegarde, restaurer sur une machine vierge | Comptes et données chiffrées retrouvés | REQ-OPS-008 | M |
| T-061 | Test de charge : 500 connexions, 50 messages par seconde pendant 5 minutes | Latence au 95e centile mesurée et consignée ; aucune perte | REQ-OPS-009 | A |
| T-062 | Redémarrer l'API avec des tâches en file | Les tâches reprennent ; aucune perte | REQ-OPS-011 | A |
| T-063 | Un agent sans capacité de parrainage soumet une demande ; un parrain la valide | Le groupe n'existe qu'après validation ; le parrain en est membre avec le rôle de parrain | REQ-GRP-001, REQ-GRP-003 | A |
| T-064 | Un parrain d'un autre ministère valide la demande d'un agent | Validation acceptée ; groupe interministériel créé ; validation auditée avec l'identité du parrain | REQ-GRP-002 | A |
| T-065 | Un agent sans capacité de parrainage tente de créer un groupe directement, puis de valider une demande | Les deux refusés ; seul le chemin de la demande lui est ouvert | REQ-AUTHZ-005, REQ-AUTHZ-006 | A |
| T-066 | Le créateur puis le parrain ajoutent et retirent des membres, renomment, promeuvent un co-parrain, suppriment le groupe | Chaque changement de membres déclenche une rotation Megolm et un partage Olm sécurisé ; le compteur de génération Goama est incrémenté ; les deux rôles disposent des mêmes capacités | REQ-GRP-004 | A |
| T-067 | Retirer un membre d'un groupe de N membres et tenter d'envoyer des messages avant les reçus | Chaque membre restant importe les clés de chaque autre membre ; N×(N−1) reçus distincts sont enregistrés ; la rotation ne passe à `TERMINE` qu'à la réception du dernier reçu ; un membre hors ligne maintient l'état `EN_ATTENTE` | REQ-SEC-001, REQ-REV-008 | A |
| T-068 | Présenter un reçu avec mauvais epoch, un sender hors groupe, un partage absent ou un membre révoqué | Reçu refusé ; statut de rotation non avancé | REQ-SEC-001 | A |
| T-069 | Réutiliser simultanément un même jeton de renouvellement dans deux requêtes | Une seule rotation du jeton réussit ; la seconde requête est refusée | REQ-ID-007 | A |
| T-070 | Télécharger/supprimer/purger un média pendant une panne filesystem ou DB ; dépasser simultanément quotas agent et groupe | Métadonnées et blobs restent réconciliables ; aucune suppression DB avant suppression physique confirmée ; quotas non dépassés sous concurrence | REQ-FILE-001 à 004 | A |
| T-071 | Connecter le même agent à deux instances API, révoquer sa session, puis couper et rétablir PostgreSQL LISTEN/NOTIFY | Une seule socket active ; présence partagée ; événements relayés aux sockets des autres instances ; perte de notification récupérée par REST et vérification périodique de session | REQ-OPS-003, REQ-OPS-004 | A |
| T-073 | Renommer un groupe, puis inspecter PostgreSQL et les journaux | Le nom n'apparaît nulle part en clair côté serveur | REQ-GRP-006 | A |
| T-074 | Un membre quitte ; le parrain suspend puis reprend ; le dernier parrain quitte | Départ effectif par rotation Megolm ; publications gelées puis rétablies ; groupe gelé et signalé au tableau de bord | REQ-GRP-007, REQ-GRP-008, REQ-GRP-009 | M |
| T-075 | L'Administrateur cherche une opération de groupe dans le tableau de bord | Aucune opération de groupe n'est proposée ni acceptée | REQ-GRP-005 | A |
| T-076 | Sur une installation vierge, lancer la commande d'amorçage, puis la relancer | Le premier Administrateur existe avec les identifiants explicitement fournis ; le second appel ne crée aucun second compte | REQ-OPS-012 | A |
| T-077 | Chercher dans le tableau de bord et dans l'API une opération de suppression définitive de compte ; révoquer un agent et relire son annuaire | Aucune opération de suppression n'existe ; le compte révoqué reste consultable avec son statut | REQ-OPS-013 | A |
| T-078 | Se déconnecter volontairement puis se reconnecter avec les mêmes identifiants sur le même appareil ; attendre l'expiration de session (12 h) et se reconnecter | Reconnexion acceptée dans les deux cas, sans intervention administrative ; l'appareil reste enrôlé et le compte actif | REQ-ID-010 | A |

## Matrice de couverture (générée et vérifiée)

| Exigence | Priorité | Tests |
|---|---|---|
| REQ-ID-001 | P0 | T-001 |
| REQ-ID-002 | P0 | T-002 |
| REQ-ID-003 | P0 | T-003 |
| REQ-ID-004 | P0 | T-004 |
| REQ-ID-005 | P1 | T-005 |
| REQ-ID-006 | P0 | T-006 |
| REQ-ID-007 | P0 | T-007 |
| REQ-ID-008 | P0 | T-008 |
| REQ-ID-009 | P1 | T-009 |
| REQ-AUTHZ-001 | P0 | T-007 |
| REQ-AUTHZ-002 | P0 | T-010 |
| REQ-AUTHZ-003 | P0 | T-011 |
| REQ-AUTHZ-004 | P0 | T-001, T-007 |
| REQ-AUTHZ-005 | P0 | T-012, T-065 |
| REQ-AUTHZ-006 | P0 | T-013, T-065 |
| REQ-AUTHZ-007 | P2 | reporté (P2) |
| REQ-GRP-001 | P0 | T-063, T-065 |
| REQ-GRP-002 | P0 | T-064 |
| REQ-GRP-003 | P0 | T-063 |
| REQ-GRP-004 | P0 | T-066 |
| REQ-GRP-005 | P0 | T-075 |
| REQ-GRP-006 | P1 | T-073 |
| REQ-GRP-007 | P1 | T-074 |
| REQ-GRP-008 | P1 | T-074 |
| REQ-GRP-009 | P1 | T-074 |
| REQ-MSG-001 | P0 | T-014 |
| REQ-MSG-002 | P0 | T-014 |
| REQ-MSG-003 | P0 | T-015 |
| REQ-MSG-004 | P0 | T-016 |
| REQ-MSG-005 | P0 | T-017 |
| REQ-MSG-006 | P1 | T-018 |
| REQ-MSG-007 | P1 | T-019 |
| REQ-FILE-001 | P0 | T-020 |
| REQ-FILE-002 | P0 | T-020 |
| REQ-FILE-003 | P0 | T-020 |
| REQ-FILE-004 | P0 | T-021 |
| REQ-FILE-005 | P1 | T-022 |
| REQ-FILE-006 | P1 | T-023 |
| REQ-FILE-007 | P1 | T-024 |
| REQ-RCPT-001 | P0 | T-025 |
| REQ-RCPT-002 | P0 | T-026 |
| REQ-RCPT-003 | P0 | T-025 |
| REQ-RCPT-004 | P0 | T-027 |
| REQ-RCPT-005 | P2 | reporté (P2) |
| REQ-RCPT-006 | P1 | T-028 |
| REQ-DIR-001 | P0 | T-029 |
| REQ-DIR-002 | P0 | T-030 |
| REQ-DIR-003 | P0 | T-031 |
| REQ-DIR-004 | P1 | T-032 |
| REQ-DIR-005 | P1 | T-033 |
| REQ-DIR-006 | P1 | T-029 |
| REQ-DIR-007 | P2 | reporté (P2) |
| REQ-CLS-001 | P0 | T-034 |
| REQ-CLS-002 | P0 | T-035 |
| REQ-CLS-003 | P0 | T-036 |
| REQ-CLS-004 | P1 | T-037 |
| REQ-CLS-005 | P0 | T-024 |
| REQ-REV-001 | P0 | T-038 |
| REQ-REV-002 | P0 | T-038 |
| REQ-REV-003 | P0 | T-039 |
| REQ-REV-004 | P0 | T-040 |
| REQ-REV-005 | P0 | T-041 |
| REQ-REV-006 | P0 | T-041 |
| REQ-REV-007 | P1 | T-042 |
| REQ-REV-008 | P1 | T-042 |
| REQ-AUD-001 | P0 | T-044 |
| REQ-AUD-002 | P0 | T-044 |
| REQ-AUD-003 | P1 | T-045 |
| REQ-AUD-004 | P1 | T-045 |
| REQ-ABUSE-001 | P0 | T-046 |
| REQ-ABUSE-002 | P1 | T-047 |
| REQ-ABUSE-003 | P1 | T-047 |
| REQ-ABUSE-004 | P0 | T-046 |
| REQ-ABUSE-005 | P1 | T-021 |
| REQ-ABUSE-006 | P1 | T-047 |
| REQ-ABUSE-007 | P1 | T-047 |
| REQ-SEC-001 | P0 | T-048 |
| REQ-SEC-003 | P0 | T-016 |
| REQ-SEC-004 | P0 | T-016 |
| REQ-SEC-005 | P0 | T-049 |
| REQ-SEC-006 | P0 | T-043 |
| REQ-SEC-007 | P0 | T-015 |
| REQ-SEC-008 | P0 | T-050 |
| REQ-SEC-009 | P1 | T-051 |
| REQ-SEC-010 | P1 | T-052 |
| REQ-SEC-011 | P1 | T-052 |
| REQ-SEC-012 | P1 | T-051 |
| REQ-REL-001 | P0 | T-053 |
| REQ-REL-002 | P1 | T-054 |
| REQ-REL-003 | P1 | T-054 |
| REQ-OPS-001 | P0 | T-055 |
| REQ-OPS-002 | P0 | T-056 |
| REQ-OPS-003 | P0 | T-057 |
| REQ-OPS-004 | P0 | T-057 |
| REQ-OPS-005 | P1 | T-058 |
| REQ-OPS-006 | P1 | T-033 |
| REQ-OPS-007 | P1 | T-059 |
| REQ-OPS-008 | P1 | T-060 |
| REQ-OPS-009 | P1 | T-061 |
| REQ-OPS-010 | P2 | reporté (P2) |
| REQ-OPS-011 | P1 | T-062 |
| REQ-OPS-012 | P0 | T-076 |
| REQ-OPS-013 | P0 | T-077 |

## Fiche de preuve (à remplir pour chaque test)

- **ID du test :** · **Date / version :**
- **Préconditions :**
- **Étapes exécutées :**
- **Résultat attendu :** · **Résultat observé :**
- **Statut :** Réussi / Échoué / Bloqué
- **Preuve :** capture expurgée, sortie de test ou journal sans contenu sensible
- **Défaut associé :**
