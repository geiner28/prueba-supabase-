// ===========================================
// Programación de Recargas - Schemas (Zod)
// ===========================================
const { z } = require("zod");

const updateProgramacionRecargasSchema = z.object({
  usuario_id: z.string().min(1, "usuario_id es requerido"),
  cantidad_recargas: z.number().int().refine((val) => [1, 2].includes(val), {
    message: "cantidad_recargas debe ser 1 o 2",
  }),
  dia_1: z.number().int().min(1, "dia_1 debe ser mínimo 1").max(28, "dia_1 debe ser máximo 28"),
  dia_2: z.number().int().min(1, "dia_2 debe ser mínimo 1").max(28, "dia_2 debe ser máximo 28").optional(),
});

module.exports = { updateProgramacionRecargasSchema };
