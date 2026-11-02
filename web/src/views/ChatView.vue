<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { megolmService } from '../crypto/megolm'
import { olmService, type OlmDeviceBundle } from '../crypto/olm'
import { withCryptoLock } from '../crypto/locks'
import { localDB } from '../db'
import { api, connectNotifications, type Device, type GroupRequest } from '../services/api'
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
  memberCount?: number
  membreIds?: string[]
  monRole?: string
}

interface Message {
  id: number
  chatId: string
  sender: string
  senderId?: string
  content: string
  time: string
  sent: boolean
  timestamp: number
  status?: 'envoye' | 'delivre' | 'lu'
  attachment?: { mediaId: string; name: string; taille: number; cle: string; mine?: boolean }
  reply?: { auteur: string; texte: string }
  seq?: number
  system?: 'group-name' | 'olm-key-share'
  ownerAgentId?: string
}

interface AgentItem {
  id: string
  name: string
  role: string
  ministry: string
  status: string
  habiliteParrain?: boolean
}

// Identifiant numérique stable du cache local, unique par groupe et séquence.
const cacheMessageId = (chatId: string, seq: number): number => {
  let hash = 2166136261
  const scopedId = `${meId.value}:${chatId}`
  for (let i = 0; i < scopedId.length; i++) hash = Math.imul(hash ^ scopedId.charCodeAt(i), 16777619) >>> 0
  return hash * 1_000_000 + (seq % 1_000_000)
}
const groupNameCache = new Map<string, string>()

// États de navigation interne
const activeTab = ref<'chats' | 'annuaire' | 'groups' | 'profile'>('chats')
const isDarkMode = ref(false)
const megolmReady = ref(false)
const olmIdentityReady = ref(false)
const groupSessionReady = ref(false)
const groupCryptoJobs = new Map<string, Promise<void>>()
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
const selectedAgent = ref<AgentItem | null>(null)
const isCreatingGroup = ref(false)
const groupActionMessage = ref('')
const groupRequests = ref<GroupRequest[]>([])

// Assistant de création de groupe (nom + membres + parrain)
const creatingOpen = ref(false)
const newGroupName = ref('')
const newGroupMembers = ref<string[]>([])
const newGroupParrainId = ref('')

// Temps réel (WebSocket), présence et appareils
const onlineAgents = ref<Set<string>>(new Set())
let wsSocket: ReturnType<typeof connectNotifications> | null = null
let wsReconnectTimer: number | undefined
let presenceTimer: number | undefined
let chatViewMounted = false

// Gestion des membres du groupe sélectionné
const membersOpen = ref(false)
const membersMessage = ref('')
const memberToAdd = ref('')
const groupMembersMap = ref<Record<string, { id: string; role: string; name: string; ministere: string; empreinte?: string }[]>>({})

// Appareils enregistrés (profil)
const deviceList = ref<Device[]>([])

const meId = computed(() => authStore.profile?.id ?? '')

// Détails WhatsApp : noms resolvés par agentId, accusés déjà envoyés,
// réponse en cours de préparation, et champ de renommage de groupe.
const namesMap = ref<Record<string, string>>({})
const readAckMap: Record<string, number> = {}
const replyTarget = ref<Message | null>(null)
const memberRenameField = ref('')

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

// ---- Helpers WhatsApp ---------------------------------------------------
const nameForAgent = (agentId: string | undefined) => {
  if (!agentId) return 'Membre du groupe'
  if (agentId === meId.value) return 'Moi'
  return namesMap.value[agentId] ?? 'Membre du groupe'
}

const resolveNames = () => {
  for (const chat of conversationsRaw.value) {
    for (const id of chat.membreIds ?? []) {
      if (id === meId.value || namesMap.value[id]) continue
      const agent = agentsListRaw.value.find((item) => item.id === id)
      if (agent) namesMap.value[id] = agent.name
    }
  }
}

// Interrupteur de journée type WhatsApp : Aujourd'hui / Hier / date.
const jourLabel = (timestamp: number, dernierJour: string) => {
  const iso = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  const d = new Date(timestamp)
  const today = new Date()
  if (iso(d) === iso(today)) return { label: 'Aujourd’hui', changed: dernierJour !== iso(today) ? iso(today) : '' }
  const hier = new Date()
  hier.setDate(hier.getDate() - 1)
  if (iso(d) === iso(hier)) return { label: 'Hier', changed: dernierJour !== iso(hier) ? iso(hier) : '' }
  const cle = iso(d)
  return {
    label: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
    changed: dernierJour !== cle ? cle : ''
  }
}

// Liste affichée : messages intercalés de séparateurs de journée.
const messagesAffichees = computed(() => {
  const list = selectedChat.value ? messagesMap.value[selectedChat.value.id] ?? [] : []
  const out: Array<{ key: string; divider?: string; message?: Message }> = []
  let dernierJour = ''
  for (const message of list) {
    const jour = jourLabel(message.timestamp, dernierJour)
    if (jour.changed) {
      dernierJour = jour.changed
      out.push({ key: `jour-${out.length}`, divider: jour.label })
    }
    out.push({ key: `msg-${message.id}`, message })
  }
  return out
})

// Sous-titre de l'en-tête de chat : “en ligne” pour une conversation privée,
// “N participants” pour un groupe.
const statutChatHead = computed(() => {
  const chat = selectedChat.value
  if (!chat) return ''
  const autres = (chat.membreIds ?? []).filter((id) => id !== meId.value)
  if (autres.length === 1) return onlineAgents.value.has(autres[0]) ? 'en ligne' : ''
  return chatNameForCount(chat)
})

// Charge et déchiffre les messages d'un groupe : textes (megolm_app),
// pièces jointes (media_cle), noms de groupe (nom_groupe) ; les accusés
// (recu_lu) et partages de clés Olm (megolm_key_share) ne s'affichent pas.
// Renvoie aussi le dernier seq pour l'accusé de lecture.
const fetchMessages = async (chat: ChatItem): Promise<{ messages: Message[]; dernierSeq: number }> => {
  const cachedAll = await localDB.getMessagesByChat(chat.id, meId.value) as Message[]
  const cachedName = cachedAll.find(message => message.system === 'group-name')
  if (cachedName?.content) groupNameCache.set(chat.id, cachedName.content)
  const placeholdersDechiffrement = new Set([
    'Message protégé — la clé n’est pas disponible sur cet appareil.',
    'Pièce jointe protégée'
  ])
  const cached = cachedAll.filter(message =>
    message.system !== 'group-name' && message.system !== 'olm-key-share' && !placeholdersDechiffrement.has(message.content)
  )
  const cachedSeqs = new Set(cachedAll.filter(message =>
    Number.isInteger(message.seq) && !placeholdersDechiffrement.has(message.content)
  ).map(message => message.seq as number))
  const processedKeyShareSeqs = new Set(cachedAll.filter(message => message.system === 'olm-key-share').map(message => message.seq ?? -1))
  // Les clés Olm non importées doivent rester récupérables même si des messages
  // plus récents ont déjà été mis en cache. On relit donc l'historique serveur
  // depuis le début, mais on ne redécode que les messages absents du cache et
  // les partages de clés sans marqueur de traitement durable.
  const remoteMessages: Awaited<ReturnType<typeof api.messages>> = []
  let cursor = 0
  while (true) {
    const batch = await api.messages(chat.id, cursor)
    if (!batch.length) break
    remoteMessages.push(...batch)
    const nextCursor = batch[batch.length - 1].seq
    if (nextCursor <= cursor || batch.length < 200) break
    cursor = nextCursor
  }
  const keyShareMessages = remoteMessages.filter((message) =>
    message.kind === 'megolm_key_share' && message.senderId !== meId.value && !processedKeyShareSeqs.has(message.seq)
  )
  const olmBundles = keyShareMessages.length ? await api.groupOlmKeys(chat.id, []) : []
  const decrypted: Message[] = [...cached]
  let dernierSeq = cachedAll.reduce((max, message) => Math.max(max, message.seq ?? 0), 0)
  for (const message of remoteMessages) {
    dernierSeq = message.seq
    if (message.kind === 'megolm_key_share') {
      if (processedKeyShareSeqs.has(message.seq)) continue
      // Le partage est déchiffré individuellement par Olm. Le serveur ne voit
      // jamais session_key : il ne transporte que l'enveloppe chiffrée.
      const memoriserPartageTraite = async () => localDB.saveMessage({
        id: cacheMessageId(chat.id, message.seq), chatId: chat.id, timestamp: new Date(message.createdAt).getTime(),
        sender: 'Système', content: '', time: '', sent: true, system: 'olm-key-share', seq: message.seq, ownerAgentId: meId.value
      })
      if (message.senderId === meId.value) { await memoriserPartageTraite(); continue }
      try {
        const envelope = JSON.parse(message.content) as {
          algorithm: string
          sender_key: string
          ciphertext: Record<string, { type: number; body: string }>
        }
        if (envelope.algorithm !== 'm.olm.v1.curve25519-aes-sha2' || !envelope.sender_key || !envelope.ciphertext) {
          throw new Error('olm_enveloppe_invalide')
        }
        const senderBundleRaw = olmBundles.find((bundle) => bundle.agentId === message.senderId)
        if (!senderBundleRaw?.deviceKeys || !senderBundleRaw.deviceSignature) throw new Error('olm_identite_expediteur_absente')
        const senderBundle: OlmDeviceBundle = {
          agentId: senderBundleRaw.agentId,
          deviceKeys: senderBundleRaw.deviceKeys,
          deviceSignature: senderBundleRaw.deviceSignature,
        }
        const senderIdentity = await olmService.verifyAndPinRemote(meId.value, senderBundle)
        if (senderIdentity.curve25519 !== envelope.sender_key) throw new Error('olm_cle_expediteur_incoherente')
        const localIdentity = await olmService.getLocalIdentity(meId.value)
        const encrypted = envelope.ciphertext[localIdentity.curve25519]
        if (!encrypted) { await memoriserPartageTraite(); continue } // enveloppe destinée à un autre membre du groupe
        const processingId = `${chat.id}:${message.seq}`
        const plaintext = await olmService.decryptFromAgent(meId.value, envelope.sender_key, encrypted.type, encrypted.body, processingId)
        const roomKey = JSON.parse(plaintext) as {
          type: string; algorithm: string; groupId: string; epoch: number; sessionId: string
          sessionKey: string; messageIndex: number; senderAgentId: string; recipientAgentId: string
        }
        if (roomKey.type !== 'm.room_key' || roomKey.algorithm !== 'm.megolm.v1.aes-sha2' ||
            roomKey.groupId !== chat.id || roomKey.epoch !== message.epoch ||
            roomKey.senderAgentId !== message.senderId || roomKey.recipientAgentId !== meId.value ||
            !roomKey.sessionKey || !Number.isInteger(roomKey.messageIndex)) {
          throw new Error('olm_cle_groupe_invalide')
        }
        const importedId = await megolmService.importSessionKey(meId.value, chat.id, roomKey.sessionKey, roomKey.messageIndex, roomKey.epoch)
        if (importedId !== roomKey.sessionId) throw new Error('megolm_session_id_incoherent')
        // Preuve envoyée seulement après l'import et la vérification du
        // session_id local. Les partages d'epochs historiques ne sont pas acquittés.
        if (message.epoch === chat.epoch) {
          await api.acknowledgeGroupKey(chat.id, message.epoch, message.senderId)
        }
        await memoriserPartageTraite()
        await olmService.acknowledgeInbound(meId.value, processingId)
      } catch (error) {
        console.warn('Partage de clé Olm ignoré :', error)
      }
      continue
    }
    if (message.kind === 'recu_lu') continue
    if (cachedSeqs.has(message.seq) && message.kind !== 'nom_groupe') continue
    const mine = message.senderId === meId.value
    let content = ''
    let cacheEntry = true
    let attachment: Message['attachment']
    let reply: Message['reply']
    if (message.kind === 'media_cle') {
      try {
        const meta = JSON.parse(await megolmService.decryptMessage(meId.value, message.content, chat.id, message.epoch)) as {
          mediaId: string; nom: string; taille: number; cle: string
        }
        content = `Pièce jointe : ${meta.nom}`
        attachment = { mediaId: meta.mediaId, name: meta.nom, taille: meta.taille, cle: meta.cle }
      } catch {
        content = 'Pièce jointe protégée'
        cacheEntry = false
      }
    } else if (message.kind === 'nom_groupe') {
      try {
        const meta = JSON.parse(await megolmService.decryptMessage(meId.value, message.content, chat.id, message.epoch)) as { nom: string }
        if (meta.nom) {
          groupNameCache.set(chat.id, meta.nom)
          await localDB.saveMessage({ id: cacheMessageId(chat.id, 0), chatId: chat.id, timestamp: 0, sender: 'Système', content: meta.nom, time: '', sent: true, system: 'group-name', seq: 0, ownerAgentId: meId.value })
        }
        if (chat.name !== meta.nom) chat.name = meta.nom
      } catch {
        /* nom protégé : on garde le nom courant */
      }
      continue
    } else if (message.kind === 'megolm_app') {
      try {
        content = await megolmService.decryptMessage(meId.value, message.content, chat.id, message.epoch)
      } catch {
        content = 'Message protégé — la clé n’est pas disponible sur cet appareil.'
        cacheEntry = false
      }
      try {
        const payload = JSON.parse(content) as { t?: string; x?: string; r?: { a: string; x: string } }
        if (payload.t === 'g' && typeof payload.x === 'string') {
          if (payload.r) reply = { auteur: nameForAgent(payload.r.a), texte: payload.r.x }
          content = payload.x
        }
      } catch {
        /* texte simple (compat ancien format) */
      }
    }
    const entry: Message = {
      id: cacheMessageId(chat.id, message.seq),
      chatId: chat.id,
      sender: mine ? 'Moi' : nameForAgent(message.senderId),
      senderId: message.senderId,
      ownerAgentId: meId.value,
      content,
      time: new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      sent: mine,
      timestamp: new Date(message.createdAt).getTime(),
      status: mine ? 'delivre' : undefined,
      attachment,
      reply,
      seq: message.seq
    }
    decrypted.push(entry)
    // Ne jamais figer dans le cache un texte de substitution produit par un
    // échec de déchiffrement : une clé arrivée plus tard doit permettre le retry.
    if (cacheEntry) await localDB.saveMessage(entry)
  }
  if (mineEtAutresInconnus(remoteMessages)) await resolveNames()
  return { messages: decrypted, dernierSeq }
}

const mineEtAutresInconnus = (remoteMessages: { senderId: string }[]) =>
  remoteMessages.some((m) => !namesMap.value[m.senderId])

// Accusé de lecture (kind recu_lu) : un seul par groupe et par seq.
const envoyerRecuLu = async (chat: ChatItem, dernierSeq: number) => {
  if (!dernierSeq || (readAckMap[chat.id] ?? 0) >= dernierSeq) return
  readAckMap[chat.id] = dernierSeq
  try {
    const encryptedPayload = await megolmService.encryptMessage(meId.value, JSON.stringify({ jqa: dernierSeq }), chat.id, chat.epoch)
    await api.sendMessage(chat.id, { epoch: chat.epoch, kind: 'recu_lu', content: encryptedPayload })
  } catch {
    /* l'accusé n'est pas critique */
  }
}

const marquerLuLocalement = (chatId: string) => {
  for (const message of messagesMap.value[chatId] ?? []) {
    if (message.sent) message.status = 'lu'
  }
}

const publierIdentiteOlm = async () => {
  if (olmIdentityReady.value) return
  if (!meId.value) throw new Error('identite_agent_indisponible')
  const [status, hasLocalAccount] = await Promise.all([
    api.olmKeyStatus(),
    olmService.hasLocalAccount(meId.value),
  ])
  const bundle = await olmService.preparePublishedBundle(meId.value, !hasLocalAccount || status.available < 10)
  await api.publishOlmKeys(bundle)
  await olmService.markPublished(meId.value)
  olmIdentityReady.value = true
}

/**
 * Crée/renouvelle la session Megolm de l'agent pour l'epoch courante et remet
 * sa clé à chaque autre membre via une session Olm ; les identités signées
 * sont vérifiées et épinglées localement en TOFU.
 */
const preparerChiffrementGroupeInterne = async (chat: ChatItem) => {
  if (!megolmReady.value || !meId.value) throw new Error('moteur_crypto_indisponible')
  await publierIdentiteOlm()
  const memberIds = chat.membreIds ?? (await api.groupMembers(chat.id)).map((member) => member.agentId)
  chat.membreIds = memberIds
  const autresIds = [...new Set(memberIds)].filter((id) => id !== meId.value)
  const published = await api.groupOlmKeys(chat.id, [])
  const usable = new Map<string, OlmDeviceBundle>()
  for (const memberId of autresIds) {
    const raw = published.find((item) => item.agentId === memberId)
    if (!raw?.deviceKeys || !raw.deviceSignature) throw new Error('olm_cle_publique_absente')
    const bundle: OlmDeviceBundle = { agentId: raw.agentId, deviceKeys: raw.deviceKeys, deviceSignature: raw.deviceSignature }
    await olmService.verifyAndPinRemote(meId.value, bundle)
    usable.set(memberId, bundle)
  }
  const claimFor: string[] = []
  for (const [memberId, bundle] of usable) {
    const curve = bundle.deviceKeys.keys[`curve25519:${bundle.deviceKeys.device_id}`]
    if (!await olmService.hasSession(meId.value, curve)) claimFor.push(memberId)
  }
  if (claimFor.length) {
    const claimed = await api.groupOlmKeys(chat.id, claimFor)
    for (const item of claimed) {
      if (!item.deviceKeys || !item.deviceSignature) continue
      usable.set(item.agentId, {
        agentId: item.agentId,
        deviceKeys: item.deviceKeys,
        deviceSignature: item.deviceSignature,
        oneTimeKey: item.oneTimeKey,
      })
    }
  }
  for (const memberId of claimFor) {
    if (!usable.get(memberId)?.oneTimeKey) throw new Error('olm_precle_indisponible')
  }

  const distributionMarker = `goama-olm-shared:${meId.value}:${chat.id}:${chat.epoch}`
  const newSessionRequired = await megolmService.needsRotation(meId.value, chat.id, chat.epoch)
  if (newSessionRequired) {
    localStorage.removeItem(distributionMarker)
    await megolmService.createGroup(meId.value, chat.id, chat.epoch)
  }
  const distributionRequired = newSessionRequired || localStorage.getItem(distributionMarker) !== '1'
  if (distributionRequired) {
    const exported = await megolmService.exportSessionKey(meId.value, chat.id, chat.epoch)
    for (const [memberId, bundle] of usable) {
      const roomKey = JSON.stringify({
        type: 'm.room_key',
        algorithm: 'm.megolm.v1.aes-sha2',
        groupId: chat.id,
        epoch: chat.epoch,
        sessionId: exported.sessionId,
        sessionKey: exported.sessionKey,
        messageIndex: exported.messageIndex,
        senderAgentId: meId.value,
        recipientAgentId: memberId,
      })
      const encrypted = await olmService.encryptToAgent(meId.value, bundle, roomKey)
      const envelope = {
        algorithm: 'm.olm.v1.curve25519-aes-sha2',
        sender_key: encrypted.sender_key,
        ciphertext: encrypted.ciphertext,
      }
      await api.sendMessage(chat.id, {
        epoch: chat.epoch,
        kind: 'megolm_key_share',
        content: JSON.stringify(envelope),
      })
      const remoteCurve = bundle.deviceKeys.keys[`curve25519:${bundle.deviceKeys.device_id}`]
      await olmService.acknowledgeOutbound(meId.value, remoteCurve, encrypted.sessionId)
    }
    // Écrit uniquement après l'acceptation de toutes les enveloppes par l'API.
    localStorage.setItem(distributionMarker, '1')
  }
  if (selectedChat.value?.id === chat.id) groupSessionReady.value = true
}

const preparerChiffrementGroupe = async (chat: ChatItem): Promise<void> => {
  const active = groupCryptoJobs.get(chat.id)
  if (active) return active
  const job = withCryptoLock(`group-bootstrap:${meId.value}:${chat.id}`, () => preparerChiffrementGroupeInterne(chat)).finally(() => {
    if (groupCryptoJobs.get(chat.id) === job) groupCryptoJobs.delete(chat.id)
  })
  groupCryptoJobs.set(chat.id, job)
  return job
}

const messageErreurCrypto = (error: unknown): string => {
  const code = error instanceof Error ? error.message : ''
  if (code === 'olm_cle_publique_absente') return 'Un participant doit ouvrir Goama une première fois avant que les échanges puissent commencer.'
  if (code === 'olm_precle_indisponible') return 'Un participant doit se reconnecter avant que les échanges puissent reprendre.'
  if (code === 'olm_identite_modifiee_verification_hors_bande_requise' || code === 'identite_olm_change_reinitialisation_admin_requise') return 'La vérification de sécurité de cette conversation doit être renouvelée avant de poursuivre.'
  if (code === 'olm_envoi_en_attente_autre_payload') return 'La protection de la conversation est en cours de vérification. Réessayez dans un instant.'
  if (code === 'megolm_distribution_olm_requise') return 'La protection de la conversation n’est pas encore prête. L’envoi reste temporairement bloqué.'
  return 'La protection de la conversation n’est pas prête. Les envois restent temporairement bloqués.'
}

const selectConversation = async (chat: ChatItem) => {
  selectedChat.value = chat
  groupSessionReady.value = false
  chat.unreadCount = 0
  try {
    await preparerChiffrementGroupe(chat)
  } catch (error) {
    groupSessionReady.value = false
    errorMessage.value = messageErreurCrypto(error)
    console.warn('Initialisation E2EE du groupe impossible :', error)
  }
  showMobileChat.value = true

  try {
    const { messages: decryptedMessages, dernierSeq } = await fetchMessages(chat)
    messagesMap.value[chat.id] = decryptedMessages
    resolveNames()
    void envoyerRecuLu(chat, dernierSeq)
  } catch (e) {
    console.warn('Utilisation du cache mémoire pour les messages')
  }

  scrollToBottom()
}

// Nom d'un groupe stocké côté clients : dernier message « nom_groupe »
// chiffré (REQ-GRP-006 — jamais en clair côté serveur).
const resoudreNomGroupe = async (groupId: string, fallback: string): Promise<string> => {
  const cachedName = groupNameCache.get(groupId)
  if (cachedName) return cachedName
  try {
    const localNames = await localDB.getMessagesByChat(groupId, meId.value) as Message[]
    const savedName = localNames.find(message => message.system === 'group-name')?.content
    if (savedName) { groupNameCache.set(groupId, savedName); return savedName }
    for (const message of (await api.messages(groupId)).reverse()) {
      if (message.kind !== 'nom_groupe') continue
      const payload = JSON.parse(await megolmService.decryptMessage(meId.value, message.content, groupId, message.epoch)) as { nom?: string }
      if (payload.nom) { groupNameCache.set(groupId, payload.nom); return payload.nom }
    }
  } catch {
    /* le nom chiffré n'est pas disponible sur cet appareil */
  }
  return fallback
}

const openGroup = (group: ChatItem) => {
  activeTab.value = 'chats'
  void selectConversation(group)
}

// Conversation privée réelle : un « groupe » à 2 membres (seul concept
// d'échange côté serveur). On réutilise celui qui existe, sinon on le
// crée — ce qui exige la capacité de parrainage (flux de demande sinon).
const startAgentChat = async (agent: AgentItem) => {
  selectedAgent.value = null
  const moi = meId.value
  if (!moi) return

  const existant = conversationsRaw.value.find(
    (chat) => (chat.membreIds ?? []).length === 2
      && (chat.membreIds ?? []).includes(agent.id)
  )
  if (existant) {
    activeTab.value = 'chats'
    await selectConversation(existant)
    return
  }

  try {
    const group = await api.createGroup()
    const membership = await api.addGroupMember(group.id, agent.id)
    namesMap.value[agent.id] = agent.name
    const chat: ChatItem = {
      id: group.id,
      name: agent.name,
      isGroup: true,
      lastMessage: 'Nouvelle conversation.',
      time: 'À l’instant',
      classification: 'Diffusion Restreinte',
      epoch: membership.epoch,
      memberCount: 2,
      membreIds: [moi, agent.id],
      monRole: 'PARRAIN'
    }
    conversationsRaw.value.unshift(chat)
    messagesMap.value[chat.id] = []
    activeTab.value = 'chats'
    await selectConversation(chat)
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    if (code === 'parrainage_requis') {
      ouvrirAssistant()
      groupActionMessage.value = 'Votre poste ne permet pas d’ouvrir directement une conversation : soumettez une demande à un parrain.'
    } else if (code === 'agent_non_enrole') {
      groupActionMessage.value = 'Cette personne ne peut pas être ajoutée pour le moment.'
    } else {
      groupActionMessage.value = 'Impossible d’ouvrir cette conversation pour le moment.'
    }
    activeTab.value = 'groups'
  }
}

// Habilitation parrain de l'agent connecté : il crée directement le groupe,
// sinon la demande enrichie (nom + membres) part à un parrain de son choix.
const estHabiliteParrain = computed(() =>
  agentsListRaw.value.some((agent) => agent.id === meId.value && agent.habiliteParrain)
)

const chatNameForCount = (chat: ChatItem) => `${chat.memberCount ?? 0} membre${chat.memberCount === 1 ? '' : 's'}`

// ---- Assistant de création de groupe : nom + membres + parrain (si
// l'agent n'est pas habilité), soumis en une seule demande -------------
const ouvrirAssistant = () => {
  newGroupName.value = ''
  newGroupMembers.value = []
  newGroupParrainId.value = ''
  creatingOpen.value = true
}

const basculerMembreAssistant = (agentId: string) => {
  newGroupMembers.value = newGroupMembers.value.includes(agentId)
    ? newGroupMembers.value.filter((id) => id !== agentId)
    : [...newGroupMembers.value, agentId]
}

const soumettreAssistant = async () => {
  const nom = newGroupName.value.trim()
  if (!nom || isCreatingGroup.value) return
  isCreatingGroup.value = true
  groupActionMessage.value = ''
  try {
    if (estHabiliteParrain.value) {
      const group = await api.createGroup()
      let groupEpoch = group.epoch
      const membreIds = [meId.value, ...newGroupMembers.value]
      for (const agentId of newGroupMembers.value) {
        try {
          const membership = await api.addGroupMember(group.id, agentId)
          groupEpoch = membership.epoch
        } catch {
          /* membre déjà présent ou non enrôlé : on continue */
        }
      }
      // Le nom du groupe reste local pour le moment ; la session E2EE est
      // initialisée juste après l'ajout du groupe à la liste des conversations.
      const chat: ChatItem = {
        id: group.id,
        name: nom,
        isGroup: true,
        lastMessage: 'Groupe créé. Préparation de la protection des échanges.',
        time: 'À l’instant',
        classification: 'Normal',
        epoch: groupEpoch,
        memberCount: membreIds.length,
        membreIds,
        monRole: 'PARRAIN'
      }
      conversationsRaw.value.unshift(chat)
      creatingOpen.value = false
      activeTab.value = 'chats'
      await selectConversation(chat)
    } else {
      if (!newGroupParrainId.value) {
        groupActionMessage.value = 'Choisissez un parrain habilité pour soumettre la demande.'
        return
      }
      await api.requestGroup(newGroupParrainId.value, nom, newGroupMembers.value)
      creatingOpen.value = false
      groupActionMessage.value = `Votre groupe « ${nom} » a été soumis au parrain.`
      await loadGroupRequests()
    }
  } catch (error) {
    groupActionMessage.value = error instanceof Error && error.message === 'demande_deja_existante'
      ? 'Une demande est déjà en attente chez ce parrain.'
      : 'Impossible de soumettre la demande pour le moment.'
  } finally {
    isCreatingGroup.value = false
  }
}

const loadGroupRequests = async () => {
    try {
      groupRequests.value = await api.groupRequests()
    } catch {
      groupRequests.value = []
    }
  }

  // ---- Gestion des membres du groupe sélectionné (GET/POST/DELETE
  // /groupes/:id/membres) -----------------------------------------------
const loadGroupMembers = async (groupId: string) => {
    try {
      const [members, bundles] = await Promise.all([api.groupMembers(groupId), api.groupOlmKeys(groupId, [])])
      const bundleByAgent = new Map(bundles
        .filter((bundle): bundle is typeof bundle & { deviceKeys: NonNullable<typeof bundle.deviceKeys>; deviceSignature: string } => Boolean(bundle.deviceKeys && bundle.deviceSignature))
        .map((bundle) => [bundle.agentId, bundle]))
      groupMembersMap.value[groupId] = await Promise.all(members.map(async (member) => {
        const agent = agentsListRaw.value.find((item) => item.id === member.agentId)
        const bundle = bundleByAgent.get(member.agentId)
        let empreinte: string | undefined
        if (bundle) {
          try {
            empreinte = await olmService.fingerprint({ agentId: bundle.agentId, deviceKeys: bundle.deviceKeys, deviceSignature: bundle.deviceSignature })
          } catch {
            empreinte = undefined
          }
        }
        return {
          id: member.agentId,
          role: member.role,
          name: agent?.name ?? 'Agent',
          ministere: agent?.ministry ?? '',
          empreinte
        }
      }))
    } catch {
      /* le groupe n'est plus visible : rien à afficher */
    }
  }

const toggleMembers = async () => {
  if (!selectedChat.value?.isGroup) return
  membersOpen.value = !membersOpen.value
  if (membersOpen.value) {
    membersMessage.value = ''
    memberToAdd.value = ''
    await loadGroupMembers(selectedChat.value.id)
  }
}

const addMemberToGroup = async () => {
  const chatId = selectedChat.value?.id
  if (!chatId || !memberToAdd.value) return
  try {
    const result = await api.addGroupMember(chatId, memberToAdd.value)
    if (selectedChat.value?.id === chatId) { selectedChat.value.epoch = result.epoch; groupSessionReady.value = false }
    const localChat = conversationsRaw.value.find((item) => item.id === chatId)
    if (localChat) localChat.epoch = result.epoch
    memberToAdd.value = ''
    membersMessage.value = 'Membre ajouté. La protection de la conversation est mise à jour avant la reprise des échanges.'
    await loadGroupMembers(chatId)
    const chat = conversationsRaw.value.find((item) => item.id === chatId)
    if (chat) chat.memberCount = groupMembersMap.value[chatId]?.length
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    membersMessage.value = code === 'membre_deja_present'
      ? 'Cet agent fait déjà partie du groupe.'
      : code === 'parrainage_requis'
        ? 'Ce parrainage est nécessaire pour l’ajouter.'
        : 'Impossible d’ajouter ce membre pour le moment.'
  }
}

const removeMemberFromGroup = async (agentId: string) => {
  const chatId = selectedChat.value?.id
  if (!chatId) return
  try {
    const result = await api.removeGroupMember(chatId, agentId)
    if (selectedChat.value?.id === chatId) { selectedChat.value.epoch = result.epoch; groupSessionReady.value = false }
    const localChat = conversationsRaw.value.find((item) => item.id === chatId)
    if (localChat) localChat.epoch = result.epoch
    membersMessage.value = 'Membre retiré. La protection de la conversation est mise à jour ; les échanges reprendront ensuite.'
    await loadGroupMembers(chatId)
    const chat = conversationsRaw.value.find((item) => item.id === chatId)
    if (chat) chat.memberCount = groupMembersMap.value[chatId]?.length
  } catch {
    membersMessage.value = 'Impossible de retirer ce membre pour le moment.'
  }
}

// Renommage d'un groupe : message « nom_groupe » chiffré (REQ-GRP-006).
const renommerGroupe = async () => {
  const chat = selectedChat.value
  const nom = memberRenameField.value.trim()
  if (!chat || !nom) return
  try {
    const distributionMarker = `goama-olm-shared:${meId.value}:${chat.id}:${chat.epoch}`
    if (localStorage.getItem(distributionMarker) !== '1' || await megolmService.needsRotation(meId.value, chat.id, chat.epoch)) await preparerChiffrementGroupe(chat)
    if (!groupSessionReady.value) throw new Error('distribution_olm_non_prete')
    const encryptedPayload = await megolmService.encryptMessage(meId.value, JSON.stringify({ nom }), chat.id, chat.epoch)
    await api.sendMessage(chat.id, { epoch: chat.epoch, kind: 'nom_groupe', content: encryptedPayload })
    chat.name = nom
    memberRenameField.value = ''
    membersMessage.value = ''
  } catch {
    membersMessage.value = 'Impossible de renommer le groupe pour le moment.'
  }
}

// Téléchargement d'une pièce jointe : le blob chiffré est récupéré via
// GET /media/:id, puis déchiffré localement avec la clé publiée dans le
// message « media_cle ». Le serveur ne peut jamais déchiffrer lui-même.
const downloadAttachment = async (message: Message) => {
  if (!message.attachment) return
  try {
    const blob = await api.downloadMedia(message.attachment.mediaId)
    const key = await megolmService.importFileKey(message.attachment.cle)
    const bytes = await megolmService.decryptBytes(blob, key)
    const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'application/octet-stream' }))
    const link = document.createElement('a')
    link.href = url
    link.download = message.attachment.name
    link.click()
    URL.revokeObjectURL(url)
  } catch {
    errorMessage.value = 'Impossible de déchiffrer cette pièce jointe.'
  }
}

const humanSize = (octets: number) => {
  if (octets < 1024) return `${octets} o`
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`
}

const decideGroupRequest = async (request: GroupRequest, approve: boolean) => {
    try {
      if (approve) {
        const group = await api.approveGroupRequest(request.id)
        // Le nom reste local ; la session E2EE sera initialisée à l'ouverture du groupe.
        const correspondant = request.estDemandeur ? request.parrain.id : request.demandeur.id
        const membreIds = [...new Set([meId.value, correspondant, ...(request.membresRequest ?? [])])]
        conversationsRaw.value.unshift({
          id: group.id,
          name: request.nomRequest ?? `${request.demandeur.prenom} ${request.demandeur.nom}`.trim(),
          isGroup: true,
          lastMessage: 'Groupe créé. Préparation de la protection des échanges.',
          time: 'À l’instant',
          classification: 'Normal',
          epoch: group.epoch,
          memberCount: membreIds.length,
          membreIds,
          monRole: 'PARRAIN'
        })
        groupActionMessage.value = 'Demande approuvée. Le groupe est créé ; ouvrez-le pour préparer la protection des échanges.'
      } else {
        await api.rejectGroupRequest(request.id)
        groupActionMessage.value = 'Demande refusée.'
      }
      await loadGroupRequests()
    } catch {
      groupActionMessage.value = 'Cette demande ne peut plus être traitée.'
  }
}

const sendMessage = async () => {
  if (!megolmReady.value || !groupSessionReady.value || !newMessage.value.trim() || !selectedChat.value) return

  const chat = selectedChat.value
  const chatId = chat.id
  if (!messagesMap.value[chatId]) {
    messagesMap.value[chatId] = []
  }

  const text = newMessage.value.trim()
  const replying = replyTarget.value
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  try {
    const distributionMarker = `goama-olm-shared:${meId.value}:${chat.id}:${chat.epoch}`
    if (localStorage.getItem(distributionMarker) !== '1' || await megolmService.needsRotation(meId.value, chatId, chat.epoch)) {
      groupSessionReady.value = false
      await preparerChiffrementGroupe(chat)
    }
    if (!groupSessionReady.value) throw new Error('distribution_olm_non_prete')
    // Payload applicatif chiffré { t:'g', x:texte, r:citation } — le serveur
    // ne voit que du bruit (ADR-08).
    const payload: { t: string; x: string; r?: { a: string; x: string } } = { t: 'g', x: text }
    if (replying) {
      payload.r = { a: replying.senderId ?? meId.value, x: replying.content.slice(0, 140) }
    }
    const encryptedPayload = await megolmService.encryptMessage(meId.value, JSON.stringify(payload), chatId, chat.epoch)
    const sent = await api.sendMessage(chatId, { epoch: chat.epoch, kind: 'megolm_app', content: encryptedPayload }) as { seq: number }

    const msgObj: Message = {
      id: cacheMessageId(chatId, sent.seq),
      chatId,
      sender: 'Moi',
      senderId: meId.value,
      ownerAgentId: meId.value,
      content: text,
      time: timeStr,
      sent: true,
      timestamp: Date.now(),
      status: 'delivre',
      seq: sent.seq,
      reply: replying
        ? { auteur: replying.sender === 'Moi' ? 'Moi' : nameForAgent(replying.senderId), texte: replying.content.slice(0, 140) }
        : undefined
    }

    await localDB.saveMessage(msgObj)
    messagesMap.value[chatId].push(msgObj)
    chat.lastMessage = text
    chat.time = timeStr
    newMessage.value = ''
    cancelReply()
    scrollToBottom()
  } catch {
    errorMessage.value = 'Le message n’a pas pu être chiffré ou envoyé.'
  }
}

const setReplyTarget = (message: Message) => {
  replyTarget.value = message
}

const cancelReply = () => {
  replyTarget.value = null
}

const triggerFileInput = () => {
  if (megolmReady.value && groupSessionReady.value) fileInputRef.value?.click()
}

const handleFileUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement
  if (!megolmReady.value || !groupSessionReady.value || !target.files || target.files.length === 0 || !selectedChat.value) return

  const file = target.files[0]
  const chat = selectedChat.value
  const chatId = chat.id
  if (!messagesMap.value[chatId]) {
    messagesMap.value[chatId] = []
  }

  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  try {
    const distributionMarker = `goama-olm-shared:${meId.value}:${chat.id}:${chat.epoch}`
    if (localStorage.getItem(distributionMarker) !== '1' || await megolmService.needsRotation(meId.value, chatId, chat.epoch)) {
      groupSessionReady.value = false
      await preparerChiffrementGroupe(chat)
    }
    if (!groupSessionReady.value) throw new Error('distribution_olm_non_prete')
    // Flux conforme au backend : le fichier est chiffré avec une clé aléatoire
    // (AES-GCM), seul le BLOB chiffré part via POST /media, puis la clé est
    // publiée dans un message « media_cle » chiffré → le serveur ne voit rien.
    const bytes = new Uint8Array(await file.arrayBuffer())
    const { key, rawBase64 } = await megolmService.generateFileKey()
    const encryptedBlob = await megolmService.encryptBytes(bytes, key)
    const media = await api.uploadMedia(chatId, encryptedBlob)

    const metadata = JSON.stringify({ mediaId: media.id, nom: file.name, taille: file.size, cle: rawBase64 })
    const encryptedPayload = await megolmService.encryptMessage(meId.value, metadata, chatId, chat.epoch)
    const sent = await api.sendMessage(chatId, { epoch: chat.epoch, kind: 'media_cle', content: encryptedPayload }) as { seq: number }

    const msgObj: Message = {
      id: cacheMessageId(chatId, sent.seq),
      chatId: chatId,
      sender: 'Moi',
      senderId: meId.value,
      ownerAgentId: meId.value,
      content: `Pièce jointe : ${file.name}`,
      time: timeStr,
      sent: true,
      timestamp: Date.now(),
      status: 'delivre',
      seq: sent.seq,
      attachment: { mediaId: media.id, name: file.name, taille: file.size, cle: rawBase64, mine: true }
    }

    await localDB.saveMessage(msgObj)
    messagesMap.value[chatId].push(msgObj)
    chat.lastMessage = `Pièce jointe : ${file.name}`
    chat.time = timeStr
  } catch {
    errorMessage.value = 'Le fichier n’a pas pu être chiffré ou envoyé.'
  }

  scrollToBottom()
  target.value = ''
}

const handleLogout = () => {
  clearInterval(presenceTimer)
  clearTimeout(wsReconnectTimer)
  wsSocket?.close()
  void api.logout().catch(() => undefined)
  authStore.logout()
  router.push('/')
}

// ---- Temps réel (relais WebSocket GET /ws) ----------------------------
// Événements servis par le backend : message, membre_ajoute,
// membre_retire, revoque. La socket ne sert qu'à RECEVOIR.
const handleWsEvent = async (event: { type?: string; kind?: string; [key: string]: unknown }) => {
  if (event.type === 'message') {
    const groupeId = typeof event.groupeId === 'string' ? event.groupeId : ''
    if (!groupeId) return
    const chat = conversationsRaw.value.find((item) => item.id === groupeId)
    if (!chat) return

    // Accusé de lecture de quelqu'un → mes messages du groupe passent en « lu ».
    if (event.kind === 'recu_lu') {
      if (String(event.de ?? '') !== meId.value) marquerLuLocalement(groupeId)
      return
    }
    // Nom de groupe changé par un parrain → on rafraîchit silencieusement.
    if (event.kind === 'nom_groupe') {
      const selection = selectedChat.value?.id === groupeId ? await resoudreNomGroupe(groupeId, chat.name) : null
      if (selection) chat.name = selection
      return
    }

    if (!String(event.de ?? '') || String(event.de ?? '') === meId.value) return
    if (event.kind === 'megolm_key_share') {
      if (selectedChat.value?.id === groupeId) {
        if (!groupSessionReady.value) {
          try { await preparerChiffrementGroupe(chat) }
          catch (error) { console.warn('Nouvelle tentative de distribution Olm impossible :', error) }
        }
        try {
          const { messages } = await fetchMessages(chat)
          messagesMap.value[groupeId] = messages
          scrollToBottom()
        } catch { /* le partage sera récupéré au prochain rattrapage */ }
      }
      return // un partage de clé n'est pas un message non lu à afficher
    }
    chat.lastMessage = event.kind === 'media_cle' ? 'Nouvelle pièce jointe reçue' : 'Nouveau message reçu'
    chat.time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    if (selectedChat.value?.id === groupeId) {
      try {
        const { messages, dernierSeq } = await fetchMessages(chat)
        messagesMap.value[groupeId] = messages
        void envoyerRecuLu(chat, dernierSeq)
        scrollToBottom()
      } catch {
        /* nouvelle tentative à la prochaine ouverture de la discussion */
      }
    } else {
      chat.unreadCount = (chat.unreadCount ?? 0) + 1
    }
  } else if (event.type === 'membre_ajoute' || event.type === 'membre_retire') {
    const groupeId = typeof event.groupeId === 'string' ? event.groupeId : ''
    if (!groupeId) return
    const chat = conversationsRaw.value.find((item) => item.id === groupeId)
    if (chat && Number.isInteger(event.epoch)) chat.epoch = Number(event.epoch)
    if (selectedChat.value?.id === groupeId) groupSessionReady.value = false
    void api.groupMembers(groupeId).then(async (members) => {
      if (chat) {
        chat.memberCount = members.length
        chat.membreIds = members.map((member) => member.agentId)
      }
      if (membersOpen.value && selectedChat.value?.id === groupeId) void loadGroupMembers(groupeId)
      if (chat && selectedChat.value?.id === groupeId) {
        try {
          await preparerChiffrementGroupe(chat)
          const { messages, dernierSeq } = await fetchMessages(chat)
          messagesMap.value[groupeId] = messages
          void envoyerRecuLu(chat, dernierSeq)
        } catch (error) {
          groupSessionReady.value = false
          errorMessage.value = messageErreurCrypto(error)
          console.warn('Rotation E2EE non terminée :', error)
        }
      } else if (!chat) {
        await loadWorkspace()
      }
    }).catch(() => undefined)
  } else if (event.type === 'revoque') {
    window.alert('Votre session a été révoquée par l’administration. Vous allez être déconnecté.')
    handleLogout()
  }
}

const connectWs = () => {
  clearTimeout(wsReconnectTimer)
  wsSocket?.close()
  const socket = connectNotifications((event) => void handleWsEvent(event))
  wsSocket = socket
  if (!socket) return

  let heartbeat: number | undefined
  socket.addEventListener('open', () => {
    heartbeat = window.setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' }))
    }, 25000)
  })
  socket.addEventListener('close', (event) => {
    clearInterval(heartbeat)
    // 4003 = fermée par le serveur pour révocation immédiate : pas de reconnexion.
    if (event.code === 4003) {
      handleLogout()
      return
    }
    if (authStore.isAuthenticated) {
      wsReconnectTimer = window.setTimeout(connectWs, 3000)
    }
  })
}

// ---- Présence (GET /presence) — en ligne parmi MES groupes -------------
const refreshPresence = async () => {
  try {
    const { enLigne } = await api.presence()
    onlineAgents.value = new Set(enLigne)
    agentsListRaw.value.forEach((agent) => {
      agent.status = onlineAgents.value.has(agent.id) ? 'En ligne' : 'Hors ligne'
    })
  } catch {
    /* la présence est purement indicative */
  }
}

// ---- Appareils enregistrés (profil) -----------------------------------
const loadDevices = async () => {
  try {
    deviceList.value = await api.devices()
  } catch {
    deviceList.value = []
  }
}

const loadWorkspace = async () => {
  try {
    const [groups, agents] = await Promise.all([api.groups(), api.agents()])
    agentsListRaw.value = agents.map((agent) => ({
      id: agent.id,
      name: `${agent.prenom} ${agent.nom}`,
      role: agent.fonction,
      ministry: agent.ministere,
      status: 'Disponible',
      habiliteParrain: agent.habiliteParrain
    }))
    const moi = meId.value
    conversationsRaw.value = groups.map((group) => {
      const autres = group.membres.filter((member) => member.agentId !== moi)
      const unAutre = autres.length === 1 ? agentsListRaw.value.find((item) => item.id === autres[0].agentId) : null
      return {
        id: group.id,
        name: unAutre?.name ?? 'Groupe',
        isGroup: true,
        lastMessage: 'Aucun message récent',
        time: '',
        classification: 'Normal',
        epoch: group.epoch,
        memberCount: group.membres.length,
        membreIds: group.membres.map((member) => member.agentId),
        monRole: group.monRole
      }
    })
    resolveNames()
    // Noms réels des groupes : dernier message « nom_groupe » chiffré.
    for (const chat of conversationsRaw.value) {
      if ((chat.membreIds ?? []).length !== 2) {
        chat.name = await resoudreNomGroupe(chat.id, chat.name === 'Groupe' ? 'Groupe' : chat.name)
      }
    }
    selectedChat.value = null
    if (conversationsRaw.value[0]) {
      await selectConversation(conversationsRaw.value[0])
    }
  } catch {
    errorMessage.value = 'Impossible de charger votre espace de messagerie.'
  }
  await loadGroupRequests()
}

watch(selectedChat, () => {
  scrollToBottom()
})

const errorMessage = ref('')

const applyTheme = (dark: boolean) => {
  isDarkMode.value = dark
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  localStorage.setItem('goama-theme', dark ? 'dark' : 'light')
}

const toggleTheme = () => applyTheme(!isDarkMode.value)

onMounted(() => {
  chatViewMounted = true
  applyTheme(localStorage.getItem('goama-theme') === 'dark')

  // Le chiffrement n'est annoncé comme actif que si le runtime Megolm
  // réel a été chargé et initialisé.
  const megolmInitialization = megolmService.init().then(() => {
    megolmReady.value = true
  }).catch(() => {
    errorMessage.value = 'La protection des messages n’est pas disponible. La messagerie reste en lecture seule.'
  })

  // Le profil doit être chargé AVANT les groupes : leur interprétation
  // (conversation privée, nom des membres, rôle) dépend de notre agentId.
  void (async () => {
    try {
      const account = await api.accountMe()
      if (!chatViewMounted) return
      authStore.setProfile(account)
      try {
        await publierIdentiteOlm()
      } catch (error) {
        errorMessage.value = 'Impossible d’activer la protection des messages. La messagerie reste bloquée.'
        console.warn('Publication identité Olm impossible :', error)
      }
      // Évite que selectConversation() démarre la création d'une session
      // avant que le module WASM Megolm ait terminé son initialisation.
      await megolmInitialization
      if (!chatViewMounted) return
      await loadWorkspace()
      if (!chatViewMounted) return
      await Promise.all([refreshPresence(), loadDevices()])
      if (!chatViewMounted) return
      connectWs()
      presenceTimer = window.setInterval(() => void refreshPresence(), 30000)
    } catch {
      errorMessage.value = 'Impossible de vérifier votre session. Réessayez ou reconnectez-vous.'
    }
  })()
})

onBeforeUnmount(() => {
  chatViewMounted = false
  clearInterval(presenceTimer)
  clearTimeout(wsReconnectTimer)
  wsSocket?.close()
})
</script>

<template>
  <div class="app-layout">
    <aside class="sidebar-nav">
      <div class="brand-logo" title="Goama">
        <img :src="logoSrc" alt="Logo Goama" class="sidebar-logo-img" />
      </div>
      <nav class="nav-items">
        <button 
          :class="{ active: activeTab === 'chats' }" 
          @click="activeTab = 'chats'" 
          aria-label="Discussions"
          title="Discussions"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14A2.5 2.5 0 0 1 21.5 8v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 3v-3H5A2.5 2.5 0 0 1 2.5 15V8A2.5 2.5 0 0 1 5 5.5Z" /><path d="M7.5 10h9M7.5 13h5" /></svg>
        </button>
        <button 
          :class="{ active: activeTab === 'annuaire' }" 
          @click="activeTab = 'annuaire'" 
          aria-label="Annuaire officiel"
          title="Annuaire officiel"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h11.5A2.5 2.5 0 0 1 19 7v12.5H7.5A2.5 2.5 0 0 1 5 17V4.5Z" /><path d="M5 17a2.5 2.5 0 0 1 2.5-2.5H19M9 8h6M9 11h6" /></svg>
        </button>
        <button
          :class="{ active: activeTab === 'groups' }"
          @click="activeTab = 'groups'"
          aria-label="Mes groupes"
          title="Mes groupes"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3" /><circle cx="16.5" cy="9.5" r="2.5" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M15 15a5 5 0 0 1 5.5 4" /></svg>
        </button>
      </nav>
      <div class="nav-footer">
        <button
          type="button"
          @click="toggleTheme"
          :aria-label="isDarkMode ? 'Activer le mode clair' : 'Activer le mode sombre'"
          :title="isDarkMode ? 'Mode clair' : 'Mode sombre'"
        >
          <svg v-if="isDarkMode" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" /></svg>
        </button>
        <button
          class="profile-btn"
          :class="{ active: activeTab === 'profile' }"
          @click="activeTab = 'profile'"
          aria-label="Mon profil"
          title="Mon profil"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.2" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>
        </button>
        <button class="logout-btn" @click="handleLogout" aria-label="Déconnexion" title="Déconnexion">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H14M11 12h9M17 8l4 4-4 4" /></svg>
        </button>
      </div>
    </aside>

    <section class="panel-list" :class="{ 'hide-mobile': showMobileChat }">
      <header class="panel-header">
        <h3>
          {{ activeTab === 'chats' ? 'Goama' : activeTab === 'annuaire' ? 'Annuaire' : activeTab === 'groups' ? 'Mes groupes' : 'Mon profil' }}
        </h3>
        <button v-if="activeTab === 'groups'" type="button" class="new-group-btn" :disabled="isCreatingGroup" @click="ouvrirAssistant" aria-label="Créer un groupe" title="Créer un groupe">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </header>

      <div class="search-bar" v-if="activeTab === 'chats' || activeTab === 'annuaire'">
        <input 
          type="text" 
          v-model="searchQuery" 
          :placeholder="activeTab === 'chats' ? 'Rechercher une discussion...' : 'Rechercher un agent...'" 
        />
      </div>

      <!-- Onglet Discussions -->
      <div class="conversation-items" v-if="activeTab === 'chats'">
        <p v-if="groupActionMessage" class="group-action-message" role="status">{{ groupActionMessage }}</p>
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
              <span v-if="chat.isGroup" class="member-count">{{ chatNameForCount(chat) }}</span>
              <span v-else-if="chat.unreadCount" class="unread-badge">{{ chat.unreadCount }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="conversation-items" v-else-if="activeTab === 'groups'">
        <p v-if="groupActionMessage" class="group-action-message" role="status">{{ groupActionMessage }}</p>
        <section v-if="groupRequests.length" class="group-requests" aria-label="Demandes de groupe">
          <div v-for="request in groupRequests" :key="request.id" class="group-request-card">
            <div>
              <strong>{{ request.estDemandeur ? `Demande envoyée à ${request.parrain.prenom} ${request.parrain.nom}` : `${request.demandeur.prenom} ${request.demandeur.nom} demande la création du groupe` }}</strong>
              <span class="group-request-name" v-if="request.nomRequest">« {{ request.nomRequest }} »</span>
              <span v-if="(request.membresRequest ?? []).length">{{ (request.membresRequest ?? []).map((id) => agentsListRaw.find((item) => item.id === id)?.name).filter(Boolean).join(', ') }}</span>
              <span v-else>Groupe à deux, sans autre membre choisi</span>
            </div>
            <div v-if="!request.estDemandeur" class="group-request-actions">
              <button type="button" @click="decideGroupRequest(request, true)">Accepter</button>
              <button type="button" @click="decideGroupRequest(request, false)">Refuser</button>
            </div>
          </div>
        </section>

        <!-- Assistant : nom + membres + parrain en une seule soumission -->
        <div v-if="creatingOpen" class="group-assistant">
          <div class="group-assistant-heading">
            <strong>Nouveau groupe</strong>
            <button type="button" @click="creatingOpen = false" aria-label="Fermer">×</button>
          </div>
          <input
            v-model="newGroupName"
            type="text"
            class="group-assistant-name"
            placeholder="Choisissez le nom du groupe"
            aria-label="Nom du groupe"
            maxlength="80"
          />
          <p class="group-assistant-label">Ajouter des membres à l’annuaire</p>
          <div class="group-assistant-people">
            <label v-for="agent in agentsListRaw.filter((item) => item.id !== meId)" :key="agent.id" class="group-assistant-person">
              <input type="checkbox" :checked="newGroupMembers.includes(agent.id)" @change="basculerMembreAssistant(agent.id)" />
              <span class="person-avatar">{{ agent.name.split(' ').map((part) => part[0]).join('').substring(0, 2) }}</span>
              <span class="person-info">
                <strong>{{ agent.name }}</strong>
                <small>{{ agent.role }}{{ agent.habiliteParrain ? ' — parrain habilité' : '' }}</small>
              </span>
            </label>
          </div>
          <template v-if="!estHabiliteParrain">
            <p class="group-assistant-label">Votre poste ne permet pas de créer directement : choisissez un parrain habilité</p>
            <select v-model="newGroupParrainId" class="group-assistant-select" aria-label="Parrain habilité">
              <option value="" disabled>Choisir un parrain</option>
              <option v-for="agent in agentsListRaw.filter((item) => item.habiliteParrain)" :key="agent.id" :value="agent.id">
                {{ agent.name }} — {{ agent.role }}
              </option>
            </select>
          </template>
          <button type="button" class="group-assistant-submit" :disabled="!newGroupName.trim() || isCreatingGroup" @click="soumettreAssistant">
            {{ estHabiliteParrain ? 'Créer le groupe' : 'Soumettre la demande au parrain' }}
          </button>
        </div>
        <button
          v-for="group in conversationsRaw.filter((conversation) => conversation.isGroup)"
          :key="group.id"
          :data-group-id="group.id"
          type="button"
          class="conversation-card group-card"
          @click="openGroup(group)"
        >
          <div class="avatar group-avatar">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3" /><circle cx="16.5" cy="9.5" r="2.5" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M15 15a5 5 0 0 1 5.5 4" /></svg>
          </div>
          <span class="info">
            <span class="top-row"><span class="title">{{ group.name }}</span><span class="member-count">{{ chatNameForCount(group) }}</span></span>
            <span class="bottom-row"><span class="preview">{{ group.lastMessage }}</span></span>
          </span>
        </button>
        <p v-if="!conversationsRaw.some((conversation) => conversation.isGroup)" class="group-empty">Aucun groupe pour le moment.</p>
      </div>

      <!-- Onglet Annuaire des agents -->
      <div class="conversation-items" v-else-if="activeTab === 'annuaire'">
        <div
          v-for="agent in filteredAgents"
          :key="agent.id"
          class="conversation-card"
          :class="{ 'is-disabled': agent.id === meId }"
          @click="agent.id === meId ? undefined : startAgentChat(agent)"
        >
          <div class="avatar agent-avatar">{{ agent.name.split(' ').map((part) => part[0]).join('').substring(0, 2) }}</div>
          <div class="info">
            <div class="top-row">
              <span class="title">{{ agent.name }}</span>
              <span class="time ministry-tag">{{ agent.ministry }}</span>
            </div>
            <div class="bottom-row">
              <p class="preview">{{ agent.role }}</p>
              <span v-if="megolmReady" class="security-status">Protection active</span>
              <span v-else class="security-status security-warning">Protection indisponible</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Onglet Profil -->
      <div class="profile-container" v-else-if="activeTab === 'profile'">
        <div v-if="errorMessage" class="error-banner" role="alert">{{ errorMessage }}</div>
        <section class="profile-card">
          <div class="profile-card-title">
            <span>Mon profil</span>
            <span class="profile-status-dot">Actif</span>
          </div>
          <div class="profile-heading">
            <div class="profile-avatar">{{ authStore.profile ? `${authStore.profile.prenom[0]}${authStore.profile.nom[0]}` : authStore.userEmail.substring(0, 2) }}</div>
            <div>
              <strong>{{ authStore.profile ? `${authStore.profile.prenom} ${authStore.profile.nom}` : 'Utilisateur Goama' }}</strong>
              <span>{{ authStore.profile?.role === 'ADMIN' ? 'Administrateur' : 'Agent Goama' }}</span>
            </div>
          </div>
          <div class="profile-details">
            <div><span>Matricule</span><strong>{{ authStore.profile?.matricule ?? authStore.userEmail }}</strong></div>
            <div><span>Statut du compte</span><strong class="settings-status">{{ authStore.profile?.statut === 'ACTIF' ? 'Compte actif' : (authStore.profile?.statut ?? 'Compte actif') }}</strong></div>
          </div>
        </section>

        <section class="profile-card profile-security-card">
          <div class="profile-card-title"><span>Sécurité et affichage</span></div>
          <p>{{ !megolmReady ? 'La protection des messages n’est pas disponible. Aucun échange ne peut être envoyé ou déchiffré.' : (groupSessionReady ? 'Cette conversation est protégée. Les participants autorisés peuvent échanger des messages.' : 'La protection de cette conversation est en cours de préparation.') }}</p>
          <div class="profile-details">
            <div><span>Protection des messages</span><strong>{{ megolmReady ? 'Active' : 'Indisponible' }}</strong></div>
            <div><span>Session</span><strong>{{ authStore.isAuthenticated ? 'Connectée' : 'Déconnectée' }}</strong></div>
            <div><span>Thème</span><strong>{{ isDarkMode ? 'Mode sombre' : 'Mode clair' }}</strong></div>
          </div>
        </section>

        <section class="profile-card">
          <div class="profile-card-title"><span>Mes appareils</span></div>
          <div v-for="device in deviceList" :key="device.id" class="profile-details">
            <div><span>{{ device.label || 'Appareil' }}</span><strong class="settings-status">{{ device.statut }}</strong></div>
            <div v-if="device.enrolledAt"><span>Enregistré le</span><strong>{{ new Date(device.enrolledAt).toLocaleDateString() }}</strong></div>
          </div>
          <p v-if="!deviceList.length" class="devices-empty">Aucun appareil enregistré pour ce compte.</p>
        </section>

      </div>
    </section>

    <main class="chat-area" :class="{ 'show-mobile': showMobileChat }" :data-selected-chat-id="selectedChat?.id ?? ''">
      <template v-if="selectedChat">
        <header class="chat-header">
          <div class="header-left">
            <button class="back-mobile-btn" @click="showMobileChat = false" aria-label="Retour aux conversations" title="Retour aux conversations"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7M8 12h13" /></svg></button>
            <div class="chat-title-info">
              <h4>{{ selectedChat.name }}</h4>
              <span class="chat-head-subtitle">
                <span v-if="!megolmReady" class="security-status security-warning">Protection indisponible</span>
                <span v-else-if="!groupSessionReady" class="security-status security-warning">Protection en cours…</span>
                <span v-else-if="statutChatHead" class="chat-online-label">{{ statutChatHead }}</span>
                <span v-else class="security-status"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>Conversation protégée</span>
              </span>
            </div>
          </div>
          <div class="header-actions">
            <span v-if="selectedChat.isGroup" class="conversation-meta">
              {{ chatNameForCount(selectedChat) }}
            </span>
            <button
              v-if="selectedChat.isGroup"
              type="button"
              class="members-toggle"
              @click="toggleMembers"
              aria-label="Gérer les membres"
              title="Gérer les membres"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3" /><circle cx="16.5" cy="9.5" r="2.5" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M15 15a5 5 0 0 1 5.5 4" /></svg>
            </button>
            <span 
              class="classification-tag" 
              :class="selectedChat.classification.toLowerCase().replace(' ', '-')"
            >
              {{ selectedChat.classification }}
            </span>
          </div>
        </header>

        <!-- Panneau des membres du groupe -->
        <div v-if="membersOpen && selectedChat.isGroup" class="members-panel">
          <div class="members-panel-heading">
            <strong>Membres du groupe</strong>
            <button type="button" @click="membersOpen = false" aria-label="Fermer">×</button>
          </div>
          <p v-if="membersMessage" class="members-message" role="status">{{ membersMessage }}</p>
          <div v-for="member in groupMembersMap[selectedChat.id] || []" :key="member.id" class="member-row">
            <span class="member-name"><em>{{ member.role }}</em>{{ member.name }}<small v-if="member.empreinte" class="member-fingerprint">Empreinte à comparer : {{ member.empreinte }}</small><small v-else class="member-fingerprint">Empreinte indisponible</small></span>
            <button
              v-if="selectedChat.monRole === 'PARRAIN' && member.id !== meId"
              type="button"
              class="member-remove"
              @click="removeMemberFromGroup(member.id)"
              aria-label="Retirer du groupe"
              title="Retirer du groupe"
            >×</button>
          </div>
          <p v-if="!(groupMembersMap[selectedChat.id] || []).length" class="members-message">Aucun membre pour le moment.</p>
          <div class="member-rename" v-if="selectedChat?.monRole === 'PARRAIN'">
            <input v-model="memberRenameField" type="text" placeholder="Nommer le groupe..." aria-label="Nom du groupe" @keyup.enter="renommerGroupe" />
            <button type="button" :disabled="!memberRenameField.trim()" @click="renommerGroupe">Nommer</button>
          </div>
          <div class="member-add">
            <select v-model="memberToAdd" aria-label="Ajouter un agent au groupe">
              <option value="" disabled>Choisir un agent</option>
              <option
                v-for="agent in agentsListRaw.filter((item) => !(groupMembersMap[selectedChat!.id] || []).some((member) => member.id === item.id))"
                :key="agent.id"
                :value="agent.id"
              >
                {{ agent.name }} — {{ agent.ministry }}
              </option>
            </select>
            <button type="button" :disabled="!memberToAdd" @click="addMemberToGroup">Ajouter</button>
          </div>
        </div>

        <div class="messages-feed" ref="messagesFeedRef">
          <div v-if="!(messagesMap[selectedChat?.id ?? ''] || []).length" class="conversation-empty">
            <div class="conversation-empty-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14A2.5 2.5 0 0 1 21.5 8v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 3v-3H5A2.5 2.5 0 0 1 2.5 15V8A2.5 2.5 0 0 1 5 5.5Z" /><path d="M8 10h8M8 13h5" /></svg>
            </div>
            <strong>Commencez la conversation</strong>
            <span>Les messages échangés ici restent protégés entre les participants.</span>
          </div>
          <template v-for="item in messagesAffichees" :key="item.key">
            <div v-if="item.divider" class="day-divider"><span>{{ item.divider }}</span></div>
            <div
              v-else-if="item.message"
              class="message-bubble"
              :class="item.message.sent ? 'sent' : 'received'"
            >
              <button
                type="button"
                class="msg-reply-btn"
                @click="setReplyTarget(item.message)"
                aria-label="Répondre à ce message"
                title="Répondre"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 3-6 5 6 5M3 8h10a6 6 0 0 1 6 6v5" /></svg>
              </button>
              <span class="sender" v-if="!item.message.sent && (selectedChat?.memberCount ?? 0) > 2">{{ item.message.sender }}</span>
              <div v-if="item.message.reply" class="reply-quote">
                <strong>{{ item.message.reply.auteur === 'Moi' ? 'Vous' : item.message.reply.auteur }}</strong>
                <span>{{ item.message.reply.texte }}</span>
              </div>
              <template v-if="item.message.attachment">
                <p class="content content-attachment">{{ item.message.content }} · {{ humanSize(item.message.attachment.taille) }}</p>
                <button type="button" class="attachment-download" @click="downloadAttachment(item.message)">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v10M8 11l4 4 4-4M5 19h14" /></svg>
                  Télécharger
                </button>
              </template>
              <p class="content" v-else>{{ item.message.content }}</p>
              <span class="timestamp">
                {{ item.message.time }}
                <svg
                  v-if="item.message.sent"
                  class="ticks"
                  :class="{ read: item.message.status === 'lu' }"
                  viewBox="0 0 18 12"
                  aria-hidden="true"
                ><path d="M1 6.5 3.5 9 8 3" /><path d="M7.5 8.2 9.5 10.5 15 3" /></svg>
              </span>
            </div>
          </template>
        </div>

        <footer class="chat-input-area">
          <input 
            type="file" 
            ref="fileInputRef" 
            class="hidden"
            @change="handleFileUpload" 
          />
          <div v-if="replyTarget" class="chat-reply-preview">
            <div class="chat-reply-body">
              <strong>{{ replyTarget.sender === 'Moi' ? 'Réponse à votre message' : `Réponse à ${replyTarget.sender}` }}</strong>
              <span>{{ replyTarget.attachment ? `Pièce jointe : ${replyTarget.attachment.name}` : replyTarget.content }}</span>
            </div>
            <button type="button" class="chat-reply-cancel" @click="cancelReply" aria-label="Annuler la réponse">×</button>
          </div>
          <div class="chat-compose">
            <button type="button" class="attach-btn" :disabled="!megolmReady || !groupSessionReady" @click="triggerFileInput" title="Joindre un fichier chiffré" aria-label="Joindre un fichier chiffré"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8.5 12.5 6.8-6.8a3.5 3.5 0 0 1 5 5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.4-8.4" /></svg></button>
            <textarea 
              v-model="newMessage" 
              rows="1"
              placeholder="Message chiffré"
              @keydown="($event) => { if ($event.key === 'Enter' && !$event.shiftKey) { $event.preventDefault(); sendMessage() } }"
            ></textarea>
            <button type="button" class="send-btn" @click="sendMessage" :disabled="!megolmReady || !groupSessionReady || !newMessage.trim()" aria-label="Envoyer le message"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 8-16 8 3.2-8L4 4Z" /><path d="M7.2 12h12.8" /></svg></button>
          </div>
        </footer>
      </template>

      <div v-else class="empty-state">
        <p>Sélectionnez une conversation pour commencer à échanger.</p>
      </div>
    </main>
  </div>
 </template>
