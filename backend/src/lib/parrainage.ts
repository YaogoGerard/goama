// =====================================================================
// Matrice des postes habilités au parrainage (REQ-AUTHZ-005, ADR-12).
//
// La capacité de parrainage vient du POSTE OFFICIEL (fonction), jamais
// de la catégorie seule. Un Conseiller Technique (catégorie P/A) ne
// parraine PAS ; un Chef de Service (A/B) parraine. Source : doc 01 §3.
//
// Comparaison insensible à la casse et aux espaces pour robustesse.
// =====================================================================

// Postes officiels habilités à créer ou valider un groupe.
// Source : tableau PRD §3 — à confirmer avec le statut général de
// la fonction publique avant tout usage réel (avertissement doc 01).
const POSTES_PARRAINS = new Set([
  "ministre",
  "directeur de cabinet",
  "secretaire general",
  "secrétaire général",
  "directeur general",
  "directeur général",
  "directeur central",
  "directeur sectoriel",
  "directeur central / sectoriel",
  "inspecteur technique",
  "chef de service",
]);

/**
 * Détermine si le poste officiel d'un agent lui confère la capacité de parrainage.
 * @param fonction  Le champ `fonction` de l'agent tel qu'enregistré en base.
 */
export function estHabiliteParrain(fonction: string): boolean {
  const normalise = fonction
    .toLowerCase()
    .trim()
    // Retire les parenthèses et leur contenu : "Directeur Central (DGTD)" → "directeur central"
    .replace(/\s*\(.*?\)/g, "")
    .trim();
  return POSTES_PARRAINS.has(normalise);
}
