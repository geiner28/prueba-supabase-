// ===========================================
// Recargas - Service
// ===========================================
const supabase = require("../../config/supabase");
const { success, errors } = require("../../utils/response");
const { resolverUsuarioPorTelefono } = require("../../utils/resolverUsuario");
const { normalizarPeriodo } = require("../../utils/periodo");
const { isValidTransition } = require("../../utils/stateMachine");
const { registrarAuditLog } = require("../../utils/auditLog");
const { crearNotificacionInterna } = require("../notificaciones/notificaciones.service");

/**
 * Reportar recarga (desde el bot).
 */
async function reportarRecarga(body) {
  const { telefono, periodo, monto, comprobante_url, referencia_tx } = body;

  // 1. Resolver usuario
  const usuario = await resolverUsuarioPorTelefono(telefono);
  if (!usuario) return errors.notFound("Usuario no encontrado con ese teléfono");

  const periodoNorm = normalizarPeriodo(periodo);
  if (!periodoNorm) return errors.validation("Periodo inválido");

  // 2. Idempotencia por referencia_tx
  if (referencia_tx) {
    const { data: existente } = await supabase
      .from("recargas")
      .select("*")
      .eq("referencia_tx", referencia_tx)
      .single();

    if (existente) {
      return success({
        recarga_id: existente.id,
        estado: existente.estado,
        mensaje: "Recarga ya reportada con esta referencia de transacción",
      });
    }
  }

  // 3. Crear recarga en estado en_validacion
  const { data: recarga, error: insertErr } = await supabase
    .from("recargas")
    .insert({
      usuario_id: usuario.usuario_id,
      periodo: periodoNorm,
      monto,
      estado: "en_validacion",
      canal_origen: "whatsapp",
      comprobante_url,
      referencia_tx: referencia_tx || null,
    })
    .select()
    .single();

  if (insertErr) throw new Error(`Error reportando recarga: ${insertErr.message}`);

  // 4. Crear revisión admin
  await supabase.from("revisiones_admin").insert({
    tipo: "recarga",
    estado: "pendiente",
    usuario_id: usuario.usuario_id,
    recarga_id: recarga.id,
    prioridad: 2,
    razon: "Comprobante recibido: validar recarga",
  });

  // 5. Audit log
  await registrarAuditLog({
    actor_tipo: "bot",
    accion: "reportar_recarga",
    entidad: "recargas",
    entidad_id: recarga.id,
    despues: recarga,
  });

  return success({ recarga_id: recarga.id, estado: "en_validacion" }, 201);
}

/**
 * Admin aprueba una recarga.
 */
async function aprobarRecarga(recargaId, body, adminId) {
  const { data: recarga, error: findErr } = await supabase
    .from("recargas")
    .select("*")
    .eq("id", recargaId)
    .single();

  if (findErr || !recarga) return errors.notFound("Recarga no encontrada");

  if (!isValidTransition("recargas", recarga.estado, "aprobada")) {
    return errors.invalidTransition(
      `No se puede aprobar recarga en estado '${recarga.estado}'. Debe estar en 'en_validacion'.`
    );
  }

  const antes = { ...recarga };
  const { data: updated, error: updateErr } = await supabase
    .from("recargas")
    .update({
      estado: "aprobada",
      validada_por: adminId,
      validada_en: new Date().toISOString(),
      observaciones_admin: body.observaciones_admin || null,
    })
    .eq("id", recargaId)
    .select()
    .single();

  if (updateErr) throw new Error(`Error aprobando recarga: ${updateErr.message}`);

  // Cerrar revisión
  await supabase
    .from("revisiones_admin")
    .update({
      estado: "resuelta",
      resuelta_por: adminId,
      resuelta_en: new Date().toISOString(),
    })
    .eq("recarga_id", recargaId)
    .in("estado", ["pendiente", "en_proceso"]);

  await registrarAuditLog({
    actor_tipo: "admin",
    actor_id: adminId,
    accion: "aprobar_recarga",
    entidad: "recargas",
    entidad_id: recargaId,
    antes,
    despues: updated,
  });

  // Notificar al usuario que su recarga fue aprobada
  await crearNotificacionInterna({
    usuario_id: recarga.usuario_id,
    tipo: "recarga_aprobada",
    canal: "whatsapp",
    payload: {
      recarga_id: recargaId,
      monto: recarga.monto,
      periodo: recarga.periodo,
      mensaje: `Tu recarga de $${Number(recarga.monto).toLocaleString()} ha sido aprobada.`,
    },
  });

  return success(updated);
}

/**
 * Admin rechaza una recarga.
 */
async function rechazarRecarga(recargaId, body, adminId) {
  const { data: recarga, error: findErr } = await supabase
    .from("recargas")
    .select("*")
    .eq("id", recargaId)
    .single();

  if (findErr || !recarga) return errors.notFound("Recarga no encontrada");

  if (!isValidTransition("recargas", recarga.estado, "rechazada")) {
    return errors.invalidTransition(
      `No se puede rechazar recarga en estado '${recarga.estado}'. Debe estar en 'en_validacion'.`
    );
  }

  const antes = { ...recarga };
  const { data: updated, error: updateErr } = await supabase
    .from("recargas")
    .update({
      estado: "rechazada",
      validada_por: adminId,
      validada_en: new Date().toISOString(),
      motivo_rechazo: body.motivo_rechazo,
    })
    .eq("id", recargaId)
    .select()
    .single();

  if (updateErr) throw new Error(`Error rechazando recarga: ${updateErr.message}`);

  // Cerrar revisión
  await supabase
    .from("revisiones_admin")
    .update({
      estado: "resuelta",
      resuelta_por: adminId,
      resuelta_en: new Date().toISOString(),
    })
    .eq("recarga_id", recargaId)
    .in("estado", ["pendiente", "en_proceso"]);

  await registrarAuditLog({
    actor_tipo: "admin",
    actor_id: adminId,
    accion: "rechazar_recarga",
    entidad: "recargas",
    entidad_id: recargaId,
    antes,
    despues: updated,
  });

  // Notificar al usuario que su recarga fue rechazada
  await crearNotificacionInterna({
    usuario_id: recarga.usuario_id,
    tipo: "recarga_rechazada",
    canal: "whatsapp",
    payload: {
      recarga_id: recargaId,
      monto: recarga.monto,
      motivo: body.motivo_rechazo,
      mensaje: `Tu recarga de $${Number(recarga.monto).toLocaleString()} fue rechazada. Motivo: ${body.motivo_rechazo}`,
    },
  });

  return success(updated);
}

module.exports = { reportarRecarga, aprobarRecarga, rechazarRecarga };
