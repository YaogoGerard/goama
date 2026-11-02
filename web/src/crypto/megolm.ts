/**
 * Moteur Megolm Goama (Matrix Olm / Megolm via libolm WebAssembly).
 *
 * Megolm chiffre les messages de groupe. Chaque agent, sur son appareil
 * unique, possède sa propre session sortante ; les autres agents reçoivent la clé de
 * session par un canal Olm authentifié (jamais en clair via l'API Goama).
 *
 * IMPORTANT : l'export/import de clé ci-dessous est une primitive de transport,
 * pas un transport. L'appelant DOIT envelopper la clé dans une session Olm
 * vérifiée avant toute transmission. Aucun fallback en clair/AES n'existe.
 * Les sessions locales sont isolées par identifiant d'agent.
 */
import { olmRuntime, ensureOlmRuntime } from './olm-runtime'
import { withCryptoLock } from './locks'

interface OlmGroupSession {
  create(): void
  encrypt(plaintext: string): string
  session_id(): string
  session_key(): string
  message_index(): number
  pickle(key: string): string
  unpickle(key: string, pickle: string): void
  free(): void
}
interface OlmInboundGroupSession {
  create(sessionKey: string): string
  decrypt(ciphertext: string): { plaintext: string; message_index: number }
  session_id(): string
  first_known_index(): number
  pickle(key: string): string
  unpickle(key: string, pickle: string): void
  free(): void
}
interface OlmApi {
  init(options?: { locateFile?: (path: string) => string }): Promise<void>
  OutboundGroupSession: new () => OlmGroupSession
  InboundGroupSession: new () => OlmInboundGroupSession
}

const olm = olmRuntime as unknown as OlmApi
const DB_NAME = 'goama-crypto-v2'
const STORE = 'megolm-sessions'
const DB_VERSION = 2
const ROTATE_AFTER_MESSAGES = 100
const ROTATE_AFTER_MS = 7 * 24 * 60 * 60 * 1000

interface StoredSession {
  id: string
  ownerAgentId: string
  kind: 'outbound' | 'inbound'
  groupId: string
  sessionId: string
  createdAt: number
  messageIndex: number
  epoch?: number
  seenIndexes?: number[]
  iv: number[]
  encryptedPickle: number[]
  shareKeyIv?: number[]
  encryptedShareKey?: number[]
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' })
      if (!req.result.objectStoreNames.contains('olm-state')) req.result.createObjectStore('olm-state', { keyPath: 'id' })
      if (!req.result.objectStoreNames.contains('olm-sessions')) req.result.createObjectStore('olm-sessions', { keyPath: 'id' })
      if (!req.result.objectStoreNames.contains('trusted-identities')) req.result.createObjectStore('trusted-identities', { keyPath: 'id' })
    }
    req.onsuccess = () => { req.result.onversionchange = () => req.result.close(); resolve(req.result) }
    req.onerror = () => reject(req.error ?? new Error('crypto_db_open_failed'))
  })
}
function txRequest<T>(db: IDBDatabase, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const req = action(tx.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('crypto_db_request_failed'))
    tx.onabort = () => reject(tx.error ?? new Error('crypto_db_transaction_aborted'))
  })
}
const encoder = new TextEncoder()
const decoder = new TextDecoder()
function b64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
function unb64(value: string): Uint8Array {
  const raw = atob(value)
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}
async function getStorageKey(db: IDBDatabase): Promise<CryptoKey> {
  const keyId = '__storage_key__'
  const existing = await txRequest<unknown>(db, 'readonly', s => s.get(keyId)) as { key?: CryptoKey } | undefined
  if (existing?.key) return existing.key
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  await txRequest(db, 'readwrite', s => s.put({ id: keyId, key }))
  return key
}
async function saveSession(db: IDBDatabase, ownerAgentId: string, id: string, kind: 'outbound' | 'inbound', groupId: string, sessionId: string, pickle: string, messageIndex: number, createdAt: number, seenIndexes: number[] = [], epoch = 0, shareKey?: string): Promise<void> {
  const storageKey = await getStorageKey(db)
  const previous = await txRequest<StoredSession | undefined>(db, 'readonly', s => s.get(id))
  const pickleIv = crypto.getRandomValues(new Uint8Array(12))
  const encryptedPickle = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: pickleIv }, storageKey, encoder.encode(pickle)))
  let shareKeyIv = previous?.shareKeyIv
  let encryptedShareKey = previous?.encryptedShareKey
  if (shareKey !== undefined) {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, storageKey, encoder.encode(shareKey)))
    shareKeyIv = [...iv]
    encryptedShareKey = [...encrypted]
  }
  await txRequest(db, 'readwrite', s => s.put({ id, ownerAgentId, kind, groupId, sessionId, createdAt, messageIndex, epoch, seenIndexes, iv: [...pickleIv], encryptedPickle: [...encryptedPickle], shareKeyIv, encryptedShareKey } satisfies StoredSession))
}
async function loadSession(db: IDBDatabase, id: string): Promise<{ record: StoredSession; pickle: string } | null> {
  const record = await txRequest<StoredSession | undefined>(db, 'readonly', s => s.get(id))
  if (!record || !('encryptedPickle' in record)) return null
  const storageKey = await getStorageKey(db)
  const pickle = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(record.iv) }, storageKey, new Uint8Array(record.encryptedPickle))
  return { record, pickle: decoder.decode(pickle) }
}
async function removeSession(db: IDBDatabase, id: string): Promise<void> { await txRequest(db, 'readwrite', s => s.delete(id)) }

async function ensureInit(): Promise<void> { await ensureOlmRuntime() }
function outId(ownerAgentId: string, groupId: string): string { return `out:${ownerAgentId}:${groupId}` }
function inId(ownerAgentId: string, groupId: string, sessionId: string): string { return `in:${ownerAgentId}:${groupId}:${sessionId}` }

async function createGroupUnlocked(ownerAgentId: string, groupId: string, epoch: number): Promise<{ sessionId: string }> {
  if (typeof indexedDB === 'undefined' || !globalThis.crypto?.subtle) throw new Error('webcrypto_indexeddb_indisponible')
  await ensureInit()
  const db = await openDb()
  const session = new olm.OutboundGroupSession()
  try {
    session.create()
    const sessionId = session.session_id()
    const sessionKey = session.session_key()
    const pickleKey = b64(crypto.getRandomValues(new Uint8Array(32)))
    const pickle = session.pickle(pickleKey)
    await saveSession(db, ownerAgentId, outId(ownerAgentId, groupId), 'outbound', groupId, sessionId, JSON.stringify({ pickle, pickleKey }), session.message_index(), Date.now(), [], epoch, sessionKey)
    const inbound = new olm.InboundGroupSession()
    try {
      // libolm's InboundGroupSession.create() accepts the session key alone;
      // the key already carries its first-known message index.
      inbound.create(sessionKey)
      await saveSession(db, ownerAgentId, inId(ownerAgentId, groupId, sessionId), 'inbound', groupId, sessionId, JSON.stringify({ pickle: inbound.pickle(pickleKey), pickleKey }), -1, Date.now(), [], epoch)
    } finally { inbound.free() }
    return { sessionId }
  } finally { session.free(); db.close() }
}

export const megolmService = {
  async init(): Promise<void> {
    if (typeof indexedDB === 'undefined' || !globalThis.crypto?.subtle) throw new Error('webcrypto_indexeddb_indisponible')
    await ensureInit()
    const db = await openDb(); db.close()
  },

  async createGroup(ownerAgentId: string, groupId: string, epoch = 0): Promise<{ sessionId: string }> {
    return withCryptoLock(`megolm-group:${ownerAgentId}:${groupId}`, () => createGroupUnlocked(ownerAgentId, groupId, epoch))
  },

  /** À envelopper via Olm avant toute transmission à un membre. */
  async exportSessionKey(ownerAgentId: string, groupId: string, expectedEpoch?: number): Promise<{ sessionId: string; messageIndex: number; sessionKey: string }> {
    await this.init()
    const db = await openDb()
    try {
      const stored = await loadSession(db, outId(ownerAgentId, groupId))
      if (!stored) throw new Error('megolm_session_absente')
      if (expectedEpoch !== undefined && (stored.record.epoch ?? 0) !== expectedEpoch) throw new Error('megolm_epoch_perime_rotation_requise')
      const data = JSON.parse(stored.pickle) as { pickle: string; pickleKey: string }
      const session = new olm.OutboundGroupSession()
      try {
        session.unpickle(data.pickleKey, data.pickle)
        const sessionKey = stored.record.encryptedShareKey && stored.record.shareKeyIv
          ? decoder.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(stored.record.shareKeyIv) }, await getStorageKey(db), new Uint8Array(stored.record.encryptedShareKey)))
          : session.session_key()
        // session_key() is the original outbound key, not an exported
        // snapshot. An inbound session created from it starts at index zero
        // even when this outbound session has already encrypted messages.
        return { sessionId: session.session_id(), messageIndex: 0, sessionKey }
      } finally { session.free() }
    } finally { db.close() }
  },

  /** À appeler uniquement après déchiffrement/authentification du paquet Olm du pair. */
  async importSessionKey(ownerAgentId: string, groupId: string, sessionKey: string, messageIndex = 0, epoch = 0): Promise<string> {
    return withCryptoLock(`megolm-group:${ownerAgentId}:${groupId}`, async () => {
      await this.init()
      // Goama distributes the original outbound session key (not an
      // export_session() snapshot), which is valid from index zero.
      if (messageIndex !== 0) throw new Error('megolm_index_initial_invalide')
      const db = await openDb()
      const session = new olm.InboundGroupSession()
      try {
        session.create(sessionKey)
        const sessionId = session.session_id()
        const existing = await loadSession(db, inId(ownerAgentId, groupId, sessionId))
        // Un partage répété ne doit pas réinitialiser l'index anti-rejeu d'une session existante.
        if (existing && existing.record.epoch === epoch) return sessionId
        const pickleKey = b64(crypto.getRandomValues(new Uint8Array(32)))
        const pickle = JSON.stringify({ pickle: session.pickle(pickleKey), pickleKey })
        await saveSession(db, ownerAgentId, inId(ownerAgentId, groupId, sessionId), 'inbound', groupId, sessionId, pickle, -1, Date.now(), [], epoch)
        return sessionId
      } finally { session.free(); db.close() }
    })
  },

  async encryptMessage(ownerAgentId: string, plaintext: string, groupId: string, expectedEpoch?: number): Promise<string> {
    return withCryptoLock(`megolm-group:${ownerAgentId}:${groupId}`, async () => {
      await this.init()
      const db = await openDb()
      try {
        const stored = await loadSession(db, outId(ownerAgentId, groupId))
        if (!stored) throw new Error('megolm_session_absente')
        if (expectedEpoch !== undefined && (stored.record.epoch ?? 0) !== expectedEpoch) throw new Error('megolm_epoch_perime_rotation_requise')
        const currentEpoch = stored.record.epoch ?? 0
        const distributionMarker = `goama-olm-shared:${ownerAgentId}:${groupId}:${currentEpoch}`
        if (typeof localStorage === 'undefined' || localStorage.getItem(distributionMarker) !== '1') throw new Error('megolm_distribution_olm_requise')
        const data = JSON.parse(stored.pickle) as { pickle: string; pickleKey: string }
        const session = new olm.OutboundGroupSession()
        try {
          session.unpickle(data.pickleKey, data.pickle)
          if (session.message_index() >= ROTATE_AFTER_MESSAGES || Date.now() - stored.record.createdAt >= ROTATE_AFTER_MS) {
            throw new Error('megolm_rotation_requise_distribution_olm')
          }
          const ciphertext = session.encrypt(plaintext)
          const nextPickle = JSON.stringify({ pickle: session.pickle(data.pickleKey), pickleKey: data.pickleKey })
          await saveSession(db, ownerAgentId, outId(ownerAgentId, groupId), 'outbound', groupId, session.session_id(), nextPickle, session.message_index(), stored.record.createdAt, stored.record.seenIndexes ?? [], stored.record.epoch ?? 0)
          return JSON.stringify({ algorithm: 'm.megolm.v1.aes-sha2', session_id: session.session_id(), ciphertext })
        } finally { session.free() }
      } finally { db.close() }
    })
  },

  async decryptMessage(ownerAgentId: string, payload: string, groupId: string, expectedEpoch?: number): Promise<string> {
    return withCryptoLock(`megolm-group:${ownerAgentId}:${groupId}`, async () => {
      await this.init()
      const envelope = JSON.parse(payload) as { algorithm?: string; session_id?: string; ciphertext?: string }
      if (envelope.algorithm !== 'm.megolm.v1.aes-sha2' || !envelope.session_id || !envelope.ciphertext) throw new Error('megolm_payload_invalide')
      const db = await openDb()
      try {
        const stored = await loadSession(db, inId(ownerAgentId, groupId, envelope.session_id))
        if (!stored) throw new Error('megolm_cle_session_indisponible')
        if (expectedEpoch !== undefined && (stored.record.epoch ?? 0) !== expectedEpoch) throw new Error('megolm_epoch_perime')
        const data = JSON.parse(stored.pickle) as { pickle: string; pickleKey: string }
        const session = new olm.InboundGroupSession()
        try {
          session.unpickle(data.pickleKey, data.pickle)
          const result = session.decrypt(envelope.ciphertext)
          const seenIndexes = stored.record.seenIndexes ?? []
          if (seenIndexes.includes(result.message_index)) throw new Error('megolm_rejeu')
          const nextSeen = [...seenIndexes, result.message_index].slice(-ROTATE_AFTER_MESSAGES)
          const nextPickle = JSON.stringify({ pickle: session.pickle(data.pickleKey), pickleKey: data.pickleKey })
          await saveSession(db, ownerAgentId, inId(ownerAgentId, groupId, envelope.session_id), 'inbound', groupId, envelope.session_id, nextPickle, Math.max(stored.record.messageIndex, result.message_index), stored.record.createdAt, nextSeen, stored.record.epoch ?? 0)
          return result.plaintext
        } finally { session.free() }
      } finally { db.close() }
    })
  },

  async rotateGroupSession(ownerAgentId: string, groupId: string, epoch = 0): Promise<{ sessionId: string }> {
    return withCryptoLock(`megolm-group:${ownerAgentId}:${groupId}`, async () => {
      await this.init()
      const db = await openDb()
      try { await removeSession(db, outId(ownerAgentId, groupId)) }
      finally { db.close() }
      return createGroupUnlocked(ownerAgentId, groupId, epoch)
    })
  },

  async hasOutboundSession(ownerAgentId: string, groupId: string, expectedEpoch?: number): Promise<boolean> {
    await this.init()
    const db = await openDb()
    try {
      const stored = await loadSession(db, outId(ownerAgentId, groupId))
      return !!stored && (expectedEpoch === undefined || (stored.record.epoch ?? 0) === expectedEpoch)
    } finally { db.close() }
  },

  async needsRotation(ownerAgentId: string, groupId: string, expectedEpoch?: number): Promise<boolean> {
    await this.init()
    const db = await openDb()
    try {
      const stored = await loadSession(db, outId(ownerAgentId, groupId))
      if (!stored) return true
      if (expectedEpoch !== undefined && (stored.record.epoch ?? 0) !== expectedEpoch) return true
      const data = JSON.parse(stored.pickle) as { pickle: string; pickleKey: string }
      const session = new olm.OutboundGroupSession()
      try {
        session.unpickle(data.pickleKey, data.pickle)
        return session.message_index() >= ROTATE_AFTER_MESSAGES || Date.now() - stored.record.createdAt >= ROTATE_AFTER_MS
      } finally { session.free() }
    } finally { db.close() }
  },

  // Pièces jointes : AES-GCM par fichier, clé à transporter dans un message Megolm.
  async generateFileKey(): Promise<{ key: CryptoKey; rawBase64: string }> {
    if (!globalThis.crypto?.subtle) throw new Error('webcrypto_indisponible')
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key))
    return { key, rawBase64: b64(raw) }
  },
  async importFileKey(rawBase64: string): Promise<CryptoKey> {
    return crypto.subtle.importKey('raw', unb64(rawBase64) as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt'])
  },
  async encryptBytes(bytes: Uint8Array, key: CryptoKey): Promise<Blob> {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes as BufferSource))
    const out = new Uint8Array(12 + encrypted.length); out.set(iv); out.set(encrypted, 12)
    return new Blob([out], { type: 'application/octet-stream' })
  },
  async decryptBytes(blob: Blob, key: CryptoKey): Promise<Uint8Array> {
    const data = new Uint8Array(await blob.arrayBuffer())
    if (data.length < 29) throw new Error('piece_jointe_chiffree_invalide')
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.slice(0, 12) as BufferSource }, key, data.slice(12)))
  },
}
