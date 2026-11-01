export const CATEGORIES = ["P", "A", "B", "C", "D", "E", "HORS_CATEGORIE"] as const;

export const POSTES_OFFICIELS = [
  "Chef de Service",
  "Directeur Central",
  "Directeur Général",
  "Secrétaire Général",
  "Directeur de Cabinet",
  "Inspecteur Technique",
  "Ministre",
  "Conseiller Technique",
  "Chargé de Mission",
  "Chargé d'Études",
  "Secrétaire Particulier",
  "Administrateur Système",
  "Rédacteur",
] as const;

export const POSTES_REFERENCE = POSTES_OFFICIELS.map((value) => ({
  value,
  label: value,
  parrainage: ["Chef de Service", "Directeur Central", "Directeur Général", "Secrétaire Général", "Directeur de Cabinet", "Inspecteur Technique", "Ministre"].includes(value),
}));

// Référentiel administratif à maintenir avec les textes officiels en vigueur.
export const MINISTERES = [
  "Ministère de la Défense et des Anciens Combattants",
  "Ministère de l'Administration Territoriale et de la Mobilité",
  "Ministère de l'Agriculture, des Ressources animales et halieutiques",
  "Ministère de l'Économie et des Finances",
  "Ministère de la Sécurité",
  "Ministère des Affaires étrangères, de la Coopération régionale et des Burkinabè de l'extérieur",
  "Ministère de la Fonction publique, du Travail et de la Protection sociale",
  "Ministère de la Communication, de la Culture, des Arts et du Tourisme",
  "Ministère de la Justice et des Droits humains",
  "Ministère de la Transition digitale, des Postes et des Communications électroniques",
  "Ministère de l'Industrie, du Commerce et de l'Artisanat",
  "Ministère des Infrastructures et du Désenclavement",
  "Ministère de l'Énergie, des Mines et des Carrières",
  "Ministère de l'Environnement, de l'Eau et de l'Assainissement",
  "Ministère de l'Enseignement de base, de l'Alphabétisation et de la Promotion des Langues nationales",
  "Ministère de l'Enseignement secondaire et de la Formation professionnelle et technique",
  "Ministère de l'Enseignement supérieur, de la Recherche et de l'Innovation",
  "Ministère de l'Urbanisme et de l'Habitat",
  "Ministère des Sports, de la Jeunesse et de l'Emploi",
  "Secrétariat général du Gouvernement",
] as const;
