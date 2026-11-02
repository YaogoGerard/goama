import { describe, expect, it } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { canonicalJson, signatureOlmValide } from "../src/lib/olm-signatures.js";

describe("signature des clés Olm", () => {
  it("vérifie une signature Ed25519 sur le JSON canonique", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const rawPublicKey = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64");
    const signedObject = { device_id: "agent-1", algorithms: ["olm", "megolm"], keys: { b: "2", a: "1" } };
    const canonical = canonicalJson(signedObject);
    const signature = sign(null, Buffer.from(canonical, "utf8"), privateKey).toString("base64");

    expect(signatureOlmValide(rawPublicKey, canonical, signature)).toBe(true);
    expect(signatureOlmValide(rawPublicKey, `${canonical} `, signature)).toBe(false);
    expect(signatureOlmValide(rawPublicKey, canonical, "invalid")).toBe(false);
  });
});
