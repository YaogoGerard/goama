# 00 — Principes d'ingénierie avant le code

## 1. Principe directeur

Nous ne commençons pas par choisir un framework ou par créer des classes. Nous commençons par établir une compréhension commune du problème, des utilisateurs, des risques et des résultats attendus.

La chaîne de conception est :

**Intention → Exigence → Garantie → Responsabilité → Modèle → Architecture → Implémentation → Vérification**

Chaque étape doit pouvoir être reliée à la précédente.

## 2. Questions à poser avant toute décision technique

- Quel problème réel voulons-nous résoudre ?
- Qui est autorisé à utiliser le système ?
- Quelles informations doivent rester confidentielles, y compris vis-à-vis de l'exploitant du serveur ?
- Que doit-il se passer lorsqu'un agent quitte son poste ou perd son autorisation ?
- Que se passe-t-il lorsque le réseau est indisponible ?
- Quelles données peuvent être conservées, et pendant combien de temps ?
- Comment démontrer objectivement qu'une exigence est satisfaite ?

## 3. Décisions durables et décisions réversibles

Une décision est durable lorsqu'une erreur aurait un impact important sur la sécurité, les données ou les utilisateurs. Les garanties de chiffrement, le modèle d'identité, la révocation et la politique de conservation sont des décisions durables : elles doivent être discutées et testées tôt.

Les choix facilement remplaçables peuvent être différés, tant qu'ils ne compromettent pas les garanties.

## 4. Règles de travail de l'équipe

1. Écrire une exigence avant d'implémenter le comportement correspondant.
2. Donner un identifiant stable à chaque exigence.
3. Associer chaque exigence importante à au moins un test.
4. Documenter les hypothèses et les décisions non tranchées.
5. Ne jamais inventer de mécanisme cryptographique.
6. Ne jamais présenter une propriété comme « sécurisée » sans préciser contre quelle menace et comment elle est vérifiée.
7. Garder les journaux techniques exempts de contenu de message, de clés et de secrets.
8. Préférer un système simple, cohérent et testable à une architecture inutilement complexe.

## 5. Définition d'une exigence prête à implémenter

Une exigence est prête lorsque :
- son acteur et son déclencheur sont identifiés ;
- le résultat attendu est observable ;
- les cas d'échec sont définis ;
- les règles d'autorisation sont explicites ;
- un test d'acceptation peut être écrit ;
- ses dépendances et questions ouvertes sont connues.

## 6. Définition de « terminé »

Une fonctionnalité n'est pas terminée simplement parce qu'elle fonctionne dans le cas nominal. Elle est terminée lorsque les cas autorisés, refusés, les erreurs, les limites, les journaux, les tests et la documentation sont cohérents.

## 7. Règles propres à ce projet (3 personnes, moins d'une semaine)

1. **Le socle de sécurité d'abord** : chiffrement de bout en bout, serveur aveugle, enrôlement avec second facteur, révocation, intrus rejeté.
2. **Trois innovations, démontrées** : accusés de lecture à valeur probante, présence et annuaire, classification des messages. Mieux vaut peu de fonctions complètes et expliquées qu'un catalogue à moitié fait.
3. **Risque majeur assumé** : le chiffrement repose sur Megolm compilé en WebAssembly, sans plan B (décision de l'équipe). Ce risque est consigné (`06_architecture_decisions.md`, R-01) et le prototype se fait en premier.
4. **Comprendre chaque ligne** : chaque membre doit pouvoir expliquer le code de chiffrement et d'authentification ; l'incapacité à l'expliquer est éliminatoire.
5. **Hypothèses écrites** : toute décision non tranchée devient une hypothèse datée (`02_requirements_srs.md`, §5).
6. **Ne jamais annoncer ce qui n'est pas testé** : ni dans les notes, ni dans le README, ni dans la vidéo.
