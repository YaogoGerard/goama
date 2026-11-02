import { describe, expect, it } from "vitest";
import { chiffrerSecretTotp, dechiffrerSecretTotp, estSecretTotpChiffre } from "../src/lib/totp.js";

describe("stockage du secret TOTP", () => {
  it("chiffre au repos et retrouve le secret initial", () => {
    const secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
    const stocke = chiffrerSecretTotp(secret);
    expect(stocke).not.toContain(secret);
    expect(estSecretTotpChiffre(stocke)).toBe(true);
    expect(dechiffrerSecretTotp(stocke)).toBe(secret);
  });

  it("utilise un IV différent à chaque chiffrement", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    expect(chiffrerSecretTotp(secret)).not.toBe(chiffrerSecretTotp(secret));
  });

  it("refuse un ciphertext altéré", () => {
    const stocke = chiffrerSecretTotp("JBSWY3DPEHPK3PXP");
    const [iv, tag, ciphertext] = stocke.slice("enc:v1:".length).split(":");
    const tagAlteree = `${tag[0] === "A" ? "B" : "A"}${tag.slice(1)}`;
    const alt = `enc:v1:${iv}:${tagAlteree}:${ciphertext}`;
    expect(() => dechiffrerSecretTotp(alt)).toThrow();
  });

  it("reconnaît les valeurs historiques en clair pour migration", () => {
    expect(estSecretTotpChiffre("JBSWY3DPEHPK3PXP")).toBe(false);
    expect(dechiffrerSecretTotp("JBSWY3DPEHPK3PXP")).toBe("JBSWY3DPEHPK3PXP");
  });
});
