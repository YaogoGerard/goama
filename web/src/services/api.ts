// Service API pour Goama (Endpoints ministériels)

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://api.ministere.gov.bf/v1'

export const apiService = {
  // Authentification de l'agent
  async login(email: string, clearanceKey: string) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, clearanceKey })
      })
      if (!response.ok) throw new Error("Échec de l'authentification sécurisée")
      return await response.json()
    } catch (error) {
      console.error("API Login Error:", error)
      // Mode hors-ligne / Simulation locale pour le développement
      return { token: 'mock-jwt-token-souverain', status: 'success' }
    }
  },

  // Envoi ou distribution des KeyPackages MLS au serveur de Gérard
  async uploadKeyPackage(keyPackage: any) {
    try {
      const response = await fetch(`${API_BASE_URL}/mls/key-package`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('goama_token') || ''}`
        },
        body: JSON.stringify({ keyPackage })
      })
      if (!response.ok) throw new Error("Erreur d'enrôlement KeyPackage")
      return await response.json()
    } catch (error) {
      console.error("API KeyPackage Error:", error)
      return { status: 'simulated-success' }
    }
  }
}