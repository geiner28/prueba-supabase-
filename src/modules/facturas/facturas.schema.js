// ===========================================
// Facturas - Schemas (Zod)
// ===========================================
const { z } = require("zod");

const capturaFacturaSchema = z.object({
  telefono: z.string().min(7),
  obligacion_id: z.string().uuid("obligacion_id debe ser UUID"),
  periodo: z.string().min(7, "Periodo requerido (YYYY-MM-DD o YYYY-MM-01)"),
  fecha_emision: z.string().optional(),
  fecha_vencimiento: z.string().optional(),
  monto: z.number().positive("Monto debe ser positivo").optional(),
  origen: z.string().optional(),
  archivo_url: z.string().optional(),
  extraccion_estado: z.enum(["ok", "dudosa", "fallida"]).default("ok"),
  extraccion_json: z.any().optional(),
  extraccion_confianza: z.number().min(0).max(1).optional(),
});

const validarFacturaSchema = z.object({
  monto: z.number().positive("Monto debe ser positivo"),
  fecha_vencimiento: z.string().min(1, "Fecha de vencimiento requerida"),
  fecha_emision: z.string().optional(),
  observaciones_admin: z.string().optional(),
});

const rechazarFacturaSchema = z.object({
  motivo_rechazo: z.string().min(1, "Motivo de rechazo requerido"),
});

module.exports = { capturaFacturaSchema, validarFacturaSchema, rechazarFacturaSchema };
