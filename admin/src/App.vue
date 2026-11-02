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
const currentTab = ref<"dashboard" | "audit">("dashboard");
const theme = ref<"dark" | "light">("dark");

const stats = ref<Stats>({ total: 0, actifs: 0, preInscrits: 0, revoques: 0, groupes: 0 });
const agents = ref<Agent[]>([]);
const agentsPage = ref(1);
const agentsTotalPages = ref(1);
const agentsSearch = ref("");
const agentsStatus = ref("ALL");
let agentsFilterTimer: ReturnType<typeof setTimeout> | undefined;
const logs = ref<AuditLog[]>([]);
const logsPage = ref(1);
const logsTotalPages = ref(1);
const retentions = ref<Retention[]>([]);
const retentionsPage = ref(1);
const retentionsTotalPages = ref(1);
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
      agentsPage.value === 1 && !agentsSearch.value && agentsStatus.value === "ALL"
        ? api.getAgents()
        : api.getAgentsPage(agentsPage.value, undefined, agentsSearch.value, agentsStatus.value),
      logsPage.value === 1 ? api.getAuditLogs() : api.getAuditLogsPage(logsPage.value),
      retentionsPage.value === 1 ? api.getRetentions() : api.getRetentionsPage(retentionsPage.value),
    ]);
    identity.value = me;
    stats.value = st;
    agents.value = Array.isArray(ag) ? ag : ag.items;
    agentsPage.value = ag.page ?? agentsPage.value;
    agentsTotalPages.value = ag.totalPages ?? 1;
    logs.value = Array.isArray(lg) ? lg : lg.items;
    logsPage.value = lg.page ?? logsPage.value;
    logsTotalPages.value = lg.totalPages ?? 1;
    retentions.value = Array.isArray(rt) ? rt : rt.items;
    if (!Array.isArray(rt)) {
      retentionsPage.value = rt.page;
      retentionsTotalPages.value = rt.totalPages;
    }
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

function changeAgentsPage(page: number) {
  agentsPage.value = page;
  loadData();
}

function filterAgents(search: string, status: string) {
  agentsSearch.value = search;
  agentsStatus.value = status;
  agentsPage.value = 1;
  if (agentsFilterTimer) clearTimeout(agentsFilterTimer);
  agentsFilterTimer = setTimeout(() => loadData(), 250);
}

function changeLogsPage(page: number) {
  logsPage.value = page;
  loadData();
}

function changeRetentionsPage(page: number) {
  retentionsPage.value = page;
  loadData();
}

onMounted(async () => {
  document.documentElement.setAttribute("data-theme", theme.value);
  if (!authenticated.value) authenticated.value = await api.restoreSession();
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
        <img class="brand-logo" src="/goama-logo.png" alt="Goama" />
        <div>
          <strong>Goama</strong>
          <small>Espace admin</small>
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
          <span>Vue d’ensemble</span>
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
          <span>Activité</span>
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

        <button type="button" class="row-action mt-1.5 border-0" @click="handleLogout">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14 4h-7v16h7M10 12h11M18 9l3 3-3 3" />
          </svg>
          <span>Déconnexion</span>
        </button>

        <div class="operator">
          <div class="avatar">AD</div>
          <div>
            <strong>{{ identity?.matricule ?? "Administrateur" }}</strong>
            <small>Compte administrateur</small>
          </div>
        </div>
      </div>
    </aside>

    <!-- Contenu principal -->
    <div class="content">
      <header class="topbar">
        <div class="crumb">
          Goama <span>/</span>
          <b>
            {{ currentTab === 'dashboard' ? 'Vue d’ensemble' : 'Activité' }}
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
            <h1>
              {{ currentTab === 'dashboard' ? 'Vue d’ensemble' : 'Activité' }}
            </h1>
          </div>
        </div>

        <!-- Vue Tableau de bord -->
        <template v-if="currentTab === 'dashboard'">
          <DashboardStats :stats="stats" />

          <section v-if="retentions.length" class="section">
            <div class="section-head">
              <h2>Protection des conversations</h2>
              <span class="status pending">{{ retentions.filter((item) => item.statut === 'EN_ATTENTE').length }} en attente</span>
            </div>
            <div class="panel retention-list">
              <div v-for="retention in retentions" :key="retention.id" class="retention-item">
                <div>
                  <strong>Mise à jour de la protection d’un groupe</strong>
                  <small>{{ retention.membresAccuses }}/{{ retention.membresAttendus }} participants protégés · {{ retention.recus }}/{{ retention.attendus }} confirmations reçues</small>
                  <small v-if="retention.erreur">Vérification nécessaire pour terminer cette mise à jour.</small>
                </div>
                <span class="status" :class="retention.statut === 'ECHEC' ? 'revoked' : retention.statut === 'TERMINE' ? 'active' : 'pending'">
                  {{ retention.statut === 'ECHEC' ? "Échec" : retention.statut === 'TERMINE' ? "Terminée" : "En attente" }}
                </span>
              </div>
              <div v-if="retentionsTotalPages > 1" class="pagination">
                <button class="row-action" type="button" :disabled="retentionsPage <= 1" @click="changeRetentionsPage(retentionsPage - 1)">
                  ← Précédente
                </button>
                <span>Page {{ retentionsPage }} sur {{ retentionsTotalPages }}</span>
                <button class="row-action" type="button" :disabled="retentionsPage >= retentionsTotalPages" @click="changeRetentionsPage(retentionsPage + 1)">
                  Suivante →
                </button>
              </div>
            </div>
          </section>

          <section class="section">
            <div class="section-head">
              <h2>Agents</h2>
            </div>
            <AgentTable
              :agents="agents"
              :loading="loading"
              :page="agentsPage"
              :total-pages="agentsTotalPages"
              @page="changeAgentsPage"
              @filter="filterAgents"
              @refresh="loadData"
            />
          </section>
        </template>

        <!-- Vue Journal d'audit -->
        <template v-else-if="currentTab === 'audit'">
          <AuditLogs
            :logs="logs"
            :loading="loading"
            :page="logsPage"
            :total-pages="logsTotalPages"
            @page="changeLogsPage"
            @refresh="loadData"
          />
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
