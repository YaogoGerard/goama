// Erreur métier : transportée jusqu'au gestionnaire d'erreurs de app.ts
// qui la convertit en réponse JSON { erreur: "code_fr" } avec le bon statut.
export class ErreurApi extends Error {
  constructor(
    public statut: number,
    public code: string,
  ) {
    super(code);
    this.name = "ErreurApi";
  }
}
