import type {
  Agent,
  AuditLog,
  PreInscriptionData,
  PreInscriptionResult,
  Stats,
  AdminIdentity,
  Retention,
} from "../types.js";

const ADMIN_PAGE_SIZE = 10;

// Préfixe de l'API (direct ou via le proxy Vite /api)
const API_URL = import.meta.env.VITE_API_URL || "/api";

class ApiClient {
  private token: string | null = null;
  private refreshInFlight: Promise<boolean> | null = null;

  constructor() {}

  setToken(token: string | null) {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }

  async restoreSession(): Promise<boolean> {
    // Efface l'ancien stockage local introduit par les versions antérieures.
    localStorage.removeItem("goama_admin_token");
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = (async () => {
      try {
        const response = await fetch(`${API_URL}/auth/refresh`, { method: "POST", credentials: "include" });
        if (!response.ok) { this.setToken(null); return false; }
        const data = await response.json() as { jeton?: string };
        if (typeof data.jeton !== "string") { this.setToken(null); return false; }
        this.setToken(data.jeton);
        return true;
      } catch {
        this.setToken(null);
        return false;
      } finally {
        this.refreshInFlight = null;
      }
    })();
    return this.refreshInFlight;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}, allowRefresh = true): Promise<T> {
    const headers = new Headers(options.headers || {});
    headers.set("Content-Type", "application/json");

    if (this.token) {
      headers.set("Authorization", `Bearer ${this.token}`);
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      credentials: "include",
      headers,
    });

    if (response.status === 401) {
      if (allowRefresh && this.token && !endpoint.startsWith("/auth/login") && !endpoint.startsWith("/auth/refresh")) {
        const restauree = await this.restoreSession();
        if (restauree) return this.request<T>(endpoint, options, false);
      }
      this.setToken(null);
      const data = await response.json().catch(() => ({}));
      throw new Error(data.erreur || "session_fermee");
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.erreur || `Erreur serveur (${response.status})`);
    }

    return data as T;
  }

  async login(matricule: string, secret: string, codeTotp: string) {
    const res = await this.request<{ jeton: string; sessionId: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ matricule, secret, codeTotp }),
    });
    this.setToken(res.jeton);
    return res;
  }

  async logout() {
    try {
      if (this.token) {
        // Corps vide interdit (Content-Type json exigé par ce client) :
        // Fastify refuserait un POST sans corps (400 corps_invalide).
        await this.request<{ ok: boolean }>("/auth/logout", {
          method: "POST",
          body: JSON.stringify({}),
        });
      }
    } finally {
      this.setToken(null);
    }
  }

  async getIdentity(): Promise<AdminIdentity> {
    return this.request<AdminIdentity>("/account/me");
  }

  async getAgents(): Promise<Agent[] & Partial<import("../types.js").Page<Agent>>> {
    const page = await this.getAgentsPage();
    return Object.assign(page.items, { page: page.page, totalPages: page.totalPages, total: page.total, limit: page.limit });
  }

  async getAgentsPage(page = 1, limit = ADMIN_PAGE_SIZE, search = "", status = "ALL") {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search.trim()) params.set("search", search.trim());
    if (status !== "ALL") params.set("status", status);
    return this.request<import("../types.js").Page<Agent>>(`/admin/accounts?${params}`);
  }

  async getStats(): Promise<Stats> {
    return this.request<Stats>("/admin/stats");
  }

  async getReferenceData(): Promise<import("../types.js").ReferenceData> {
    return this.request<import("../types.js").ReferenceData>("/admin/reference-data");
  }

  async getAuditLogs(): Promise<AuditLog[] & Partial<import("../types.js").Page<AuditLog>>> {
    const page = await this.getAuditLogsPage();
    return Object.assign(page.items, { page: page.page, totalPages: page.totalPages, total: page.total, limit: page.limit });
  }

  async getAuditLogsPage(page = 1, limit = ADMIN_PAGE_SIZE) {
    return this.request<import("../types.js").Page<AuditLog>>(`/admin/audit-events?page=${page}&limit=${limit}`);
  }

  async getRetentions(): Promise<Retention[]> {
    return (await this.getRetentionsPage()).items;
  }

  async getRetentionsPage(page = 1, limit = ADMIN_PAGE_SIZE) {
    return this.request<import("../types.js").Page<Retention>>(`/admin/retentions?page=${page}&limit=${limit}`);
  }

  async preInscrire(data: PreInscriptionData): Promise<PreInscriptionResult> {
    return this.request<PreInscriptionResult>("/admin/accounts", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async revoquerAgent(agentId: string): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>(`/admin/accounts/${agentId}/revoke`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  }

  async suspendreAgent(agentId: string): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>(`/admin/accounts/${agentId}/suspend`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  }

  async reactiverAgent(agentId: string): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>(`/admin/accounts/${agentId}/reactivate`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  }

  async reinitialiserAcces(agentId: string): Promise<PreInscriptionResult> {
    return this.request<PreInscriptionResult>(`/admin/accounts/${agentId}/mfa/reset-request`, {
      method: "POST",
    });
  }

  async getDevices() {
    return this.request<Array<{ id: string; label: string; publicKey: string; statut: string; enrolledAt: string | null; revokedAt: string | null }>>("/devices");
  }

  async revokeDevice(deviceId: string): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>(`/admin/devices/${deviceId}`, { method: "DELETE" });
  }
}

export const api = new ApiClient();
