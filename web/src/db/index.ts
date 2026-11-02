// Cache local : le contenu complet est chiffré avec une clé propre à l'appareil.
// Cette clé locale est distincte des sessions Megolm pour ne jamais consommer
// le ratchet lors d'une simple écriture/lecture du cache.
const DB_NAME = 'GoamaSecureDB'
const DB_VERSION = 2
const STORE_MESSAGES = 'messages'
const STORE_KEYS = 'localKeys'
const LOCAL_KEY_ID = 'message-cache-v1'

interface StoredMessage {
  id: number
  chatId: string
  ownerAgentId?: string
  timestamp: number
  iv: ArrayBuffer
  ciphertext: ArrayBuffer
}

let localKeyPromise: Promise<CryptoKey> | null = null

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        const store = db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' })
        store.createIndex('chatId', 'chatId', { unique: false })
        store.createIndex('timestamp', 'timestamp', { unique: false })
      }
      if (!db.objectStoreNames.contains(STORE_KEYS)) {
        db.createObjectStore(STORE_KEYS, { keyPath: 'id' })
      }
    }
  })
}

async function getLocalKey(): Promise<CryptoKey> {
  if (localKeyPromise) return localKeyPromise
  localKeyPromise = (async () => {
    const db = await openDB()
    const existing = await new Promise<{ id: string; key: CryptoKey } | undefined>((resolve, reject) => {
      const request = db.transaction(STORE_KEYS, 'readonly').objectStore(STORE_KEYS).get(LOCAL_KEY_ID)
      request.onsuccess = () => resolve(request.result as { id: string; key: CryptoKey } | undefined)
      request.onerror = () => reject(request.error)
    })
    if (existing?.key) return existing.key

    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_KEYS, 'readwrite')
      transaction.objectStore(STORE_KEYS).put({ id: LOCAL_KEY_ID, key })
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error ?? new Error('creation_cle_locale_interrompue'))
    })
    return key
  })().catch((error: unknown) => {
    localKeyPromise = null
    throw error
  })
  return localKeyPromise
}

export const localDB = {
  async openDB(): Promise<IDBDatabase> {
    return openDB()
  },

  // Chiffre toutes les métadonnées sensibles, y compris la clé de fichier,
  // le nom de la pièce jointe et le contenu d'une réponse citée.
  async saveMessage<T extends { id: number; chatId: string; timestamp: number }>(message: T): Promise<void> {
    const db = await openDB()
    const key = await getLocalKey()
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const plaintext = new TextEncoder().encode(JSON.stringify(message))
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
    const stored: StoredMessage = {
      id: message.id,
      chatId: message.chatId,
      ownerAgentId: (message as T & { ownerAgentId?: string }).ownerAgentId,
      timestamp: message.timestamp,
      iv: iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength),
      ciphertext
    }

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_MESSAGES, 'readwrite')
      transaction.objectStore(STORE_MESSAGES).put(stored)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error ?? new Error('ecriture_locale_interrompue'))
    })
  },

  async getMessagesByChat(chatId: string, ownerAgentId?: string): Promise<any[]> {
    const db = await openDB()
    const records = await new Promise<StoredMessage[]>((resolve, reject) => {
      const request = db.transaction(STORE_MESSAGES, 'readonly').objectStore(STORE_MESSAGES).index('chatId').getAll(chatId)
      request.onsuccess = () => resolve((request.result ?? []) as StoredMessage[])
      request.onerror = () => reject(request.error)
    })
    const scopedRecords = ownerAgentId ? records.filter((record) => record.ownerAgentId === ownerAgentId) : records
    scopedRecords.sort((a, b) => a.timestamp - b.timestamp)
    if (!scopedRecords.length) return []

    const key = await getLocalKey()
    return Promise.all(scopedRecords.map(async (record) => {
      if (!record.iv || !record.ciphertext) {
        // Les anciennes entrées de cache ne sont pas au format chiffré local v2.
        return null
      }
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(record.iv) },
        key,
        record.ciphertext
      )
      return JSON.parse(new TextDecoder().decode(plaintext)) as Record<string, unknown>
    })).then((messages) => messages.filter((message) => message !== null))
  },

  // Efface les messages en cache, la clé locale et les sessions Megolm de cet appareil.
  async purgeAll(): Promise<void> {
    const db = await openDB()
    db.close()
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('purge_locale_bloquee'))
    })
    localKeyPromise = null
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('goama-crypto-v2')
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('purge_crypto_bloquee'))
    })
  }
}
