import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  // État de l'utilisateur connecté
  const isAuthenticated = ref<boolean>(localStorage.getItem('goama_token') !== null)
  const userEmail = ref<string>(localStorage.getItem('goama_matricule') ?? '')
  const userRole = ref<string>('')
  const profile = ref<{ id: string; matricule: string; prenom: string; nom: string; role: string; statut: string } | null>(null)

  // Fonction de connexion
  const login = (matricule: string, token: string, role = '') => {
    userEmail.value = matricule
    if (role) userRole.value = role
    isAuthenticated.value = true
    localStorage.setItem('goama_auth', 'true')
    localStorage.setItem('goama_token', token)
    localStorage.setItem('goama_matricule', matricule)
  }

  const setProfile = (value: { id: string; matricule: string; prenom: string; nom: string; role: string; statut: string }) => {
    profile.value = value
    userRole.value = value.role
  }

  // Fonction de déconnexion et nettoyage
  const logout = () => {
    isAuthenticated.value = false
    userEmail.value = ''
    userRole.value = ''
    profile.value = null
    localStorage.removeItem('goama_auth')
    localStorage.removeItem('goama_token')
    localStorage.removeItem('goama_matricule')
    sessionStorage.clear()
  }

  return {
    isAuthenticated,
    userEmail,
    userRole,
    profile,
    login,
    setProfile,
    logout
  }
})