<script setup lang="ts">
import { ref } from "vue";
import { api } from "../api/client.js";

const emit = defineEmits<{
  (e: "login-success"): void;
}>();

const matricule = ref("");
const secret = ref("");
const codeTotp = ref("");
const showSecret = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);

async function submitLogin() {
  if (!matricule.value || !secret.value || !codeTotp.value) {
    error.value = "Veuillez renseigner tous les champs (y compris le code de vérification).";
    return;
  }

  loading.value = true;
  error.value = null;

  try {
    await api.login(matricule.value.trim(), secret.value, codeTotp.value.trim());
    emit("login-success");
  } catch (err: any) {
    if (err.message === "identifiants_invalides") {
      error.value = "Identifiant, mot de passe ou code de vérification invalide.";
    } else if (err.message === "trop_de_requetes") {
      error.value = "Trop de tentatives. Veuillez patienter avant de réessayer.";
    } else {
      error.value = err.message || "Erreur de connexion au serveur.";
    }
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-wrapper">
    <div class="login-card">
      <div class="login-brand">
        <img class="brand-logo" src="/goama-logo.png" alt="Goama" />
        <strong>Goama Admin</strong>
      </div>

      <div v-if="error" class="login-alert danger">
        <div>{{ error }}</div>
      </div>

      <form @submit.prevent="submitLogin" class="login-form">
        <div class="form-group">
          <label for="matricule">Identifiant</label>
          <input
            id="matricule"
            v-model="matricule"
            type="text"
            class="field"
            placeholder="Saisissez votre identifiant"
            required
            autocomplete="username"
          />
        </div>

        <div class="form-group">
          <label for="secret">Mot de passe</label>
          <div class="password-field">
            <input
              id="secret"
              v-model="secret"
              :type="showSecret ? 'text' : 'password'"
              class="field"
              placeholder="Saisissez votre mot de passe"
              required
              autocomplete="current-password"
            />
            <button
              type="button"
              class="password-toggle"
              :aria-label="showSecret ? 'Masquer le mot de passe' : 'Afficher le mot de passe'"
              :title="showSecret ? 'Masquer le mot de passe' : 'Afficher le mot de passe'"
              @click="showSecret = !showSecret"
            >
              <svg
                v-if="showSecret"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.7 10.7 0 0 1 12 5c5.2 0 8.8 4.4 9.8 6.4a11.8 11.8 0 0 1-3.1 3.8M6.2 6.2C3.9 7.7 2.5 10 2.2 11.4 3.2 13.5 6.8 18 12 18c1 0 1.9-.2 2.8-.5" />
              </svg>
              <svg
                v-else
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M2.2 12S5.4 5 12 5s9.8 7 9.8 7-3.2 7-9.8 7-9.8-7-9.8-7Z" />
                <circle cx="12" cy="12" r="2.8" />
              </svg>
            </button>
          </div>
        </div>

        <div class="form-group">
          <label for="codeTotp">
            <span>Code de vérification</span>
            <small class="label-hint">6 chiffres</small>
          </label>
          <input
            id="codeTotp"
            v-model="codeTotp"
            type="text"
            inputmode="numeric"
            pattern="[0-9]{6}"
            maxlength="6"
            class="field totp-field"
            placeholder="000000"
            required
            autocomplete="one-time-code"
          />
        </div>

        <button type="submit" class="primary login-btn" :disabled="loading">
          <span v-if="loading">Connexion en cours...</span>
          <span v-else>Continuer</span>
        </button>
      </form>

    </div>
  </div>
  </template>
