<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { api } from "../api/client.js";
import type { PreInscriptionResult, ReferenceData } from "../types.js";

const emit = defineEmits<{
  (e: "close"): void;
  (e: "success"): void;
}>();

const form = reactive({
  matricule: "",
  nom: "",
  prenom: "",
  ministere: "",
  fonction: "",
  categorie: "",
});

const loading = ref(false);
const error = ref<string | null>(null);
const result = ref<PreInscriptionResult | null>(null);
const copied = ref(false);

const referenceData = ref<ReferenceData>({ categories: [], ministeres: [], postes: [] });
const loadingReferenceData = ref(true);

onMounted(async () => {
  try {
    referenceData.value = await api.getReferenceData();
    form.categorie = referenceData.value.categories[0] ?? "";
      form.fonction = referenceData.value.postes[0]?.value ?? "";
    form.ministere = referenceData.value.ministeres[0] ?? "";
  } catch {
    error.value = "Impossible de charger les référentiels.";
  } finally {
    loadingReferenceData.value = false;
  }
});

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
          <span class="eyebrow">Nouvel accès</span>
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
          <div class="code-label">Code d'activation · valable 24 h</div>
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

        <div class="form-section">
          <div class="form-section-title">
            <span class="section-number">01</span>
            <div>
              <strong>Identité professionnelle</strong>
            </div>
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
            <select id="agentCategorie" v-model="form.categorie" class="field" required :disabled="loadingReferenceData">
              <option v-for="categorie in referenceData.categories" :key="categorie" :value="categorie">
                {{ categorie === "HORS_CATEGORIE" ? "Hors catégorie" : categorie }}
              </option>
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
        </div>

        <div class="form-section">
          <div class="form-section-title">
            <span class="section-number">02</span>
            <div>
              <strong>Rattachement administratif</strong>
            </div>
          </div>

          <div class="form-group">
            <label for="agentPoste">Poste officiel *</label>
          <select id="agentPoste" v-model="form.fonction" class="field" required :disabled="loadingReferenceData">
              <option v-for="poste in referenceData.postes" :key="poste.value" :value="poste.value">
                {{ poste.label }} ({{ poste.parrainage ? "Parrain habilité" : "Sans parrainage" }})
              </option>
            </select>
          </div>

          <div class="form-group">
            <label for="agentMinistere">Ministère de rattachement *</label>
            <select id="agentMinistere" v-model="form.ministere" class="field" required :disabled="loadingReferenceData">
              <option v-for="min in referenceData.ministeres" :key="min" :value="min">
                {{ min }}
              </option>
            </select>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="row-action" @click="emit('close')" :disabled="loading">
            Annuler
          </button>
          <button type="submit" class="primary" :disabled="loading || loadingReferenceData || !form.ministere">
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
  padding: 22px 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-top: 2px;
}

.form-section + .form-section {
  padding-top: 18px;
  border-top: 1px solid var(--line);
}

.form-section-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.form-section-title strong,
.form-section-title small {
  display: block;
}

.form-section-title strong {
  font-size: 13px;
}

.form-section-title small {
  margin-top: 2px;
  color: var(--subtle);
  font-size: 11px;
}

.section-number {
  display: grid;
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  color: var(--accent);
  font-size: 10px;
  font-weight: 700;
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

.form-group .field {
  width: 100%;
}

.modal-footer {
  margin-top: 4px;
  padding-top: 18px;
  border-top: 1px solid var(--line);
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

@media (max-width: 639px) {
  .modal-backdrop {
    align-items: end;
    padding: 0;
  }

  .modal-dialog {
    max-height: 94vh;
    border-radius: 16px 16px 0 0;
    overflow-y: auto;
  }

  .modal-header,
  .modal-body,
  .activation-result {
    padding-left: 18px;
    padding-right: 18px;
  }

  .form-row {
    grid-template-columns: 1fr;
    gap: 14px;
  }

  .modal-footer {
    flex-direction: column-reverse;
  }

  .modal-footer button {
    width: 100%;
  }

  .code-value {
    font-size: 26px;
  }
}
</style>
