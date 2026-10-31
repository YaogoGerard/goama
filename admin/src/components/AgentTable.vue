<script setup lang="ts">
import { computed, ref } from "vue";
import type { Agent } from "../types.js";
import { api } from "../api/client.js";

const props = defineProps<{
  agents: Agent[];
  loading: boolean;
}>();

const emit = defineEmits<{
  (e: "refresh"): void;
}>();

const search = ref("");
const statusFilter = ref<string>("ALL");
const revokingId = ref<string | null>(null);
const actionError = ref<string | null>(null);

const filteredAgents = computed(() => {
  return props.agents.filter((a) => {
    const q = search.value.toLowerCase().trim();
    const matchQuery =
      !q ||
      a.nom.toLowerCase().includes(q) ||
      a.prenom.toLowerCase().includes(q) ||
      a.matricule.toLowerCase().includes(q) ||
      a.ministere.toLowerCase().includes(q) ||
      a.fonction.toLowerCase().includes(q);

    const matchStatus =
      statusFilter.value === "ALL" || a.statut === statusFilter.value;

    return matchQuery && matchStatus;
  });
});

async function confirmRevocation(agent: Agent) {
  if (agent.statut === "REVOQUE") return;

  const conf = confirm(
    `Voulez-vous révoquer IMMÉDIATEMENT l'agent ${agent.prenom} ${agent.nom} (${agent.matricule}) ?\n\n` +
      `Effets conformes à ADR-08 :\n` +
      `- Clôture immédiate de toutes ses sessions et WebSockets (code 4003)\n` +
      `- Retrait des carnets d'adresses (KeyPackages supprimés)\n` +
      `- Retrait cryptographique émis par les membres en ligne des groupes\n` +
      `- Ce compte ne sera JAMAIS supprimé (REQ-OPS-013)`
  );

  if (!conf) return;

  revokingId.value = agent.id;
  actionError.value = null;

  try {
    await api.revoquerAgent(agent.id);
    emit("refresh");
  } catch (err: any) {
    actionError.value = err.message || "Erreur lors de la révocation de l'agent.";
  } finally {
    revokingId.value = null;
  }

}

async function suspendAgent(agent: Agent) {
  if (agent.statut !== "ACTIF") return;
  if (!confirm(`Suspendre temporairement l'accès de ${agent.prenom} ${agent.nom} ?`)) return;
  revokingId.value = agent.id;
  actionError.value = null;
  try {
    await api.suspendreAgent(agent.id);
    emit("refresh");
  } catch (err: any) {
    actionError.value = err.message || "Erreur lors de la suspension.";
  } finally {
    revokingId.value = null;
  }
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
</script>

<template>
  <div class="panel">
    <div class="toolbar">
      <input
        v-model="search"
        class="field search"
        placeholder="Rechercher par nom, matricule, ministère ou fonction..."
        aria-label="Recherche"
      />
      <select v-model="statusFilter" class="field" aria-label="Filtrer par statut">
        <option value="ALL">Tous les statuts</option>
        <option value="ACTIF">Actif (2FA validé)</option>
        <option value="PRE_INSCRIT">Pré-inscrit (En attente)</option>
        <option value="SUSPENDU">Suspendu</option>
        <option value="REVOQUE">Révoqué</option>
      </select>
      <button class="row-action" type="button" @click="emit('refresh')">
        ↻ Actualiser
      </button>
    </div>

    <div v-if="actionError" class="login-alert danger" style="margin: 12px">
      <span>⚠</span>
      <div>{{ actionError }}</div>
    </div>

    <div style="overflow-x: auto">
      <table class="table">
        <thead>
          <tr>
            <th>Agent & Matricule</th>
            <th>Poste officiel & Catégorie</th>
            <th>Ministère</th>
            <th>Statut</th>
            <th>Création</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="6" style="text-align: center; padding: 32px; color: var(--muted)">
              Chargement des agents officiels...
            </td>
          </tr>
          <tr v-else-if="filteredAgents.length === 0">
            <td colspan="6" style="text-align: center; padding: 32px; color: var(--muted)">
              Aucun agent ne correspond aux critères de recherche.
            </td>
          </tr>
          <tr v-for="agent in filteredAgents" :key="agent.id">
            <td>
              <strong>{{ agent.prenom }} {{ agent.nom }}</strong>
              <small>Matricule : <code>{{ agent.matricule }}</code></small>
            </td>
            <td>
              <div>{{ agent.fonction }}</div>
              <small>Catégorie : <strong>{{ agent.categorie }}</strong></small>
            </td>
            <td>
              <span>{{ agent.ministere }}</span>
            </td>
            <td>
              <span v-if="agent.statut === 'ACTIF'" class="status active">Actif</span>
              <span v-else-if="agent.statut === 'PRE_INSCRIT'" class="status pending">En attente</span>
              <span v-else-if="agent.statut === 'SUSPENDU'" class="status pending">Suspendu</span>
              <span v-else-if="agent.statut === 'REVOQUE'" class="status revoked">Révoqué</span>
            </td>
            <td>
              <small>{{ formatDate(agent.createdAt) }}</small>
            </td>
            <td>
              <button
                v-if="agent.statut !== 'REVOQUE'"
                type="button"
                class="row-action revoke"
                :disabled="revokingId === agent.id"
                @click="confirmRevocation(agent)"
              >
                {{ revokingId === agent.id ? "Révocation..." : "Révoquer" }}
              </button>
              <button
                v-if="agent.statut === 'ACTIF'"
                type="button"
                class="row-action"
                :disabled="revokingId === agent.id"
                @click="suspendAgent(agent)"
              >
                Suspendre
              </button>
              <span v-else class="status revoked" style="border: 0; padding: 0">
                Accès coupé
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="privacy">
      <span>✓</span>
      <div>
        <strong>Confidentialité préservée (G-06 & REQ-AUTHZ-003)</strong>
        Cette vue d'administration ne contient aucun message, aperçu de conversation ou pièce jointe.
        L'Administrateur ne possède aucune clé cryptographique.
      </div>
    </div>
  </div>
</template>
