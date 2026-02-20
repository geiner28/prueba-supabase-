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
const { crearNotificacionInterna } = require("../notificaciones/notificaciones.service");

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
  let nuevaObligacionId = null;
  const obligacionId = pago.facturas?.obligacion_id;
  if (obligacionId) {
    await actualizarContadoresObligacion(obligacionId);
    const { data: obl } = await supabase.from("obligaciones").select("*").eq("id", obligacionId).single();
    obligacionEstado = obl?.estado;

    // Si la obligación se completó, crear la del siguiente mes automáticamente
    if (obligacionEstado === "completada" && obl) {
      nuevaObligacionId = await crearObligacionSiguienteMes(obl);

      // Notificar: obligación completada
      await crearNotificacionInterna({
        usuario_id: pago.usuario_id,
        tipo: "obligacion_completada",
        canal: "whatsapp",
        payload: {
          obligacion_id: obligacionId,
          periodo: obl.periodo,
          mensaje: `¡Tu obligación de ${formatearPeriodo(obl.periodo)} ha sido completada! Todas tus facturas fueron pagadas.`,
          nueva_obligacion_id: nuevaObligacionId,
        },
      });
    }
  }

  // Notificar: pago confirmado
  await crearNotificacionInterna({
    usuario_id: pago.usuario_id,
    tipo: "pago_confirmado",
    canal: "whatsapp",
    payload: {
      pago_id: pagoId,
      monto: pago.monto_aplicado,
      servicio: pago.facturas?.servicio,
      comprobante_pago_url: comprobante_pago_url || null,
      mensaje: `Se ha confirmado el pago de $${Number(pago.monto_aplicado).toLocaleString()} para ${pago.facturas?.servicio || "tu factura"}.`,
    },
  });

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
    nueva_obligacion_id: nuevaObligacionId,
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

/**
 * Crear automáticamente la obligación del siguiente mes
 * cuando la actual se completa.
 */
async function crearObligacionSiguienteMes(obligacionCompletada) {
  try {
    const periodoActual = new Date(obligacionCompletada.periodo);
    const siguienteMes = new Date(periodoActual);
    siguienteMes.setUTCMonth(siguienteMes.getUTCMonth() + 1);
    const nuevoPeriodo = `${siguienteMes.getUTCFullYear()}-${String(siguienteMes.getUTCMonth() + 1).padStart(2, "0")}-01`;

    // Verificar que no exista ya una obligación para el siguiente mes
    const { data: existente } = await supabase
      .from("obligaciones")
      .select("id")
      .eq("usuario_id", obligacionCompletada.usuario_id)
      .eq("periodo", nuevoPeriodo)
      .single();

    if (existente) {
      console.log(`[PAGOS] Obligación del periodo ${nuevoPeriodo} ya existe para usuario ${obligacionCompletada.usuario_id}`);
      return existente.id;
    }

    // Formatear nombre del periodo
    const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    const mesNombre = meses[siguienteMes.getUTCMonth()];
    const anio = siguienteMes.getUTCFullYear();
    const descripcion = `Pagos de ${mesNombre} ${anio}`;

    // Crear nueva obligación
    const { data: nueva, error } = await supabase
      .from("obligaciones")
      .insert({
        usuario_id: obligacionCompletada.usuario_id,
        descripcion,
        periodo: nuevoPeriodo,
        servicio: descripcion,
        tipo_referencia: "periodo",
        numero_referencia: `${nuevoPeriodo}-auto-${Date.now()}`,
        estado: "activa",
        total_facturas: 0,
        facturas_pagadas: 0,
        monto_total: 0,
        monto_pagado: 0,
      })
      .select()
      .single();

    if (error) {
      console.error("[PAGOS] Error creando obligación siguiente:", error.message);
      return null;
    }

    // Copiar las facturas de la obligación completada al nuevo periodo
    // (mismo servicio, mismo monto, pero para el nuevo periodo)
    const { data: facturasAntiguas } = await supabase
      .from("facturas")
      .select("servicio, monto, origen")
      .eq("obligacion_id", obligacionCompletada.id)
      .not("estado", "eq", "rechazada");

    if (facturasAntiguas && facturasAntiguas.length > 0) {
      const nuevasFacturas = facturasAntiguas.map(f => ({
        usuario_id: obligacionCompletada.usuario_id,
        obligacion_id: nueva.id,
        servicio: f.servicio,
        periodo: nuevoPeriodo,
        monto: f.monto,
        estado: "extraida",
        origen: f.origen || "auto",
        extraccion_estado: "ok",
      }));

      const { error: insertErr } = await supabase
        .from("facturas")
        .insert(nuevasFacturas);

      if (insertErr) {
        console.error("[PAGOS] Error copiando facturas al nuevo periodo:", insertErr.message);
      } else {
        // Actualizar contadores
        await supabase
          .from("obligaciones")
          .update({
            total_facturas: nuevasFacturas.length,
            monto_total: nuevasFacturas.reduce((s, f) => s + Number(f.monto), 0),
          })
          .eq("id", nueva.id);
      }
    }

    await registrarAuditLog({
      actor_tipo: "sistema",
      accion: "auto_crear_obligacion_siguiente",
      entidad: "obligaciones",
      entidad_id: nueva.id,
      antes: { obligacion_completada_id: obligacionCompletada.id },
      despues: nueva,
    });

    // Notificar al usuario de la nueva obligación
    await crearNotificacionInterna({
      usuario_id: obligacionCompletada.usuario_id,
      tipo: "nueva_obligacion",
      canal: "whatsapp",
      payload: {
        obligacion_id: nueva.id,
        periodo: nuevoPeriodo,
        descripcion,
        total_facturas: (facturasAntiguas || []).length,
        mensaje: `Se ha creado tu nueva obligación para ${mesNombre} ${anio} con ${(facturasAntiguas || []).length} factura(s). Recuerda hacer tu recarga a tiempo.`,
      },
    });

    console.log(`[PAGOS] ✅ Obligación auto-creada: ${nueva.id} para periodo ${nuevoPeriodo}`);
    return nueva.id;
  } catch (err) {
    console.error("[PAGOS] Error en crearObligacionSiguienteMes:", err.message);
    return null;
  }
}

/**
 * Formatear periodo (YYYY-MM-01) a texto legible.
 */
function formatearPeriodo(periodo) {
  if (!periodo) return "";
  const d = new Date(periodo);
  const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  return `${meses[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

module.exports = { crearPago, confirmarPago, fallarPago };
