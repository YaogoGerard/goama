<script setup lang="ts">
import { onMounted, ref } from 'vue'
import QRCode from 'qrcode'
import { api } from '../services/api'
import logoSrc from '../assets/logo.png'

const matricule = ref('')
const code = ref('')
const secret = ref('')
const confirmSecret = ref('')
const showSecret = ref(false)
const showConfirmSecret = ref(false)
const errorMessage = ref('')
const isLoading = ref(false)
const activation = ref<{ totpSecret: string; uri: string } | null>(null)
const qrCode = ref('')

onMounted(() => {
  const params = new URLSearchParams(window.location.hash.slice(1))
  matricule.value = params.get('matricule') ?? ''
  code.value = params.get('code') ?? ''
  window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`)
})

const activate = async () => {
  errorMessage.value = ''
  if (!matricule.value || !code.value || secret.value.length < 8) {
    errorMessage.value = 'Le lien est incomplet ou le mot de passe est trop court.'
    return
  }
  if (secret.value !== confirmSecret.value) {
    errorMessage.value = 'Les mots de passe ne correspondent pas.'
    return
  }
  isLoading.value = true
  try {
    activation.value = await api.activate({ matricule: matricule.value, code: code.value, secret: secret.value })
    qrCode.value = await QRCode.toDataURL(activation.value.uri, {
      width: 220,
      margin: 1,
      color: { dark: '#211d16', light: '#fffdf8' }
    })
  } catch (error) {
    errorMessage.value = error instanceof TypeError
      ? 'Le service est momentanément inaccessible. Vérifiez la connexion puis réessayez.'
      : 'Ce lien est invalide, expiré ou déjà utilisé.'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <main class="relative grid min-h-svh place-items-center overflow-hidden bg-[#0f0f0f] px-5 py-10">
    <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_8%,rgba(245,183,0,0.16),transparent_34rem)]"></div>
    <section class="relative w-full max-w-[420px] rounded-2xl border border-[#e4dfd4] bg-[#fffdf8] p-6 text-slate-900 shadow-[0_24px_60px_rgba(0,0,0,0.32)] sm:p-8">
      <div class="mb-7 text-center">
        <img :src="logoSrc" alt="Goama" class="mx-auto mb-4 size-12 rounded-xl object-contain">
        <h1 class="text-2xl font-semibold tracking-[-0.03em] text-[#211d16]">
          {{ activation ? 'Sécuriser votre accès' : 'Activer votre accès' }}
        </h1>
        <p class="mt-2 text-sm text-[#655d50]">
          {{ activation ? 'Scannez le QR code avec votre application d’authentification.' : 'Définissez votre mot de passe pour commencer.' }}
        </p>
      </div>

      <div v-if="errorMessage" class="mb-5 rounded-lg border border-red-300 bg-red-50 px-3.5 py-3 text-sm text-red-700" role="alert">
        {{ errorMessage }}
      </div>

      <form v-if="!activation" class="grid gap-5" @submit.prevent="activate">
        <label class="grid gap-2 text-sm font-medium text-[#211d16]">
          <span>Matricule</span>
          <input v-model="matricule" class="h-11 rounded-lg border border-[#d8d1c4] bg-white px-3.5 text-sm outline-none focus:border-[#a97800] focus:ring-4 focus:ring-[#f5b700]/15" required>
        </label>
        <label class="grid gap-2 text-sm font-medium text-[#211d16]">
          <span>Nouveau mot de passe</span>
          <span class="relative">
            <input v-model="secret" class="h-11 w-full rounded-lg border border-[#d8d1c4] bg-white px-3.5 pr-11 text-sm outline-none focus:border-[#a97800] focus:ring-4 focus:ring-[#f5b700]/15" :type="showSecret ? 'text' : 'password'" minlength="8" autocomplete="new-password" required>
            <button type="button" class="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md border-0 bg-transparent text-[#857b69] hover:bg-[#f1ebdd] hover:text-[#211d16] focus:outline-none focus:ring-2 focus:ring-[#a97800]/30" :aria-label="showSecret ? 'Masquer' : 'Afficher'" :title="showSecret ? 'Masquer le mot de passe' : 'Afficher le mot de passe'" @click="showSecret = !showSecret">
              <svg v-if="showSecret" class="size-[18px] fill-none stroke-current stroke-[1.8]" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.7 10.7 0 0 1 12 5c5.2 0 8.8 4.4 9.8 6.4a11.8 11.8 0 0 1-3.1 3.8M6.2 6.2C3.9 7.7 2.5 10 2.2 11.4 3.2 13.5 6.8 18 12 18c1 0 1.9-.2 2.8-.5" /></svg>
              <svg v-else class="size-[18px] fill-none stroke-current stroke-[1.8]" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M2.2 12S5.4 5 12 5s9.8 7 9.8 7-3.2 7-9.8 7-9.8-7-9.8-7Z" /><circle cx="12" cy="12" r="2.8" /></svg>
            </button>
          </span>
        </label>
        <label class="grid gap-2 text-sm font-medium text-[#211d16]">
          <span>Confirmer le mot de passe</span>
          <span class="relative">
            <input v-model="confirmSecret" class="h-11 w-full rounded-lg border border-[#d8d1c4] bg-white px-3.5 pr-11 text-sm outline-none focus:border-[#a97800] focus:ring-4 focus:ring-[#f5b700]/15" :type="showConfirmSecret ? 'text' : 'password'" minlength="8" autocomplete="new-password" required>
            <button type="button" class="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md border-0 bg-transparent text-[#857b69] hover:bg-[#f1ebdd] hover:text-[#211d16] focus:outline-none focus:ring-2 focus:ring-[#a97800]/30" :aria-label="showConfirmSecret ? 'Masquer' : 'Afficher'" :title="showConfirmSecret ? 'Masquer le mot de passe' : 'Afficher le mot de passe'" @click="showConfirmSecret = !showConfirmSecret">
              <svg v-if="showConfirmSecret" class="size-[18px] fill-none stroke-current stroke-[1.8]" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.7 10.7 0 0 1 12 5c5.2 0 8.8 4.4 9.8 6.4a11.8 11.8 0 0 1-3.1 3.8M6.2 6.2C3.9 7.7 2.5 10 2.2 11.4 3.2 13.5 6.8 18 12 18c1 0 1.9-.2 2.8-.5" /></svg>
              <svg v-else class="size-[18px] fill-none stroke-current stroke-[1.8]" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M2.2 12S5.4 5 12 5s9.8 7 9.8 7-3.2 7-9.8 7-9.8-7-9.8-7Z" /><circle cx="12" cy="12" r="2.8" /></svg>
            </button>
          </span>
        </label>
        <button class="h-11 rounded-lg border border-[#f5b700] bg-[#f5b700] text-sm font-semibold text-[#2b1d00] hover:bg-[#ffd15a] disabled:opacity-60" type="submit" :disabled="isLoading">
          {{ isLoading ? 'Activation…' : 'Continuer' }}
        </button>
      </form>

      <div v-else class="grid justify-items-center gap-4 text-center">
        <img :src="qrCode" alt="QR code de configuration de sécurité" class="size-[220px] rounded-lg border border-[#d8d1c4] p-2">
        <p class="text-xs text-[#655d50]">Dans Google Authenticator, choisissez « Scanner un QR code ».</p>
        <code class="max-w-full break-all rounded-lg bg-[#f1ebdd] px-3 py-2 text-xs text-[#655d50]">{{ activation.totpSecret }}</code>
        <RouterLink to="/" class="text-sm font-semibold text-[#8b6400] hover:underline">Accéder à la connexion</RouterLink>
      </div>
    </section>
  </main>
</template>
