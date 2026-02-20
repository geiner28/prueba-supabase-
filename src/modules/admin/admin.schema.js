// ===========================================
// Admin - Schemas (Zod)
// Dashboard y listado de clientes
// ===========================================
const { z } = require("zod");

const queryClientesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  plan: z.enum(["control", "tranquilidad", "respaldo"]).optional(),
  activo: z.coerce.boolean().optional(),
});

const queryPagosHistorialSchema = z.object({
  telefono: z.string().min(7).optional(),
  periodo: z.string().optional(),
  estado: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

module.exports = { queryClientesSchema, queryPagosHistorialSchema };
