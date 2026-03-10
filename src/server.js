// ===========================================
// DeOne Backend - Server Entry Point
// ===========================================
const config = require("./config");
const app = require("./app");

// Importar jobs
let initJobs;
try {
  const jobs = require("./jobs/recordatorios.job");
  initJobs = jobs.initJobs;
} catch (e) {
  console.warn("[SERVER] No se pudieron cargar los jobs:", e.message);
  initJobs = null;
}

const PORT = config.port;

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║         🚀 DeOne Backend                  ║
║──────────────────────────────────────────║
║  Puerto:     ${String(PORT).padEnd(28)}║
║  Entorno:    ${String(config.nodeEnv || 'development').padEnd(28)}║
║  Supabase:   Conectado                    ║
║  Health:     http://localhost:${PORT}/api/health  ║
╚═══════════════════════════════════════════╝
  `);

  // Inicializar jobs programados
  if (initJobs) {
    try {
      initJobs();
      console.log("[SERVER] ✓ Jobs programados inicializados");
    } catch (e) {
      console.error("[SERVER] Error inicializando jobs:", e.message);
    }
  }
});
