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
  <main class="grid min-h-svh place-items-center bg-linear-to-br from-slate-50 to-sky-100 p-6">
    <section class="w-full max-w-[430px] rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_20px_50px_rgba(15,23,42,0.12)] sm:p-11">
      <img :src="logoSrc" alt="Goama" class="mx-auto mb-5 size-14 rounded-[14px]">
      <p class="mb-1 text-center text-xs font-bold uppercase tracking-[0.08em] text-sky-600">Messagerie professionnelle</p>
      <h1 class="text-center text-3xl font-bold text-slate-900">Bienvenue sur Goama</h1>
      <p class="my-3 mb-7 text-center text-sm leading-6 text-slate-500">Accédez à vos échanges avec votre identité professionnelle.</p>
      <form class="grid gap-4" @submit.prevent="handleLogin">
        <div v-if="errorMessage" class="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">{{ errorMessage }}</div>
        <label class="grid gap-1.5 text-xs font-semibold text-slate-700">Matricule <input v-model="matricule" class="w-full rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-600 focus:ring-4 focus:ring-sky-600/15" autocomplete="username" placeholder="Ex. AG001" required></label>
        <label class="grid gap-1.5 text-xs font-semibold text-slate-700">Mot de passe <input v-model="secret" class="w-full rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-600 focus:ring-4 focus:ring-sky-600/15" type="password" autocomplete="current-password" required></label>
        <label class="grid gap-1.5 text-xs font-semibold text-slate-700">Code de vérification <input v-model="codeTotp" class="w-full rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-600 focus:ring-4 focus:ring-sky-600/15" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" required></label>
        <button class="mt-1 rounded-lg border-0 bg-slate-900 px-4 py-3.5 font-bold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-65" type="submit" :disabled="isLoading">{{ isLoading ? 'Connexion…' : 'Se connecter' }}</button>
      </form>
      <p class="mt-5 text-center text-xs leading-5 text-slate-500">Votre code de vérification est fourni par votre application d’authentification.</p>
    </section>
  </main>
</template>
