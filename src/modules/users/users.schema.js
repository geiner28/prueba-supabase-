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

module.exports = { upsertUserSchema };
