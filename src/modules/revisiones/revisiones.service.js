// ===========================================
// Revisiones Admin - Service
// ===========================================
const supabase = require("../../config/supabase");
const { success, errors } = require("../../utils/response");
const { isValidTransition } = require("../../utils/stateMachine");
const { registrarAuditLog } = require("../../utils/auditLog");

/**
 * Listar revisiones con filtros opcionales.
 */
async function listarRevisiones({ tipo, estado }) {
  let query = supabase
    .from("revisiones_admin")
    .select("*, usuarios(nombre, telefono)")
    .order("prioridad", { ascending: true })
    .order("creado_en", { ascending: true });

  if (tipo) query = query.eq("tipo", tipo);
  if (estado) {
    query = query.eq("estado", estado);
  } else {
    query = query.eq("estado", "pendiente"); // default
  }

  const { data, error } = await query;
  if (error) throw new Error(`Error listando revisiones: ${error.message}`);

  return success(data);
}

/**
 * Admin toma una revisión.
 */
async function tomarRevision(revisionId, adminId) {
  const { data: revision, error: findErr } = await supabase
    .from("revisiones_admin")
    .select("*")
    .eq("id", revisionId)
    .single();

  if (findErr || !revision) return errors.notFound("Revisión no encontrada");

  if (!isValidTransition("revisiones_admin", revision.estado, "en_proceso")) {
    return errors.invalidTransition(
      `No se puede tomar revisión en estado '${revision.estado}'`
    );
  }

  const { data: updated, error: updateErr } = await supabase
    .from("revisiones_admin")
    .update({
      estado: "en_proceso",
      asignada_a: adminId,
    })
    .eq("id", revisionId)
    .select()
    .single();

  if (updateErr) throw new Error(`Error tomando revisión: ${updateErr.message}`);

  return success(updated);
}

/**
 * Admin descarta una revisión.
 */
async function descartarRevision(revisionId, body, adminId) {
  const { data: revision, error: findErr } = await supabase
    .from("revisiones_admin")
    .select("*")
    .eq("id", revisionId)
    .single();

  if (findErr || !revision) return errors.notFound("Revisión no encontrada");

  if (!isValidTransition("revisiones_admin", revision.estado, "descartada")) {
    return errors.invalidTransition(
      `No se puede descartar revisión en estado '${revision.estado}'`
    );
  }

  const { data: updated, error: updateErr } = await supabase
    .from("revisiones_admin")
    .update({
      estado: "descartada",
      resuelta_por: adminId,
      resuelta_en: new Date().toISOString(),
    })
    .eq("id", revisionId)
    .select()
    .single();

  if (updateErr) throw new Error(`Error descartando revisión: ${updateErr.message}`);

  await registrarAuditLog({
    actor_tipo: "admin",
    actor_id: adminId,
    accion: "descartar_revision",
    entidad: "revisiones_admin",
    entidad_id: revisionId,
    antes: revision,
    despues: updated,
  });

  return success(updated);
}

module.exports = { listarRevisiones, tomarRevision, descartarRevision };
