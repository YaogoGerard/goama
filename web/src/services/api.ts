import type { OlmMemberBundle, OlmPublishedBundle } from '../crypto/olm'

const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:8080' : '/api')

// Le jeton d'accès ne vit que dans la mémoire du document. Le cookie de
// renouvellement est HttpOnly et n'est jamais accessible au JavaScript.
let accessToken: string | null = null
let refreshInFlight: Promise<string | null> | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

async function renouvelerJetonAcces(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = (async () => {
    try {
      const response = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' })
      if (!response.ok) { accessToken = null; return null }
      const body = await response.json() as { jeton?: string }
      accessToken = typeof body.jeton === 'string' ? body.jeton : null
      return accessToken
    } catch {
      accessToken = null
      return null
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

async function readApiError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null) as { erreur?: string; message?: string } | null
  return body?.erreur ?? body?.message ?? `http_${response.status}`
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const hasBody = options.body !== undefined && options.body !== null
  const envoyer = () => fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(hasBody && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(options.headers ?? {})
    }
  })
  let response = await envoyer()
  if (response.status === 401 && accessToken && path !== '/auth/refresh' && !path.startsWith('/auth/connexion') && !path.startsWith('/auth/login')) {
    const token = await renouvelerJetonAcces()
    if (token) response = await envoyer()
  }
  if (!response.ok) throw new Error(await readApiError(response))
  if (response.status === 204) return undefined as T
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    throw new Error('reponse_api_invalide')
  }
  return response.json() as Promise<T>
}

async function requestBinary(path: string, options: RequestInit = {}): Promise<Blob> {
  const envoyer = () => fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(options.headers ?? {})
    }
  })
  let response = await envoyer()
  if (response.status === 401 && accessToken) {
    const token = await renouvelerJetonAcces()
    if (token) response = await envoyer()
  }
  if (!response.ok) throw new Error(await readApiError(response))
  return response.blob()
}

export interface AuthResponse {
  jeton: string
  sessionId: string
}

export interface ActivationResponse {
  totpSecret: string
  uri: string
}

export interface Agent {
  id: string
  prenom: string
  nom: string
  ministere: string
  fonction: string
  habiliteParrain?: boolean
}

export interface AccountProfile {
  id: string
  matricule: string
  prenom: string
  nom: string
  role: string
  statut: string
}

export interface Group {
  id: string
  epoch: number
  monRole: string
  membres: { agentId: string; role: string }[]
}

export interface GroupRequest {
  id: string
  statut: string
  createdAt: string
  nomRequest?: string
  membresRequest?: string[]
  estDemandeur: boolean
  demandeur: { id: string; prenom: string; nom: string; fonction: string; ministere: string }
  parrain: { id: string; prenom: string; nom: string; fonction: string; ministere: string }
}

export interface Device {
  id: string
  label: string
  publicKey: string
  statut: string
  enrolledAt: string | null
  revokedAt: string | null
}

export interface PresenceResponse {
  enLigne: string[]
}

export const api = {
  login(payload: { matricule: string; secret: string; codeTotp: string }) {
    return request<AuthResponse>('/auth/connexion', { method: 'POST', body: JSON.stringify(payload) })
  },
  activate(payload: { matricule: string; code: string; secret: string }) {
    return request<ActivationResponse>('/auth/activation', { method: 'POST', body: JSON.stringify(payload) })
  },
  logout() {
    return request<{ ok: boolean }>('/auth/deconnexion', { method: 'POST' })
  },
  refresh() {
    return request<AuthResponse>('/auth/refresh', { method: 'POST' })
  },
  accountMe() {
    return request<AccountProfile>('/account/me')
  },
  agents() {
    return request<Agent[]>('/agents')
  },
  groups() {
    return request<Group[]>('/groupes')
  },
  createGroup() {
    return request<{ id: string; epoch: number }>('/groupes', { method: 'POST', body: JSON.stringify({}) })
  },
  requestGroup(parrainId: string, nom?: string, membres?: string[]) {
    return request<{ id: string; statut: string }>('/groupes/demandes', {
      method: 'POST',
      body: JSON.stringify({ parrainId, ...(nom ? { nom } : {}), ...(membres?.length ? { membres } : {}) })
    })
  },
  groupRequests() {
    return request<GroupRequest[]>('/groupes/demandes')
  },
  approveGroupRequest(requestId: string) {
    return request<{ id: string; epoch: number }>(`/groupes/demandes/${requestId}/approuver`, { method: 'POST' })
  },
  rejectGroupRequest(requestId: string) {
    return request<{ ok: boolean }>(`/groupes/demandes/${requestId}/rejeter`, { method: 'POST' })
  },
  groupMembers(groupId: string) {
    return request<{ agentId: string; role: string; addedAt?: string }[]>(`/groupes/${groupId}/membres`)
  },
  addGroupMember(groupId: string, agentId: string) {
    return request<{ ok: boolean; epoch: number }>(`/groupes/${groupId}/membres`, {
      method: 'POST',
      body: JSON.stringify({ agentId })
    })
  },
  removeGroupMember(groupId: string, agentId: string) {
    return request<{ ok: boolean; epoch: number; rotationCryptographique: 'EN_ATTENTE' }>(`/groupes/${groupId}/membres/${agentId}`, { method: 'DELETE' })
  },
  devices() {
    return request<Device[]>('/devices')
  },
  olmKeyStatus() {
    return request<{ available: number }>('/devices/olm-keys/status')
  },
  publishOlmKeys(bundle: OlmPublishedBundle) {
    return request<{ ok: boolean; oneTimeKeysPublished: number }>('/devices/olm-keys', {
      method: 'POST', body: JSON.stringify(bundle)
    })
  },
  groupOlmKeys(groupId: string, claimFor: string[] = []) {
    return request<OlmMemberBundle[]>(`/groupes/${groupId}/olm-keys`, {
      method: 'POST', body: JSON.stringify({ claimFor })
    })
  },
  acknowledgeGroupKey(groupId: string, epoch: number, senderId: string) {
    return request<{ ok: boolean; enCours: boolean; recus: number; attendus: number }>(`/groupes/${groupId}/rotation/ack`, {
      method: 'POST', body: JSON.stringify({ epoch, senderId })
    })
  },
  enrollDevice(payload: { matricule: string; code: string; publicKey: string; label: string }) {
    return request<{ deviceId: string }>('/devices/enroll', { method: 'POST', body: JSON.stringify(payload) })
  },
  presence() {
    return request<PresenceResponse>('/presence')
  },
  uploadMedia(groupId: string, encryptedBlob: Blob) {
    const form = new FormData()
    form.append('groupeId', groupId)
    form.append('fichier', encryptedBlob, 'goama-media.bin')
    return request<{ id: string; taille: number; sha256: string }>('/media', {
      method: 'POST',
      body: form,
      headers: {}
    })
  },
  downloadMedia(mediaId: string) {
    return requestBinary(`/media/${mediaId}`)
  },
  deleteMedia(mediaId: string) {
    return request<{ ok: boolean }>(`/media/${mediaId}`, { method: 'DELETE' })
  },
  sendMessage(groupId: string, payload: { epoch: number; kind: 'megolm_app' | 'megolm_key_share' | 'recu_lu' | 'nom_groupe' | 'media_cle'; content: string }) {
    return request(`/groupes/${groupId}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  },
  messages(groupId: string, apresSeq = 0) {
    const query = apresSeq > 0 ? `?apresSeq=${apresSeq}` : ''
    return request<{ seq: number; epoch: number; kind: string; content: string; createdAt: string; senderId: string }[]>(
      `/groupes/${groupId}/messages${query}`
    )
  }
}

// Passerelle temps réel : GET /ws. Le jeton part dans le PREMIER message de
// la socket (jamais dans l'URL — REQ-OPS-005) ; la socket ne sert qu'à
// RECEVOIR. Un battement de cœur ping/pong la maintient ouverte.
export function connectNotifications(onEvent: (event: { type?: string; [key: string]: unknown }) => void) {
  const token = accessToken
  if (!token || typeof WebSocket === 'undefined') return null

  const base = API_URL.startsWith('http')
    ? API_URL.replace(/^http/, 'ws')
    : `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${API_URL}`
  const socket = new WebSocket(`${base}/ws`)
  socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'auth', jeton: token })))
  socket.addEventListener('message', (message) => {
    try {
      onEvent(JSON.parse(message.data) as { type?: string; [key: string]: unknown })
    } catch {
      socket.close()
    }
  })
  return socket
}

export interface RealtimeEvent {
  type: 'message' | 'membre_ajoute' | 'membre_retire' | 'revoque'
  groupeId?: string
  seq?: number
  epoch?: number
  kind?: string
  content?: string
  de?: string
  agentId?: string
}
