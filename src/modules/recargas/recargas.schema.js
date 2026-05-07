// ===========================================
// Recargas - Schemas (Zod)
// ===========================================
const { z } = require("zod");

const reportarRecargaSchema = z.object({
  telefono: z.string().min(7),
  periodo: z.string().min(7, "Periodo requerido"),
  monto: z.number().positive("Monto debe ser positivo"),
  comprobante_url: z.string().min(1).optional(),
  referencia_tx: z.string().optional(),
  // Campos opcionales para actualizar el perfil del usuario en el mismo llamado
  nombre: z.string().max(120).optional(),
  apellido: z.string().max(120).optional(),
});

const aprobarRecargaSchema = z.object({
  observaciones_admin: z.string().optional(),
});

const rechazarRecargaSchema = z.object({
  motivo_rechazo: z.string().min(1, "Motivo de rechazo requerido"),
});

const actualizarRecargaSchema = z.object({
  monto: z.number().positive("Monto debe ser positivo").optional(),
  periodo: z.string().min(7, "Periodo inválido").optional(),
  comprobante_url: z.string().nullable().optional(),
  referencia_tx: z.string().nullable().optional(),
  observaciones_admin: z.string().nullable().optional(),
});

module.exports = { reportarRecargaSchema, aprobarRecargaSchema, rechazarRecargaSchema, actualizarRecargaSchema };
