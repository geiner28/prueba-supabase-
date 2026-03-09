// ===========================================
// Solicitudes Recarga - Schema (Zod)
// ===========================================
const { z } = require("zod");

// Generar solicitudes automáticas de recarga
const generarSolicitudesSchema = z.object({
  telefono: z.string().min(7),
  obligacion_id: z.string().uuid("obligacion_id debe ser UUID"),
});

// Consultar solicitudes
const querySolicitudesSchema = z.object({
  telefono: z.string().min(7),
  estado: z.enum(["pendiente", "parcial", "cumplida", "vencida", "cancelada"]).optional(),
  obligacion_id: z.string().uuid().optional(),
});

// Verificar recordatorios (bot llama periódicamente)
const verificarRecordatoriosSchema = z.object({
  telefono: z.string().min(7),
});

// Actualizar fechas de cuotas (usuario personaliza)
const actualizarFechasSchema = z.object({
  fecha_cuota_1: z.string().optional(),
  fecha_cuota_2: z.string().optional(),
});

module.exports = {
  generarSolicitudesSchema,
  querySolicitudesSchema,
  verificarRecordatoriosSchema,
  actualizarFechasSchema,
};
