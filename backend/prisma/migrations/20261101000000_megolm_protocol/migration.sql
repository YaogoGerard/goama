-- ADR-19 : le nouveau défaut applicatif est Megolm. Les lignes historiques
-- mls_app/mls_commit sont conservées intactes : leur ciphertext n'est pas
-- compatible avec Megolm et ne doit jamais être relabellé/déchiffré comme tel.
ALTER TABLE "Message" ALTER COLUMN "kind" SET DEFAULT 'megolm_app';
