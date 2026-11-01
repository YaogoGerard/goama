const DB_NAME = 'GoamaCryptoDB'
const DB_VERSION = 1
const STORE_KEYS = 'groupKeys'

type KeyRecord = {
  groupId: string
  key: CryptoKey
}

function openKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_KEYS, { keyPath: 'groupId' })
    }
  })
}

async function loadOrCreateKey(groupId: string): Promise<CryptoKey> {
  const db = await openKeyDb()
  const existing = await new Promise<KeyRecord | undefined>((resolve, reject) => {
    const request = db.transaction(STORE_KEYS, 'readonly').objectStore(STORE_KEYS).get(groupId)
    request.onsuccess = () => resolve(request.result as KeyRecord | undefined)
    request.onerror = () => reject(request.error)
  })
  if (existing?.key) return existing.key

  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE_KEYS, 'readwrite').objectStore(STORE_KEYS).put({ groupId, key } satisfies KeyRecord)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
  return key
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

export const mlsService = {
  async init(): Promise<void> {
    if (!globalThis.crypto?.subtle || !globalThis.indexedDB) {
      throw new Error('Web Crypto et IndexedDB sont nécessaires pour la messagerie.')
    }
  },

  async generateKeyPackage(): Promise<string> {
    throw new Error('Les KeyPackages MLS nécessitent le module OpenMLS WASM.')
  },

  async encryptMessage(plainText: string, groupId: string): Promise<string> {
    await this.init()
    const key = await loadOrCreateKey(groupId)
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encoded = new TextEncoder().encode(plainText)
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded))
    return `v1.${toBase64(iv)}.${toBase64(ciphertext)}`
  },

  async decryptMessage(payload: string, groupId: string): Promise<string> {
    await this.init()
    const [version, ivValue, ciphertextValue] = payload.split('.')
    if (version !== 'v1' || !ivValue || !ciphertextValue) throw new Error('message_chiffre_invalide')
    const key = await loadOrCreateKey(groupId)
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(ivValue) as BufferSource },
      key,
      fromBase64(ciphertextValue) as BufferSource,
    )
    return new TextDecoder().decode(plaintext)
  },

  async resetCryptoContext(): Promise<void> {
    await this.init()
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      request.onblocked = () => resolve()
    })
  },
}
