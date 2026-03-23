// ===========================================
// Admin - Schemas (Zod)
// Dashboard y listado de clientes
// ===========================================
const { z } = require("zod");

const queryClientesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  plan: z.enum(["control", "tranquilidad", "respaldo"]).optional(),
  activo: z.coerce.boolean().optional(),
});

const queryPagosHistorialSchema = z.object({
  telefono: z.string().min(7).optional(),
  periodo: z.string().optional(),
  estado: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Schema para upsert de usuarios por admin (con campos extendidos)
// Si se envía usuario_id, busca por ID (permite cambiar teléfono).
// Si no se envía, busca por teléfono (comportamiento original para creación).
const upsertUsuarioAdminSchema = z.object({
  usuario_id: z.string().uuid().optional(),
  telefono: z.string().min(7),
  nombre: z.string().optional(),
  apellido: z.string().optional(),
  correo: z.string().email().optional(),
  direccion: z.string().optional(),
  plan: z.enum(["control", "tranquilidad", "respaldo"]).optional(),
});

// Schema para actualizar usuario por ID (admin puede cambiar teléfono)
const updateUsuarioAdminSchema = z.object({
  telefono: z.string().min(7).optional(),
  nombre: z.string().optional(),
  apellido: z.string().optional(),
  correo: z.string().email().optional().nullable(),
  direccion: z.string().optional().nullable(),
  plan: z.enum(["control", "tranquilidad", "respaldo"]).optional(),
  activo: z.boolean().optional(),
});

const queryHistorialSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(8),
  tipo: z.enum(["recarga", "obligacion_agregada", "pago_factura", "usuario_creado"]).optional(),
  usuario_id: z.string().uuid().optional(),
  desde: z.string().optional(),
  hasta: z.string().optional(),
});

const queryTransaccionesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(8),
  tipo: z.enum(["pago", "recarga"]).optional(),
  usuario_id: z.string().uuid().optional(),
  search: z.string().optional(),
});

module.exports = { queryClientesSchema, queryPagosHistorialSchema, upsertUsuarioAdminSchema, updateUsuarioAdminSchema, queryHistorialSchema, queryTransaccionesSchema };
