import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, setAccessToken } from '../services/api'

export const useAuthStore = defineStore('auth', () => {
  const isAuthenticated = ref(false)
  const userEmail = ref('')
  const userRole = ref('')
  const profile = ref<{ id: string; matricule: string; prenom: string; nom: string; role: string; statut: string } | null>(null)
  let initialisation: Promise<void> | null = null
  let initialise = false

  const login = (matricule: string, token: string, role = '') => {
    setAccessToken(token)
    userEmail.value = matricule
    if (role) userRole.value = role
    isAuthenticated.value = true
    initialise = true
  }

  const initialize = async () => {
    if (initialise) return
    if (initialisation) return initialisation
    initialise = true
    initialisation = (async () => {
      // Supprime les JWT persistés par les anciennes versions du client.
      localStorage.removeItem('goama_token')
      localStorage.removeItem('goama_auth')
      localStorage.removeItem('goama_matricule')
      try {
        const session = await api.refresh()
        setAccessToken(session.jeton)
        isAuthenticated.value = true
        const account = await api.accountMe()
        setProfile(account)
        userEmail.value = account.matricule
      } catch {
        setAccessToken(null)
        isAuthenticated.value = false
      }
    })().finally(() => { initialisation = null })
    return initialisation
  }

  const setProfile = (value: { id: string; matricule: string; prenom: string; nom: string; role: string; statut: string }) => {
    profile.value = value
    userRole.value = value.role
    userEmail.value = value.matricule
  }

  const logout = () => {
    initialise = true
    setAccessToken(null)
    isAuthenticated.value = false
    userEmail.value = ''
    userRole.value = ''
    profile.value = null
    sessionStorage.clear()
  }

  return { isAuthenticated, userEmail, userRole, profile, login, initialize, setProfile, logout }
})
