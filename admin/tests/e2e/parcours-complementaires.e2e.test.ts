import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import App from "../../src/App.vue";
import LoginView from "../../src/components/LoginView.vue";
import AgentTable from "../../src/components/AgentTable.vue";
import AuditLogs from "../../src/components/AuditLogs.vue";
import PreInscrireModal from "../../src/components/PreInscrireModal.vue";
import { api } from "../../src/api/client.js";
import type { Agent, AuditLog, Retention } from "../../src/types.js";

// Jeu d'agents couvrant les quatre statuts pour les parcours de liste.
const AGENTS: Agent[] = [
  {
    id: "ag-1",
    matricule: "AG001",
    nom: "SAWADOGO",
    prenom: "Awa",
    ministere: "Ministère de la Transition Digitale",
    fonction: "Directeur Central",
    categorie: "A",
    role: "AGENT",
    statut: "ACTIF",
    createdAt: new Date().toISOString(),
    revokedAt: null,
  },
  {
    id: "ag-3",
    matricule: "AG003",
    nom: "KABORÉ",
    prenom: "Fatimata",
    ministere: "Ministère de la Santé",
    fonction: "Chef de Service",
    categorie: "B",
    role: "AGENT",
    statut: "SUSPENDU",
    createdAt: new Date().toISOString(),
    revokedAt: null,
  },
  {
    id: "ag-5",
    matricule: "AG005",
    nom: "ZONGO",
    prenom: "Mariam",
    ministere: "Ministère de l'Économie et des Finances",
    fonction: "Rédacteur",
    categorie: "C",
    role: "AGENT",
    statut: "REVOQUE",
    createdAt: new Date().toISOString(),
    revokedAt: new Date().toISOString(),
  },
];

const LOGS: AuditLog[] = [
  {
    id: "l-1",
    action: "revocation",
    detail: "AG005 révoqué immédiatement",
    actorId: "admin-1",
    createdAt: new Date().toISOString(),
  },
  {
    id: "l-2",
    action: "creation_groupe",
    detail: "groupe créé par AG001 (parrain)",
    actorId: "ag-1",
    createdAt: new Date().toISOString(),
  },
];

const RETENTIONS: Retention[] = [
  {
    id: "r-1",
    groupeId: "9f3a2b4c-6d8e-4f0a-b1c2-3d4e5f6a7b8c",
    agentId: "ag-5-uuid-café",
    epoch: 1,
    statut: "EN_ATTENTE",
    erreur: null,
    membresAttendus: 2,
    membresAccuses: 0,
    recus: 0,
    attendus: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function stubDashboard(agents: Agent[] = [], logs: AuditLog[] = [], ret: Retention[] = []) {
  vi.spyOn(api, "getStats").mockResolvedValue({ total: agents.length, actifs: 1, preInscrits: 0, revoques: 1, groupes: 1 });
  vi.spyOn(api, "getAgents").mockResolvedValue(agents);
  vi.spyOn(api, "getAuditLogs").mockResolvedValue(logs);
  vi.spyOn(api, "getRetentions").mockResolvedValue(ret);
}

async function connectedApp(mocks: (agents?: Agent[]) => void = () => stubDashboard()) {
  api.setToken("fake-jwt-admin");
  mocks();
  const wrapper = mount(App);
  await flushPromises();
  return wrapper;
}

describe("Parcours complémentaires de l'interface Admin — Goama", () => {
  beforeEach(() => {
    localStorage.clear();
    api.setToken(null);
    vi.restoreAllMocks();
    vi.spyOn(api, "getIdentity").mockResolvedValue({
      id: "admin-1",
      matricule: "ADMIN001",
      prenom: "Amélie",
      nom: "KABORÉ",
      role: "ADMIN",
      statut: "ACTIF",
    });
    vi.spyOn(api, "getReferenceData").mockResolvedValue({
      categories: ["P", "A", "B", "C", "D", "E", "HORS_CATEGORIE"],
      ministeres: ["Ministère de la Transition digitale"],
      postes: [
        { value: "Chef de Service", label: "Chef de Service", parrainage: true },
        { value: "Conseiller Technique", label: "Conseiller Technique", parrainage: false },
      ],
    });
  });

  it("7. Suspendre un agent actif : confirmation, appel API et rechargement", async () => {
    const suspendreSpy = vi.spyOn(api, "suspendreAgent").mockResolvedValue({ ok: true });
    const wrapper = mount(AgentTable, { props: { agents: [AGENTS[0]], loading: false } });
    const suspendBtn = wrapper.findAll("button").find((b) => b.text() === "Suspendre")!;
    expect(suspendBtn.exists()).toBe(true);

    await suspendBtn.trigger("click");
    await wrapper.find(".action-modal .primary").trigger("click");
    await flushPromises();

    expect(suspendreSpy).toHaveBeenCalledWith("ag-1");
    expect(wrapper.emitted("refresh")).toHaveLength(1);
    // Aucun message d'erreur ne doit apparaître
    expect(wrapper.find(".login-alert").exists()).toBe(false);
  });

  it("8. La suspension annulée dans la fenêtre de confirmation n'appelle pas l'API", async () => {
    const suspendreSpy = vi.spyOn(api, "suspendreAgent").mockResolvedValue({ ok: true });

    const wrapper = mount(AgentTable, { props: { agents: [AGENTS[0]], loading: false } });
    await wrapper.findAll("button").find((b) => b.text() === "Suspendre")!.trigger("click");
    expect(wrapper.find(".action-modal").exists()).toBe(true);
    await wrapper.find(".action-modal .row-action").trigger("click");
    await flushPromises();

    expect(suspendreSpy).not.toHaveBeenCalled();
    expect(wrapper.emitted("refresh")).toBeUndefined();
  });

  it("9. Réactiver un agent suspendu : confirmation, appel API et rechargement", async () => {
    const reactiverSpy = vi.spyOn(api, "reactiverAgent").mockResolvedValue({ ok: true });
    const wrapper = mount(AgentTable, { props: { agents: [AGENTS[1]], loading: false } });
    const reactivateBtn = wrapper.findAll("button").find((b) => b.text() === "Réactiver")!;
    expect(reactivateBtn.exists()).toBe(true);

    await reactivateBtn.trigger("click");
    expect(wrapper.find(".action-modal").text()).toContain("Réactiver cet agent ?");
    await wrapper.find(".action-modal .primary").trigger("click");
    await flushPromises();

    expect(reactiverSpy).toHaveBeenCalledWith("ag-3");
    expect(wrapper.emitted("refresh")).toHaveLength(1);
  });

  it("10. Recherche de filtre de statut : le tableau ne montre que les agents correspondants", async () => {
    const wrapper = mount(AgentTable, { props: { agents: AGENTS, loading: false } });

    // Aucun filtre : les 3 agents sont visibles
    expect(wrapper.findAll("tbody tr").length).toBe(3);

    // Recherche par nom (insensible à la casse)
    await wrapper.find(".field.search").setValue("sawadogo");
    const rows = wrapper.findAll("tbody tr");
    expect(rows.length).toBe(1);
    expect(rows[0].text()).toContain("SAWADOGO");

    // Filtre par statut : seulement les suspendus
    await wrapper.find(".field.search").setValue("");
    await wrapper.find("select.field").setValue("SUSPENDU");
    const rows2 = wrapper.findAll("tbody tr");
    expect(rows2.length).toBe(1);
    expect(rows2[0].text()).toContain("KABORÉ");

    // Aucun résultat : message dédié
    await wrapper.find("select.field").setValue("REVOQUÉ");
    await wrapper.find(".field.search").setValue("xyz-aucun-agent");
    expect(wrapper.text()).toContain("Aucun agent ne correspond aux critères de recherche.");
  });

  it("10. Journal d'audit : libellés français, actions formatées et bouton Actualiser", async () => {
    const wrapper = mount(AuditLogs, { props: { logs: LOGS, loading: false } });

    // Les actions sont traduites en libellés officiels
    expect(wrapper.text()).toContain("Révocation immédiate d'agent");
    expect(wrapper.text()).toContain("Création d'un groupe (parrainage)");
    // Les détails sont affichés
    expect(wrapper.text()).toContain("AG005 révoqué immédiatement");
    // Bouton Actualiser émet refresh
    const refreshBtn = wrapper.findAll("button").find((b) => /actualiser/i.test(b.text()))!;
    await refreshBtn.trigger("click");
    expect(wrapper.emitted("refresh")).toHaveLength(1);
  });

  it("11. Navigation par onglets : audit et retour au tableau de bord", async () => {
    const wrapper = await connectedApp(() => stubDashboard(AGENTS, LOGS, RETENTIONS));

    const navBtns = wrapper.findAll(".nav button");
    expect(navBtns.some((b) => b.text().includes("Agents"))).toBe(false);
    expect(wrapper.findComponent(AgentTable).exists()).toBe(true);
    // L'agent révoqué montre bien « Accès coupé » sans bouton action
    expect(wrapper.text()).toContain("Accès coupé");

    // Onglet Activité
    await navBtns.find((b) => b.text().includes("Activité"))!.trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("Activité");
    expect(wrapper.text()).toContain("Révocation immédiate d'agent");

    // Retour au tableau de bord
    await navBtns.find((b) => b.text().includes("Vue d’ensemble"))!.trigger("click");
    await wrapper.vm.$nextTick();
    // Le panneau de suivi des rotations apparaît (1 en attente)
    expect(wrapper.text()).toContain("Protection des conversations");
    expect(wrapper.text()).toContain("1 en attente");
  });

  it("12. Bascule du thème clair ⇄ sombre : attribute data-theme changé et libellé mis à jour", async () => {
    const wrapper = await connectedApp();

    // Par défaut : thème sombre, propose de passer au clair
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    const themeBtn = wrapper.findAll(".sidebar-foot button")[0];
    expect(themeBtn.text()).toContain("Thème clair");

    await themeBtn.trigger("click");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(themeBtn.text()).toContain("Thème sombre");

    await themeBtn.trigger("click");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("13. Échec de chargement des données : message lisible, sans casser l'écran", async () => {
    api.setToken("fake-jwt-admin");
    vi.restoreAllMocks();
    vi.spyOn(api, "getIdentity").mockResolvedValue({
      id: "admin-1", matricule: "ADMIN001", prenom: "Amélie", nom: "KABORÉ", role: "ADMIN", statut: "ACTIF",
    });
    vi.spyOn(api, "getStats").mockRejectedValue(new Error("boom"));
    vi.spyOn(api, "getAgents").mockRejectedValue(new Error("boom"));
    vi.spyOn(api, "getAuditLogs").mockRejectedValue(new Error("boom"));
    vi.spyOn(api, "getRetentions").mockRejectedValue(new Error("boom"));

    const wrapper = mount(App);
    await flushPromises();

    expect(wrapper.text()).toContain("Impossible de charger les données administratives.");
    // L'interface reste administrable : le bouton d'action principal est là
    expect(wrapper.text()).toContain("Pré-inscrire un agent");
  });

  it("14. Session expirée pendant l'usage (session_fermee) : retour à l'écran de connexion", async () => {
    api.setToken("fake-jwt-admin");
    vi.restoreAllMocks();
    vi.spyOn(api, "getIdentity").mockRejectedValue(new Error("session_fermee"));
    vi.spyOn(api, "getStats").mockRejectedValue(new Error("session_fermee"));
    vi.spyOn(api, "getAgents").mockRejectedValue(new Error("session_fermee"));
    vi.spyOn(api, "getAuditLogs").mockRejectedValue(new Error("session_fermee"));
    vi.spyOn(api, "getRetentions").mockRejectedValue(new Error("session_fermee"));

    const wrapper = mount(App);
    await flushPromises();

    expect(wrapper.findComponent(LoginView).exists()).toBe(true);
    expect(wrapper.find(".shell").exists()).toBe(false);
  });

  it("15. Erreur de rate limiting à la connexion : message d'attente affiché", async () => {
    vi.spyOn(api, "login").mockRejectedValue(new Error("trop_de_requetes"));

    const wrapper = mount(LoginView);
    await wrapper.find("#matricule").setValue("ADMIN001");
    await wrapper.find("#secret").setValue("AdminGoama2026!");
    await wrapper.find("#codeTotp").setValue("000000");
    await wrapper.find("form").trigger("submit.prevent");
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain("Trop de tentatives. Veuillez patienter avant de réessayer.");
  });

  it("16. Modale de pré-inscription : matricule normalisé en majuscules (trim + upper) et options de poste conformes ADR-12", async () => {
    const preInscrireSpy = vi.spyOn(api, "preInscrire").mockResolvedValue({
      agentId: "uuid-1",
      codeActivation: "AAAA1234",
    });

    const wrapper = mount(PreInscrireModal);
    await flushPromises();

    // La modale liste les postes habilités ET non habilités (ADR-12)
    const options = wrapper.findAll("select option").map((o) => o.text());
    expect(options.some((o) => o.includes("Chef de Service") && o.includes("habilité"))).toBe(true);
    expect(options.some((o) => o.includes("Sans parrainage"))).toBe(true);

    // La saisie est normalisée : « ag077 » → « AG077 »
    await wrapper.find("#agentMatricule").setValue("ag077");
    await wrapper.find("#agentNom").setValue("  Compaoré  ");
    await wrapper.find("#agentPrenom").setValue("Karim");

    await wrapper.find("form").trigger("submit.prevent");
    await flushPromises();

    expect(preInscrireSpy).toHaveBeenCalledWith(
      expect.objectContaining({ matricule: "AG077", nom: "Compaoré", prenom: "Karim" }),
    );
  });

  it("17. Modale : erreur backend matricule_deja_enrole affichée en clair", async () => {
    vi.spyOn(api, "preInscrire").mockRejectedValue(new Error("matricule_deja_enrole"));

    const wrapper = mount(PreInscrireModal);
    await wrapper.find("#agentMatricule").setValue("AG001");
    await wrapper.find("#agentNom").setValue("SAWADOGO");
    await wrapper.find("#agentPrenom").setValue("Awa");
    await wrapper.find("form").trigger("submit.prevent");
    await flushPromises();

    expect(wrapper.text()).toContain("Ce matricule est déjà pré-inscrit ou utilisé.");
  });
});
