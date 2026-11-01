// Définitions des types et interfaces pour l'application Goama

export interface UserProfile {
  email: string
  clearanceLevel: 'Secret Défense' | 'Confidentiel Défense' | 'Diffusion Restreinte'
  role: string
  isActive: boolean
}

export interface ChatMessage {
  id: number
  chatId: string
  sender: string
  content: string
  time: string
  sent: boolean
  timestamp: number
}

export interface ChatRoom {
  id: string
  title: string
  protocol: string
  classification: string
  participantsCount: number
}

export interface MLSKeyPackageState {
  keyPackageId: string
  status: 'active' | 'revoked' | 'pending'
  createdAt: number
}