// ===========================================
// Disponibilidad - Schema (Zod)
// ===========================================
const { z } = require("zod");

const queryDisponibleSchema = z.object({
  telefono: z.string().min(7),
  periodo: z.string().min(7).optional(),
});

module.exports = { queryDisponibleSchema };
