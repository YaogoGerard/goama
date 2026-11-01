<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import logoSrc from '../assets/logo.png'

const router = useRouter()
const authStore = useAuthStore()

const email = ref('agent@ministere.gov.bf')
const password = ref('')
const errorMessage = ref('')
const isLoading = ref(false)

const handleLogin = async () => {
  if (!email.value.trim() || !password.value.trim()) {
    errorMessage.value = "Veuillez renseigner tous les champs de sécurité."
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  try {
    // Simulation d'une vérification d'authentification chiffrée
    await new Promise(resolve => setTimeout(resolve, 800))
    
    authStore.login(email.value, 'Secret Défense')
    router.push('/chat')
  } catch (err) {
    errorMessage.value = "Échec de l'authentification cryptographique."
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="login-container">
    <div class="login-card">
      <div class="logo-wrapper">
        <img :src="logoSrc" alt="Logo Goama" class="login-logo" />
      </div>
      <h2>Portail Sécurisé Goama</h2>
      <p class="subtitle">Chiffrement E2EE - OpenMLS & IndexedDB</p>

      <form @submit.prevent="handleLogin" class="login-form">
        <div v-if="errorMessage" class="error-banner">
          {{ errorMessage }}
        </div>

        <div class="input-group">
          <label for="email">Identifiant Agent (E-mail)</label>
          <input 
            type="email" 
            id="email" 
            v-model="email" 
            placeholder="agent@ministere.gov.bf" 
            required 
          />
        </div>

        <div class="input-group">
          <label for="password">Clé d'accès / Mot de passe</label>
          <input 
            type="password" 
            id="password" 
            v-model="password" 
            placeholder="••••••••••••" 
            required 
          />
        </div>

        <button type="submit" class="submit-btn" :disabled="isLoading">
          {{ isLoading ? 'Connexion sécurisée en cours...' : 'Accéder au réseau chiffré' }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100vw;
  height: 100vh;
  background-color: #0f172a;
  position: fixed;
  top: 0;
  left: 0;
  box-sizing: border-box;
}

.login-card {
  background-color: #ffffff;
  padding: 2.5rem;
  border-radius: 12px;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.logo-wrapper {
  margin-bottom: 1rem;
}

.login-logo {
  width: 64px;
  height: 64px;
  object-fit: contain;
  border-radius: 12px;
}

h2 {
  font-size: 1.25rem;
  color: #0f172a;
  margin: 0 0 0.25rem 0;
  font-weight: 700;
  text-align: center;
}

.subtitle {
  font-size: 0.8rem;
  color: #64748b;
  margin-bottom: 1.5rem;
  text-align: center;
}

.login-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.input-group label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #334155;
}

.input-group input {
  padding: 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.9rem;
  outline: none;
  background-color: #f8fafc;
  transition: border-color 0.2s;
}

.input-group input:focus {
  border-color: #0284c7;
}

.error-banner {
  background-color: #fee2e2;
  color: #dc2626;
  font-size: 0.8rem;
  padding: 0.5rem;
  border-radius: 6px;
  text-align: center;
  font-weight: 500;
}

.submit-btn {
  background-color: #0f172a;
  color: white;
  border: none;
  padding: 0.75rem;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  margin-top: 0.5rem;
  transition: background-color 0.2s;
}

.submit-btn:hover {
  background-color: #1e293b;
}

.submit-btn:disabled {
  background-color: #94a3b8;
  cursor: not-allowed;
}
</style>