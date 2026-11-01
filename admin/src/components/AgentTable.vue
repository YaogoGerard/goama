<script setup lang="ts">
import { computed, ref } from "vue";
import type { Agent } from "../types.js";
import { api } from "../api/client.js";

const props = defineProps<{
  agents: Agent[];
  loading: boolean;
  page?: number;
  totalPages?: number;
}>();

const emit = defineEmits<{
  (e: "refresh"): void;
  (e: "page", page: number): void;
  (e: "filter", search: string, status: string): void;
}>();

const search = ref("");
const statusFilter = ref<string>("ALL");
const revokingId = ref<string | null>(null);
const actionError = ref<string | null>(null);
const pendingAction = ref<{ type: "suspend" | "revoke" | "reactivate"; agent: Agent } | null>(null);

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
  pendingAction.value = { type: "revoke", agent };
}

async function executePendingAction() {
  if (!pendingAction.value) return;
  const { type, agent } = pendingAction.value;
  pendingAction.value = null;
  revokingId.value = agent.id;
  actionError.value = null;

  try {
    if (type === "revoke") {
      await api.revoquerAgent(agent.id);
    } else if (type === "suspend") {
      await api.suspendreAgent(agent.id);
    } else {
      await api.reactiverAgent(agent.id);
    }
    emit("refresh");
  } catch (err: any) {
    actionError.value =
      err.message ||
      (type === "revoke"
        ? "Erreur lors de la révocation de l'agent."
        : "Erreur lors de la suspension de l'agent.");
  } finally {
    revokingId.value = null;
  }
}

async function suspendAgent(agent: Agent) {
  if (agent.statut !== "ACTIF") return;
  pendingAction.value = { type: "suspend", agent };
}

async function reactivateAgent(agent: Agent) {
  if (agent.statut !== "SUSPENDU") return;
  pendingAction.value = { type: "reactivate", agent };
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
        @input="emit('filter', search, statusFilter)"
      />
      <select v-model="statusFilter" class="field" aria-label="Filtrer par statut" @change="emit('filter', search, statusFilter)">
        <option value="ALL">Tous les statuts</option>
        <option value="ACTIF">Actif</option>
        <option value="PRE_INSCRIT">En attente</option>
        <option value="SUSPENDU">Suspendu</option>
        <option value="REVOQUE">Révoqué</option>
      </select>
      <button class="row-action" type="button" @click="emit('refresh')">
        ↻ Actualiser
      </button>
    </div>

    <div v-if="actionError" class="login-alert danger" style="margin: 12px">
      <div>{{ actionError }}</div>
    </div>

    <div style="overflow-x: auto">
      <table class="table">
        <thead>
          <tr>
            <th>Agent</th>
            <th>Poste</th>
            <th>Ministère</th>
            <th>Statut</th>
            <th>Création</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="6" style="text-align: center; padding: 32px; color: var(--muted)">
              Chargement...
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
                v-if="agent.statut !== 'REVOQUE' && agent.statut !== 'SUSPENDU'"
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
              <button
                v-if="agent.statut === 'SUSPENDU'"
                type="button"
                class="row-action"
                :disabled="revokingId === agent.id"
                @click="reactivateAgent(agent)"
              >
                Réactiver
              </button>
              <span v-if="agent.statut === 'REVOQUE'" class="status revoked" style="border: 0; padding: 0">
                Accès coupé
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="(totalPages ?? 1) > 1" class="pagination">
      <button class="row-action" type="button" :disabled="(page ?? 1) <= 1" @click="emit('page', (page ?? 1) - 1)">
        ← Précédente
      </button>
      <span>Page {{ page ?? 1 }} sur {{ totalPages }} · 10 agents par page</span>
      <button class="row-action" type="button" :disabled="(page ?? 1) >= (totalPages ?? 1)" @click="emit('page', (page ?? 1) + 1)">
        Suivante →
      </button>
    </div>

    <div
      v-if="pendingAction"
      class="action-modal-backdrop"
      role="presentation"
      @click.self="pendingAction = null"
    >
      <section
        class="action-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-modal-title"
      >
        <div class="action-modal-header">
          <div>
            <span class="eyebrow">Confirmation</span>
            <h3 id="action-modal-title">
              {{
                pendingAction.type === "revoke"
                  ? "Révoquer cet agent ?"
                  : pendingAction.type === "suspend"
                    ? "Suspendre cet agent ?"
                    : "Réactiver cet agent ?"
              }}
            </h3>
          </div>
          <button
            type="button"
            class="icon close-btn"
            aria-label="Fermer"
            @click="pendingAction = null"
          >
            ✕
          </button>
        </div>
        <div class="action-modal-body">
          <p>
            {{ pendingAction.agent.prenom }} {{ pendingAction.agent.nom }}
            <span>({{ pendingAction.agent.matricule }})</span>
          </p>
          <small v-if="pendingAction.type === 'revoke'">
            Cet agent perdra immédiatement l’accès à son compte.
          </small>
          <small v-else-if="pendingAction.type === 'suspend'">
            L’accès pourra être rétabli ultérieurement.
          </small>
          <small v-else>
            L’agent pourra se reconnecter avec ses identifiants habituels.
          </small>
        </div>
        <div class="action-modal-footer">
          <button type="button" class="row-action" @click="pendingAction = null">
            Annuler
          </button>
          <button
            type="button"
            class="primary"
            :disabled="revokingId !== null"
            @click="executePendingAction"
          >
            {{
              pendingAction.type === "revoke"
                ? "Révoquer l’agent"
                : pendingAction.type === "suspend"
                  ? "Suspendre l’agent"
                  : "Réactiver l’agent"
            }}
          </button>
        </div>
      </section>
    </div>

  </div>
</template>

<style scoped>
.action-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgb(0 0 0 / 65%);
  backdrop-filter: blur(4px);
}

.action-modal {
  width: min(100%, 480px);
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
  box-shadow: 0 20px 48px rgb(0 0 0 / 40%);
}

.action-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--line);
}

.action-modal-header h3 {
  margin: 4px 0 0;
  font-size: 18px;
}

.action-modal-body {
  padding: 24px;
}

.action-modal-body p {
  margin: 0 0 8px;
  font-weight: 600;
}

.action-modal-body p span,
.action-modal-body small {
  color: var(--muted);
}

.action-modal-body small {
  font-size: 13px;
}

.action-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 0 24px 24px;
}

.close-btn {
  display: grid;
  place-items: center;
  font-size: 14px;
}
</style>
