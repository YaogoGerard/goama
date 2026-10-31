import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import App from "../../src/App.vue";
import LoginView from "../../src/components/LoginView.vue";
import PreInscrireModal from "../../src/components/PreInscrireModal.vue";
import { api } from "../../src/api/client.js";

describe("E2E Admin Workflow — Goama Administration", () => {
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
    vi.spyOn(api, "getRetentions").mockResolvedValue([]);
  });

  it("1. Affiche l'écran de connexion 2FA si non authentifié", () => {
    const wrapper = mount(App);
    expect(wrapper.findComponent(LoginView).exists()).toBe(true);
    expect(wrapper.text()).toContain("Goama Admin");
    expect(wrapper.text()).not.toContain("Connexion Administrateur");
    expect(wrapper.text()).toContain("Code TOTP");
    expect(wrapper.find(".shell").exists()).toBe(false);
  });

  it("2. Refuse la connexion avec un TOTP erroné et affiche l'alerte", async () => {
    vi.spyOn(api, "login").mockRejectedValue(new Error("identifiants_invalides"));

    const wrapper = mount(LoginView);
    await wrapper.find("#matricule").setValue("ADMIN001");
    await wrapper.find("#secret").setValue("AdminGoama2026!");
    await wrapper.find("#codeTotp").setValue("000000");

    await wrapper.find("form").trigger("submit.prevent");
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain("Matricule, mot de passe ou code TOTP invalide.");
  });

  it("3. Authentifie l'Admin avec le double facteur et bascule sur le tableau de bord", async () => {
    vi.spyOn(api, "login").mockResolvedValue({ jeton: "fake-jwt-admin", sessionId: "session-1" });
    vi.spyOn(api, "getStats").mockResolvedValue({ total: 7, actifs: 6, preInscrits: 1, revoques: 0, groupes: 2 });
    vi.spyOn(api, "getAgents").mockResolvedValue([
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
    ]);
    vi.spyOn(api, "getAuditLogs").mockResolvedValue([]);

    const wrapper = mount(App);
    const login = wrapper.findComponent(LoginView);
    login.vm.$emit("login-success");

    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    await flushPromises();

    expect(wrapper.find(".shell").exists()).toBe(true);
    expect(wrapper.text()).toContain("Tableau de bord");
    expect(wrapper.text()).toContain("Agents actifs");
    expect(wrapper.text()).toContain("ADMIN001");
    // Règle G-06 : l'avertissement de confidentialité doit être présent
    expect(wrapper.text()).toContain("Confidentialité préservée");
  });

  it("4. Modal de pré-inscription : émet le code 24 h à usage unique (REQ-ID-002)", async () => {
    vi.spyOn(api, "preInscrire").mockResolvedValue({
      agentId: "new-agent-uuid",
      codeActivation: "E8F291B4",
    });

    const wrapper = mount(PreInscrireModal);

    await wrapper.find("#agentMatricule").setValue("AG099");
    await wrapper.find("#agentNom").setValue("OUEDRAOGO");
    await wrapper.find("#agentPrenom").setValue("Salif");
    await wrapper.find("#agentCategorie").setValue("A");
    await wrapper.find("#agentPoste").setValue("Chef de Service");

    await wrapper.find("form").trigger("submit.prevent");
    await flushPromises();

    // Vérifie l'affichage du code à 8 caractères
    expect(wrapper.text()).toContain("Agent pré-inscrit avec succès");
    expect(wrapper.text()).toContain("E8F291B4");
    expect(wrapper.text()).toContain("valable 24 h");
    expect(wrapper.text()).toContain("Copier le code");
  });

  it("5. Révocation immédiate d'un agent avec coupure d'accès (ADR-08 / REQ-REV-001)", async () => {
    api.setToken("fake-jwt-admin");
    const revoquerSpy = vi.spyOn(api, "revoquerAgent").mockResolvedValue({ ok: true });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    vi.spyOn(api, "getStats").mockResolvedValue({ total: 1, actifs: 1, preInscrits: 0, revoques: 0, groupes: 0 });
    vi.spyOn(api, "getAgents").mockResolvedValue([
      {
        id: "target-agent-id",
        matricule: "AG002",
        nom: "OUÉDRAOGO",
        prenom: "Issa",
        ministere: "Ministère de la Santé",
        fonction: "Agent technique",
        categorie: "B",
        role: "AGENT",
        statut: "ACTIF",
        createdAt: new Date().toISOString(),
        revokedAt: null,
      },
    ]);
    vi.spyOn(api, "getAuditLogs").mockResolvedValue([]);

    const wrapper = mount(App);
    await flushPromises();

    // Clique sur le bouton Révoquer
    const revokeBtn = wrapper.find(".row-action.revoke");
    expect(revokeBtn.exists()).toBe(true);

    await revokeBtn.trigger("click");
    await flushPromises();

    expect(revoquerSpy).toHaveBeenCalledWith("target-agent-id");
  });

  it("6. Déconnexion de l'administrateur et fermeture de session", async () => {
    api.setToken("fake-jwt-admin");
    const logoutSpy = vi.spyOn(api, "logout").mockResolvedValue();
    vi.spyOn(api, "getStats").mockResolvedValue({ total: 0, actifs: 0, preInscrits: 0, revoques: 0, groupes: 0 });
    vi.spyOn(api, "getAgents").mockResolvedValue([]);
    vi.spyOn(api, "getAuditLogs").mockResolvedValue([]);

    const wrapper = mount(App);
    await flushPromises();

    const logoutBtn = wrapper.find(".sidebar-foot .row-action");
    expect(logoutBtn.text()).toContain("Déconnexion");

    await logoutBtn.trigger("click");
    await flushPromises();

    expect(logoutSpy).toHaveBeenCalled();
    expect(wrapper.findComponent(LoginView).exists()).toBe(true);
  });
});
