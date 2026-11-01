import { defineStore } from 'pinia'
import { ref } from 'vue'
import { localDB } from '../db'

interface Message {
  id: number
  chatId: string
  sender: string
  content: string
  time: string
  sent: boolean
  timestamp: number
}

export const useChatStore = defineStore('chat', () => {
  const messages = ref<Message[]>([
    { id: 1, chatId: 'goama-main', sender: 'Gérard (Backend)', content: 'Les endpoints d’enrôlement et de distribution des KeyPackages MLS sont prêts.', time: '10:40', sent: false, timestamp: Date.now() - 120000 },
    { id: 2, chatId: 'goama-main', sender: 'Agent', content: 'Parfait, l’interface Vue 3 / TypeScript est opérationnelle.', time: '10:42', sent: true, timestamp: Date.now() - 60000 }
  ])
  const activeChatId = ref<string>('goama-main')

  // Charger les messages depuis IndexedDB
  async function loadMessages() {
    try {
      const stored = await localDB.getMessagesByChat(activeChatId.value)
      if (stored && stored.length > 0) {
        messages.value = stored
      }
    } catch (err) {
      console.error("Erreur chargement messages IndexedDB", err)
    }
  }

  // Envoyer et sauvegarder un message
  async function sendMessage(content: string, senderName: string = 'Agent (Moi)') {
    if (!content.trim()) return

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const msgObj: Message = {
      id: Date.now(),
      chatId: activeChatId.value,
      sender: senderName,
      content,
      time: timeStr,
      sent: true,
      timestamp: Date.now()
    }

    try {
      await localDB.saveMessage(msgObj)
      messages.value.push(msgObj)
    } catch (err) {
      console.error("Erreur sauvegarde message", err)
    }
  }

  // Purge totale (Protocole Panique)
  async function clearAllData() {
    try {
      await localDB.purgeAll()
      messages.value = []
    } catch (err) {
      console.error("Erreur lors de la purge", err)
    }
  }

  return {
    messages,
    activeChatId,
    loadMessages,
    sendMessage,
    clearAllData
  }
})