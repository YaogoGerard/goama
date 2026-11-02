# Implémentation du transport Olm et des sessions Megolm

**Périmètre :** un seul appareil actif par agent. Le multi-appareil est explicitement hors périmètre.

## 1. Rôle des protocoles

- **Megolm (`m.megolm.v1.aes-sha2`)** chiffre les messages d'un groupe. Chaque agent émetteur possède sa propre session sortante pour la génération courante du groupe.
- **Olm (`m.olm.v1.curve25519-aes-sha2`)** transporte individuellement la clé Megolm de chaque émetteur vers chaque autre membre autorisé.
- Le serveur Goama conserve les clés publiques, les pré-clés publiques signées et les enveloppes chiffrées. Il ne reçoit jamais une clé Megolm brute ni une clé privée Olm.

## 2. Publication des clés publiques

Au premier lancement authentifié sur l'appareil unique de l'agent, le navigateur crée ou restaure un compte Olm local. Il publie :

1. une identité Curve25519/Ed25519, signée par la clé Ed25519 du compte ;
2. un lot de pré-clés Curve25519 à usage unique, chacune signée par la même clé Ed25519.

Le backend vérifie les signatures Ed25519 avant stockage. Les pré-clés sont conservées dans `KeyPackage.payload`, qui ne contient que des données publiques. Le serveur attribue au plus une pré-clé à chaque couple émetteur/destinataire ; une réclamation répétée du même couple retourne la même pré-clé au lieu de vider le stock. Un changement d'identité est refusé ; la réinitialisation du paquet public nécessite une action administrative auditée, puis une nouvelle vérification hors bande par les clients.

Les états privés Olm et les pickles sont conservés dans IndexedDB et enveloppés avec AES-GCM via Web Crypto. Les clés privées ne sont jamais envoyées à l'API.

## 3. Distribution d'une clé Megolm

Lorsqu'un agent ouvre un groupe :

1. le client récupère les identités publiques des membres actifs ;
2. il vérifie les signatures et épingle les identités déjà rencontrées ;
3. pour chaque membre sans session Olm locale, il réclame une pré-clé signée ;
4. il crée ou renouvelle sa session Megolm si la génération du groupe a changé, ou si le seuil de rotation est atteint ;
5. il chiffre le contenu `m.room_key` séparément dans une session Olm pour chaque autre membre ;
6. il transmet à l'API uniquement une enveloppe `megolm_key_share` avec le ciphertext Olm adressé au destinataire.

Le destinataire sélectionne l'enveloppe qui porte sa clé Curve25519, crée une session Olm entrante à la réception d'un message pré-clé, vérifie la clé d'identité de l'expéditeur, déchiffre le contenu, puis importe la clé dans une session Megolm entrante. Les autres membres reçoivent le même blob de transport, mais ne possèdent pas la clé privée correspondant au destinataire et ne peuvent pas le déchiffrer.

Les enveloppes de partage sont stockées dans l'historique durable du groupe. Un membre hors ligne peut les récupérer à sa reconnexion, sous réserve que son identité et son état cryptographique local soient toujours disponibles. Les identités publiques des anciens membres sont conservées consultables par les membres actuels afin de traiter les partages historiques ; aucune nouvelle pré-clé ne peut être réclamée pour un membre retiré.

## 4. Rotation et retrait

Le compteur `epoch` Goama est un compteur de génération de membres ; ce n'est pas une epoch native du protocole Megolm. L'ajout, le retrait et la révocation incrémentent cette génération. À la prochaine ouverture du groupe ou à la réception de l'événement de changement, chaque membre restant crée une nouvelle session Megolm et la distribue aux seuls membres actifs. Le serveur refuse les messages envoyés avec une ancienne génération.

Le client persiste les enveloppes Olm sortantes non confirmées par l'API afin de pouvoir les réessayer sans faire avancer une seconde fois le ratchet. Il conserve aussi temporairement un contenu Olm déchiffré jusqu'à l'import Megolm correspondant.

## 5. Modèle de confiance

Les signatures prouvent que les clés publiques et les pré-clés ont été signées par l'identité Ed25519 annoncée. Le client applique un mécanisme **TOFU** (*Trust On First Use*) : la première identité vue pour un agent est épinglée localement ; tout changement ultérieur est rejeté.

**Limite importante :** il n'existe pas encore d'écran de comparaison de empreintes ni de vérification hors bande par un canal institutionnel. Une attaque active du serveur lors du tout premier échange pourrait donc substituer une identité avant son épinglage. Le TOFU seul ne constitue pas une authentification institutionnelle complète.

## 6. Limites et critères avant usage réel

- Le code utilise `@matrix-org/olm` 3.2.15 (libolm), bibliothèque dépréciée par Matrix. Matrix recommande `@matrix-org/matrix-sdk-crypto-wasm`, binding WASM de sa machine à états E2EE basée sur Vodozemac ; cette pile n'est pas intégrée.
- Le chemin d'échange Olm/Megolm est maintenant raccordé dans le code, mais il n'a pas pu être exécuté entre deux navigateurs indépendants dans l'environnement de préparation : le registre npm était inaccessible.
- Aucun test cryptographique de bout en bout, test de pénétration ou audit indépendant n'est déclaré réussi.
- Il n'existe pas encore d'accusé de réception cryptographique explicite pour chaque destinataire. La persistance serveur et le rattrapage par séquence assurent le transport différé, mais ne prouvent pas qu'un membre a effectivement importé la clé.
- La récupération automatique après perte de l'IndexedDB, remplacement de navigateur ou corruption d'une session Olm n'est pas implémentée. Le changement d'identité est bloqué par TOFU et demande une procédure de ré-enrôlement/vérification.
- Les pré-clés sont renouvelées au démarrage lorsque le stock serveur devient faible ; le réapprovisionnement en continu pendant une session longue n'est pas encore piloté par un accusé de consommation.
- Une enveloppe Olm sortante restée en attente d'un ancien `epoch` après un changement de membres nécessite une procédure de reprise contrôlée ; elle n'est pas automatiquement réinitialisée.

**Conclusion :** cette intégration corrige le blocage structurel du partage de clés, mais elle n'est pas certifiée ni démontrée en exécution. Goama reste un prototype de démonstration et ne doit pas traiter de données administratives réelles avant les tests multi-agents, la vérification hors bande des identités, la migration vers la pile WASM officielle Matrix (`@matrix-org/matrix-sdk-crypto-wasm` / Vodozemac) et une revue cryptographique indépendante.

## 7. Scénario minimal de validation

1. Connecter deux agents fictifs sur deux navigateurs distincts ; vérifier que chacun publie son identité et ses pré-clés signées.
2. Créer un groupe et vérifier que chaque agent reçoit le partage Olm destiné à sa clé Curve25519.
3. Envoyer un message dans chaque sens et vérifier le déchiffrement Megolm.
4. Inspecter PostgreSQL et le trafic API : aucune clé Megolm ni aucun texte clair ne doit apparaître.
5. Ajouter un troisième agent, vérifier la nouvelle génération et la distribution aux membres actifs.
6. Retirer le troisième agent, vérifier qu'il ne reçoit pas les nouvelles clés et ne peut pas déchiffrer les messages postérieurs à la rotation.
7. Rejouer une enveloppe de partage et vérifier son rejet.
