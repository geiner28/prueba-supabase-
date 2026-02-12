// ===========================================
// Audit Log Helper
// ===========================================
const supabase = require("../config/supabase");

/**
 * Registra una entrada de auditoría.
 * @param {object} params
 * @param {string} params.actor_tipo - "admin" | "bot" | "sistema"
 * @param {string|null} params.actor_id - UUID del actor (null si bot/sistema)
 * @param {string} params.accion - Descripción de la acción
 * @param {string} params.entidad - Nombre de la tabla/entidad
 * @param {string} params.entidad_id - UUID de la entidad
 * @param {object|null} params.antes - Estado anterior (JSON)
 * @param {object|null} params.despues - Estado posterior (JSON)
 */
async function registrarAuditLog({ actor_tipo, actor_id = null, accion, entidad, entidad_id, antes = null, despues = null }) {
  const { error } = await supabase.from("audit_log").insert({
    actor_tipo,
    actor_id,
    accion,
    entidad,
    entidad_id,
    antes,
    despues,
  });

  if (error) {
    console.error("[AUDIT_LOG] Error al registrar:", error.message);
  }
}

module.exports = { registrarAuditLog };
