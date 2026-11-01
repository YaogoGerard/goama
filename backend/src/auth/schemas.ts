// Schémas Zod du module auth : la forme EXACTE de chaque requête.
// Tout ce qui n'est pas déclaré ici est rejeté (400) avant le service.
import { z } from "zod";

// Pré-inscription par l'Administrateur (ADR-15)
export const SchemaPreInscription = z.object({
  matricule: z.string().min(3).max(40),
  nom: z.string().min(1).max(80),
  prenom: z.string().min(1).max(80),
  // Le référentiel est fourni par /admin/reference-data, mais le serveur
  // conserve une validation de forme pour permettre les évolutions
  // institutionnelles sans bloquer les anciennes données.
  ministere: z.string().min(1).max(120),
  fonction: z.string().min(1).max(120),
  categorie: z.string().min(1).max(16),
});

// Activation par l'agent : code reçu + choix du secret personnel
export const SchemaActivation = z.object({
  matricule: z.string().min(3).max(40),
  code: z.string().min(6).max(16),
  secret: z.string().min(8).max(128), // le futur secret personnel (jamais stocké en clair)
});

// Connexion : secret personnel (facteur 1) + code TOTP (facteur 2)
export const SchemaConnexion = z.object({
  matricule: z.string().min(3).max(40),
  secret: z.string().min(8).max(128),
  codeTotp: z.string().regex(/^\d{6}$/, "code_totp_invalide"),
});
