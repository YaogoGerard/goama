import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  // État de l'utilisateur connecté
  const isAuthenticated = ref<boolean>(true)
  const userEmail = ref<string>('agent@ministere.gov.bf')
  const userRole = ref<string>('Secret Défense')

  // Fonction de connexion
  const login = (email: string, role?: string) => {
    userEmail.value = email
    if (role) userRole.value = role
    isAuthenticated.value = true
    localStorage.setItem('goama_auth', 'true')
    localStorage.setItem('goama_email', email)
  }

  // Fonction de déconnexion et nettoyage
  const logout = () => {
    isAuthenticated.value = false
    userEmail.value = ''
    localStorage.removeItem('goama_auth')
    localStorage.removeItem('goama_email')
    sessionStorage.clear()
  }

  return {
    isAuthenticated,
    userEmail,
    userRole,
    login,
    logout
  }
})