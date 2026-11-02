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
const showSecret = ref(false)
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
  <main class="relative grid min-h-svh place-items-center overflow-hidden bg-[#0f0f0f] px-5 py-10">
    <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_8%,rgba(245,183,0,0.16),transparent_34rem)]"></div>
    <div class="pointer-events-none absolute -bottom-32 -left-24 size-80 rounded-full border border-[#a96e2d]/20 shadow-[0_0_0_18px_rgba(169,110,45,0.03),0_0_0_36px_rgba(245,183,0,0.02)]"></div>
    <section class="w-full max-w-[420px] rounded-2xl border border-[#e4dfd4] bg-[#fffdf8] p-6 text-slate-900 shadow-[0_24px_60px_rgba(0,0,0,0.32)] sm:p-8">
      <div class="mb-7 text-center">
        <img :src="logoSrc" alt="Goama" class="mx-auto mb-5 size-12 rounded-xl object-contain">
        <h1 class="text-2xl font-semibold tracking-[-0.03em] text-[#211d16]">Bienvenue sur Goama</h1>
        <p class="mt-2 text-sm text-[#655d50]">Accédez à votre messagerie professionnelle.</p>
      </div>

      <div>
        <form class="grid gap-5" @submit.prevent="handleLogin">
          <div v-if="errorMessage" class="rounded-lg border border-red-300 bg-red-50 px-3.5 py-3 text-sm text-red-700" role="alert">
            {{ errorMessage }}
          </div>

          <label class="grid gap-2 text-sm font-medium text-[#211d16]">
            <span>Matricule</span>
            <input v-model="matricule" class="h-11 w-full rounded-lg border border-[#d8d1c4] bg-white px-3.5 text-sm text-[#211d16] outline-none transition placeholder:text-[#a39a8b] focus:border-[#a97800] focus:ring-4 focus:ring-[#f5b700]/15" autocomplete="username" placeholder="Votre matricule" required>
          </label>

          <div class="grid gap-2 text-sm font-medium text-[#211d16]">
            <label for="web-password" class="cursor-pointer">Mot de passe</label>
            <span class="relative">
              <input id="web-password" v-model="secret" class="h-11 w-full rounded-lg border border-[#d8d1c4] bg-white px-3.5 pr-11 text-sm text-[#211d16] outline-none transition placeholder:text-[#a39a8b] focus:border-[#a97800] focus:ring-4 focus:ring-[#f5b700]/15" :type="showSecret ? 'text' : 'password'" autocomplete="current-password" placeholder="Votre mot de passe" required>
              <button
                type="button"
                class="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md border-0 bg-transparent text-[#857b69] transition hover:bg-[#f1ebdd] hover:text-[#211d16] focus:outline-none focus:ring-2 focus:ring-[#a97800]/30"
                :aria-label="showSecret ? 'Masquer' : 'Afficher'"
                :title="showSecret ? 'Masquer le mot de passe' : 'Afficher le mot de passe'"
                @click="showSecret = !showSecret"
              >
                <svg v-if="showSecret" class="size-[18px] fill-none stroke-current stroke-[1.8]" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.7 10.7 0 0 1 12 5c5.2 0 8.8 4.4 9.8 6.4a11.8 11.8 0 0 1-3.1 3.8M6.2 6.2C3.9 7.7 2.5 10 2.2 11.4 3.2 13.5 6.8 18 12 18c1 0 1.9-.2 2.8-.5" />
                </svg>
                <svg v-else class="size-[18px] fill-none stroke-current stroke-[1.8]" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.2 12S5.4 5 12 5s9.8 7 9.8 7-3.2 7-9.8 7-9.8-7-9.8-7Z" />
                  <circle cx="12" cy="12" r="2.8" />
                </svg>
              </button>
            </span>
          </div>

          <label class="grid gap-2 text-sm font-medium text-[#211d16]">
            <span>Code de vérification</span>
            <input v-model="codeTotp" class="h-11 w-full rounded-lg border border-[#d8d1c4] bg-white px-3.5 text-sm font-medium tracking-[0.24em] text-[#211d16] outline-none transition placeholder:tracking-normal placeholder:text-[#a39a8b] focus:border-[#a97800] focus:ring-4 focus:ring-[#f5b700]/15" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="6 chiffres" required>
          </label>

          <button class="mt-1 h-11 rounded-lg border border-[#f5b700] bg-[#f5b700] px-4 text-sm font-semibold text-[#2b1d00] transition hover:bg-[#ffd15a] focus:outline-none focus:ring-4 focus:ring-[#f5b700]/20 disabled:cursor-wait disabled:opacity-60" type="submit" :disabled="isLoading">
            {{ isLoading ? 'Connexion…' : 'Se connecter' }}
          </button>
        </form>
      </div>

      <p class="mt-5 text-center text-xs text-[#857b69]">Utilisez le code fourni par votre application d’authentification.</p>
    </section>
  </main>
</template>
