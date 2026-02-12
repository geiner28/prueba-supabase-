// ===========================================
// Obligaciones - Schemas (Zod)
// ===========================================
const { z } = require("zod");

const createObligacionSchema = z.object({
  telefono: z.string().min(7),
  servicio: z.string().min(1, "Servicio requerido"),
  pagina_pago: z.string().optional(),
  tipo_referencia: z.string().min(1, "Tipo de referencia requerido"),
  numero_referencia: z.string().min(1, "Número de referencia requerido"),
  periodicidad: z.enum(["mensual", "quincenal"]).default("mensual"),
  estado: z.enum(["activa", "inactiva"]).optional(),
});

const updateObligacionSchema = z.object({
  estado: z.enum(["activa", "inactiva"]).optional(),
  periodicidad: z.enum(["mensual", "quincenal"]).optional(),
  pagina_pago: z.string().optional(),
  quincena_objetivo: z.number().int().min(1).max(31).optional(),
});

const queryObligacionesSchema = z.object({
  telefono: z.string().min(7),
});

module.exports = { createObligacionSchema, updateObligacionSchema, queryObligacionesSchema };
