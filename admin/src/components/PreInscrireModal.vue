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
const linkCopied = ref(false);

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

function activationLink() {
  if (!result.value) return "";
  const base = import.meta.env.VITE_WEB_URL ?? "http://localhost:3000";
  return `${base}/activation#matricule=${encodeURIComponent(form.matricule.trim().toUpperCase())}&code=${encodeURIComponent(result.value.codeActivation)}`;
}

async function copyActivationLink() {
  await navigator.clipboard.writeText(activationLink());
  linkCopied.value = true;
  setTimeout(() => {
    linkCopied.value = false;
  }, 2500);
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

      <!-- Résultat avec lien d'activation -->
      <div v-show="result" class="activation-result">
        <div class="result-badge">✓ Agent pré-inscrit avec succès</div>
        <p class="result-desc">Transmettez ce lien à l’agent. Il ouvrira directement son parcours d’activation.</p>

        <div class="code-box">
          <div class="code-label">Lien d’activation · valable 24 h</div>
          <div class="break-all text-left text-xs text-[var(--muted)]">{{ activationLink() }}</div>
          <button type="button" class="primary copy-btn mt-4" @click="copyActivationLink">
            {{ linkCopied ? "✓ Lien copié" : "Copier le lien" }}
          </button>
        </div>

        <div class="security-notice">
          <svg viewBox="0 0 24 24" aria-hidden="true" class="size-3.5 shrink-0 fill-none stroke-[var(--warn)] stroke-[1.8] stroke-linecap-round stroke-linejoin-round">
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
