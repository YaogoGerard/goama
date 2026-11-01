<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { api } from '../services/api'
import logoSrc from '../assets/logo.png'

const router = useRouter()
const authStore = useAuthStore()
const matricule = ref('')
const secret = ref('')
const codeTotp = ref('')
const errorMessage = ref('')
const isLoading = ref(false)

const handleLogin = async () => {
  if (!matricule.value.trim() || !secret.value || !/^\d{6}$/.test(codeTotp.value)) {
    errorMessage.value = 'Renseignez votre matricule, votre mot de passe et le code à 6 chiffres.'
    return
  }
  isLoading.value = true
  errorMessage.value = ''
  try {
    const session = await api.login({
      matricule: matricule.value.trim(),
      secret: secret.value,
      codeTotp: codeTotp.value
    })
    authStore.login(matricule.value.trim(), session.jeton)
    await router.push('/chat')
  } catch {
    errorMessage.value = 'Identifiants ou code de sécurité invalides.'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-card">
      <img :src="logoSrc" alt="Goama" class="login-logo">
      <p class="eyebrow">Messagerie professionnelle</p>
      <h1>Bienvenue sur Goama</h1>
      <p class="intro">Accédez à vos échanges avec votre identité professionnelle.</p>
      <form class="login-form" @submit.prevent="handleLogin">
        <div v-if="errorMessage" class="error-banner" role="alert">{{ errorMessage }}</div>
        <label>Matricule <input v-model="matricule" autocomplete="username" placeholder="Ex. AG001" required></label>
        <label>Mot de passe <input v-model="secret" type="password" autocomplete="current-password" required></label>
        <label>Code de vérification <input v-model="codeTotp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" required></label>
        <button class="submit-btn" type="submit" :disabled="isLoading">{{ isLoading ? 'Connexion…' : 'Se connecter' }}</button>
      </form>
      <p class="login-note">Votre code de vérification est fourni par votre application d’authentification.</p>
    </section>
  </main>
</template>

<style scoped>
.login-page { min-height: 100svh; display: grid; place-items: center; padding: 1.5rem; background: linear-gradient(135deg, #f8fafc 0%, #e0f2fe 100%); }
.login-card { width: min(100%, 430px); padding: clamp(1.75rem, 5vw, 2.75rem); background: #fff; border: 1px solid #e2e8f0; border-radius: 1.25rem; box-shadow: 0 20px 50px rgba(15, 23, 42, .12); }
.login-logo { display: block; width: 58px; height: 58px; margin: 0 auto 1.25rem; border-radius: 14px; }
.eyebrow { margin: 0 0 .4rem; color: #0284c7; font-size: .75rem; font-weight: 700; letter-spacing: .08em; text-align: center; text-transform: uppercase; }
h1 { margin: 0; color: #0f172a; font-size: clamp(1.5rem, 4vw, 1.9rem); text-align: center; }
.intro, .login-note { color: #64748b; font-size: .9rem; line-height: 1.5; text-align: center; }
.intro { margin: .65rem 0 1.75rem; }
.login-form { display: grid; gap: 1rem; }
label { display: grid; gap: .4rem; color: #334155; font-size: .8rem; font-weight: 650; }
input { width: 100%; padding: .8rem .9rem; border: 1px solid #cbd5e1; border-radius: .65rem; background: #f8fafc; color: #0f172a; font: inherit; outline: none; }
input:focus { border-color: #0284c7; box-shadow: 0 0 0 3px rgba(2, 132, 199, .15); }
.error-banner { padding: .7rem .8rem; border-radius: .6rem; background: #fef2f2; color: #b91c1c; font-size: .8rem; }
.submit-btn { margin-top: .25rem; padding: .85rem 1rem; border: 0; border-radius: .65rem; background: #0f172a; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
.submit-btn:hover { background: #1e293b; }
.submit-btn:disabled { cursor: wait; opacity: .65; }
.login-note { margin: 1.25rem 0 0; font-size: .75rem; }
</style>
