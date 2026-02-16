// ===========================================
// Users - Schemas (Zod)
// ===========================================
const { z } = require("zod");

const upsertUserSchema = z.object({
  telefono: z.string().min(7, "Teléfono requerido"),
  nombre: z.string().optional(),
  apellido: z.string().optional(),
  correo: z.string().email("Correo inválido").optional(),
});

const updatePlanSchema = z.object({
  telefono: z.string().min(7, "Teléfono requerido"),
  plan: z.enum(["control", "tranquilidad", "respaldo"], "Plan debe ser 'control', 'tranquilidad' o 'respaldo'"),
});

module.exports = { upsertUserSchema, updatePlanSchema };
