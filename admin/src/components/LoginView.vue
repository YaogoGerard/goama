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
    error.value = "Veuillez renseigner tous les champs (y compris le code TOTP).";
    return;
  }

  loading.value = true;
  error.value = null;

  try {
    await api.login(matricule.value.trim(), secret.value, codeTotp.value.trim());
    emit("login-success");
  } catch (err: any) {
    if (err.message === "identifiants_invalides") {
      error.value = "Matricule, mot de passe ou code TOTP invalide.";
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
        <span>⚠</span>
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
            <span>Code TOTP</span>
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

<style scoped>
.login-wrapper {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 32px 20px;
  background:
    radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 28rem),
    var(--bg);
}

.login-card {
  width: 100%;
  max-width: 430px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 38px;
  box-shadow: var(--shadow-md);
}

.login-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-bottom: 38px;
  gap: 12px;
}

.login-brand strong {
  font-size: 20px;
  letter-spacing: -0.02em;
}

.brand-logo {
  width: 72px;
  height: 72px;
  object-fit: contain;
}

.login-alert {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 12px 14px;
  border-radius: 8px;
  font-size: 13px;
  margin-bottom: 18px;
}

.login-alert.danger {
  background: color-mix(in srgb, var(--danger) 15%, transparent);
  border: 1px solid var(--danger);
  color: var(--text);
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.password-field {
  position: relative;
}

.password-field .field {
  width: 100%;
  padding-right: 46px;
}

.password-toggle {
  position: absolute;
  top: 50%;
  right: 12px;
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  padding: 0;
  transform: translateY(-50%);
  border: 0;
  background: transparent;
  color: var(--muted);
}

.password-toggle:hover,
.password-toggle:focus-visible {
  color: var(--accent);
}

.password-toggle svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.form-group label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  display: flex;
  justify-content: space-between;
}

.label-hint {
  color: var(--subtle);
  font-size: 11px;
}

.totp-field {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 17px;
  letter-spacing: 0.22em;
  text-align: left;
}

.login-form .field {
  width: 100%;
  height: 46px;
}

.login-form .field::placeholder {
  color: var(--subtle);
}

.login-form .field:focus {
  background: var(--surface);
}

.login-btn {
  width: 100%;
  margin-top: 6px;
  min-height: 46px;
  font-size: 14px;
}

</style>
