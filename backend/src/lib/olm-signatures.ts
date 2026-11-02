import { createPublicKey, verify as verifyEd25519 } from "node:crypto";

/** Matrix-style canonical JSON for the signed Olm key objects used by Goama. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
}

/** Verify a libolm Ed25519 signature against its raw 32-byte public key. */
export function signatureOlmValide(publicKey: string, message: string, signature: string): boolean {
  try {
    const rawKey = Buffer.from(publicKey, "base64");
    const rawSignature = Buffer.from(signature, "base64");
    if (rawKey.length !== 32 || rawSignature.length !== 64) return false;
    const derKey = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), rawKey]);
    const key = createPublicKey({ key: derKey, format: "der", type: "spki" });
    return verifyEd25519(null, Buffer.from(message, "utf8"), key, rawSignature);
  } catch {
    return false;
  }
}
