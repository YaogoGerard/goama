import { execSync } from "node:child_process";
import { test, expect, type Page } from "@playwright/test";
import { totp } from "./totp.js";

// ============================================================
// Smoke test RÉEL : admin navigueur → API Docker → PostgreSQL.
// Aucune brique n'est simulée. Données de démonstration uniquement.
// ============================================================

let secretTotp = "";

test.beforeAll(() => {
  // Le secret TOTP réel est généré par scripts/bootstrap-admin.ts au
  // démarrage du conteneur. On le lit à la source (la base), comme un
  // exploitant provisionnerait son administrateur.
  secretTotp = execSync(
    `docker compose -f "${process.env.COMPOSE_DIR ?? process.cwd() + "/.."}/docker-compose.yml"` +
      ` exec -T db psql -U goama -d goama -t -A -c 'SELECT "totpSecret" FROM "Agent" WHERE matricule = '"'"'ADMIN001'"'"';'`,
    { encoding: "utf8" },
  ).trim();
  if (!secretTotp) throw new Error("ADMIN001 absent de la base : lancez la stack Docker.");
});

const CREDS = {
  matricule: "ADMIN001",
  motDePasse: "AdminGoama2026!",
};

async function seConnecter(page: Page) {
  await page.goto("/");
  await page.getByLabel(/Identifiant/i).fill(CREDS.matricule);
  await page.getByLabel("Mot de passe", { exact: true }).fill(CREDS.motDePasse);
  await page.getByLabel(/Code TOTP/i).fill(totp(secretTotp));
  await page.getByRole("button", { name: /continuer/i }).click();

  // En cas de bascule de période TOTP (fenêtre de 30 s), un second essai
  // avec le code courant recalculé suffit.
  try {
    await page.getByText("Tableau de bord", { exact: false }).first().waitFor({ timeout: 5_000 });
  } catch {
    await page.getByLabel(/Code TOTP/i).fill(totp(secretTotp));
    await page.getByRole("button", { name: /continuer/i }).click();
  }
}

test.describe("Parcours réel Admin Goama (stack Docker)", () => {
  test("1. L'écran de connexion 2FA est servi par l'admin conteneurisé", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Goama Admin|Administration/i).first()).toBeVisible();
    await expect(page.getByLabel(/Code TOTP/i)).toBeVisible();
    // Favicon réel bien servi
    const res = await page.request.get("/favicon.ico");
    expect(res.status()).toBe(200);
  });

  test("2. Connexion 2FA réelle → tableau de bord peuplé depuis l'API", async ({ page }) => {
    await seConnecter(page);

    // Le dashboard affiche les statistiques servies par l'API réelle
    await expect(page.getByText(/Agents actifs/i)).toBeVisible();
    await expect(page.getByText(/Pré-inscriptions en attente/i)).toBeVisible();
    // Le panneau de confidentialité (G-06 & REQ-AUTHZ-003) est présent
    await expect(page.getByText(/Confidentialité préservée/i)).toBeVisible();
  });

  test("3. Gestion des agents : la table nourrie par le backend réagit à la recherche", async ({ page }) => {
    await seConnecter(page);

    await page.getByRole("button", { name: /Gestion des agents/i }).click();
    await expect(page.getByText(/Agent & Matricule/i)).toBeVisible();

    // La recherche filtre côté client — « xxxzzz » ne doit rien trouver
    await page.getByPlaceholder(/Rechercher/i).fill("xxxzzz");
    await expect(page.getByText(/Aucun agent ne correspond/i)).toBeVisible();
    await page.getByPlaceholder(/Rechercher/i).fill("");
  });

  test("4. Journal d'audit : la connexion 2FA réelle a bien été journalisée", async ({ page }) => {
    await seConnecter(page);

    await page.getByRole("button", { name: /Journal d'audit/i }).click();
    // La connexion de CE test apparaît dans le journal persisté par le backend
    await expect(page.getByText("Ouverture de session (2FA)").first()).toBeVisible();
  });

  test("5. Déconnexion réelle → retour sur l'écran de connexion", async ({ page }) => {
    await seConnecter(page);

    await page.getByRole("button", { name: /Déconnexion/i }).click();
    await expect(page.getByLabel(/Code TOTP/i)).toBeVisible({ timeout: 10_000 });

    // Le jeton est réellement supprimé du stockage local
    const jeton = await page.evaluate(() => localStorage.getItem("goama_admin_token"));
    expect(jeton).toBeNull();
  });
});
