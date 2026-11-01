<script setup lang="ts">
// Composant racine de l'application Goama
</script>

<template>
  <router-view />
</template>

<style>
/* L'espace de travail gère lui-même le défilement de ses panneaux. */
html, body {
  margin: 0;
  padding: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  background-color: #f8fafc;
}

#app {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

*, *::before, *::after {
  box-sizing: inherit;
}
</style>