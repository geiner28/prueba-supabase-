// ===========================================
// Facturas - Service v2
// Factura = servicio individual (agua, gas, energía)
// Pertenece a una obligación (compromiso del periodo)
// ===========================================
const supabase = require("../../config/supabase");
const { success, errors } = require("../../utils/response");
const { resolverUsuarioPorTelefono } = require("../../utils/resolverUsuario");
const { normalizarPeriodo } = require("../../utils/periodo");
const { isValidTransition } = require("../../utils/stateMachine");
const { registrarAuditLog } = require("../../utils/auditLog");
const { crearNotificacionInterna } = require("../notificaciones/notificaciones.service");

/**
 * Capturar factura (registrar un servicio dentro de una obligación).
 */
async function capturaFactura(body, actorTipo = "bot") {
  const {
    telefono, obligacion_id, servicio, monto,
    fecha_vencimiento, fecha_emision, periodo,
    origen, archivo_url, extraccion_estado, extraccion_json, extraccion_confianza
  } = body;

  // 1. Resolver usuario
  const usuario = await resolverUsuarioPorTelefono(telefono);
  if (!usuario) return errors.notFound("Usuario no encontrado con ese teléfono");

  // 2. Verificar que la obligación existe y pertenece al usuario
  const { data: obligacion, error: oblErr } = await supabase
    .from("obligaciones")
    .select("*")
    .eq("id", obligacion_id)
    .eq("usuario_id", usuario.usuario_id)
    .single();

  if (oblErr || !obligacion) {
    return errors.notFound("Obligación no encontrada o no pertenece al usuario");
  }

  // 3. Normalizar periodo (usar el de la obligación si no se envía)
  const periodoNorm = normalizarPeriodo(periodo || obligacion.periodo);

  // 4. Determinar si requiere revisión
  const requiereRevision = ["dudosa", "fallida"].includes(extraccion_estado);
  const estadoFactura = requiereRevision ? "en_revision" : "extraida";

  // 5. Crear factura
  const { data: factura, error: insertErr } = await supabase
    .from("facturas")
    .insert({
      usuario_id: usuario.usuario_id,
      obligacion_id,
      servicio,
      periodo: periodoNorm,
      fecha_emision: fecha_emision || null,
      fecha_vencimiento: fecha_vencimiento || null,
      monto,
      estado: estadoFactura,
      origen: origen || null,
      archivo_url: archivo_url || null,
      extraccion_estado: extraccion_estado || "ok",
      extraccion_json: extraccion_json || null,
      extraccion_confianza: extraccion_confianza != null ? extraccion_confianza : null,
    })
    .select()
    .single();

  if (insertErr) {
    throw new Error(`Error creando factura: ${insertErr.message}`);
  }

  // 6. Actualizar contadores de la obligación
  await actualizarContadoresObligacion(obligacion_id);

  // 7. Si requiere revisión, crear revisiones_admin
  if (requiereRevision) {
    const razones = [];
    if (["dudosa", "fallida"].includes(extraccion_estado)) {
      razones.push(`Extracción ${extraccion_estado} (confianza: ${extraccion_confianza || 'N/A'})`);
    }
    await supabase.from("revisiones_admin").insert({
      tipo: "factura",
      estado: "pendiente",
      usuario_id: usuario.usuario_id,
      factura_id: factura.id,
      prioridad: extraccion_estado === "fallida" ? 1 : 2,
      razon: razones.join("; ") || "Requiere revisión manual",
    });
  }

  // 8. Audit log
  await registrarAuditLog({
    actor_tipo: actorTipo,
    accion: "capturar_factura",
    entidad: "facturas",
    entidad_id: factura.id,
    despues: factura,
  });

  return success({
    factura_id: factura.id,
    servicio,
    monto,
    estado: estadoFactura,
    requiere_revision: requiereRevision,
  }, 201);
}

/**
 * Admin valida una factura.
 */
async function validarFactura(facturaId, body, adminId) {
  const { monto, fecha_vencimiento, fecha_emision, observaciones_admin } = body;

  const { data: factura, error: findErr } = await supabase
    .from("facturas")
    .select("*")
    .eq("id", facturaId)
    .single();

  if (findErr || !factura) return errors.notFound("Factura no encontrada");

  if (!isValidTransition("facturas", factura.estado, "validada")) {
    return errors.invalidTransition(
      `No se puede validar factura en estado '${factura.estado}'. Debe estar en 'en_revision' o 'extraida'.`
    );
  }

  const antes = { ...factura };
  const updateData = {
    monto,
    estado: "validada",
    observaciones_admin: observaciones_admin || null,
    validada_por: adminId,
    validada_en: new Date().toISOString(),
  };
  if (fecha_vencimiento) updateData.fecha_vencimiento = fecha_vencimiento;
  if (fecha_emision) updateData.fecha_emision = fecha_emision;

  const { data: updated, error: updateErr } = await supabase
    .from("facturas")
    .update(updateData)
    .eq("id", facturaId)
    .select()
    .single();

  if (updateErr) throw new Error(`Error validando factura: ${updateErr.message}`);

  // Cerrar revisión asociada
  await supabase
    .from("revisiones_admin")
    .update({ estado: "resuelta", resuelta_por: adminId, resuelta_en: new Date().toISOString() })
    .eq("factura_id", facturaId)
    .in("estado", ["pendiente", "en_proceso"]);

  // Actualizar contadores obligación
  if (factura.obligacion_id) {
    await actualizarContadoresObligacion(factura.obligacion_id);
  }

  await registrarAuditLog({
    actor_tipo: "admin", actor_id: adminId,
    accion: "validar_factura", entidad: "facturas", entidad_id: facturaId,
    antes, despues: updated,
  });

  // Notificar al usuario
  await crearNotificacionInterna({
    usuario_id: factura.usuario_id,
    tipo: "factura_validada",
    canal: "whatsapp",
    payload: {
      factura_id: facturaId,
      servicio: updated.servicio,
      monto,
      mensaje: `Tu factura de ${updated.servicio} por $${Number(monto).toLocaleString()} ha sido validada y está lista para pago.`,
    },
  });

  return success({ factura_id: facturaId, servicio: updated.servicio, estado: "validada" });
}

/**
 * Admin rechaza una factura.
 */
async function rechazarFactura(facturaId, body, adminId) {
  const { motivo_rechazo } = body;

  const { data: factura, error: findErr } = await supabase
    .from("facturas")
    .select("*")
    .eq("id", facturaId)
    .single();

  if (findErr || !factura) return errors.notFound("Factura no encontrada");

  if (!isValidTransition("facturas", factura.estado, "rechazada")) {
    return errors.invalidTransition(
      `No se puede rechazar factura en estado '${factura.estado}'.`
    );
  }

  const antes = { ...factura };
  const { data: updated, error: updateErr } = await supabase
    .from("facturas")
    .update({
      estado: "rechazada",
      motivo_rechazo,
      validada_por: adminId,
      validada_en: new Date().toISOString(),
    })
    .eq("id", facturaId)
    .select()
    .single();

  if (updateErr) throw new Error(`Error rechazando factura: ${updateErr.message}`);

  await supabase
    .from("revisiones_admin")
    .update({ estado: "resuelta", resuelta_por: adminId, resuelta_en: new Date().toISOString() })
    .eq("factura_id", facturaId)
    .in("estado", ["pendiente", "en_proceso"]);

  if (factura.obligacion_id) {
    await actualizarContadoresObligacion(factura.obligacion_id);
  }

  await registrarAuditLog({
    actor_tipo: "admin", actor_id: adminId,
    accion: "rechazar_factura", entidad: "facturas", entidad_id: facturaId,
    antes, despues: updated,
  });

  // Notificar al usuario
  await crearNotificacionInterna({
    usuario_id: factura.usuario_id,
    tipo: "factura_rechazada",
    canal: "whatsapp",
    payload: {
      factura_id: facturaId,
      servicio: factura.servicio,
      motivo: motivo_rechazo,
      mensaje: `Tu factura de ${factura.servicio || "servicio"} fue rechazada. Motivo: ${motivo_rechazo}`,
    },
  });

  return success({ factura_id: facturaId, estado: "rechazada" });
}

/**
 * Listar facturas de una obligación.
 */
async function listarFacturasPorObligacion(obligacionId) {
  const { data, error } = await supabase
    .from("facturas")
    .select("*")
    .eq("obligacion_id", obligacionId)
    .order("creado_en", { ascending: true });

  if (error) throw new Error(`Error listando facturas: ${error.message}`);
  return success(data);
}

/**
 * Actualizar contadores de una obligación basado en sus facturas.
 */
async function actualizarContadoresObligacion(obligacionId) {
  const { data: facturas } = await supabase
    .from("facturas")
    .select("id, estado, monto")
    .eq("obligacion_id", obligacionId);

  if (!facturas) return;

  const totalFacturas = facturas.length;
  const facturasPagadas = facturas.filter(f => f.estado === "pagada").length;
  const montoTotal = facturas.reduce((sum, f) => sum + Number(f.monto || 0), 0);
  const montoPagado = facturas.filter(f => f.estado === "pagada").reduce((sum, f) => sum + Number(f.monto || 0), 0);

  const updateData = {
    total_facturas: totalFacturas,
    facturas_pagadas: facturasPagadas,
    monto_total: montoTotal,
    monto_pagado: montoPagado,
  };

  // Auto-completar si todas pagadas
  if (totalFacturas > 0 && facturasPagadas === totalFacturas) {
    updateData.estado = "completada";
    updateData.completada_en = new Date().toISOString();
  } else if (facturasPagadas > 0) {
    updateData.estado = "en_progreso";
  }

  await supabase
    .from("obligaciones")
    .update(updateData)
    .eq("id", obligacionId);
}

module.exports = {
  capturaFactura,
  validarFactura,
  rechazarFactura,
  listarFacturasPorObligacion,
  actualizarContadoresObligacion,
};
