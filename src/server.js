// ===========================================
// DeOne Backend - Server Entry Point
// ===========================================
const config = require("./config");
const app = require("./app");

const PORT = config.port;

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║         🚀 DeOne Backend                  ║
║─────────────────────────────────────────  ║
║  Puerto:     ${String(PORT).padEnd(28)}║
║  Entorno:    ${String(config.nodeEnv).padEnd(28)}║
║  Supabase:   Conectado                    ║
║  Health:     http://localhost:${PORT}/api/health  ║
╚═══════════════════════════════════════════╝
  `);
});
