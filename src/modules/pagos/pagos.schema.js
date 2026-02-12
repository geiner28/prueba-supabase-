// ===========================================
// Pagos - Schemas (Zod)
// ===========================================
const { z } = require("zod");

const crearPagoSchema = z.object({
  telefono: z.string().min(7),
  factura_id: z.string().uuid("factura_id debe ser UUID"),
});

const confirmarPagoSchema = z.object({
  proveedor_pago: z.string().optional(),
  referencia_pago: z.string().optional(),
  comprobante_pago_url: z.string().optional(),
});

const fallarPagoSchema = z.object({
  error_detalle: z.string().min(1, "Detalle de error requerido"),
});

module.exports = { crearPagoSchema, confirmarPagoSchema, fallarPagoSchema };
