import { z } from "zod";

// Types de payload transportés par le serveur. Le serveur ne déchiffre jamais
// ces objets : il valide uniquement leur enveloppe et relaie les octets reçus.
export const KINDS = ["megolm_app", "megolm_key_share", "recu_lu", "nom_groupe", "media_cle"] as const;

const SchemaMegolmEnvelope = z.object({
  algorithm: z.literal("m.megolm.v1.aes-sha2"),
  session_id: z.string().min(1).max(255),
  ciphertext: z.string().min(1).max(64 * 1024).regex(/^[A-Za-z0-9+/_=-]+$/),
}).strict();

// Format de transport Olm Matrix : ciphertext indexé par la clé publique du
// destinataire. Cette validation ne prouve PAS l'authenticité cryptographique ;
// elle empêche seulement de confondre une clé brute avec un paquet Olm structuré.
const SchemaOlmEnvelope = z.object({
  algorithm: z.literal("m.olm.v1.curve25519-aes-sha2"),
  sender_key: z.string().min(1).max(255),
  ciphertext: z.record(z.string(), z.object({
    type: z.number().int().min(0).max(1),
    body: z.string().min(1).max(64 * 1024),
  }).strict()).refine((items) => Object.keys(items).length > 0),
}).strict();

export const SchemaMessage = z.object({
  epoch: z.number().int().min(0),
  kind: z.enum(KINDS),
  // Le client sérialise l'enveloppe JSON Megolm/Olm. Limite conservatrice
  // compatible avec la limite applicative de 64 Kio de ciphertext.
  content: z.string().min(2).max(96 * 1024),
}).superRefine((message, ctx) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(message.content);
  } catch {
    ctx.addIssue({ code: "custom", path: ["content"], message: "enveloppe_chiffree_json_invalide" });
    return;
  }

  const schema = message.kind === "megolm_key_share" ? SchemaOlmEnvelope : SchemaMegolmEnvelope;
  const result = schema.safeParse(parsed);
  if (!result.success) {
    ctx.addIssue({ code: "custom", path: ["content"], message: "enveloppe_chiffree_invalide" });
  }
});

export const SchemaAjoutMembre = z.object({
  agentId: z.string().uuid(),
});

export const SchemaDemandeGroupe = z.object({
  parrainId: z.string().uuid(),
  nom: z.string().trim().min(1).max(80).optional(),
  membres: z.array(z.string().uuid()).max(20).optional(),
});
