<script setup lang="ts">
import type { Stats } from "../types.js";

defineProps<{
  stats: Stats;
}>();
</script>

<template>
  <div class="stats-grid">
    <div class="stat stat-success">
      <div class="stat-label">Agents actifs</div>
      <strong>{{ stats.actifs }}</strong>
      <small>Comptes actuellement actifs</small>
    </div>

    <div class="stat stat-warning">
      <div class="stat-label">Pré-inscriptions en attente</div>
      <strong>{{ stats.preInscrits }}</strong>
      <small class="stat-note warning">À traiter prochainement</small>
    </div>

    <div class="stat stat-danger">
      <div class="stat-label">Agents révoqués</div>
      <strong>{{ stats.revoques }}</strong>
      <small class="stat-note danger">Accès désactivé</small>
    </div>

  </div>
</template>
