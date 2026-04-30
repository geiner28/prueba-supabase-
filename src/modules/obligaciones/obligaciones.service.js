// ===========================================
// Obligaciones - Service v2
// Obligación = compromiso de pago del periodo
// Contiene múltiples facturas (agua, gas, energía)
// Se auto-completa cuando todas sus facturas están pagadas
// ===========================================
const supabase = require("../../config/supabase");
const { success, errors } = require("../../utils/response");
const { resolverUsuarioPorTelefono } = require("../../utils/resolverUsuario");
const { normalizarPeriodo } = require("../../utils/periodo");
const { registrarAuditLog } = require("../../utils/auditLog");

/**
 * Crear obligación del periodo.
 * Ej: "Pagos de Febrero 2026"
 */
async function crearObligacion({
  telefono,
  descripcion,
  periodo,
  servicio,
  tipo_referencia,
  numero_referencia,
  pagina_pago,
  periodicidad,
  receptor,
  grupo,
}) {
  const usuario = await resolverUsuarioPorTelefono(telefono);
  if (!usuario) return errors.notFound("Usuario no encontrado con ese teléfono");

  const periodoNorm = normalizarPeriodo(periodo);
  if (!periodoNorm) return errors.validation("Periodo inválido");

  const { data, error } = await supabase
    .from("obligaciones")
    .insert({
      usuario_id: usuario.usuario_id,
      descripcion,
      periodo: periodoNorm,
      servicio: servicio || descripcion,
      tipo_referencia: tipo_referencia || "periodo",
      numero_referencia: numero_referencia || `${periodoNorm}-${Date.now()}`,
      pagina_pago: pagina_pago || null,
      periodicidad: periodicidad || "mensual",
      receptor: receptor || null,
      grupo: grupo || null,
      estado: "activa",
      total_facturas: 0,
      facturas_pagadas: 0,
      monto_total: 0,
      monto_pagado: 0,
    })
    .select()
    .single();

  if (error) throw new Error(`Error creando obligación: ${error.message}`);

  await registrarAuditLog({
    actor_tipo: "admin",
    accion: "crear_obligacion",
    entidad: "obligaciones",
    entidad_id: data.id,
    despues: data,
  });

  return success(data, 201);
}

/**
 * Listar obligaciones de un usuario (con sus facturas).
 */
async function listarObligaciones(telefono, filtroEstado) {
  const usuario = await resolverUsuarioPorTelefono(telefono);
  if (!usuario) return errors.notFound("Usuario no encontrado con ese teléfono");

  let query = supabase
    .from("obligaciones")
    .select("*, facturas(*)")
    .eq("usuario_id", usuario.usuario_id)
    .order("creado_en", { ascending: false });

  if (filtroEstado) {
    query = query.eq("estado", filtroEstado);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Error listando obligaciones: ${error.message}`);

  // Calcular progreso para cada obligación
  const resultado = data.map(obl => {
    const facturas = obl.facturas || [];
    const totalFacturas = facturas.length;
    const facturasPagadas = facturas.filter(f => f.estado === "pagada").length;
    const montoTotal = facturas.reduce((sum, f) => sum + Number(f.monto || 0), 0);
    const montoPagado = facturas.filter(f => f.estado === "pagada").reduce((sum, f) => sum + Number(f.monto || 0), 0);
    const progreso = totalFacturas > 0 ? Math.round((facturasPagadas / totalFacturas) * 100) : 0;

    return {
      ...obl,
      total_facturas: totalFacturas,
      facturas_pagadas: facturasPagadas,
      monto_total: montoTotal,
      monto_pagado: montoPagado,
      progreso,
    };
  });

  return success(resultado);
}

/**
 * Obtener detalle de una obligación con todas sus facturas.
 */
async function obtenerObligacion(obligacionId) {
  const { data, error } = await supabase
    .from("obligaciones")
    .select("*, facturas(*), usuarios(nombre, apellido, telefono)")
    .eq("id", obligacionId)
    .single();

  if (error || !data) return errors.notFound("Obligación no encontrada");

  const facturas = data.facturas || [];
  const totalFacturas = facturas.length;
  const facturasPagadas = facturas.filter(f => f.estado === "pagada").length;
  const montoTotal = facturas.reduce((sum, f) => sum + Number(f.monto || 0), 0);
  const montoPagado = facturas.filter(f => f.estado === "pagada").reduce((sum, f) => sum + Number(f.monto || 0), 0);
  const progreso = totalFacturas > 0 ? Math.round((facturasPagadas / totalFacturas) * 100) : 0;

  return success({
    ...data,
    total_facturas: totalFacturas,
    facturas_pagadas: facturasPagadas,
    monto_total: montoTotal,
    monto_pagado: montoPagado,
    progreso,
  });
}

/**
 * Actualizar obligación.
 *
 * Valida transiciones de estado y aplica efectos colaterales:
 *   - completada      → emite notificación 'obligacion_cumplida' (campaña bot).
 *   - cancelada       → suspende solicitudes de recarga / recordatorios automáticos
 *                       de la obligación (cron job no las volverá a evaluar).
 *
 * Transiciones permitidas:
 *   activa        → en_progreso | completada | cancelada
 *   en_progreso   → completada  | cancelada
 *   completada    → (terminal — solo admin con flag explícito puede revertir)
 *   cancelada     → activa  (reactivar)
 */
async function actualizarObligacion(id, updates) {
  const { data: existing, error: findErr } = await supabase
    .from("obligaciones")
    .select("*")
    .eq("id", id)
    .single();

  if (findErr || !existing) return errors.notFound("Obligación no encontrada");

  const cleanUpdates = {};
  if (updates.descripcion !== undefined) cleanUpdates.descripcion = updates.descripcion;
  if (updates.pagina_pago !== undefined) cleanUpdates.pagina_pago = updates.pagina_pago;
  if (updates.periodicidad !== undefined) cleanUpdates.periodicidad = updates.periodicidad || "mensual";
  if (updates.receptor !== undefined) cleanUpdates.receptor = updates.receptor;
  if (updates.grupo !== undefined) cleanUpdates.grupo = updates.grupo;

  // Validar transición de estado si se solicita cambio
  if (updates.estado !== undefined && updates.estado !== existing.estado) {
    const allowed = {
      activa: ["en_progreso", "completada", "cancelada"],
      en_progreso: ["completada", "cancelada"],
      completada: [], // terminal — bloqueado para evitar inconsistencias con pagos
      cancelada: ["activa"],
    };
    const validNext = allowed[existing.estado] || [];
    if (!validNext.includes(updates.estado)) {
      return errors.invalidTransition(
        `Transición no válida: '${existing.estado}' → '${updates.estado}'. ` +
        `Desde '${existing.estado}' solo se permite: [${validNext.join(", ") || "ninguno"}].`
      );
    }
    cleanUpdates.estado = updates.estado;
    if (updates.estado === "completada") cleanUpdates.completada_en = new Date().toISOString();
    if (updates.estado === "activa") cleanUpdates.completada_en = null;
  }

  if (Object.keys(cleanUpdates).length === 0) {
    return errors.validation("No se proporcionaron campos para actualizar");
  }

  const { data, error } = await supabase
    .from("obligaciones")
    .update(cleanUpdates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`Error actualizando obligación: ${error.message}`);

  // Side effects según el nuevo estado
  if (cleanUpdates.estado === "cancelada") {
    await suspenderRecordatoriosObligacion(id, "obligacion_cancelada");
  }

  if (cleanUpdates.estado === "completada") {
    await emitirNotificacionCumplida(data);
  }

  await registrarAuditLog({
    actor_tipo: "admin",
    accion: "actualizar_obligacion",
    entidad: "obligaciones",
    entidad_id: id,
    antes: existing,
    despues: data,
  });

  return success(data);
}

/**
 * Suspende solicitudes de recarga y notificaciones pendientes
 * asociadas a una obligación cuando esta se cancela.
 * - solicitudes_recarga: estado → 'cancelada'
 * - notificaciones tipo solicitud_recarga* aún pendientes → estado 'fallida'
 */
async function suspenderRecordatoriosObligacion(obligacionId, motivo = "obligacion_cancelada") {
  try {
    // 1. Cancelar solicitudes de recarga asociadas
    const { data: solicitudes } = await supabase
      .from("solicitudes_recarga")
      .select("id, usuario_id")
      .eq("obligacion_id", obligacionId)
      .in("estado", ["pendiente", "parcial"]);

    if (solicitudes && solicitudes.length > 0) {
      await supabase
        .from("solicitudes_recarga")
        .update({ estado: "cancelada", actualizado_en: new Date().toISOString() })
        .in("id", solicitudes.map(s => s.id));
    }

    // 2. Marcar notificaciones de recordatorio pendientes como fallidas
    //    (no se entregarán al bot porque la obligación fue cancelada)
    const { data: oblData } = await supabase
      .from("obligaciones")
      .select("usuario_id, periodo")
      .eq("id", obligacionId)
      .single();

    if (oblData) {
      await supabase
        .from("notificaciones")
        .update({ estado: "fallida", ultimo_error: `Obligación cancelada (${motivo})` })
        .eq("usuario_id", oblData.usuario_id)
        .eq("estado", "pendiente")
        .in("tipo", [
          "solicitud_recarga",
          "solicitud_recarga_inicio_mes",
          "recordatorio_recarga",
        ]);
    }

    console.log(`[OBLIGACIONES] Recordatorios suspendidos para obligación ${obligacionId} (${solicitudes?.length || 0} solicitudes)`);
  } catch (err) {
    console.error(`[OBLIGACIONES] Error suspendiendo recordatorios: ${err.message}`);
  }
}

/**
 * Dispara la campaña 'obligacion_cumplida' para el bot/usuario
 * cuando una obligación pasa manualmente a 'completada'.
 */
async function emitirNotificacionCumplida(obligacion) {
  try {
    const { crearNotificacionInterna } = require("../notificaciones/notificaciones.service");
    const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    const d = new Date(obligacion.periodo);
    const periodoLabel = `${meses[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

    await crearNotificacionInterna({
      usuario_id: obligacion.usuario_id,
      tipo: "obligacion_cumplida",
      canal: "whatsapp",
      destinatario: "usuario",
      payload: {
        obligacion_id: obligacion.id,
        servicio: obligacion.servicio || obligacion.descripcion || null,
        periodo: obligacion.periodo,
        monto_total: Number(obligacion.monto_total || 0),
        monto_pagado: Number(obligacion.monto_pagado || 0),
        mensaje: `✅ ¡Tu obligación de ${periodoLabel} fue completada!`,
      },
    });
  } catch (err) {
    console.error(`[OBLIGACIONES] Error emitiendo notificación cumplida: ${err.message}`);
  }
}

/**
 * Verificar y auto-completar obligación si todas sus facturas están pagadas.
 * Llamada después de confirmar un pago.
 */
async function verificarCompletarObligacion(obligacionId) {
  if (!obligacionId) return null;

  const { data: facturas, error } = await supabase
    .from("facturas")
    .select("id, estado, monto")
    .eq("obligacion_id", obligacionId);

  if (error || !facturas || facturas.length === 0) return null;

  const totalFacturas = facturas.length;
  const facturasPagadas = facturas.filter(f => f.estado === "pagada").length;
  const montoTotal = facturas.reduce((sum, f) => sum + Number(f.monto || 0), 0);
  const montoPagado = facturas.filter(f => f.estado === "pagada").reduce((sum, f) => sum + Number(f.monto || 0), 0);

  // Actualizar contadores
  const updateData = {
    total_facturas: totalFacturas,
    facturas_pagadas: facturasPagadas,
    monto_total: montoTotal,
    monto_pagado: montoPagado,
  };

  // Si todas pagadas → completar obligación
  if (facturasPagadas === totalFacturas) {
    updateData.estado = "completada";
    updateData.completada_en = new Date().toISOString();
  } else if (facturasPagadas > 0) {
    // Al menos una pagada → en_progreso
    updateData.estado = "en_progreso";
  }

  await supabase
    .from("obligaciones")
    .update(updateData)
    .eq("id", obligacionId);

  return updateData.estado;
}

/**
 * Eliminar obligación (hard delete).
 * - Bloqueado si hay facturas en estado 'pagada' o 'validada' (riesgo financiero/legal).
 * - Por default también bloqueado si hay facturas asociadas.
 * - Con force=true: elimina facturas no pagadas/validadas en cascada y luego la obligación.
 *   Solicitudes_recarga se eliminan por CASCADE.
 *   Facturas tienen FK ON DELETE RESTRICT, por eso se borran manualmente.
 */
async function eliminarObligacion(obligacionId, { force = false, actor = "admin" } = {}) {
  const { data: obl, error: findErr } = await supabase
    .from("obligaciones")
    .select("*")
    .eq("id", obligacionId)
    .single();
  if (findErr || !obl) return errors.notFound("Obligación no encontrada");

  const { data: facturas, error: facErr } = await supabase
    .from("facturas")
    .select("id, estado, validacion_estado")
    .eq("obligacion_id", obligacionId);
  if (facErr) throw new Error(`Error consultando facturas: ${facErr.message}`);

  const protegidas = (facturas || []).filter(
    (f) => f.estado === "pagada" || f.validacion_estado === "validada"
  );
  if (protegidas.length > 0) {
    return errors.invalidTransition(
      `No se puede eliminar: la obligación tiene ${protegidas.length} factura(s) pagada(s)/validada(s). Esta acción está bloqueada por integridad financiera.`
    );
  }

  if ((facturas || []).length > 0 && !force) {
    return errors.invalidTransition(
      `La obligación tiene ${facturas.length} factura(s) asociada(s). Use ?force=true para eliminarlas en cascada.`
    );
  }

  // force=true → borrar facturas no protegidas (todas, ya validamos arriba que no hay pagadas/validadas)
  if ((facturas || []).length > 0) {
    const ids = facturas.map(f => f.id);
    const { error: delFacErr } = await supabase.from("facturas").delete().in("id", ids);
    if (delFacErr) throw new Error(`Error eliminando facturas: ${delFacErr.message}`);
  }

  const { error: delErr } = await supabase.from("obligaciones").delete().eq("id", obligacionId);
  if (delErr) throw new Error(`Error eliminando obligación: ${delErr.message}`);

  await registrarAuditLog({
    actor_tipo: actor,
    accion: "eliminar_obligacion",
    entidad: "obligaciones",
    entidad_id: obligacionId,
    antes: { ...obl, facturas_eliminadas: (facturas || []).length },
  });

  return success({
    obligacion_id: obligacionId,
    eliminada: true,
    facturas_eliminadas: (facturas || []).length,
  });
}

module.exports = {
  crearObligacion,
  listarObligaciones,
  obtenerObligacion,
  actualizarObligacion,
  verificarCompletarObligacion,
  eliminarObligacion,
};
