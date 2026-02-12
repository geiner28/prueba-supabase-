// ===========================================
// Revisiones Admin - Schemas (Zod)
// ===========================================
const { z } = require("zod");

const queryRevisionesSchema = z.object({
  tipo: z.enum(["factura", "recarga"]).optional(),
  estado: z.enum(["pendiente", "en_proceso", "resuelta", "descartada"]).optional(),
});

const descartarRevisionSchema = z.object({
  razon: z.string().optional(),
});

module.exports = { queryRevisionesSchema, descartarRevisionSchema };
