// ===========================================
// Recargas - Schemas (Zod)
// ===========================================
const { z } = require("zod");

const reportarRecargaSchema = z.object({
  telefono: z.string().min(7),
  periodo: z.string().min(7, "Periodo requerido"),
  monto: z.number().positive("Monto debe ser positivo"),
  comprobante_url: z.string().min(1, "Comprobante requerido"),
  referencia_tx: z.string().optional(),
});

const aprobarRecargaSchema = z.object({
  observaciones_admin: z.string().optional(),
});

const rechazarRecargaSchema = z.object({
  motivo_rechazo: z.string().min(1, "Motivo de rechazo requerido"),
});

module.exports = { reportarRecargaSchema, aprobarRecargaSchema, rechazarRecargaSchema };
