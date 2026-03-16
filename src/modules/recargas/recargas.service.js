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

// Importar funciones de notificaciones de recarga
let crearNotificacionRecarga;
let prepararDatosNotificacion;
try {
  crearNotificacionRecarga = require("../notificaciones/notificaciones.service").crearNotificacionRecarga;
  prepararDatosNotificacion = require("../notificaciones/notificaciones.service").prepararDatosNotificacion;
} catch (e) {
  crearNotificacionRecarga = null;
  prepararDatosNotificacion = null;
}

/**
 * Reportar recarga (desde el bot).
 */
async function reportarRecarga(body, actorTipo = "bot") {
  const { telefono, periodo, monto, comprobante_url, referencia_tx } = body;
  
  // Determinar canal de origen basado en quién hace la petición
  const canalOrigen = actorTipo === "admin" ? "web_admin" : "whatsapp";

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
      canal_origen: canalOrigen,
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

  // NUEVO: Enviar notificación de recarga confirmada con el nuevo saldo
  if (crearNotificacionRecarga && prepararDatosNotificacion) {
    try {
      // Calcular el nuevo saldo del usuario
      const { data: todasRecargas } = await supabase
        .from('recargas')
        .select('monto')
        .eq('usuario_id', recarga.usuario_id)
        .eq('estado', 'aprobada');
      
      const { data: todosPagos } = await supabase
        .from('pagos')
        .select('monto_aplicado')
        .eq('usuario_id', recarga.usuario_id)
        .eq('estado', 'pagado');
      
      const totalRecargas = (todasRecargas || []).reduce((sum, r) => sum + Number(r.monto || 0), 0);
      const totalPagos = (todosPagos || []).reduce((sum, p) => sum + Number(p.monto_aplicado || 0), 0);
      const saldoActual = totalRecargas - totalPagos;
      
      // Preparar datos para notificación de recarga confirmada
      const datosConfirmada = {
        nombre_usuario: '', // se填充 en crearNotificacionRecarga
        monto: recarga.monto,
        saldo: saldoActual,
        periodo: recarga.periodo
      };
      
      // Crear notificación de recarga confirmada
      await crearNotificacionRecarga(
        recarga.usuario_id,
        'recarga_confirmada',
        datosConfirmada
      );
      
      console.log(`[RECARGAS] Notificación de recarga confirmada enviada para usuario ${recarga.usuario_id}, saldo: ${saldoActual}`);
    } catch (err) {
      console.error("[RECARGAS] Error enviando notificación de recarga confirmada:", err.message);
      // No fallamos la operación si falla la notificación
    }
  }

  // ============================================================
  // NUEVO: AUTO-LIMPIEZA - Cancelar notificaciones de cobro pendientes
  // Cuando se aprueba una recarga, cancelamos las notificaciones
  // de cobro pendientes para evitar mensajes redundantes
  // ============================================================
  try {
    // Buscar notificaciones de cobro pendientes del usuario
    const { data: notificacionesCobro, error: errorBusqueda } = await supabase
      .from('notificaciones')
      .select('id, tipo, estado, payload')
      .eq('usuario_id', recarga.usuario_id)
      .in('estado', ['pendiente', 'enviada'])
      .in('tipo', ['solicitud_recarga', 'solicitud_recarga_inicio_mes']);

    if (errorBusqueda) {
      console.error("[RECARGAS] Error buscando notificaciones de cobro:", errorBusqueda.message);
    } else if (notificacionesCobro && notificacionesCobro.length > 0) {
      const idsCancelar = notificacionesCobro.map(n => n.id);
      
      // Actualizar estado a 'cancelada' y guardar info en payload (sin alterar el resto)
      for (const notif of notificacionesCobro) {
        const payloadActual = notif.payload || {};
        payloadActual.cancelacion = {
          cancelada_por: 'aprobar_recarga',
          cancelada_en: new Date().toISOString(),
          motivo: `Recarga aprobada ID: ${recargaId}`,
          recarga_aprobada_id: recargaId
        };
        
        await supabase
          .from('notificaciones')
          .update({ 
            estado: 'cancelada',
            payload: payloadActual
          })
          .eq('id', notif.id);
      }
      
      console.log(`[RECARGAS] ${idsCancelar.length} notificaciones de cobro canceladas para usuario ${recarga.usuario_id}`);
    }
  } catch (err) {
    console.error("[RECARGAS] Error en auto-limpieza de notificaciones:", err.message);
    // No fallamos la operación principal
  }

  // ============================================================
  // NUEVO: Actualizar solicitudes de recarga pendientes
  // Marcar como cumplidas las solicitudes de recarga del usuario
  // ============================================================
  try {
    const { data: solicitudesActualizar, error: errorSolicitudes } = await supabase
      .from('solicitudes_recarga')
      .select('id, monto_recargado')
      .eq('usuario_id', recarga.usuario_id)
      .eq('obligacion_id', recarga.periodo) // Usar periodo como referencia
      .in('estado', ['pendiente', 'parcial']);

    if (errorSolicitudes) {
      console.error("[RECARGAS] Error buscando solicitudes de recarga:", errorSolicitudes.message);
    } else if (solicitudesActualizar && solicitudesActualizar.length > 0) {
      const montoRecarga = Number(recarga.monto);
      
      for (const sol of solicitudesActualizar) {
        const nuevoMontoRecargado = Number(sol.monto_recargado || 0) + montoRecarga;
        const nuevoEstado = nuevoMontoRecargado >= sol.monto_solicitado ? 'cumplida' : 'parcial';
        
        await supabase
          .from('solicitudes_recarga')
          .update({
            monto_recargado: nuevoMontoRecargado,
            estado: nuevoEstado,
            actualizado_en: new Date().toISOString()
          })
          .eq('id', sol.id);
      }
      
      console.log(`[RECARGAS] ${solicitudesActualizar.length} solicitudes de recarga actualizadas para usuario ${recarga.usuario_id}`);
    }
  } catch (err) {
    console.error("[RECARGAS] Error actualizando solicitudes de recarga:", err.message);
  }

  return success(updated);
}

/**
 * Obtener recargas pendientes de validación para un usuario (por teléfono).
 */
async function obtenerRecargasPendientesPorTelefono(telefono) {
  // 1. Resolver usuario
  const usuarioResuelto = await resolverUsuarioPorTelefono(telefono);
  if (!usuarioResuelto) return errors.notFound("Usuario no encontrado con ese teléfono");

  const usuario = usuarioResuelto.usuario; // Acceder al objeto usuario completo

  // 2. Obtener recargas pendientes del usuario (en_validacion)
  const { data: recargas, error: recargasErr } = await supabase
    .from("recargas")
    .select("*")
    .eq("usuario_id", usuarioResuelto.usuario_id)
    .eq("estado", "en_validacion")
    .order("creado_en", { ascending: false });

  if (recargasErr) throw new Error(`Error obteniendo recargas: ${recargasErr.message}`);

  // Si no hay recargas pendientes, retornar respuesta diferente
  if (!recargas || recargas.length === 0) {
    return success({
      usuario: {
        usuario_id: usuarioResuelto.usuario_id,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        telefono: usuario.telefono,
        plan: usuario.plan,
      },
      recargas_pendientes: [],
      no_pending: true, // Indicador para diferenciar "usuario sin recargas" de "usuario no encontrado"
    });
  }

  return success({
    usuario: {
      usuario_id: usuarioResuelto.usuario_id,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      telefono: usuario.telefono,
      plan: usuario.plan,
    },
    recargas_pendientes: recargas || [],
  });
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

module.exports = { reportarRecarga, aprobarRecarga, rechazarRecarga, obtenerRecargasPendientesPorTelefono };
