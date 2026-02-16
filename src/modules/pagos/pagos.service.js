// ===========================================
// Pagos - Service v2
// Al confirmar pago → verifica si la obligación se completa
// ===========================================
const supabase = require("../../config/supabase");
const { success, errors } = require("../../utils/response");
const { resolverUsuarioPorTelefono } = require("../../utils/resolverUsuario");
const { normalizarPeriodo } = require("../../utils/periodo");
const { isValidTransition } = require("../../utils/stateMachine");
const { registrarAuditLog } = require("../../utils/auditLog");
const { actualizarContadoresObligacion } = require("../facturas/facturas.service");

/**
 * Crear pago para una factura validada.
 */
async function crearPago(body, actorTipo = "sistema", actorId = null) {
  const { telefono, factura_id } = body;

  const usuario = await resolverUsuarioPorTelefono(telefono);
  if (!usuario) return errors.notFound("Usuario no encontrado con ese teléfono");

  const { data: factura, error: factErr } = await supabase
    .from("facturas")
    .select("*")
    .eq("id", factura_id)
    .eq("usuario_id", usuario.usuario_id)
    .single();

  if (factErr || !factura) {
    return errors.notFound("Factura no encontrada o no pertenece al usuario");
  }

  if (factura.estado !== "validada") {
    return errors.invalidTransition(
      `No se puede crear pago para factura en estado '${factura.estado}'. Debe estar 'validada'.`
    );
  }

  // Calcular disponible del periodo
  const periodoNorm = normalizarPeriodo(factura.periodo);

  const { data: recargas } = await supabase
    .from("recargas")
    .select("monto")
    .eq("usuario_id", usuario.usuario_id)
    .eq("periodo", periodoNorm)
    .eq("estado", "aprobada");

  const totalRecargas = (recargas || []).reduce((sum, r) => sum + Number(r.monto), 0);

  const { data: pagosExistentes } = await supabase
    .from("pagos")
    .select("monto_aplicado")
    .eq("usuario_id", usuario.usuario_id)
    .in("estado", ["en_proceso", "pagado"]);

  const totalPagos = (pagosExistentes || []).reduce((sum, p) => sum + Number(p.monto_aplicado), 0);
  const disponible = totalRecargas - totalPagos;

  if (disponible < Number(factura.monto)) {
    return errors.insufficientFunds(
      `Fondos insuficientes. Disponible: $${disponible.toLocaleString()}, Requerido: $${Number(factura.monto).toLocaleString()}`
    );
  }

  // Seleccionar recarga asociada
  const { data: recargaAsociada } = await supabase
    .from("recargas")
    .select("id")
    .eq("usuario_id", usuario.usuario_id)
    .eq("periodo", periodoNorm)
    .eq("estado", "aprobada")
    .order("creado_en", { ascending: false })
    .limit(1)
    .single();

  const { data: pago, error: pagoErr } = await supabase
    .from("pagos")
    .insert({
      usuario_id: usuario.usuario_id,
      factura_id: factura.id,
      recarga_id: recargaAsociada ? recargaAsociada.id : null,
      monto_aplicado: factura.monto,
      estado: "en_proceso",
    })
    .select()
    .single();

  if (pagoErr) throw new Error(`Error creando pago: ${pagoErr.message}`);

  await registrarAuditLog({
    actor_tipo: actorTipo, actor_id: actorId,
    accion: "crear_pago", entidad: "pagos", entidad_id: pago.id,
    despues: pago,
  });

  return success({
    pago_id: pago.id,
    estado: "en_proceso",
    monto: factura.monto,
    servicio: factura.servicio,
  }, 201);
}

/**
 * Confirmar pago exitoso.
 * Auto-completa la obligación si todas sus facturas quedan pagadas.
 */
async function confirmarPago(pagoId, body, actorTipo = "admin", actorId = null) {
  const { proveedor_pago, referencia_pago, comprobante_pago_url } = body;

  const { data: pago, error: findErr } = await supabase
    .from("pagos")
    .select("*, facturas(*)")
    .eq("id", pagoId)
    .single();

  if (findErr || !pago) return errors.notFound("Pago no encontrado");

  if (!isValidTransition("pagos", pago.estado, "pagado")) {
    return errors.invalidTransition(`No se puede confirmar pago en estado '${pago.estado}'`);
  }

  const antes = { ...pago };

  // 1. Actualizar pago → pagado
  const { data: updated, error: updateErr } = await supabase
    .from("pagos")
    .update({
      estado: "pagado",
      ejecutado_en: new Date().toISOString(),
      proveedor_pago: proveedor_pago || null,
      referencia_pago: referencia_pago || null,
      comprobante_pago_url: comprobante_pago_url || null,
    })
    .eq("id", pagoId)
    .select()
    .single();

  if (updateErr) throw new Error(`Error confirmando pago: ${updateErr.message}`);

  // 2. Marcar factura como pagada
  await supabase
    .from("facturas")
    .update({ estado: "pagada" })
    .eq("id", pago.factura_id);

  // 3. Verificar y auto-completar obligación
  let obligacionEstado = null;
  const obligacionId = pago.facturas?.obligacion_id;
  if (obligacionId) {
    await actualizarContadoresObligacion(obligacionId);
    const { data: obl } = await supabase.from("obligaciones").select("estado").eq("id", obligacionId).single();
    obligacionEstado = obl?.estado;
  }

  await registrarAuditLog({
    actor_tipo: actorTipo, actor_id: actorId,
    accion: "confirmar_pago", entidad: "pagos", entidad_id: pagoId,
    antes, despues: updated,
  });

  return success({
    pago_id: pagoId,
    estado: "pagado",
    factura_estado: "pagada",
    obligacion_estado: obligacionEstado,
    obligacion_completada: obligacionEstado === "completada",
  });
}

/**
 * Marcar pago como fallido.
 */
async function fallarPago(pagoId, body, actorTipo = "admin", actorId = null) {
  const { error_detalle } = body;

  const { data: pago, error: findErr } = await supabase
    .from("pagos")
    .select("*")
    .eq("id", pagoId)
    .single();

  if (findErr || !pago) return errors.notFound("Pago no encontrado");

  if (!isValidTransition("pagos", pago.estado, "fallido")) {
    return errors.invalidTransition(`No se puede marcar como fallido pago en estado '${pago.estado}'`);
  }

  const antes = { ...pago };
  const { data: updated, error: updateErr } = await supabase
    .from("pagos")
    .update({ estado: "fallido", error_detalle })
    .eq("id", pagoId)
    .select()
    .single();

  if (updateErr) throw new Error(`Error marcando pago fallido: ${updateErr.message}`);

  await registrarAuditLog({
    actor_tipo: actorTipo, actor_id: actorId,
    accion: "fallar_pago", entidad: "pagos", entidad_id: pagoId,
    antes, despues: updated,
  });

  return success({ pago_id: pagoId, estado: "fallido" });
}

module.exports = { crearPago, confirmarPago, fallarPago };
