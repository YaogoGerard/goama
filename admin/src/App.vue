<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "./api/client.js";
import type { AdminIdentity, Agent, AuditLog, Retention, Stats } from "./types.js";
import LoginView from "./components/LoginView.vue";
import DashboardStats from "./components/DashboardStats.vue";
import AgentTable from "./components/AgentTable.vue";
import PreInscrireModal from "./components/PreInscrireModal.vue";
import AuditLogs from "./components/AuditLogs.vue";

const authenticated = ref(api.isAuthenticated());
const currentTab = ref<"dashboard" | "agents" | "audit">("dashboard");
const theme = ref<"dark" | "light">("dark");

const stats = ref<Stats>({ total: 0, actifs: 0, preInscrits: 0, revoques: 0, groupes: 0 });
const agents = ref<Agent[]>([]);
const logs = ref<AuditLog[]>([]);
const retentions = ref<Retention[]>([]);
const identity = ref<AdminIdentity | null>(null);

const loading = ref(false);
const showModal = ref(false);
const toastMessage = ref<string | null>(null);
const dataError = ref<string | null>(null);

function notify(msg: string) {
  toastMessage.value = msg;
  setTimeout(() => {
    toastMessage.value = null;
  }, 4000);
}

function toggleTheme() {
  theme.value = theme.value === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", theme.value);
}

async function loadData() {
  if (!authenticated.value) return;
  loading.value = true;
  dataError.value = null;
  try {
    const [me, st, ag, lg, rt] = await Promise.all([
      api.getIdentity(),
      api.getStats(),
      api.getAgents(),
      api.getAuditLogs(),
      api.getRetentions(),
    ]);
    identity.value = me;
    stats.value = st;
    agents.value = ag;
    logs.value = lg;
    retentions.value = rt;
  } catch (err: any) {
    if (err.message === "session_fermee") {
      authenticated.value = false;
    } else {
      dataError.value = "Impossible de charger les données administratives.";
    }
  } finally {
    loading.value = false;
  }
}

function handleLoginSuccess() {
  authenticated.value = true;
  notify("Connexion réussie.");
  loadData();
}

async function handleLogout() {
  await api.logout();
  authenticated.value = false;
  notify("Session fermée avec succès.");
}

function onPreInscriptionSuccess() {
  notify("Agent pré-inscrit avec succès !");
  loadData();
}

onMounted(() => {
  document.documentElement.setAttribute("data-theme", theme.value);
  if (authenticated.value) {
    loadData();
  }
});
</script>

<template>
  <div v-if="!authenticated">
    <LoginView @login-success="handleLoginSuccess" />
  </div>

  <div v-else class="shell">
    <!-- Barre latérale -->
    <aside class="sidebar">
      <div class="brand">
        <div class="mark">G</div>
        <div>
          <strong>Goama</strong>
          <small>Administration</small>
        </div>
      </div>

      <nav class="nav">
        <button
          type="button"
          :class="{ active: currentTab === 'dashboard' }"
          @click="currentTab = 'dashboard'"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          <span>Tableau de bord</span>
        </button>

        <button
          type="button"
          :class="{ active: currentTab === 'agents' }"
          @click="currentTab = 'agents'"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="9" cy="8" r="3.5" />
            <path d="M3 19.5c.7-3 3-4.5 6-4.5s5.3 1.5 6 4.5" />
            <circle cx="17" cy="9" r="2.5" />
            <path d="M17.5 14.5c1.8.4 3 1.6 3.5 3.5" />
          </svg>
          <span>Gestion des agents</span>
          <span class="count">{{ agents.length }}</span>
        </button>

        <button
          type="button"
          :class="{ active: currentTab === 'audit' }"
          @click="currentTab = 'audit'"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 3h9l4 4v14H6z" />
            <path d="M15 3v4h4M9 12h7M9 16h7" />
          </svg>
          <span>Journal d'audit</span>
        </button>
      </nav>

      <div class="sidebar-foot">
        <button type="button" @click="toggleTheme">
          <svg v-if="theme === 'dark'" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4L7 17M17 7l1.4-1.4" />
          </svg>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
          </svg>
          <span>Thème {{ theme === 'dark' ? 'clair' : 'sombre' }}</span>
        </button>

        <button type="button" class="row-action" style="margin-top: 6px; border: 0" @click="handleLogout">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14 4h-7v16h7M10 12h11M18 9l3 3-3 3" />
          </svg>
          <span>Déconnexion</span>
        </button>

        <div class="operator">
          <div class="avatar">AD</div>
          <div>
            <strong>{{ identity?.matricule ?? "Administrateur" }}</strong>
            <small>Administrateur officiel</small>
          </div>
        </div>
      </div>
    </aside>

    <!-- Contenu principal -->
    <div class="content">
      <header class="topbar">
        <div class="crumb">
          Goama Admin <span>/</span>
          <b>
            {{
              currentTab === 'dashboard'
                ? 'Tableau de bord'
                : currentTab === 'agents'
                  ? 'Gestion des agents'
                  : "Journal d'audit"
            }}
          </b>
        </div>
        <div class="top-actions">
          <button class="primary" type="button" @click="showModal = true">
            Pré-inscrire un agent
          </button>
        </div>
      </header>

      <main class="main">
        <div v-if="dataError" class="login-alert danger" role="alert">
          <span>!</span>
          <div>{{ dataError }}</div>
        </div>
        <div class="intro">
          <div>
            <p class="eyebrow">Espace d’administration</p>
            <h1>
              {{
                currentTab === 'dashboard'
                  ? 'Tableau de bord'
                  : currentTab === 'agents'
                    ? 'Gestion des agents'
                    : "Journal d'activité"
              }}
            </h1>
            <p>Gérez les agents et suivez l’activité de votre organisation.</p>
          </div>
        </div>

        <!-- Vue Tableau de bord -->
        <template v-if="currentTab === 'dashboard'">
          <DashboardStats :stats="stats" />

          <section v-if="retentions.length" class="section">
            <div class="section-head">
              <h2>Retraits à suivre</h2>
              <span class="status pending">{{ retentions.length }} en attente</span>
            </div>
            <div class="panel retention-list">
              <div v-for="retention in retentions" :key="retention.id" class="retention-item">
                <div>
                  <strong>Groupe {{ retention.groupeId.slice(0, 8) }}…</strong>
                  <small>Agent {{ retention.agentId.slice(0, 8) }}…</small>
                </div>
                <span class="status" :class="retention.statut === 'ECHEC' ? 'revoked' : 'pending'">
                  {{ retention.statut === 'ECHEC' ? "Échec" : "En attente" }}
                </span>
              </div>
            </div>
          </section>

          <section class="section">
            <div class="section-head">
              <h2>Agents récents</h2>
              <button class="link" type="button" @click="currentTab = 'agents'">
                Voir tous les agents →
              </button>
            </div>
            <AgentTable :agents="agents.slice(0, 5)" :loading="loading" @refresh="loadData" />
          </section>
        </template>

        <!-- Vue Agents complète -->
        <template v-else-if="currentTab === 'agents'">
          <AgentTable :agents="agents" :loading="loading" @refresh="loadData" />
        </template>

        <!-- Vue Journal d'audit -->
        <template v-else-if="currentTab === 'audit'">
          <AuditLogs :logs="logs" :loading="loading" @refresh="loadData" />
        </template>
      </main>
    </div>

    <!-- Modal de pré-inscription -->
    <PreInscrireModal
      v-if="showModal"
      @close="showModal = false"
      @success="onPreInscriptionSuccess"
    />

    <!-- Toast Notification -->
    <div v-if="toastMessage" class="toast show" role="status">
      {{ toastMessage }}
    </div>
  </div>
</template>
