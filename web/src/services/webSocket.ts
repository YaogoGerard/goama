// Service WebSocket pour la messagerie instantanée sécurisée

type MessageCallback = (data: any) => void

export class SecureWebSocketService {
  private socket: WebSocket | null = null
  private url: string

  constructor(url: string = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`) {
    this.url = url
  }

  // Établir la connexion sécurisée
  connect(onMessageReceived: MessageCallback) {
    try {
      this.socket = new WebSocket(this.url)

      this.socket.onopen = () => {
        console.log("🔒 Canal WebSocket sécurisé établi.")
      }

      this.socket.onmessage = (event) => {
        const data = JSON.parse(event.data)
        onMessageReceived(data)
      }

      this.socket.onerror = (error) => {
        console.error("Erreur WebSocket:", error)
      }

      this.socket.onclose = () => {
        console.log("Canal WebSocket fermé. Tentative de reconnexion...")
        setTimeout(() => this.connect(onMessageReceived), 5000)
      }
    } catch (error) {
      console.error("Impossible d'établir le canal WebSocket.", error)
    }
  }

  // Envoyer un message chiffré sur le WebSocket
  send(payload: any) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload))
    } else {
      console.warn("WebSocket non connectée. Message stocké localement uniquement.")
    }
  }

  // Fermer la connexion (ex: lors du Protocole Panique ou déconnexion)
  disconnect() {
    if (this.socket) {
      this.socket.close()
      this.socket = null
    }
  }
}

export const wsService = new SecureWebSocketService()