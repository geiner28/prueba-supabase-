// ===========================================
// Notificaciones - Schemas (Zod)
// ===========================================
const { z } = require("zod");

const crearNotificacionSchema = z.object({
  telefono: z.string().min(7),
  tipo: z.string().min(1, "Tipo de notificación requerido"),
  canal: z.enum(["whatsapp", "email", "push", "sms"]).default("whatsapp"),
  payload: z.any().optional(),
});

const crearNotificacionMasivaSchema = z.object({
  tipo: z.string().min(1, "Tipo de notificación requerido"),
  canal: z.enum(["whatsapp", "email", "push", "sms"]).default("whatsapp"),
  payload: z.any().optional(),
  filtro_plan: z.enum(["control", "tranquilidad", "respaldo"]).optional(),
});

const actualizarEstadoNotificacionSchema = z.object({
  estado: z.enum(["enviada", "fallida", "leida"]),
  ultimo_error: z.string().optional(),
});

const queryNotificacionesSchema = z.object({
  telefono: z.string().min(7).optional(),
  tipo: z.string().optional(),
  estado: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

module.exports = {
  crearNotificacionSchema,
  crearNotificacionMasivaSchema,
  actualizarEstadoNotificacionSchema,
  queryNotificacionesSchema,
};
