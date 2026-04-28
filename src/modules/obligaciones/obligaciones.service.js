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
async function crearObligacion({ telefono, descripcion, periodo }) {
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
      servicio: descripcion,
      tipo_referencia: "periodo",
      numero_referencia: `${periodoNorm}-${Date.now()}`,
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
  if (updates.estado !== undefined) cleanUpdates.estado = updates.estado;
  if (updates.estado === "completada") cleanUpdates.completada_en = new Date().toISOString();

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

  return success(data);
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
    .select("id, estado")
    .eq("obligacion_id", obligacionId);
  if (facErr) throw new Error(`Error consultando facturas: ${facErr.message}`);

  const protegidas = (facturas || []).filter(f => f.estado === "pagada" || f.estado === "validada");
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
