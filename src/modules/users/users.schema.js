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

const deleteUserQuerySchema = z.object({
  telefono: z.string().min(7).optional(),
  hard: z.union([z.literal("true"), z.literal("false")]).optional(),
  force: z.union([z.literal("true"), z.literal("false")]).optional(),
});

module.exports = { upsertUserSchema, updatePlanSchema, deleteUserQuerySchema };
