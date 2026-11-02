/**
 * Olm pairwise transport for Goama (one active device per agent).
 *
 * This module stores the Olm account and sessions locally, publishes only
 * signed public identity/one-time keys, and encrypts Megolm room-key payloads
 * separately for each recipient. The API never receives a Megolm key in clear.
 *
 * Trust model: first-seen identity keys are pinned locally (TOFU). A key change
 * is rejected and requires an explicit out-of-band identity re-verification.
 */
import { olmRuntime, ensureOlmRuntime } from './olm-runtime'
import { withCryptoLock } from './locks'

interface OlmAccount {
  create(): void
  identity_keys(): string
  generate_one_time_keys(count: number): void
  one_time_keys(): string
  mark_keys_as_published(): void
  sign(message: string): string
  remove_one_time_keys(session: OlmSession): void
  pickle(key: string): string
  unpickle(key: string, pickle: string): void
  free(): void
}
interface OlmSession {
  create_outbound(account: OlmAccount, identityKey: string, oneTimeKey: string): void
  create_inbound(account: OlmAccount, message: string): void
  create_inbound_from(account: OlmAccount, identityKey: string, message: string): void
  encrypt(plaintext: string): { type: number; body: string }
  decrypt(type: number, body: string): string
  session_id(): string
  pickle(key: string): string
  unpickle(key: string, pickle: string): void
  free(): void
}
interface OlmUtility {
  ed25519_verify(key: string, message: string, signature: string): void
  free(): void
}
interface OlmApi {
  init(options?: { locateFile?: (path: string) => string }): Promise<void>
  Account: new () => OlmAccount
  Session: new () => OlmSession
  Utility: new () => OlmUtility
}

const olm = olmRuntime as unknown as OlmApi
const DB_NAME = 'goama-crypto-v2'
const DB_VERSION = 2
const MEGOLM_STORE = 'megolm-sessions'
const ACCOUNT_STORE = 'olm-state'
const SESSION_STORE = 'olm-sessions'
const TRUST_STORE = 'trusted-identities'
const encoder = new TextEncoder()
const decoder = new TextDecoder()

export interface OlmOneTimeKey {
  keyId: string
  key: string
  signature: string
}
export interface OlmDeviceBundle {
  agentId: string
  deviceKeys: {
    device_id: string
    algorithms: string[]
    keys: Record<string, string>
  }
  deviceSignature: string
  oneTimeKey?: OlmOneTimeKey | null
}
export interface OlmPublishedBundle {
  deviceKeys: OlmDeviceBundle['deviceKeys']
  deviceSignature: string
  oneTimeKeys: OlmOneTimeKey[]
}
export interface OlmMemberBundle {
  agentId: string
  deviceKeys: OlmDeviceBundle['deviceKeys'] | null
  deviceSignature: string | null
  oneTimeKey: OlmOneTimeKey | null
}

interface StoredCiphertext {
  id: string
  iv: number[]
  ciphertext: number[]
}
interface StoredOlmSession extends StoredCiphertext {
  ownerAgentId: string
  remoteKey: string
  sessionId: string
  updatedAt: number
  pendingEnvelopeIv?: number[]
  pendingEnvelopeCiphertext?: number[]
  pendingPlaintextHash?: string
}
interface StoredTrustedIdentity {
  id: string
  ownerAgentId: string
  agentId: string
  curve25519: string
  ed25519: string
  pinnedAt: number
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const object = value as Record<string, unknown>
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`
}
function bytesToBase64(bytes: Uint8Array): string {
  let raw = ''
  for (let i = 0; i < bytes.length; i += 0x8000) raw += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(raw)
}
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(MEGOLM_STORE)) db.createObjectStore(MEGOLM_STORE, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(ACCOUNT_STORE)) db.createObjectStore(ACCOUNT_STORE, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(SESSION_STORE)) db.createObjectStore(SESSION_STORE, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(TRUST_STORE)) db.createObjectStore(TRUST_STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result) }
    request.onerror = () => reject(request.error ?? new Error('olm_db_open_failed'))
    request.onblocked = () => reject(new Error('olm_db_upgrade_bloque'))
  })
}
function requestResult<T>(db: IDBDatabase, storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const request = action(tx.objectStore(storeName))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('olm_db_request_failed'))
    tx.onabort = () => reject(tx.error ?? new Error('olm_db_transaction_aborted'))
  })
}
async function storageKey(db: IDBDatabase): Promise<CryptoKey> {
  const found = await requestResult<unknown>(db, MEGOLM_STORE, 'readonly', (store) => store.get('__storage_key__')) as { key?: CryptoKey } | undefined
  if (found?.key) return found.key
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  await requestResult(db, MEGOLM_STORE, 'readwrite', (store) => store.put({ id: '__storage_key__', key }))
  return key
}
async function seal(db: IDBDatabase, storeName: string, id: string, plaintext: string, extra: Record<string, unknown> = {}): Promise<void> {
  const key = await storageKey(db)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext)))
  await requestResult(db, storeName, 'readwrite', (store) => store.put({ id, iv: [...iv], ciphertext: [...ciphertext], ...extra }))
}
async function unseal(db: IDBDatabase, record: StoredCiphertext): Promise<string> {
  const key = await storageKey(db)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(record.iv) }, key, new Uint8Array(record.ciphertext))
  return decoder.decode(plaintext)
}
async function ensureInit(): Promise<void> { await ensureOlmRuntime() }
function accountId(agentId: string): string { return `account:${agentId}` }

function withPairLock<T>(key: string, action: () => Promise<T>): Promise<T> {
  return withCryptoLock(`olm-pair:${key}`, action)
}

async function withAccountUnlocked<T>(agentId: string, action: (account: OlmAccount, db: IDBDatabase) => Promise<T>): Promise<T> {
  await ensureInit()
  if (!globalThis.crypto?.subtle || typeof indexedDB === 'undefined') throw new Error('olm_stockage_local_indisponible')
  const db = await openDb()
  let account: OlmAccount | null = null
  try {
    account = new olm.Account()
    const record = await requestResult<StoredCiphertext | undefined>(db, ACCOUNT_STORE, 'readonly', (store) => store.get(accountId(agentId)))
    if (record) {
      const serialized = JSON.parse(await unseal(db, record)) as { pickle: string; pickleKey: string }
      account.unpickle(serialized.pickleKey, serialized.pickle)
    } else {
      account.create()
    }
    const result = await action(account, db)
    const pickleKey = bytesToBase64(crypto.getRandomValues(new Uint8Array(32)))
    const pickle = account.pickle(pickleKey)
    await seal(db, ACCOUNT_STORE, accountId(agentId), JSON.stringify({ pickle, pickleKey }))
    return result
  } finally {
    account?.free()
    db.close()
  }
}

function withAccount<T>(agentId: string, action: (account: OlmAccount, db: IDBDatabase) => Promise<T>): Promise<T> {
  return withCryptoLock(`olm-account:${agentId}`, () => withAccountUnlocked(agentId, action))
}

async function saveSession(db: IDBDatabase, ownerAgentId: string, remoteKey: string, session: OlmSession, pending?: { envelope: string; plaintextHash: string }): Promise<void> {
  const sessionId = session.session_id()
  const pickleKey = bytesToBase64(crypto.getRandomValues(new Uint8Array(32)))
  const pickle = session.pickle(pickleKey)
  const id = `${ownerAgentId}:${remoteKey}:${sessionId}`
  const previous = await requestResult<StoredOlmSession | undefined>(db, SESSION_STORE, 'readonly', (store) => store.get(id))
  let pendingEnvelopeIv = previous?.pendingEnvelopeIv
  let pendingEnvelopeCiphertext = previous?.pendingEnvelopeCiphertext
  let pendingPlaintextHash = previous?.pendingPlaintextHash
  if (pending) {
    const key = await storageKey(db)
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(pending.envelope)))
    pendingEnvelopeIv = [...iv]
    pendingEnvelopeCiphertext = [...encrypted]
    pendingPlaintextHash = pending.plaintextHash
  }
  await seal(db, SESSION_STORE, id, JSON.stringify({ pickle, pickleKey }), {
    ownerAgentId, remoteKey, sessionId, updatedAt: Date.now(), pendingEnvelopeIv, pendingEnvelopeCiphertext, pendingPlaintextHash,
  })
}
async function hashPlaintext(value: string): Promise<string> {
  return bytesToBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))))
}
async function readPendingEnvelope(db: IDBDatabase, record: StoredOlmSession): Promise<string> {
  if (!record.pendingEnvelopeIv || !record.pendingEnvelopeCiphertext) throw new Error('olm_envoi_en_attente_absent')
  const key = await storageKey(db)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(record.pendingEnvelopeIv) }, key, new Uint8Array(record.pendingEnvelopeCiphertext))
  return decoder.decode(plaintext)
}
async function loadSessions(db: IDBDatabase, ownerAgentId: string, remoteKey: string): Promise<{ record: StoredOlmSession; session: OlmSession }[]> {
  const records = await requestResult<StoredOlmSession[]>(db, SESSION_STORE, 'readonly', (store) => store.getAll())
  const output: { record: StoredOlmSession; session: OlmSession }[] = []
  for (const record of records.filter((item) => item.ownerAgentId === ownerAgentId && item.remoteKey === remoteKey).sort((a, b) => b.updatedAt - a.updatedAt)) {
    const serialized = JSON.parse(await unseal(db, record)) as { pickle: string; pickleKey: string }
    const session = new olm.Session()
    try {
      session.unpickle(serialized.pickleKey, serialized.pickle)
      output.push({ record, session })
    } catch (error) {
      session.free()
      throw error
    }
  }
  return output
}

function validateIdentity(bundle: OlmDeviceBundle): { curve25519: string; ed25519: string } {
  const curve25519 = bundle.deviceKeys.keys[`curve25519:${bundle.deviceKeys.device_id}`]
  const ed25519 = bundle.deviceKeys.keys[`ed25519:${bundle.deviceKeys.device_id}`]
  if (!curve25519 || !ed25519 || !/^[A-Za-z0-9+/]{43}=?$/.test(curve25519) || !/^[A-Za-z0-9+/]{43}=?$/.test(ed25519) || !bundle.deviceSignature || bundle.deviceKeys.device_id !== bundle.agentId || !bundle.deviceKeys.algorithms.includes('m.olm.v1.curve25519-aes-sha2') || !bundle.deviceKeys.algorithms.includes('m.megolm.v1.aes-sha2')) throw new Error('olm_identite_invalide')
  const utility = new olm.Utility()
  try { utility.ed25519_verify(ed25519, canonicalJson(bundle.deviceKeys), bundle.deviceSignature) }
  finally { utility.free() }
  return { curve25519, ed25519 }
}
function verifyOneTimeKey(ed25519: string, oneTimeKey: OlmOneTimeKey): void {
  if (!oneTimeKey.key || !/^[A-Za-z0-9+/]{43}=?$/.test(oneTimeKey.key) || !oneTimeKey.keyId || !oneTimeKey.signature) throw new Error('olm_precle_invalide')
  const utility = new olm.Utility()
  try { utility.ed25519_verify(ed25519, canonicalJson({ key: oneTimeKey.key }), oneTimeKey.signature) }
  finally { utility.free() }
}

export const olmService = {
  async init(): Promise<void> { await ensureInit(); const db = await openDb(); db.close() },

  async hasLocalAccount(agentId: string): Promise<boolean> {
    await ensureInit()
    const db = await openDb()
    try {
      return !!await requestResult<StoredCiphertext | undefined>(db, ACCOUNT_STORE, 'readonly', (store) => store.get(accountId(agentId)))
    } finally { db.close() }
  },

  /** Creates/loads the local account and returns a signed public bundle. */
  async preparePublishedBundle(agentId: string, replenishOneTimeKeys = true): Promise<OlmPublishedBundle> {
    return withAccount(agentId, async (account) => {
      const identity = JSON.parse(account.identity_keys()) as { curve25519: string; ed25519: string }
      const deviceKeys = {
        device_id: agentId,
        algorithms: ['m.olm.v1.curve25519-aes-sha2', 'm.megolm.v1.aes-sha2'],
        keys: { [`curve25519:${agentId}`]: identity.curve25519, [`ed25519:${agentId}`]: identity.ed25519 },
      }
      const deviceSignature = account.sign(canonicalJson(deviceKeys))
      const unpublished = JSON.parse(account.one_time_keys()) as { curve25519?: Record<string, string> }
      const pending = Object.entries(unpublished.curve25519 ?? {})
      if (replenishOneTimeKeys && pending.length < 10) account.generate_one_time_keys(20 - pending.length)
      const fresh = JSON.parse(account.one_time_keys()) as { curve25519?: Record<string, string> }
      const oneTimeKeys = Object.entries(fresh.curve25519 ?? {}).map(([keyId, key]) => ({
        keyId,
        key,
        signature: account.sign(canonicalJson({ key })),
      }))
      return { deviceKeys, deviceSignature, oneTimeKeys }
    })
  },

  /** Mark locally-generated one-time keys as published only after API success. */
  async markPublished(agentId: string): Promise<void> {
    await withAccount(agentId, async (account) => { account.mark_keys_as_published() })
  },

  async getLocalIdentity(agentId: string): Promise<{ curve25519: string; ed25519: string }> {
    return withAccount(agentId, async (account) => JSON.parse(account.identity_keys()) as { curve25519: string; ed25519: string })
  },

  /** TOFU pin. A changed key is rejected; never silently re-pin. */
  async verifyAndPinRemote(ownerAgentId: string, bundle: OlmDeviceBundle): Promise<{ curve25519: string; ed25519: string }> {
    const identity = validateIdentity(bundle)
    const db = await openDb()
    try {
      const trustId = `trusted:${ownerAgentId}:${bundle.agentId}`
      const previous = await requestResult<StoredTrustedIdentity | undefined>(db, TRUST_STORE, 'readonly', (store) => store.get(trustId))
      if (previous && (previous.curve25519 !== identity.curve25519 || previous.ed25519 !== identity.ed25519)) {
        throw new Error('olm_identite_modifiee_verification_hors_bande_requise')
      }
      if (!previous) await requestResult(db, TRUST_STORE, 'readwrite', (store) => store.put({ id: trustId, ownerAgentId, agentId: bundle.agentId, ...identity, pinnedAt: Date.now() } satisfies StoredTrustedIdentity))
      return identity
    } finally { db.close() }
  },

  async hasSession(agentId: string, remoteCurve25519: string): Promise<boolean> {
    const db = await openDb()
    try {
      const sessions = await loadSessions(db, agentId, remoteCurve25519)
      const found = sessions.length > 0
      sessions.forEach(({ session }) => session.free())
      return found
    } finally { db.close() }
  },

  /** Encrypt to one agent. Creates an Olm pre-key session only when required. */
  async encryptToAgent(agentId: string, remoteBundle: OlmDeviceBundle, plaintext: string): Promise<{ sender_key: string; ciphertext: Record<string, { type: number; body: string }>; sessionId: string }> {
    const remote = await this.verifyAndPinRemote(agentId, remoteBundle)
    return withPairLock(`${agentId}:${remote.curve25519}`, async () => {
      const oneTimeKey = remoteBundle.oneTimeKey
      const db = await openDb()
      try {
      const existing = await loadSessions(db, agentId, remote.curve25519)
      const wantedHash = await hashPlaintext(plaintext)
      const pendingItem = existing.find((item) => item.record.pendingEnvelopeIv && item.record.pendingEnvelopeCiphertext)
      if (pendingItem) {
        const pending = JSON.parse(await readPendingEnvelope(db, pendingItem.record)) as {
          sender_key: string; ciphertext: Record<string, { type: number; body: string }>
        }
        if (pendingItem.record.pendingPlaintextHash !== wantedHash) {
          existing.forEach(({ session }) => session.free())
          throw new Error('olm_envoi_en_attente_autre_payload')
        }
        const sessionId = pendingItem.record.sessionId
        existing.forEach(({ session }) => session.free())
        return { ...pending, sessionId }
      }

      let session: OlmSession
      if (existing.length) {
        session = existing[0].session
        existing.slice(1).forEach(({ session: stale }) => stale.free())
      } else {
        if (!oneTimeKey) throw new Error('olm_precle_indisponible')
        verifyOneTimeKey(remote.ed25519, oneTimeKey)
        session = await withAccount(agentId, async (account) => {
          const created = new olm.Session()
          created.create_outbound(account, remote.curve25519, oneTimeKey.key)
          return created
        })
      }
      try {
        const encrypted = session.encrypt(plaintext)
        const local = await this.getLocalIdentity(agentId)
        const envelope = { sender_key: local.curve25519, ciphertext: { [remote.curve25519]: encrypted } }
        await saveSession(db, agentId, remote.curve25519, session, { envelope: JSON.stringify(envelope), plaintextHash: wantedHash })
        return { ...envelope, sessionId: session.session_id() }
      } finally { session.free() }
      } finally { db.close() }
    })
  },

  /** Clear the persisted retry envelope only after the backend confirms storage. */
  async acknowledgeOutbound(agentId: string, remoteCurve25519: string, sessionId: string): Promise<void> {
    return withPairLock(`${agentId}:${remoteCurve25519}`, async () => {
      const db = await openDb()
      try {
        const id = `${agentId}:${remoteCurve25519}:${sessionId}`
        const record = await requestResult<StoredOlmSession | undefined>(db, SESSION_STORE, 'readonly', (store) => store.get(id))
        if (!record) return
        delete record.pendingEnvelopeIv
        delete record.pendingEnvelopeCiphertext
        delete record.pendingPlaintextHash
        await requestResult(db, SESSION_STORE, 'readwrite', (store) => store.put(record))
      } finally { db.close() }
    })
  },

  /** Decrypt an Olm message and persist the ratchet/session state. */
  async decryptFromAgent(agentId: string, senderCurve25519: string, messageType: number, body: string, processingId: string): Promise<string> {
    return withPairLock(`${agentId}:${senderCurve25519}`, async () => {
      const db = await openDb()
      const pendingId = `pending-in:${agentId}:${processingId}`
      try {
      const pending = await requestResult<StoredCiphertext | undefined>(db, ACCOUNT_STORE, 'readonly', (store) => store.get(pendingId))
      if (pending) return await unseal(db, pending)

      const existing = await loadSessions(db, agentId, senderCurve25519)
      for (const item of existing) {
        try {
          const plaintext = item.session.decrypt(messageType, body)
          await saveSession(db, agentId, senderCurve25519, item.session)
          await seal(db, ACCOUNT_STORE, pendingId, plaintext)
          existing.filter((candidate) => candidate !== item).forEach(({ session }) => session.free())
          item.session.free()
          return plaintext
        } catch {
          // Essayer la session suivante avant d'en créer une nouvelle.
        }
      }
      existing.forEach(({ session }) => session.free())
      if (messageType !== 0) throw new Error('olm_session_inconnue')

      return await withAccount(agentId, async (account) => {
        const inbound = new olm.Session()
        try {
          // La variante *_from lie explicitement le message pré-clé à
          // l'identité annoncée et remplace remote_identity_key(), qui
          // n'existe pas dans @matrix-org/olm 3.2.15.
          inbound.create_inbound_from(account, senderCurve25519, body)
          const plaintext = inbound.decrypt(messageType, body)
          account.remove_one_time_keys(inbound)
          await saveSession(db, agentId, senderCurve25519, inbound)
          await seal(db, ACCOUNT_STORE, pendingId, plaintext)
          return plaintext
        } finally { inbound.free() }
      })
      } finally { db.close() }
    })
  },

  /** Commit a decrypted room key after Megolm has imported it successfully. */
  async acknowledgeInbound(agentId: string, processingId: string): Promise<void> {
    const db = await openDb()
    try {
      await requestResult(db, ACCOUNT_STORE, 'readwrite', (store) => store.delete(`pending-in:${agentId}:${processingId}`))
    } finally { db.close() }
  },
}
