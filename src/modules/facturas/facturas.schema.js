// ===========================================
// Facturas - Schemas (Zod) v2
// Factura = servicio individual dentro de una obligación
// ===========================================
const { z } = require("zod");

// Capturar factura — el bot o admin registra un servicio
const capturaFacturaSchema = z.object({
  telefono: z.string().min(7),
  obligacion_id: z.string().uuid("obligacion_id debe ser UUID"),
  servicio: z.string().min(1, "Nombre del servicio requerido (ej: 'EPM Energía', 'Agua', 'Gas')"),
  monto: z.number().positive("Monto debe ser positivo").nullable().optional(),
  fecha_vencimiento: z.string().nullable().optional(),
  fecha_emision: z.string().nullable().optional(),
  periodo: z.string().nullable().optional(),
  origen: z.string().nullable().optional(),
  archivo_url: z.string().nullable().optional(),
  referencia_pago: z.string().nullable().optional(),
  extraccion_estado: z.enum(["ok", "dudosa", "fallida"]).default("ok"),
  extraccion_json: z.any().optional(),
  extraccion_confianza: z.number().min(0).max(1).nullable().optional(),
});

// Validar factura (admin confirma datos)
const validarFacturaSchema = z.object({
  monto: z.number().positive("Monto debe ser positivo"),
  fecha_vencimiento: z.string().optional(),
  fecha_emision: z.string().optional(),
  referencia_pago: z.string().nullable().optional(),
  observaciones_admin: z.string().optional(),
});

// Rechazar factura
const rechazarFacturaSchema = z.object({
  motivo_rechazo: z.string().min(1, "Motivo de rechazo requerido"),
});

module.exports = { capturaFacturaSchema, validarFacturaSchema, rechazarFacturaSchema };
