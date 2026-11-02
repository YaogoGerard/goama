import { createRequire } from "node:module";
import fs from "node:fs/promises";
import { chromium, request } from "@playwright/test";

const backendRequire = createRequire(new URL("../../../backend/package.json", import.meta.url));
const { TOTP } = backendRequire("otpauth");

const webBase = process.env.GOAMA_WEB_URL ?? "http://127.0.0.1:3000";
const apiBase = process.env.GOAMA_API_URL ?? "http://127.0.0.1:8080";
const admin = {
  matricule: process.env.GOAMA_ADMIN_MATRICULE ?? "LOCAL-ADMIN-001",
  password: process.env.GOAMA_ADMIN_PASSWORD ?? "",
  totp: process.env.GOAMA_ADMIN_TOTP_SECRET ?? "",
};
const agents = {
  a: { matricule: "AG001", password: process.env.GOAMA_AG001_PASSWORD ?? "", totp: process.env.GOAMA_AG001_TOTP_SECRET ?? "" },
  b: { matricule: "AG002", password: process.env.GOAMA_AG002_PASSWORD ?? "", totp: process.env.GOAMA_AG002_TOTP_SECRET ?? "" },
  c: { matricule: "AG003", password: "Agent3LivePassword!" },
};
const requireEnv = (value, name) => {
  if (!value) throw new Error(`Variable absente : ${name}`);
  return value;
};
const totp = (secret) => new TOTP({ secret }).generate();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function apiJson(context, method, path, options = {}) {
  const response = await context[method](path, options);
  if (!response.ok()) throw new Error(`${method.toUpperCase()} ${path} → ${response.status()} ${await response.text()}`);
  return response.json();
}

async function makePage(label, browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if ((message.type() === "error" || message.type() === "warning") && !message.text().includes("/api/auth/refresh")) errors.push(`${label}:console:${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`${label}:page:${error.message}`));
  page.on("requestfailed", (request) => {
    if (!request.url().includes("/api/auth/refresh") && !request.url().includes("favicon")) {
      errors.push(`${label}:network:${request.url()} ${request.failure()?.errorText ?? "failed"}`);
    }
  });
  page.on("response", async (response) => {
    if (response.status() >= 400 && !(response.status() === 401 && response.url().includes("/auth/refresh"))) {
      const body = await response.text().catch(() => "");
      errors.push(`${label}:http:${response.status()} ${response.request().method()} ${new URL(response.url()).pathname} ${body.slice(0, 240)}`);
    }
  });
  return { context, page, errors };
}

async function login(page, agent, expectConversation = true) {
  await page.goto(`${webBase}/`, { waitUntil: "domcontentloaded" });
  await page.locator('input[placeholder="Votre matricule"]').fill(agent.matricule);
  await page.locator("#web-password").fill(agent.password);
  await page.locator('input[placeholder="6 chiffres"]').fill(totp(agent.totp));
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/chat", { timeout: 15000 });
  if (expectConversation) await page.locator(".conversation-card").first().waitFor({ timeout: 15000 });
}

async function waitGroupReady(page) {
  await page.waitForFunction(() => {
    const button = document.querySelector('button[aria-label="Joindre un fichier chiffré"]');
    return Boolean(button && !button.disabled);
  }, { timeout: 30000 });
}

async function selectGroupById(page, groupId) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByLabel("Mes groupes").click();
  const card = page.locator(`button.group-card[data-group-id="${groupId}"]`);
  await card.waitFor({ timeout: 20000 });
  await page.locator('main.chat-area[data-selected-chat-id]:not([data-selected-chat-id=""])').waitFor({ timeout: 20000 });
  console.log(`SELECT_GROUP ${groupId} cards=${await page.locator("button.group-card").count()}`);
  await card.click();
  try {
    await page.locator(`main.chat-area[data-selected-chat-id="${groupId}"]`).waitFor({ timeout: 20000 });
  } catch (error) {
    const selected = await page.locator("main.chat-area").getAttribute("data-selected-chat-id").catch(() => null);
    throw new Error(`groupe_non_selectionne attendu=${groupId} obtenu=${selected ?? "absent"}: ${error instanceof Error ? error.message : String(error)}`);
  }
  await waitGroupReady(page);
}

async function sendMessage(page, recipient, content) {
  await page.locator('textarea[placeholder="Message chiffré"]').fill(content);
  await page.getByRole("button", { name: "Envoyer le message" }).click();
  await recipient.getByText(content, { exact: true }).last().waitFor({ timeout: 20000 });
}

async function downloadAndCheck(page, filename, expected) {
  const bubble = page.locator(".message-bubble").filter({ hasText: filename }).last();
  const downloadPromise = page.waitForEvent("download", { timeout: 15000 });
  await bubble.getByRole("button", { name: "Télécharger" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  const content = path ? await fs.readFile(path) : Buffer.alloc(0);
  if (download.suggestedFilename() !== filename || content.toString() !== expected) {
    throw new Error(`Téléchargement invalide : ${download.suggestedFilename()} (${content.length} octets)`);
  }
}

const browser = await chromium.launch({
  headless: false,
  slowMo: 70,
  executablePath: process.env.GOAMA_CHROME_PATH ?? "/usr/bin/google-chrome-stable",
  args: ["--no-sandbox"],
});
const pages = {};
const keepOpenMs = Number(process.env.KEEP_OPEN_MS ?? 180000);

try {
  requireEnv(admin.password, "GOAMA_ADMIN_PASSWORD");
  requireEnv(admin.totp, "GOAMA_ADMIN_TOTP_SECRET");
  requireEnv(agents.a.password, "GOAMA_AG001_PASSWORD");
  requireEnv(agents.a.totp, "GOAMA_AG001_TOTP_SECRET");
  requireEnv(agents.b.password, "GOAMA_AG002_PASSWORD");
  requireEnv(agents.b.totp, "GOAMA_AG002_TOTP_SECRET");

  const api = await request.newContext({
    baseURL: apiBase,
    extraHTTPHeaders: { origin: webBase },
  });
  const adminLogin = await apiJson(api, "post", "/auth/login", {
    data: { matricule: admin.matricule, secret: admin.password, codeTotp: totp(admin.totp) },
  });
  const authorization = { authorization: `Bearer ${adminLogin.jeton}` };
  const accountPage = await apiJson(api, "get", "/admin/accounts?limit=100", { headers: authorization });
  const accountByMatricule = new Map(accountPage.items.map((account) => [account.matricule, account]));
  const agent3 = accountByMatricule.get("AG003");
  if (!agent3) throw new Error("AG003 absent de l’annuaire administrateur");

  const reset = await apiJson(api, "post", `/admin/accounts/${agent3.id}/mfa/reset-request`, { headers: authorization });
  for (const matricule of ["AG001", "AG002", "AG003"]) {
    const account = accountByMatricule.get(matricule);
    if (account) await apiJson(api, "delete", `/admin/agents/${account.id}/olm-keys`, { headers: authorization });
  }
  await api.dispose();
  console.log("PASS préparation administrateur : AG003 réinitialisé et identités locales renouvelées");

  pages.a = await makePage("AG001", browser);
  pages.b = await makePage("AG002", browser);
  pages.c = await makePage("AG003", browser);

  // Activer le troisième compte avant de charger l’annuaire d’AG001 :
  // l’assistant de création doit pouvoir proposer les trois participants.
  await pages.c.page.goto(`${webBase}/activation#matricule=AG003&code=${encodeURIComponent(reset.codeActivation)}`, { waitUntil: "domcontentloaded" });
  const inputs = pages.c.page.locator("input");
  await inputs.nth(0).fill("AG003");
  await inputs.nth(1).fill(agents.c.password);
  await inputs.nth(2).fill(agents.c.password);
  await pages.c.page.getByRole("button", { name: "Continuer" }).click();
  await pages.c.page.locator("code").waitFor({ timeout: 15000 });
  agents.c.totp = await pages.c.page.locator("code").innerText();
  await pages.c.page.goto(`${webBase}/`, { waitUntil: "domcontentloaded" });

  await login(pages.a.page, agents.a);
  console.log("PASS AG001 connecté — Chef de Service");
  await sleep(1800);
  await login(pages.b.page, agents.b);
  console.log("PASS AG002 connecté — Directeur Central");
  await sleep(1800);
  await login(pages.c.page, agents.c, false);
  console.log("PASS AG003 activé et connecté — Chargé d’Études");

  pages.a.errors.length = 0;
  pages.b.errors.length = 0;
  pages.c.errors.length = 0;

  const pauseAfterLogins = Number(process.env.PAUSE_AFTER_LOGINS_MS ?? 0);
  if (pauseAfterLogins > 0) {
    console.log(`PAUSE_AFTER_LOGINS ${pauseAfterLogins}ms — réinitialiser les compteurs de test maintenant`);
    await sleep(pauseAfterLogins);
  }

  await pages.a.page.getByLabel("Mes groupes").click();
  await pages.a.page.getByRole("button", { name: "Créer un groupe" }).click();
  await pages.a.page.getByLabel("Nom du groupe").fill("Groupe trois niveaux");
  await pages.a.page.locator("label.group-assistant-person").filter({ hasText: "Issa OUÉDRAOGO" }).locator("input").check();
  await pages.a.page.locator("label.group-assistant-person").filter({ hasText: "Fatimata ZONGO" }).locator("input").check();
  const createdGroupResponse = pages.a.page.waitForResponse((response) => {
    return response.request().method() === "POST" && new URL(response.url()).pathname === "/api/groupes" && response.status() === 201;
  });
  await pages.a.page.getByRole("button", { name: "Créer le groupe" }).click();
  const createdGroup = await (await createdGroupResponse).json();
  const createdGroupId = createdGroup.id;
  await pages.a.page.locator(`main.chat-area[data-selected-chat-id="${createdGroupId}"]`).waitFor({ timeout: 20000 });
  await waitGroupReady(pages.a.page);
  console.log("PASS création live du groupe à trois niveaux");

  await selectGroupById(pages.b.page, createdGroupId);
  console.log("PASS AG002 a rejoint le groupe à trois membres");
  await selectGroupById(pages.c.page, createdGroupId);
  console.log("PASS AG003 a rejoint le groupe à trois membres");
  pages.a.errors.length = 0;
  pages.b.errors.length = 0;
  pages.c.errors.length = 0;

  await sendMessage(pages.a.page, pages.b.page, "Message AG001 vers AG002");
  console.log("PASS conversation 1/3 : AG001 → AG002");
  await sendMessage(pages.b.page, pages.c.page, "Message AG002 vers AG003");
  console.log("PASS conversation 2/3 : AG002 → AG003");
  await sendMessage(pages.c.page, pages.a.page, "Message AG003 vers AG001");
  console.log("PASS conversation 3/3 : AG003 → AG001");

  const fileOne = "Fichier AG001 vers le groupe\n";
  await pages.a.page.locator('input[type="file"]').setInputFiles({ name: "ag001-groupe.txt", mimeType: "text/plain", buffer: Buffer.from(fileOne) });
  await pages.b.page.locator(".content-attachment").filter({ hasText: "ag001-groupe.txt" }).waitFor({ timeout: 20000 });
  await pages.c.page.locator(".content-attachment").filter({ hasText: "ag001-groupe.txt" }).waitFor({ timeout: 20000 });
  await downloadAndCheck(pages.b.page, "ag001-groupe.txt", fileOne);
  console.log("PASS fichier 1/2 : AG001 → groupe → AG002, téléchargement vérifié");

  const fileThree = "Fichier AG003 vers le groupe\n";
  await pages.c.page.locator('input[type="file"]').setInputFiles({ name: "ag003-groupe.txt", mimeType: "text/plain", buffer: Buffer.from(fileThree) });
  await pages.a.page.locator(".content-attachment").filter({ hasText: "ag003-groupe.txt" }).waitFor({ timeout: 20000 });
  await pages.b.page.locator(".content-attachment").filter({ hasText: "ag003-groupe.txt" }).waitFor({ timeout: 20000 });
  await downloadAndCheck(pages.a.page, "ag003-groupe.txt", fileThree);
  console.log("PASS fichier 2/2 : AG003 → groupe → AG001, téléchargement vérifié");

  const errors = [...pages.a.errors, ...pages.b.errors, ...pages.c.errors];
  console.log(`BROWSER_ERRORS ${errors.length}`);
  for (const error of errors.slice(0, 30)) console.log(error);
  console.log(`LIVE_THREE_AGENT_OK fenêtres conservées ${Math.round(keepOpenMs / 1000)}s`);
} catch (error) {
  console.error("LIVE_THREE_AGENT_FAILED", error);
  for (const [label, entry] of Object.entries(pages)) {
    const state = await entry.page.locator("body").innerText().catch(() => "");
    console.error(`${label} ERRORS`, entry.errors.slice(-20));
    console.error(`${label} STATE`, state.replace(/\s+/g, " ").slice(-700));
  }
  process.exitCode = 1;
}

await sleep(keepOpenMs);
for (const entry of Object.values(pages)) await entry.context.close();
await browser.close();
