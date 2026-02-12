// ===========================================
// Disponibilidad - Schema (Zod)
// ===========================================
const { z } = require("zod");

const queryDisponibleSchema = z.object({
  telefono: z.string().min(7),
  periodo: z.string().min(7, "Periodo requerido"),
});

module.exports = { queryDisponibleSchema };
