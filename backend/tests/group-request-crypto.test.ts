import { describe, expect, it } from "vitest";
import { chiffrerDonneeDemande, dechiffrerDonneeDemande } from "../src/lib/group-request-crypto.js";

describe("confidentialité des demandes de groupe", () => {
  it("chiffre et déchiffre les champs de demande", () => {
    const valeur = "Nom de groupe confidentiel — agent-123";
    const ciphertext = chiffrerDonneeDemande(valeur);
    expect(ciphertext).toMatch(/^enc:greq:v1:/);
    expect(ciphertext).not.toContain(valeur);
    expect(dechiffrerDonneeDemande(ciphertext)).toBe(valeur);
  });

  it("utilise un IV unique et authentifie le ciphertext", () => {
    const first = chiffrerDonneeDemande("donnée personnelle");
    const second = chiffrerDonneeDemande("donnée personnelle");
    expect(first).not.toBe(second);

    const [iv, tag, ciphertext] = first.slice("enc:greq:v1:".length).split(":");
    const alteredTag = `${tag![0] === "A" ? "B" : "A"}${tag!.slice(1)}`;
    expect(() => dechiffrerDonneeDemande(`enc:greq:v1:${iv}:${alteredTag}:${ciphertext}`)).toThrow();
  });

  it("lit les anciennes valeurs en clair pour permettre le backfill", () => {
    expect(dechiffrerDonneeDemande("ancien nom de groupe")).toBe("ancien nom de groupe");
  });
});
