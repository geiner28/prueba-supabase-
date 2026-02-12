// ===========================================
// Pagos - Service
// ===========================================
const supabase = require("../../config/supabase");
const { success, errors } = require("../../utils/response");
const { resolverUsuarioPorTelefono } = require("../../utils/resolverUsuario");
const { normalizarPeriodo } = require("../../utils/periodo");
const { isValidTransition } = require("../../utils/stateMachine");
const { registrarAuditLog } = require("../../utils/auditLog");

/**
 * Crear pago: valida factura, fondos disponibles, asocia recarga.
 */
async function crearPago(body, actorTipo = "sistema", actorId = null) {
  const { telefono, factura_id } = body;

  // 1. Resolver usuario
  const usuario = await resolverUsuarioPorTelefono(telefono);
  if (!usuario) return errors.notFound("Usuario no encontrado con ese teléfono");

  // 2. Cargar factura y validar pertenencia + estado
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

  // 3. Calcular disponible del periodo
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
    .select("monto_aplicado, facturas!inner(periodo)")
    .eq("usuario_id", usuario.usuario_id)
    .eq("estado", "pagado")
    .eq("facturas.periodo", periodoNorm);

  const totalPagos = (pagosExistentes || []).reduce((sum, p) => sum + Number(p.monto_aplicado), 0);

  const disponible = totalRecargas - totalPagos;

  if (disponible < Number(factura.monto)) {
    return errors.insufficientFunds(
      `Disponible: ${disponible}, Monto factura: ${factura.monto}. Fondos insuficientes.`
    );
  }

  // 4. Seleccionar recarga aprobada más reciente del periodo
  const { data: recargaAsociada } = await supabase
    .from("recargas")
    .select("id")
    .eq("usuario_id", usuario.usuario_id)
    .eq("periodo", periodoNorm)
    .eq("estado", "aprobada")
    .order("creado_en", { ascending: false })
    .limit(1)
    .single();

  // 5. Crear pago
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

  // 6. Audit log
  await registrarAuditLog({
    actor_tipo: actorTipo,
    actor_id: actorId,
    accion: "crear_pago",
    entidad: "pagos",
    entidad_id: pago.id,
    despues: pago,
  });

  return success({ pago_id: pago.id, estado: "en_proceso" }, 201);
}

/**
 * Confirmar pago exitoso.
 */
async function confirmarPago(pagoId, body, actorTipo = "admin", actorId = null) {
  const { proveedor_pago, referencia_pago, comprobante_pago_url } = body;

  const { data: pago, error: findErr } = await supabase
    .from("pagos")
    .select("*")
    .eq("id", pagoId)
    .single();

  if (findErr || !pago) return errors.notFound("Pago no encontrado");

  if (!isValidTransition("pagos", pago.estado, "pagado")) {
    return errors.invalidTransition(
      `No se puede confirmar pago en estado '${pago.estado}'`
    );
  }

  const antes = { ...pago };

  // Actualizar pago
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

  // Marcar factura como pagada
  await supabase
    .from("facturas")
    .update({ estado: "pagada" })
    .eq("id", pago.factura_id);

  await registrarAuditLog({
    actor_tipo: actorTipo,
    actor_id: actorId,
    accion: "confirmar_pago",
    entidad: "pagos",
    entidad_id: pagoId,
    antes,
    despues: updated,
  });

  return success(updated);
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
    return errors.invalidTransition(
      `No se puede marcar como fallido pago en estado '${pago.estado}'`
    );
  }

  const antes = { ...pago };
  const { data: updated, error: updateErr } = await supabase
    .from("pagos")
    .update({
      estado: "fallido",
      error_detalle,
    })
    .eq("id", pagoId)
    .select()
    .single();

  if (updateErr) throw new Error(`Error marcando pago fallido: ${updateErr.message}`);

  // Factura permanece 'validada' (no se modifica)

  await registrarAuditLog({
    actor_tipo: actorTipo,
    actor_id: actorId,
    accion: "fallar_pago",
    entidad: "pagos",
    entidad_id: pagoId,
    antes,
    despues: updated,
  });

  return success(updated);
}

module.exports = { crearPago, confirmarPago, fallarPago };
