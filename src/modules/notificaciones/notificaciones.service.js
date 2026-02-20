// ===========================================
// Notificaciones - Service
// Usa la tabla 'notificaciones' existente en la DB
// Tipos: recarga_aprobada, recarga_rechazada,
//        obligacion_completada, pago_confirmado,
//        factura_validada, factura_rechazada,
//        nueva_obligacion, recordatorio_recarga
// ===========================================
const supabase = require("../../config/supabase");
const { success, errors } = require("../../utils/response");
const { resolverUsuarioPorTelefono } = require("../../utils/resolverUsuario");

/**
 * Crear una notificación para un usuario.
 */
async function crearNotificacion({ telefono, tipo, canal, payload }) {
  const usuario = await resolverUsuarioPorTelefono(telefono);
  if (!usuario) return errors.notFound("Usuario no encontrado con ese teléfono");

  const { data, error } = await supabase
    .from("notificaciones")
    .insert({
      usuario_id: usuario.usuario_id,
      tipo,
      canal: canal || "whatsapp",
      payload: payload || {},
      estado: "pendiente",
    })
    .select()
    .single();

  if (error) throw new Error(`Error creando notificación: ${error.message}`);

  return success(data, 201);
}

/**
 * Crear notificación interna (desde otros servicios, sin resolver teléfono).
 * Recibe directamente usuario_id.
 */
async function crearNotificacionInterna({ usuario_id, tipo, canal, payload }) {
  const { data, error } = await supabase
    .from("notificaciones")
    .insert({
      usuario_id,
      tipo,
      canal: canal || "whatsapp",
      payload: payload || {},
      estado: "pendiente",
    })
    .select()
    .single();

  if (error) {
    console.error("[NOTIFICACIONES] Error creando notificación interna:", error.message);
    return null;
  }

  return data;
}

/**
 * Crear notificación masiva (a todos los usuarios activos, filtro opcional por plan).
 */
async function crearNotificacionMasiva({ tipo, canal, payload, filtro_plan }) {
  let query = supabase
    .from("usuarios")
    .select("id")
    .eq("activo", true);

  if (filtro_plan) {
    query = query.eq("plan", filtro_plan);
  }

  const { data: usuarios, error: usrErr } = await query;
  if (usrErr) throw new Error(`Error buscando usuarios: ${usrErr.message}`);

  if (!usuarios || usuarios.length === 0) {
    return success({ total_enviadas: 0, mensaje: "No hay usuarios activos que coincidan con el filtro" });
  }

  const rows = usuarios.map(u => ({
    usuario_id: u.id,
    tipo,
    canal: canal || "whatsapp",
    payload: payload || {},
    estado: "pendiente",
  }));

  const { data, error } = await supabase
    .from("notificaciones")
    .insert(rows)
    .select("id");

  if (error) throw new Error(`Error creando notificaciones masivas: ${error.message}`);

  return success({ total_enviadas: (data || []).length }, 201);
}

/**
 * Listar notificaciones con filtros.
 */
async function listarNotificaciones({ telefono, tipo, estado, limit, offset }) {
  let query = supabase
    .from("notificaciones")
    .select("*, usuarios(nombre, apellido, telefono)", { count: "exact" })
    .order("creado_en", { ascending: false })
    .range(offset, offset + limit - 1);

  if (telefono) {
    const usuario = await resolverUsuarioPorTelefono(telefono);
    if (!usuario) return errors.notFound("Usuario no encontrado con ese teléfono");
    query = query.eq("usuario_id", usuario.usuario_id);
  }
  if (tipo) query = query.eq("tipo", tipo);
  if (estado) query = query.eq("estado", estado);

  const { data, error, count } = await query;
  if (error) throw new Error(`Error listando notificaciones: ${error.message}`);

  return success({ notificaciones: data, total: count, limit, offset });
}

/**
 * Obtener notificaciones pendientes de un usuario (para el bot).
 */
async function obtenerPendientesUsuario(telefono) {
  const usuario = await resolverUsuarioPorTelefono(telefono);
  if (!usuario) return errors.notFound("Usuario no encontrado con ese teléfono");

  const { data, error } = await supabase
    .from("notificaciones")
    .select("*")
    .eq("usuario_id", usuario.usuario_id)
    .eq("estado", "pendiente")
    .order("creado_en", { ascending: true });

  if (error) throw new Error(`Error buscando notificaciones pendientes: ${error.message}`);

  return success(data);
}

/**
 * Marcar notificación como enviada/fallida/leída.
 */
async function actualizarEstadoNotificacion(notificacionId, { estado, ultimo_error }) {
  const { data: existing, error: findErr } = await supabase
    .from("notificaciones")
    .select("*")
    .eq("id", notificacionId)
    .single();

  if (findErr || !existing) return errors.notFound("Notificación no encontrada");

  const updates = { estado };
  if (ultimo_error) updates.ultimo_error = ultimo_error;

  const { data, error } = await supabase
    .from("notificaciones")
    .update(updates)
    .eq("id", notificacionId)
    .select()
    .single();

  if (error) throw new Error(`Error actualizando notificación: ${error.message}`);

  return success(data);
}

/**
 * Marcar múltiples notificaciones como enviadas (batch).
 */
async function marcarEnviadasBatch(ids) {
  const { data, error } = await supabase
    .from("notificaciones")
    .update({ estado: "enviada" })
    .in("id", ids)
    .select("id");

  if (error) throw new Error(`Error marcando notificaciones: ${error.message}`);

  return success({ actualizadas: (data || []).length });
}

module.exports = {
  crearNotificacion,
  crearNotificacionInterna,
  crearNotificacionMasiva,
  listarNotificaciones,
  obtenerPendientesUsuario,
  actualizarEstadoNotificacion,
  marcarEnviadasBatch,
};
