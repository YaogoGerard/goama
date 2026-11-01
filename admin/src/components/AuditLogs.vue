<script setup lang="ts">
import type { AuditLog } from "../types.js";

defineProps<{
  logs: AuditLog[];
  loading: boolean;
}>();

const emit = defineEmits<{
  (e: "refresh"): void;
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
        Historique des actions réalisées dans l’administration
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

    <div class="privacy">
      <svg viewBox="0 0 24 24" aria-hidden="true" style="flex-shrink: 0; width: 16px; height: 16px; margin-top: 2px; fill: none; stroke: var(--success); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round">
        <path d="M4.5 12.5l5 5 10-11" />
      </svg>
      <div>
        <strong>Historique protégé</strong>
        Les données sensibles et le contenu des conversations ne sont jamais affichés ici.
      </div>
    </div>
  </div>
</template>
