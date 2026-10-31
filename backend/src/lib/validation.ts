// =====================================================================
// Validation des entrées : chaque corps de requête passe par un schéma
// Zod AVANT d'atteindre les services. Une entrée invalide = 400, sans
// jamais atteindre la base de données (défense en profondeur).
// =====================================================================
import type { z } from "zod";
import { ErreurApi } from "./erreurs.js";

export function validerCorps<T extends z.ZodType>(schema: T, corps: unknown): z.output<T> {
  const resultat = schema.safeParse(corps);
  if (!resultat.success) {
    const champs = resultat.error.issues.map((i) => i.path.join(".")).join(",");
    throw new ErreurApi(400, `corps_invalide:${champs}`);
  }
  return resultat.data;
}
