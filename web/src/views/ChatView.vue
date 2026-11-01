<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { mlsService } from '../crypto/mls'
import { localDB } from '../db'
import { api } from '../services/api'
import logoSrc from '../assets/logo.png'

const router = useRouter()
const authStore = useAuthStore()

interface ChatItem {
  id: string
  name: string
  isGroup: boolean
  lastMessage: string
  time: string
  unreadCount?: number
  classification: 'Diffusion Restreinte' | 'Secret' | 'Normal'
  epoch: number
}

interface Message {
  id: number
  chatId: string
  sender: string
  content: string
  time: string
  sent: boolean
  timestamp: number
}

interface AgentItem {
  id: string
  name: string
  role: string
  ministry: string
  status: string
}

// États de navigation interne
const activeTab = ref<'chats' | 'annuaire' | 'settings'>('chats')
const showMobileChat = ref(false)
const searchQuery = ref('')

// Données des conversations brutes
const conversationsRaw = ref<ChatItem[]>([])

// Annuaire officiel des agents brut
const agentsListRaw = ref<AgentItem[]>([])

// Filtrage dynamique via Computed
const filteredConversations = computed(() => {
  if (!searchQuery.value.trim()) return conversationsRaw.value
  const query = searchQuery.value.toLowerCase()
  return conversationsRaw.value.filter(c => 
    c.name.toLowerCase().includes(query) || c.lastMessage.toLowerCase().includes(query)
  )
})

const filteredAgents = computed(() => {
  if (!searchQuery.value.trim()) return agentsListRaw.value
  const query = searchQuery.value.toLowerCase()
  return agentsListRaw.value.filter(a => 
    a.name.toLowerCase().includes(query) || 
    a.role.toLowerCase().includes(query) || 
    a.ministry.toLowerCase().includes(query)
  )
})

const selectedChat = ref<ChatItem | null>(null)

// Base de messages par discussion en mémoire (synchronisée avec IndexedDB)
const messagesMap = ref<Record<string, Message[]>>({})

const newMessage = ref('')
const messagesFeedRef = ref<HTMLElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

const scrollToBottom = async () => {
  await nextTick()
  if (messagesFeedRef.value) {
    messagesFeedRef.value.scrollTop = messagesFeedRef.value.scrollHeight
  }
}

const selectConversation = async (chat: ChatItem) => {
  selectedChat.value = chat
  chat.unreadCount = 0
  showMobileChat.value = true

  try {
    const remoteMessages = await api.messages(chat.id)
    const decryptedMessages = await Promise.all(remoteMessages
      .filter((message) => message.kind === 'mls_app')
      .map(async (message, index) => ({
        id: index,
        chatId: chat.id,
        sender: message.senderId === authStore.userEmail ? 'Moi' : 'Membre du groupe',
        content: await mlsService.decryptMessage(message.content, chat.id),
        time: new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sent: message.senderId === authStore.userEmail,
        timestamp: new Date(message.createdAt).getTime()
      })))
    messagesMap.value[chat.id] = decryptedMessages
    const dbMessages = await localDB.getMessagesByChat(chat.id)
    if (decryptedMessages.length === 0 && dbMessages && dbMessages.length > 0) {
      messagesMap.value[chat.id] = dbMessages
    }
  } catch (e) {
    console.warn('Utilisation du cache mémoire pour les messages')
  }

  scrollToBottom()
}

const startAgentChat = (agent: AgentItem) => {
  let existing = conversationsRaw.value.find(c => c.name === agent.name)
  if (!existing) {
    existing = {
      id: 'agent-' + agent.id,
      name: agent.name,
      isGroup: false,
      lastMessage: 'Session OpenMLS initialisée.',
      time: 'À l\'instant',
      classification: 'Diffusion Restreinte',
      epoch: 0
    }
    conversationsRaw.value.unshift(existing)
    messagesMap.value[existing.id] = [
      { 
        id: Date.now(), 
        chatId: existing.id,
        sender: agent.name, 
        content: `Sécurisation de la liaison E2EE avec ${agent.role} (${agent.ministry}).`, 
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 
        sent: false,
        timestamp: Date.now() 
      }
    ]
  }
  activeTab.value = 'chats'
  selectConversation(existing)
}

const sendMessage = async () => {
  if (!newMessage.value.trim() || !selectedChat.value) return

  const chatId = selectedChat.value.id
  if (!messagesMap.value[chatId]) {
    messagesMap.value[chatId] = []
  }

  const text = newMessage.value.trim()
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const encryptedPayload = await mlsService.encryptMessage(text, authStore.userEmail || 'agent')
  const decryptedText = await mlsService.decryptMessage(encryptedPayload, chatId)
  await api.sendMessage(chatId, { epoch: selectedChat.value.epoch, kind: 'mls_app', content: encryptedPayload })

  const msgObj: Message = {
    id: Date.now(),
    chatId: chatId,
    sender: 'Moi',
    content: decryptedText,
    time: timeStr,
    sent: true,
    timestamp: Date.now()
  }

  try {
    await localDB.saveMessage(msgObj)
  } catch (err) {
    console.error('Erreur de sauvegarde IndexedDB :', err)
  }

  messagesMap.value[chatId].push(msgObj)
  selectedChat.value.lastMessage = text
  selectedChat.value.time = timeStr

  newMessage.value = ''
  scrollToBottom()
}

const triggerFileInput = () => {
  fileInputRef.value?.click()
}

const handleFileUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement
  if (!target.files || target.files.length === 0 || !selectedChat.value) return

  const file = target.files[0]
  const chatId = selectedChat.value.id
  if (!messagesMap.value[chatId]) {
    messagesMap.value[chatId] = []
  }

  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const attachmentText = `📎 [Pièce jointe sécurisée] ${file.name} (${Math.round(file.size / 1024)} Ko)`

  const encryptedPayload = await mlsService.encryptMessage(attachmentText, authStore.userEmail || 'agent')
  const decryptedText = await mlsService.decryptMessage(encryptedPayload, chatId)

  const msgObj: Message = {
    id: Date.now(),
    chatId: chatId,
    sender: 'Moi',
    content: decryptedText,
    time: timeStr,
    sent: true,
    timestamp: Date.now()
  }

  try {
    await localDB.saveMessage(msgObj)
  } catch (err) {
    console.error('Erreur sauvegarde IndexedDB du fichier :', err)
  }

  messagesMap.value[chatId].push(msgObj)
  selectedChat.value.lastMessage = `Pièce jointe : ${file.name}`
  selectedChat.value.time = timeStr

  scrollToBottom()
  target.value = ''
}

const handleLogout = () => {
  void api.logout().catch(() => undefined)
  authStore.logout()
  router.push('/')
}

const loadWorkspace = async () => {
  try {
    const [groups, agents] = await Promise.all([api.groups(), api.agents()])
    conversationsRaw.value = groups.map((group, index) => ({
      id: group.id,
      name: `Groupe ${index + 1}`,
      isGroup: true,
      lastMessage: 'Aucun message récent',
      time: '',
      classification: 'Normal',
      epoch: group.epoch
    }))
    agentsListRaw.value = agents.map((agent) => ({
      id: agent.id,
      name: `${agent.prenom} ${agent.nom}`,
      role: agent.fonction,
      ministry: agent.ministere,
      status: 'Disponible'
    }))
    selectedChat.value = conversationsRaw.value[0] ?? null
  } catch {
    errorMessage.value = 'Impossible de charger votre espace de messagerie.'
  }
}

const triggerPanicWipe = async () => {
  if (confirm("⚠️ ALERTE SÉCURITÉ : Voulez-vous déclencher le nettoyage cryptographique d'urgence et détruire toutes les sessions locales ?")) {
    localStorage.clear()
    sessionStorage.clear()
    try {
      await localDB.purgeAll()
    } catch (e) {
      console.error("Erreur lors de la purge d'IndexedDB", e)
    }
    router.replace('/')
  }
}

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'x') {
    triggerPanicWipe()
  }
})

watch(selectedChat, () => {
  scrollToBottom()
})

const errorMessage = ref('')
onMounted(loadWorkspace)
</script>

<template>
  <div class="app-layout">
    <aside class="sidebar-nav">
      <div 
        class="brand-logo" 
        @dblclick="triggerPanicWipe" 
        title="Goama - Double-clic pour le Protocole Panique (Zéro-Trace)"
      >
        <img :src="logoSrc" alt="Logo Goama" class="sidebar-logo-img" />
      </div>
      <nav class="nav-items">
        <button 
          :class="{ active: activeTab === 'chats' }" 
          @click="activeTab = 'chats'" 
          title="Discussions"
        >
          💬
        </button>
        <button 
          :class="{ active: activeTab === 'annuaire' }" 
          @click="activeTab = 'annuaire'" 
          title="Annuaire officiel"
        >
          👥
        </button>
        <button 
          :class="{ active: activeTab === 'settings' }" 
          @click="activeTab = 'settings'" 
          title="Paramètres de sécurité"
        >
          ⚙️
        </button>
      </nav>
      <div class="nav-footer">
        <button class="logout-btn" @click="handleLogout" title="Déconnexion">
          🚪
        </button>
      </div>
    </aside>

    <section class="panel-list" :class="{ 'hide-mobile': showMobileChat }">
      <header class="panel-header">
        <h3>
          {{ activeTab === 'chats' ? 'Messagerie' : activeTab === 'annuaire' ? 'Annuaire Sécurisé' : 'Paramètres' }}
        </h3>
        <span class="badge-e2ee">
          {{ activeTab === 'chats' ? 'E2EE OpenMLS' : activeTab === 'annuaire' ? 'État' : 'Sécurité' }}
        </span>
      </header>

      <div class="search-bar" v-if="activeTab !== 'settings'">
        <input 
          type="text" 
          v-model="searchQuery" 
          :placeholder="activeTab === 'chats' ? 'Rechercher une discussion...' : 'Rechercher un agent...'" 
        />
      </div>

      <!-- Onglet Discussions -->
      <div class="conversation-items" v-if="activeTab === 'chats'">
        <div 
          v-for="chat in filteredConversations" 
          :key="chat.id"
          class="conversation-card"
          :class="{ active: selectedChat?.id === chat.id }"
          @click="selectConversation(chat)"
        >
          <div class="avatar">{{ chat.name.substring(0, 2).toUpperCase() }}</div>
          <div class="info">
            <div class="top-row">
              <span class="title">{{ chat.name }}</span>
              <span class="time">{{ chat.time }}</span>
            </div>
            <div class="bottom-row">
              <p class="preview">{{ chat.lastMessage }}</p>
              <span v-if="chat.unreadCount" class="unread-badge">{{ chat.unreadCount }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Onglet Annuaire des agents -->
      <div class="conversation-items" v-else-if="activeTab === 'annuaire'">
        <div 
          v-for="agent in filteredAgents" 
          :key="agent.id"
          class="conversation-card"
          @click="startAgentChat(agent)"
        >
          <div class="avatar agent-avatar">{{ agent.name.substring(4, 6) }}</div>
          <div class="info">
            <div class="top-row">
              <span class="title">{{ agent.name }}</span>
              <span class="time ministry-tag">{{ agent.ministry }}</span>
            </div>
            <div class="bottom-row">
              <p class="preview">{{ agent.role }}</p>
              <span class="unread-badge status-active">🔒 Sécurisé</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Onglet Paramètres de Sécurité -->
      <div class="settings-container" v-else-if="activeTab === 'settings'">
        <div v-if="errorMessage" class="error-banner" role="alert">{{ errorMessage }}</div>
        <div class="settings-section">
          <h4>Identité Numérique d'État</h4>
          <p class="settings-info"><strong>Matricule :</strong> {{ authStore.userEmail }}</p>
          <p class="settings-info"><strong>Statut :</strong> Compte actif</p>
        </div>

        <div class="settings-section">
          <h4>Chiffrement de Bout en Bout</h4>
          <p class="settings-info"><strong>Protection :</strong> Chiffrement côté client</p>
          <p class="settings-info"><strong>Stockage :</strong> Données locales protégées</p>
          <button class="action-btn" @click="errorMessage = 'La rotation des clés sera disponible après l’activation du client MLS.'">
            🔄 Régénérer les KeyPackages
          </button>
        </div>

        <div class="settings-section panic-zone">
          <h4>Action d'Urgence</h4>
          <button class="action-btn panic" @click="triggerPanicWipe">
            🚨 Protocole Zéro-Trace (Panique)
          </button>
        </div>

        <div class="settings-section">
          <h4>Session</h4>
          <button class="action-btn danger" @click="handleLogout">
            🚪 Fermer la session sécurisée
          </button>
        </div>
      </div>
    </section>

    <main class="chat-area" :class="{ 'show-mobile': showMobileChat }">
      <template v-if="selectedChat">
        <header class="chat-header">
          <div class="header-left">
            <button class="back-mobile-btn" @click="showMobileChat = false">←</button>
            <div class="chat-title-info">
              <h4>{{ selectedChat.name }}</h4>
              <span class="security-status">🔒 Session chiffrée (MLS)</span>
            </div>
          </div>
          <div class="header-actions">
            <span 
              class="classification-tag" 
              :class="selectedChat.classification.toLowerCase().replace(' ', '-')"
            >
              {{ selectedChat.classification }}
            </span>
          </div>
        </header>

        <div class="messages-feed" ref="messagesFeedRef">
          <div 
            v-for="msg in messagesMap[selectedChat.id] || []" 
            :key="msg.id" 
            class="message-bubble"
            :class="msg.sent ? 'sent' : 'received'"
          >
            <span class="sender" v-if="!msg.sent">{{ msg.sender }}</span>
            <p class="content">{{ msg.content }}</p>
            <span class="timestamp">{{ msg.time }}</span>
          </div>
        </div>

        <footer class="chat-input-area">
          <input 
            type="file" 
            ref="fileInputRef" 
            style="display: none" 
            @change="handleFileUpload" 
          />
          <button type="button" class="attach-btn" @click="triggerFileInput" title="Joindre un fichier chiffré">📎</button>
          <input 
            type="text" 
            v-model="newMessage" 
            placeholder="Écrire un message chiffré..." 
            @keyup.enter="sendMessage"
          />
          <button type="button" class="send-btn" @click="sendMessage">Envoyer</button>
        </footer>
      </template>

      <div v-else class="empty-state">
        <p>Sélectionnez une conversation pour commencer à échanger.</p>
      </div>
    </main>
  </div>
</template>

<style scoped>
:global(html), :global(body) {
  margin: 0;
  padding: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  box-sizing: border-box;
}

.app-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  max-height: 100vh;
  max-width: 100vw;
  overflow: hidden;
  background-color: #f8fafc;
  position: fixed;
  top: 0;
  left: 0;
}

.sidebar-nav {
  width: 64px;
  min-width: 64px;
  background-color: #0f172a;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1rem 0;
  height: 100vh;
  box-sizing: border-box;
  z-index: 10;
}
.brand-logo {
  margin-bottom: 2rem;
  cursor: pointer;
  user-select: none;
  display: flex;
  justify-content: center;
  align-items: center;
}
.sidebar-logo-img {
  width: 40px;
  height: 40px;
  object-fit: contain;
  border-radius: 8px;
}
.nav-items {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  flex: 1;
}
.nav-items button {
  background: none;
  border: none;
  font-size: 1.25rem;
  padding: 0.5rem;
  border-radius: 8px;
  cursor: pointer;
  color: #94a3b8;
  transition: all 0.2s;
}
.nav-items button.active, .nav-items button:hover {
  background-color: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}
.nav-footer {
  margin-top: auto;
}
.logout-btn {
  background: none;
  border: none;
  font-size: 1.25rem;
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 8px;
  color: #ef4444;
}
.logout-btn:hover {
  background-color: rgba(239, 68, 68, 0.1);
}

.panel-list {
  width: 320px;
  min-width: 320px;
  height: 100vh;
  border-right: 1px solid #e2e8f0;
  background-color: #ffffff;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.panel-header {
  padding: 1.25rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}
.badge-e2ee {
  font-size: 0.7rem;
  background-color: #dcfce7;
  color: #16a34a;
  padding: 0.25rem 0.5rem;
  border-radius: 12px;
  font-weight: 600;
}
.search-bar {
  padding: 0.75rem 1rem;
  flex-shrink: 0;
}
.search-bar input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  background-color: #f8fafc;
  outline: none;
  box-sizing: border-box;
}
.conversation-items {
  flex: 1;
  overflow-y: auto;
}
.conversation-card {
  display: flex;
  padding: 0.875rem 1rem;
  gap: 0.75rem;
  cursor: pointer;
  border-bottom: 1px solid #f1f5f9;
  transition: background-color 0.15s;
}
.conversation-card:hover {
  background-color: #f8fafc;
}
.conversation-card.active {
  background-color: #e0f2fe;
}
.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background-color: #0f172a;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 0.875rem;
  flex-shrink: 0;
}
.avatar.agent-avatar {
  background-color: #0284c7;
}
.info {
  flex: 1;
  overflow: hidden;
}
.top-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.875rem;
  font-weight: 600;
  color: #0f172a;
}
.title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.time {
  font-size: 0.75rem;
  color: #94a3b8;
  font-weight: 400;
}
.ministry-tag {
  background-color: #f1f5f9;
  padding: 0.1rem 0.3rem;
  border-radius: 4px;
  font-size: 0.65rem;
  color: #475569;
}
.bottom-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.25rem;
}
.preview {
  font-size: 0.8rem;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0;
}
.unread-badge {
  background-color: #0284c7;
  color: white;
  font-size: 0.7rem;
  padding: 0.1rem 0.4rem;
  border-radius: 10px;
  font-weight: 600;
}
.unread-badge.status-active {
  background-color: #16a34a;
}

.settings-container {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  overflow-y: auto;
  flex: 1;
}
.settings-section h4 {
  font-size: 0.9rem;
  color: #0f172a;
  margin-bottom: 0.5rem;
  border-bottom: 2px solid #e2e8f0;
  padding-bottom: 0.25rem;
}
.settings-info {
  font-size: 0.8rem;
  color: #475569;
  margin: 0.25rem 0;
}
.action-btn {
  width: 100%;
  padding: 0.6rem;
  background-color: #0f172a;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  margin-top: 0.5rem;
}
.action-btn:hover {
  background-color: #1e293b;
}
.action-btn.panic {
  background-color: #d97706;
}
.action-btn.panic:hover {
  background-color: #b45309;
}
.action-btn.danger {
  background-color: #ef4444;
}
.action-btn.danger:hover {
  background-color: #dc2626;
}

.chat-area {
  flex: 1;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #f1f5f9;
  overflow: hidden;
  box-sizing: border-box;
}
.chat-header {
  padding: 1rem 1.5rem;
  background-color: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.back-mobile-btn {
  display: none;
  background: none;
  border: none;
  font-size: 1.25rem;
  cursor: pointer;
}
.chat-title-info h4 {
  font-size: 1rem;
  color: #0f172a;
  margin: 0;
}
.security-status {
  font-size: 0.75rem;
  color: #16a34a;
  font-weight: 500;
}
.classification-tag {
  padding: 0.25rem 0.6rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}
.classification-tag.diffusion-restreinte {
  background-color: #fef3c7;
  color: #d97706;
}
.classification-tag.secret {
  background-color: #fee2e2;
  color: #dc2626;
}
.classification-tag.normal {
  background-color: #e2e8f0;
  color: #475569;
}

.messages-feed {
  flex: 1;
  padding: 1.5rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  box-sizing: border-box;
}
.message-bubble {
  max-width: 65%;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  position: relative;
  word-break: break-word;
}
.message-bubble.received {
  background-color: #ffffff;
  align-self: flex-start;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}
.message-bubble.sent {
  background-color: #0f172a;
  color: white;
  align-self: flex-end;
}
.sender {
  font-size: 0.75rem;
  font-weight: 600;
  color: #0284c7;
  display: block;
  margin-bottom: 0.25rem;
}
.timestamp {
  font-size: 0.65rem;
  opacity: 0.7;
  float: right;
  margin-top: 0.5rem;
  margin-left: 0.5rem;
}

.chat-input-area {
  padding: 1rem 1.5rem;
  background-color: #ffffff;
  border-top: 1px solid #e2e8f0;
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-shrink: 0;
  box-sizing: border-box;
}
.chat-input-area input[type="text"] {
  flex: 1;
  padding: 0.75rem 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  outline: none;
  background-color: #f8fafc;
  box-sizing: border-box;
}
.send-btn {
  background-color: #0f172a;
  color: white;
  border: none;
  padding: 0.75rem 1.25rem;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
}
.send-btn:hover {
  background-color: #1e293b;
}
.attach-btn {
  background: none;
  border: none;
  font-size: 1.25rem;
  cursor: pointer;
}
.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
}

@media (max-width: 768px) {
  .panel-list {
    width: calc(100vw - 64px);
    min-width: calc(100vw - 64px);
  }
  .panel-list.hide-mobile {
    display: none;
  }
  .chat-area {
    display: none;
    width: calc(100vw - 64px);
  }
  .chat-area.show-mobile {
    display: flex;
  }
  .back-mobile-btn {
    display: block;
  }
  .message-bubble {
    max-width: 85%;
  }
}
</style>