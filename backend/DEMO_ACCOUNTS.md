# Comptes de démonstration (100 % FICTIFS)

Créés par `npm run db:seed`. Tous les noms, matricules et ministères sont inventés.

## Connexion (2 facteurs)

| Matricule | Identité | Rôle | Mot de passe | Secret TOTP (base32) |
|---|---|---|---|---|
| `ADMIN001` | Amélie KABORÉ | ADMIN | `AdminGoama2026!` | `JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP` |
| `AG001` | Awa SAWADOGO | AGENT | `GoamaDemo2026!` | `KRSXG5DSM5UQ4LLNKRSXG5DSM5UQ4LLN` |
| `AG002` | Issa OUÉDRAOGO | AGENT | `GoamaDemo2026!` | `MFRGGZDFMZTWQ2LKMFRGGZDFMZTWQ2LK` |
| `AG003` | Fatimata KABORÉ | AGENT | `GoamaDemo2026!` | `NBSWY3DPFQQFO33SNBSWY3DPFQQFO33S` |
| `AG004` | Moussa TRAORÉ | AGENT | `GoamaDemo2026!` | `ONSWG4TFOQQGS4ZAONSWG4TFOQQGS4ZA` |
| `AG005` | Mariam ZONGO | AGENT | `GoamaDemo2026!` | `PBJXG4TBNVZGS5DPPBJXG4TBNVZGS5DP` |
| `AG006` | Karim COMPAORÉ | AGENT | `GoamaDemo2026!` | `QVSWY3DPEBZWQ3DFQVSWY3DPEBZWQ3DF` |

## Utilisation du second facteur

1. Ouvrir une application d'authentification (Aegis, Google Authenticator, FreeOTP…)
2. Ajouter un compte via l'URI `otpauth://` correspondante (voir colonnes ci-dessous) :

- `ADMIN001` : `otpauth://totp/Goama:ADMIN001?issuer=Goama&secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&algorithm=SHA1&digits=6&period=30`
- `AG001` : `otpauth://totp/Goama:AG001?issuer=Goama&secret=KRSXG5DSM5UQ4LLNKRSXG5DSM5UQ4LLN&algorithm=SHA1&digits=6&period=30`
- `AG002` : `otpauth://totp/Goama:AG002?issuer=Goama&secret=MFRGGZDFMZTWQ2LKMFRGGZDFMZTWQ2LK&algorithm=SHA1&digits=6&period=30`
- `AG003` : `otpauth://totp/Goama:AG003?issuer=Goama&secret=NBSWY3DPFQQFO33SNBSWY3DPFQQFO33S&algorithm=SHA1&digits=6&period=30`
- `AG004` : `otpauth://totp/Goama:AG004?issuer=Goama&secret=ONSWG4TFOQQGS4ZAONSWG4TFOQQGS4ZA&algorithm=SHA1&digits=6&period=30`
- `AG005` : `otpauth://totp/Goama:AG005?issuer=Goama&secret=PBJXG4TBNVZGS5DPPBJXG4TBNVZGS5DP&algorithm=SHA1&digits=6&period=30`
- `AG006` : `otpauth://totp/Goama:AG006?issuer=Goama&secret=QVSWY3DPEBZWQ3DFQVSWY3DPEBZWQ3DF&algorithm=SHA1&digits=6&period=30`

3. Saisir le code à 6 chiffres courant au moment de la connexion.

## Groupe de démonstration

Un groupe existe déjà : `ADMIN001` (parrain) + `AG001` + `AG002`. Son nom n'est pas stocké
côté serveur : il voyage chiffré dans un message de type `nom_groupe`.
