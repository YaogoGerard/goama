import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { config } from "../config.js";

const PREFIX = "enc:greq:v1:";
const AAD = Buffer.from("goama:group-request:v1", "utf8");

function key(): Buffer {
  if (config.GROUP_REQUEST_ENCRYPTION_KEY) return Buffer.from(config.GROUP_REQUEST_ENCRYPTION_KEY, "hex");
  // Développement/tests seulement ; la clé dédiée est obligatoire en production.
  return createHash("sha256").update(`goama-dev-group-request:${config.JWT_SECRET}`).digest();
}

export function chiffrerDonneeDemande(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(AAD);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${PREFIX}${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function dechiffrerDonneeDemande(value: string): string {
  // Compatibilité transitoire avec les demandes enregistrées avant chiffrement.
  if (!value.startsWith(PREFIX)) return value;
  const parts = value.slice(PREFIX.length).split(":");
  if (parts.length !== 3) throw new Error("group_request_ciphertext_invalid");
  const iv = Buffer.from(parts[0]!, "base64url");
  const tag = Buffer.from(parts[1]!, "base64url");
  const ciphertext = Buffer.from(parts[2]!, "base64url");
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) throw new Error("group_request_ciphertext_invalid");
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAAD(AAD);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
