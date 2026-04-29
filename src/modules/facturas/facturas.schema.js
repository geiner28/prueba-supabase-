// ===========================================
// Facturas - Schemas (Zod) v3 — Estados rediseñados (28-abr-2026)
//
// Modelo de estados:
//   estado (visible al usuario)        → pendiente | pagada | sin_factura | aproximada
//   validacion_estado (interno admin)  → sin_validar | validada | rechazada
//
// Factura = servicio individual dentro de una obligación.
// ===========================================
const { z } = require("zod");

const ESTADO_FACTURA = ["pendiente", "pagada", "sin_factura", "aproximada"];
const VALIDACION_ESTADO = ["sin_validar", "validada", "rechazada"];

// Capturar factura — el bot o admin registra un servicio
const capturaFacturaSchema = z.object({
  telefono: z.string().min(7),
  obligacion_id: z.string().uuid("obligacion_id debe ser UUID"),
  servicio: z.string().min(1, "Nombre del servicio requerido (ej: 'EPM Energía', 'Agua', 'Gas')"),
  monto: z.number().nonnegative("Monto no puede ser negativo").nullable().optional(),
  fecha_vencimiento: z.string().nullable().optional(),
  fecha_emision: z.string().nullable().optional(),
  fecha_recordatorio: z.string().nullable().optional(),
  periodo: z.string().nullable().optional(),
  origen: z.string().nullable().optional(),
  archivo_url: z.string().nullable().optional(),
  pagina_pago: z.string().nullable().optional(),
  referencia_pago: z.string().nullable().optional(),
  tipo_referencia: z.string().nullable().optional(),
  etiqueta: z.string().nullable().optional(),
  grupo: z.coerce.number().int().min(1).max(2).nullable().optional(),
  extraccion_estado: z.enum(["ok", "dudosa", "fallida"]).default("ok"),
  extraccion_json: z.any().optional(),
  extraccion_confianza: z.number().min(0).max(1).nullable().optional(),
});

// Validar factura (admin marca validacion_estado='validada' y opcionalmente edita campos).
// Todos los campos son OPCIONALES: el admin puede solo validar sin tocar nada,
// o validar y editar campos al mismo tiempo. NO se envía mensaje al usuario.
const validarFacturaSchema = z.object({
  monto: z.number().nonnegative().nullable().optional(),
  servicio: z.string().min(1).optional(),
  fecha_vencimiento: z.string().nullable().optional(),
  fecha_emision: z.string().nullable().optional(),
  fecha_recordatorio: z.string().nullable().optional(),
  referencia_pago: z.string().nullable().optional(),
  tipo_referencia: z.string().nullable().optional(),
  etiqueta: z.string().nullable().optional(),
  archivo_url: z.string().nullable().optional(),
  pagina_pago: z.string().nullable().optional(),
  observaciones_admin: z.string().nullable().optional(),
  periodo: z.string().min(7).optional(),
  grupo: z.coerce.number().int().min(1).max(2).nullable().optional(),
});

// Rechazar factura (admin marca validacion_estado='rechazada')
const rechazarFacturaSchema = z.object({
  motivo_rechazo: z.string().min(1, "Motivo de rechazo requerido"),
});

// Aproximar factura — acepta `monto` directo o `porcentaje` (default 10) sobre monto base.
const actualizarMontoFacturaSchema = z.object({
  monto: z.number().nonnegative().optional(),
  porcentaje: z.number().min(0).max(100).optional(),
  observaciones_admin: z.string().nullable().optional(),
}).refine((d) => d.monto != null || d.porcentaje != null, {
  message: "Debes enviar 'monto' o 'porcentaje' para aproximar",
});

// Edición libre de cualquier factura — admin puede modificar todos los campos
// incluyendo estado / validacion_estado / grupo.
const actualizarFacturaSchema = z.object({
  servicio: z.string().min(1).optional(),
  monto: z.number().nonnegative().nullable().optional(),
  fecha_vencimiento: z.string().nullable().optional(),
  fecha_emision: z.string().nullable().optional(),
  fecha_recordatorio: z.string().nullable().optional(),
  periodo: z.string().min(7).optional(),
  referencia_pago: z.string().nullable().optional(),
  tipo_referencia: z.string().nullable().optional(),
  etiqueta: z.string().nullable().optional(),
  archivo_url: z.string().nullable().optional(),
  pagina_pago: z.string().nullable().optional(),
  observaciones_admin: z.string().nullable().optional(),
  motivo_rechazo: z.string().nullable().optional(),
  grupo: z.coerce.number().int().min(1).max(2).nullable().optional(),
  estado: z.enum(ESTADO_FACTURA).optional(),
  validacion_estado: z.enum(VALIDACION_ESTADO).optional(),
  aproximacion_porcentaje: z.number().min(0).max(100).nullable().optional(),
});

module.exports = {
  capturaFacturaSchema,
  validarFacturaSchema,
  rechazarFacturaSchema,
  actualizarMontoFacturaSchema,
  actualizarFacturaSchema,
  ESTADO_FACTURA,
  VALIDACION_ESTADO,
};
