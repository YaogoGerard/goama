// Gestionnaire IndexedDB sécurisé et chiffré pour Goama
import { mlsService } from '../crypto/mls'

const DB_NAME = 'GoamaSecureDB'
const DB_VERSION = 1
const STORE_MESSAGES = 'messages'

export const localDB = {
  // Initialisation de la base de données IndexedDB
  openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
          const store = db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' })
          store.createIndex('chatId', 'chatId', { unique: false })
          store.createIndex('timestamp', 'timestamp', { unique: false })
        }
      }
    })
  },

  // Sauvegarder un message avec chiffrement local du contenu
  async saveMessage(message: { id: number; chatId: string; sender: string; content: string; time: string; sent: boolean; timestamp: number }): Promise<void> {
    const db = await this.openDB()
    
    // Chiffrement du contenu avant le stockage persistant local
    const encryptedContent = await mlsService.encryptMessage(message.content, message.chatId)
    const secureMessage = { ...message, content: encryptedContent }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_MESSAGES, 'readwrite')
      const store = transaction.objectStore(STORE_MESSAGES)
      const request = store.put(secureMessage)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  },

  // Récupérer et déchiffrer les messages d'une conversation spécifique
  async getMessagesByChat(chatId: string): Promise<any[]> {
    const db = await this.openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_MESSAGES, 'readonly')
      const store = transaction.objectStore(STORE_MESSAGES)
      const index = store.index('chatId')
      const request = index.getAll(chatId)

      request.onsuccess = async () => {
        const results = request.result || []
        results.sort((a, b) => a.timestamp - b.timestamp)

        // Déchiffrement de chaque message à la volée lors de la lecture
        const decryptedResults = []
        for (const msg of results) {
          const plainContent = await mlsService.decryptMessage(msg.content, msg.chatId)
          decryptedResults.push({ ...msg, content: plainContent })
        }

        resolve(decryptedResults)
      }
      request.onerror = () => reject(request.error)
    })
  },

  // Protocole Panique (Zéro-Trace) : Purge totale d'IndexedDB et des clés crypto
  async purgeAll(): Promise<void> {
    await mlsService.resetCryptoContext()
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      request.onblocked = () => resolve()
    })
  }
}