<script setup lang="ts">
import { reactive, ref } from "vue";
import { api } from "../api/client.js";
import type { PreInscriptionResult } from "../types.js";

const emit = defineEmits<{
  (e: "close"): void;
  (e: "success"): void;
}>();

const form = reactive({
  matricule: "",
  nom: "",
  prenom: "",
  ministere: "Ministère de la Transition Digitale",
  fonction: "Chef de Service",
  categorie: "A",
});

const loading = ref(false);
const error = ref<string | null>(null);
const result = ref<PreInscriptionResult | null>(null);
const copied = ref(false);

const POSTES_OFFICIELS = [
  { label: "Chef de Service (Parrain habilité)", value: "Chef de Service" },
  { label: "Directeur Central / Sectoriel (Parrain habilité)", value: "Directeur Central" },
  { label: "Directeur Général (Parrain habilité)", value: "Directeur Général" },
  { label: "Secrétaire Général (Parrain habilité)", value: "Secrétaire Général" },
  { label: "Directeur de Cabinet (Parrain habilité)", value: "Directeur de Cabinet" },
  { label: "Inspecteur Technique (Parrain habilité)", value: "Inspecteur Technique" },
  { label: "Ministre (Parrain habilité)", value: "Ministre" },
  { label: "Conseiller Technique (Sans parrainage)", value: "Conseiller Technique" },
  { label: "Chargé de Mission (Sans parrainage)", value: "Chargé de Mission" },
  { label: "Chargé d'Études (Sans parrainage)", value: "Chargé d'Études" },
  { label: "Secrétaire Particulier (Sans parrainage)", value: "Secrétaire Particulier" },
  { label: "Administrateur Système / IT (Sans parrainage)", value: "Administrateur Système" },
  { label: "Rédacteur / Agent technique (Sans parrainage)", value: "Rédacteur" },
];

const MINISTERES = [
  "Ministère de la Transition Digitale, des Postes et des Communications Électroniques",
  "Ministère de l'Économie et des Finances",
  "Ministère de l'Administration Territoriale et de la Sécurité",
  "Ministère des Affaires Étrangères",
  "Ministère de la Santé",
  "Ministère de l'Éducation Nationale",
  "Secrétariat Général du Gouvernement",
];

async function submitPreInscription() {
  loading.value = true;
  error.value = null;

  try {
    const res = await api.preInscrire({
      matricule: form.matricule.trim().toUpperCase(),
      nom: form.nom.trim(),
      prenom: form.prenom.trim(),
      ministere: form.ministere,
      fonction: form.fonction,
      categorie: form.categorie,
    });
    result.value = res;
    emit("success");
  } catch (err: any) {
    if (err.message === "matricule_deja_enrole") {
      error.value = "Ce matricule est déjà pré-inscrit ou utilisé.";
    } else {
      error.value = err.message || "Erreur lors de la pré-inscription.";
    }
  } finally {
    loading.value = false;
  }
}

function copyCode() {
  if (result.value?.codeActivation) {
    navigator.clipboard.writeText(result.value.codeActivation);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2500);
  }
}
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="modal-dialog">
      <div class="modal-header">
        <div>
          <span class="eyebrow">Enrôlement officiel</span>
          <h3>Pré-inscrire un agent</h3>
        </div>
        <button class="icon close-btn" type="button" @click="emit('close')">✕</button>
      </div>

      <!-- Résultat avec Code d'activation -->
      <div v-show="result" class="activation-result">
        <div class="result-badge">✓ Agent pré-inscrit avec succès</div>
        <p class="result-desc">
          Transmettez ce code d'activation à usage unique à l'agent (par e-mail officiel ou en main propre).
        </p>

        <div class="code-box">
          <div class="code-label">Code d'activation (valable 24 h — REQ-ID-002)</div>
          <div class="code-value">{{ result?.codeActivation }}</div>
          <button type="button" class="primary copy-btn" @click="copyCode">
            {{ copied ? "✓ Copié dans le presse-papier !" : "Copier le code" }}
          </button>
        </div>

        <div class="security-notice">
          <svg viewBox="0 0 24 24" aria-hidden="true" style="flex-shrink: 0; width: 14px; height: 14px; fill: none; stroke: var(--warn); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round">
            <rect x="5" y="10" width="14" height="10" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
          <small>
            Le serveur ne conserve que l'empreinte SHA-256 de ce code.
            Il ne sera plus jamais réaffiché après la fermeture de cette fenêtre.
          </small>
        </div>

        <button type="button" class="row-action finish-btn" @click="emit('close')">
          Terminer et fermer
        </button>
      </div>

      <!-- Formulaire de saisie -->
      <form v-show="!result" @submit.prevent="submitPreInscription" class="modal-body">
        <div v-if="error" class="login-alert danger">
          <div>{{ error }}</div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="agentMatricule">Matricule professionnel *</label>
            <input
              id="agentMatricule"
              v-model="form.matricule"
              type="text"
              class="field"
              placeholder="Ex : AG007"
              required
            />
          </div>

          <div class="form-group">
            <label for="agentCategorie">Catégorie fonction publique *</label>
            <select id="agentCategorie" v-model="form.categorie" class="field" required>
              <option value="P">P (Hors catégorie / Cadre supérieur)</option>
              <option value="A">A (Cadre supérieur / Ingénieur)</option>
              <option value="B">B (Cadre moyen / Technicien)</option>
              <option value="C">C (Agent d'application)</option>
              <option value="D">D (Agent d'exécution)</option>
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="agentNom">Nom *</label>
            <input
              id="agentNom"
              v-model="form.nom"
              type="text"
              class="field"
              placeholder="Ex : KABORÉ"
              required
            />
          </div>

          <div class="form-group">
            <label for="agentPrenom">Prénom *</label>
            <input
              id="agentPrenom"
              v-model="form.prenom"
              type="text"
              class="field"
              placeholder="Ex : Fatoumata"
              required
            />
          </div>
        </div>

        <div class="form-group">
          <label for="agentPoste">Poste officiel (Habilitation au parrainage ADR-12) *</label>
          <select id="agentPoste" v-model="form.fonction" class="field" required>
            <option v-for="poste in POSTES_OFFICIELS" :key="poste.value" :value="poste.value">
              {{ poste.label }}
            </option>
          </select>
          <small class="field-hint">
            La capacité de parrainage se déduit du poste officiel, jamais de la catégorie seule (REQ-AUTHZ-005).
          </small>
        </div>

        <div class="form-group">
          <label for="agentMinistere">Ministère de rattachement *</label>
          <select id="agentMinistere" v-model="form.ministere" class="field" required>
            <option v-for="min in MINISTERES" :key="min" :value="min">
              {{ min }}
            </option>
          </select>
        </div>

        <div class="modal-footer">
          <button type="button" class="row-action" @click="emit('close')" :disabled="loading">
            Annuler
          </button>
          <button type="submit" class="primary" :disabled="loading">
            <span v-if="loading">Génération en cours...</span>
            <span v-else>Pré-inscrire et générer le code 24 h</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 15, 18, 0.5);
  backdrop-filter: blur(2px);
  display: grid;
  place-items: center;
  z-index: 1000;
  padding: 16px;
}

.modal-dialog {
  width: 100%;
  max-width: 560px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.18);
}

.modal-header {
  padding: 20px 24px;
  border-bottom: 1px solid var(--line);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h3 {
  margin: 4px 0 0;
  font-size: 18px;
}

.close-btn {
  font-size: 14px;
  display: grid;
  place-items: center;
}

.modal-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}

.field-hint {
  font-size: 11px;
  color: var(--subtle);
  line-height: 1.4;
}

.modal-footer {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.activation-result {
  padding: 28px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.result-badge {
  display: inline-flex;
  padding: 6px 14px;
  background: color-mix(in srgb, var(--success) 15%, transparent);
  border: 1px solid var(--success);
  color: var(--success);
  border-radius: 99px;
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 12px;
}

.result-desc {
  color: var(--muted);
  font-size: 13px;
  margin: 0 0 20px;
}

.code-box {
  width: 100%;
  background: var(--bg2);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 20px;
  margin-bottom: 16px;
}

.code-label {
  font-size: 12px;
  color: var(--subtle);
  margin-bottom: 8px;
}

.code-value {
  font-family: monospace;
  font-size: 32px;
  font-weight: 800;
  letter-spacing: 0.15em;
  color: var(--accent);
  margin-bottom: 16px;
}

.copy-btn {
  width: 100%;
}

.security-notice {
  display: flex;
  gap: 8px;
  align-items: center;
  background: color-mix(in srgb, var(--warn) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--warn) 30%, transparent);
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 11px;
  color: var(--muted);
  text-align: left;
  margin-bottom: 20px;
}

.finish-btn {
  width: 100%;
}
</style>
