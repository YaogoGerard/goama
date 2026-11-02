# Comptes de démonstration — Goama

Provisionnés automatiquement au premier `docker compose up` par l'amorçage de l'API (`backend/src/bootstrap-accounts.ts`) puis affichés dans les journaux (`docker compose logs api`). Comptes **strictement fictifs**, réservés à l'installation locale de démonstration. Idempotent : un compte existant n'est jamais modifié, les identifiants restent stables aux redémarrages.

| Matricule | Rôle | Poste (habilitation parrainage) | Mot de passe |
|---|---|---|---|
| `ADMIN001` | Administrateur | Administrateur Système | `GoamaAdmin2026!` |
| `AG001` | Agent | Chef de Service — **habilité** | `GoamaDemo2026!` |
| `AG002` | Agent | Directeur Central — **habilité** | `GoamaDemo2026!` |
| `AG003` | Agent | Chargé d'Études — non habilité | `GoamaDemo2026!` |

Secrets TOTP (à enregistrer dans une application d'authentification) :

| Matricule | Secret TOTP (Base32) |
|---|---|
| `ADMIN001` | `JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP` |
| `AG001` | `KRSXG5DSM5UQ4LLNKRSXG5DSM5UQ4LLN` |
| `AG002` | `MFRGGZDFMZTWQ2LKMFRGGZDFMZTWQ2LK` |
| `AG003` | `NBSWY3DPFQQFO33SNBSWY3DPFQQFO33S` |

## Provisionnement d'une installation réelle

Pour provisionner un administrateur avec des identifiants choisis, fournir les variables `ADMIN_MATRICULE`, `ADMIN_PASSWORD` (et `ADMIN_TOTP_SECRET` pour éviter l'affichage du TOTP généré) avant le démarrage. Les agents de démonstration peuvent être retirés en pré-inscrivant les agents réels via la console d'administration puis en réinitialisant le volume de données (`docker compose down -v`).

## Réinitialisation

```bash
docker compose down -v   # efface données, fichiers et secrets générés
docker compose up        # nouvelle stack, amorçage complet
```
