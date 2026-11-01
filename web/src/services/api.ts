const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('goama_token')
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {})
    }
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { erreur?: string } | null
    throw new Error(body?.erreur ?? 'requete_echouee')
  }
  return response.json() as Promise<T>
}

export interface AuthResponse {
  jeton: string
  sessionId: string
}

export interface Agent {
  id: string
  prenom: string
  nom: string
  ministere: string
  fonction: string
}

export interface Group {
  id: string
  epoch: number
  monRole: string
  membres: { agentId: string; role: string }[]
}

export const api = {
  login(payload: { matricule: string; secret: string; codeTotp: string }) {
    return request<AuthResponse>('/auth/connexion', { method: 'POST', body: JSON.stringify(payload) })
  },
  logout() {
    return request<{ ok: boolean }>('/auth/deconnexion', { method: 'POST' })
  },
  agents() {
    return request<Agent[]>('/agents')
  },
  groups() {
    return request<Group[]>('/groupes')
  },
  sendMessage(groupId: string, payload: { epoch: number; kind: 'mls_app'; content: string }) {
    return request(`/groupes/${groupId}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  },
  messages(groupId: string) {
    return request<{ seq: number; epoch: number; kind: string; content: string; createdAt: string; senderId: string }[]>(
      `/groupes/${groupId}/messages`
    )
  }
}
