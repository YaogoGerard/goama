// Point d'entrée : construit l'application, écoute, démarre la purge
// périodique et gère l'arrêt propre (SIGINT/SIGTERM).
import { construireApp } from "./app.js";
import { demarrerPurge } from "./jobs/purge.js";
import { config } from "./config.js";

const app = await construireApp();
await app.listen({ port: config.PORT, host: "0.0.0.0" });

const arreterPurge = demarrerPurge();
console.log(`[goama] API prête sur :${config.PORT} — /healthz /readyz /ws`);

async function fermer() {
  arreterPurge();
  await app.close();
  process.exit(0);
}
process.on("SIGINT", fermer);
process.on("SIGTERM", fermer);
