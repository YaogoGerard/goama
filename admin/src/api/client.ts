import type {
  Agent,
  AuditLog,
  PreInscriptionData,
  PreInscriptionResult,
  Stats,
  AdminIdentity,
  Retention,
} from "../types.js";

// Préfixe de l'API (direct ou via le proxy Vite /api)
const API_URL = import.meta.env.VITE_API_URL || "/api";

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem("goama_admin_token");
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem("goama_admin_token", token);
    } else {
      localStorage.removeItem("goama_admin_token");
    }
  }

  getToken(): string | null {
    return this.token;
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers || {});
    headers.set("Content-Type", "application/json");

    if (this.token) {
      headers.set("Authorization", `Bearer ${this.token}`);
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
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

  async getAgents(): Promise<Agent[]> {
    return this.request<Agent[]>("/admin/accounts");
  }

  async getStats(): Promise<Stats> {
    return this.request<Stats>("/admin/stats");
  }

  async getAuditLogs(): Promise<AuditLog[]> {
    return this.request<AuditLog[]>("/admin/audit-events");
  }

  async getRetentions(): Promise<Retention[]> {
    return this.request<Retention[]>("/admin/retentions");
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
    });
  }

  async suspendreAgent(agentId: string): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>(`/admin/accounts/${agentId}/suspend`, {
      method: "POST",
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
