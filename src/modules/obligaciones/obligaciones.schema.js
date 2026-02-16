// ===========================================
// Obligaciones - Schemas (Zod) v2
// Obligación = compromiso de pago del periodo
// ===========================================
const { z } = require("zod");

const createObligacionSchema = z.object({
  telefono: z.string().min(7),
  descripcion: z.string().min(1, "Descripción requerida (ej: 'Pagos de Febrero 2026')"),
  periodo: z.string().min(7, "Periodo requerido (YYYY-MM-DD)"),
});

const updateObligacionSchema = z.object({
  descripcion: z.string().optional(),
  estado: z.enum(["activa", "en_progreso", "completada", "cancelada"]).optional(),
});

const queryObligacionesSchema = z.object({
  telefono: z.string().min(7),
  estado: z.string().optional(),
});

module.exports = { createObligacionSchema, updateObligacionSchema, queryObligacionesSchema };
