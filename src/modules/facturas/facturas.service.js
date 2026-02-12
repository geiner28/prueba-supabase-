// ===========================================
// Facturas - Service
// ===========================================
const supabase = require("../../config/supabase");
const { success, errors } = require("../../utils/response");
const { resolverUsuarioPorTelefono } = require("../../utils/resolverUsuario");
const { normalizarPeriodo } = require("../../utils/periodo");
const { isValidTransition } = require("../../utils/stateMachine");
const { registrarAuditLog } = require("../../utils/auditLog");

/**
 * Captura una factura (desde el bot).
 */
async function capturaFactura(body, actorTipo = "bot") {
  const { telefono, obligacion_id, periodo, fecha_emision, fecha_vencimiento, monto,
    origen, archivo_url, extraccion_estado, extraccion_json, extraccion_confianza } = body;

  // 1. Resolver usuario
  const usuario = await resolverUsuarioPorTelefono(telefono);
  if (!usuario) return errors.notFound("Usuario no encontrado con ese teléfono");

  // 2. Normalizar periodo
  const periodoNorm = normalizarPeriodo(periodo);
  if (!periodoNorm) return errors.validation("Periodo inválido");

  // 3. Idempotencia: buscar factura existente por (obligacion_id, periodo)
  const { data: existente } = await supabase
    .from("facturas")
    .select("*")
    .eq("obligacion_id", obligacion_id)
    .eq("periodo", periodoNorm)
    .single();

  if (existente) {
    return success({
      factura_id: existente.id,
      estado: existente.estado,
      requiere_revision: existente.estado === "en_revision",
      mensaje: "Factura ya existente para esta obligación y periodo",
    });
  }

  // 4. Determinar si requiere revisión
  const requiereRevision =
    ["dudosa", "fallida"].includes(extraccion_estado) || !monto || !fecha_vencimiento;

  const estadoFactura = requiereRevision ? "en_revision" : "extraida";

  // 5. Crear factura
  const { data: factura, error: insertErr } = await supabase
    .from("facturas")
    .insert({
      usuario_id: usuario.usuario_id,
      obligacion_id,
      periodo: periodoNorm,
      fecha_emision: fecha_emision || null,
      fecha_vencimiento: fecha_vencimiento || null,
      monto: monto || 0,
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
    if (insertErr.code === "23505") {
      return errors.conflict("Ya existe factura para esta obligación y periodo");
    }
    throw new Error(`Error creando factura: ${insertErr.message}`);
  }

  // 6. Si requiere revisión, crear revisiones_admin
  if (requiereRevision) {
    const razones = [];
    if (["dudosa", "fallida"].includes(extraccion_estado)) razones.push(`Extracción ${extraccion_estado}`);
    if (!monto) razones.push("Monto no detectado");
    if (!fecha_vencimiento) razones.push("Fecha de vencimiento no detectada");

    await supabase.from("revisiones_admin").insert({
      tipo: "factura",
      estado: "pendiente",
      usuario_id: usuario.usuario_id,
      factura_id: factura.id,
      prioridad: extraccion_estado === "fallida" ? 1 : 2,
      razon: razones.join("; "),
    });
  }

  // 7. Audit log
  await registrarAuditLog({
    actor_tipo: actorTipo,
    accion: "capturar_factura",
    entidad: "facturas",
    entidad_id: factura.id,
    despues: factura,
  });

  return success({
    factura_id: factura.id,
    estado: estadoFactura,
    requiere_revision: requiereRevision,
  }, 201);
}

/**
 * Admin valida una factura.
 */
async function validarFactura(facturaId, body, adminId) {
  const { monto, fecha_vencimiento, fecha_emision, observaciones_admin } = body;

  // 1. Cargar factura
  const { data: factura, error: findErr } = await supabase
    .from("facturas")
    .select("*")
    .eq("id", facturaId)
    .single();

  if (findErr || !factura) return errors.notFound("Factura no encontrada");

  // 2. Validar transición
  if (!isValidTransition("facturas", factura.estado, "validada")) {
    return errors.invalidTransition(
      `No se puede validar factura en estado '${factura.estado}'. Debe estar en 'en_revision' o 'extraida'.`
    );
  }

  // 3. Actualizar factura
  const antes = { ...factura };
  const { data: updated, error: updateErr } = await supabase
    .from("facturas")
    .update({
      monto,
      fecha_vencimiento,
      fecha_emision: fecha_emision || factura.fecha_emision,
      estado: "validada",
      observaciones_admin: observaciones_admin || null,
      validada_por: adminId,
      validada_en: new Date().toISOString(),
    })
    .eq("id", facturaId)
    .select()
    .single();

  if (updateErr) throw new Error(`Error validando factura: ${updateErr.message}`);

  // 4. Cerrar revisión asociada
  await supabase
    .from("revisiones_admin")
    .update({
      estado: "resuelta",
      resuelta_por: adminId,
      resuelta_en: new Date().toISOString(),
    })
    .eq("factura_id", facturaId)
    .in("estado", ["pendiente", "en_proceso"]);

  // 5. Audit log
  await registrarAuditLog({
    actor_tipo: "admin",
    actor_id: adminId,
    accion: "validar_factura",
    entidad: "facturas",
    entidad_id: facturaId,
    antes,
    despues: updated,
  });

  return success(updated);
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
      `No se puede rechazar factura en estado '${factura.estado}'. Debe estar en 'en_revision' o 'extraida'.`
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

  // Cerrar revisión
  await supabase
    .from("revisiones_admin")
    .update({
      estado: "resuelta",
      resuelta_por: adminId,
      resuelta_en: new Date().toISOString(),
    })
    .eq("factura_id", facturaId)
    .in("estado", ["pendiente", "en_proceso"]);

  await registrarAuditLog({
    actor_tipo: "admin",
    actor_id: adminId,
    accion: "rechazar_factura",
    entidad: "facturas",
    entidad_id: facturaId,
    antes,
    despues: updated,
  });

  return success(updated);
}

module.exports = { capturaFactura, validarFactura, rechazarFactura };
