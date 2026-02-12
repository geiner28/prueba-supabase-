// ===========================================
// DeOne Backend - Configuración Central
// ===========================================
require("dotenv").config();

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || "development",

  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },

  auth: {
    botApiKey: process.env.BOT_API_KEY,
    adminApiKey: process.env.ADMIN_API_KEY,
  },
};

// Validar variables requeridas
const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "BOT_API_KEY", "ADMIN_API_KEY"];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Variable de entorno requerida: ${key}`);
  }
}

module.exports = config;
