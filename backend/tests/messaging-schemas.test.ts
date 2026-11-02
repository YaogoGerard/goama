import { describe, expect, it } from "vitest";
import { SchemaMessage } from "../src/messaging/schemas.js";

describe("contrat des enveloppes chiffrées", () => {
  it("accepte une enveloppe Megolm structurée sans la déchiffrer", () => {
    const result = SchemaMessage.safeParse({
      epoch: 0,
      kind: "megolm_app",
      content: JSON.stringify({
        algorithm: "m.megolm.v1.aes-sha2",
        session_id: "session-fixture",
        ciphertext: "AwgAYmxvYi1jaGlmZnJl",
      }),
    });
    expect(result.success).toBe(true);
  });

  it("rejette le texte brut ou une simple chaîne base64 comme message Megolm", () => {
    for (const content of ["message confidentiel", "bWVzc2FnZQ==", "{\"ciphertext\":\"x\"}"]) {
      expect(SchemaMessage.safeParse({ epoch: 0, kind: "megolm_app", content }).success).toBe(false);
    }
  });

  it("accepte uniquement une enveloppe Olm structurée pour le partage de clé", () => {
    const valid = JSON.stringify({
      algorithm: "m.olm.v1.curve25519-aes-sha2",
      sender_key: "curve25519-sender",
      ciphertext: { "curve25519-recipient": { type: 1, body: "AwgAb2xtLWJsb2I" } },
    });
    expect(SchemaMessage.safeParse({ epoch: 0, kind: "megolm_key_share", content: valid }).success).toBe(true);
    expect(SchemaMessage.safeParse({ epoch: 0, kind: "megolm_key_share", content: "Zm9v" }).success).toBe(false);
  });
});
