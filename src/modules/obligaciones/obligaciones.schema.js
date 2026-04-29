// ===========================================
// Obligaciones - Schemas (Zod) v2
// Obligación = compromiso de pago del periodo
// ===========================================
const { z } = require("zod");

const createObligacionSchema = z.object({
  telefono: z.string().min(7),
  descripcion: z.string().min(1, "Descripción requerida (ej: 'Pagos de Febrero 2026')"),
  periodo: z.string().min(7, "Periodo requerido (YYYY-MM-DD)"),
  // Campos opcionales para el modal "Nueva obligación" del dashboard
  servicio: z.string().min(1).optional(),
  tipo_referencia: z.string().min(1).optional(),
  numero_referencia: z.string().min(1).optional(),
  pagina_pago: z.string().url().optional(),
  periodicidad: z.string().min(1).optional(),
  // Nuevos campos del rediseño 2026-04 (mockup modales)
  receptor: z.string().min(1).max(120).optional(),
  grupo: z.coerce.number().int().min(1).max(2).optional(),
});

const updateObligacionSchema = z.object({
  descripcion: z.string().optional(),
  estado: z.enum(["activa", "en_progreso", "completada", "cancelada"]).optional(),
  pagina_pago: z.string().url().nullable().optional(),
  periodicidad: z.string().nullable().optional(),
  receptor: z.string().max(120).nullable().optional(),
  grupo: z.coerce.number().int().min(1).max(2).nullable().optional(),
});

const queryObligacionesSchema = z.object({
  telefono: z.string().min(7),
  estado: z.string().optional(),
});

const deleteObligacionQuerySchema = z.object({
  force: z.union([z.literal("true"), z.literal("false")]).optional(),
});

module.exports = { createObligacionSchema, updateObligacionSchema, queryObligacionesSchema, deleteObligacionQuerySchema };
