<script setup lang="ts">
import type { AuditLog } from "../types.js";

defineProps<{
  logs: AuditLog[];
  loading: boolean;
  page?: number;
  totalPages?: number;
}>();

const emit = defineEmits<{
  (e: "refresh"): void;
  (e: "page", page: number): void;
}>();

function formatAction(action: string) {
  switch (action) {
    case "pre_inscription":
      return "Pré-inscription d'un agent";
    case "activation":
      return "Activation de compte (TOTP validé)";
    case "connexion":
      return "Ouverture de session (2FA)";
    case "revocation":
      return "Révocation immédiate d'agent";
    case "creation_groupe":
      return "Création d'un groupe (parrainage)";
    case "ajout_membre":
      return "Ajout de membre dans un groupe";
    case "retrait_membre":
      return "Retrait de membre d'un groupe";
    default:
      return action;
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
</script>

<template>
  <div class="panel">
    <div class="toolbar" style="justify-content: space-between; align-items: center">
      <div style="font-size: 13px; color: var(--muted)">
        Historique des actions
      </div>
      <button class="row-action" type="button" @click="emit('refresh')">
        ↻ Actualiser les journaux
      </button>
    </div>

    <div style="overflow-x: auto">
      <table class="table">
        <thead>
          <tr>
            <th>Horodatage</th>
            <th>Événement</th>
            <th>Détails</th>
            <th>Acteur</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="4" style="text-align: center; padding: 32px; color: var(--muted)">
              Chargement des journaux d'audit...
            </td>
          </tr>
          <tr v-else-if="logs.length === 0">
            <td colspan="4" style="text-align: center; padding: 32px; color: var(--muted)">
              Aucun événement d'audit enregistré.
            </td>
          </tr>
          <tr v-for="log in logs" :key="log.id">
            <td>
              <code>{{ formatDate(log.createdAt) }}</code>
            </td>
            <td>
              <strong style="color: var(--accent)">{{ formatAction(log.action) }}</strong>
            </td>
            <td>
              <code v-if="log.detail">{{ log.detail }}</code>
              <span v-else style="color: var(--subtle)">—</span>
            </td>
            <td>
              <small>{{ log.actorId ? `Agent/Admin : ${log.actorId.slice(0, 8)}...` : 'Système' }}</small>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="(totalPages ?? 1) > 1" class="pagination">
      <button class="row-action" type="button" :disabled="(page ?? 1) <= 1" @click="emit('page', (page ?? 1) - 1)">
        ← Précédente
      </button>
      <span>Page {{ page ?? 1 }} sur {{ totalPages }} · 10 événements par page</span>
      <button class="row-action" type="button" :disabled="(page ?? 1) >= (totalPages ?? 1)" @click="emit('page', (page ?? 1) + 1)">
        Suivante →
      </button>
    </div>

  </div>
</template>
