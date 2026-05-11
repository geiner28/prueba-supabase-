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
const { crearNotificacionInterna, generarMensajePagoObligacion } = require("../notificaciones/notificaciones.service");

function montoSuscripcionPorPlan(plan) {
  const planNorm = String(plan || "tranquilidad").toLowerCase();
  if (planNorm === "tranquilidad") return 10000;
  if (planNorm === "respaldo") return 20000;
  return 0;
}

function planTieneSuscripcion(plan) {
  const planNorm = String(plan || "tranquilidad").toLowerCase();
  return planNorm === "tranquilidad" || planNorm === "respaldo";
}

function calcularFechaRecordatorio(fechaVencimiento) {
  if (!fechaVencimiento) return null;

  const raw = String(fechaVencimiento);
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T00:00:00`)
    : new Date(raw);

  if (Number.isNaN(parsed.getTime())) return null;

  parsed.setDate(parsed.getDate() - 5);
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Saldo global heredado entre meses:
 *   recargas aprobadas - pagos (pagados + en_proceso)
 * Incluye fallback legacy para facturas "pagada" sin registro en tabla pagos.
 */
async function calcularSaldoGlobalDisponible(usuarioId) {
  const [{ data: recargas }, { data: pagosComprometidos }, { data: facturasPagadas }] = await Promise.all([
    supabase
      .from("recargas")
      .select("monto")
      .eq("usuario_id", usuarioId)
      .eq("estado", "aprobada"),
    supabase
      .from("pagos")
      .select("monto_aplicado, factura_id")
      .eq("usuario_id", usuarioId)
      .in("estado", ["pagado", "en_proceso"]),
    supabase
      .from("facturas")
      .select("id, monto")
      .eq("usuario_id", usuarioId)
      .eq("estado", "pagada"),
  ]);

  const totalRecargas = (recargas || []).reduce(
    (sum, r) => sum + Number(r.monto || 0),
    0
  );

  const pagosRows = pagosComprometidos || [];
  const totalPagosRegistrados = pagosRows.reduce(
    (sum, p) => sum + Number(p.monto_aplicado || 0),
    0
  );

  const facturaIdsConPago = new Set(
    pagosRows.map((p) => p.factura_id).filter(Boolean)
  );

  const totalPagosLegacy = (facturasPagadas || [])
    .filter((f) => !facturaIdsConPago.has(f.id))
    .reduce((sum, f) => sum + Number(f.monto || 0), 0);

  const totalComprometido = totalPagosRegistrados + totalPagosLegacy;
  const disponible = totalRecargas - totalComprometido;

  return {
    totalRecargas,
    totalComprometido,
    disponible,
  };
}

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

  if (factura.validacion_estado !== "validada") {
    return errors.invalidTransition(
      `No se puede crear pago para factura con validacion_estado='${factura.validacion_estado}'. Debe estar 'validada' por el admin.`
    );
  }
  if (factura.estado === "pagada") {
    return errors.invalidTransition("La factura ya está pagada.");
  }

  // Disponible GLOBAL heredado entre meses.
  // Se descuenta lo ya pagado y lo reservado en pagos en_proceso.
  // También cubre datos legacy (facturas pagadas sin fila en pagos).
  // Pero necesitamos periodoNorm para asociar la recarga del mismo período
  const periodoNorm = normalizarPeriodo(factura.periodo);

  const { disponible } = await calcularSaldoGlobalDisponible(usuario.usuario_id);

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
  let nuevasObligacionesIds = [];
  const obligacionId = pago.facturas?.obligacion_id;
  if (obligacionId) {
    await actualizarContadoresObligacion(obligacionId);
    const { data: obl } = await supabase.from("obligaciones").select("*").eq("id", obligacionId).single();
    obligacionEstado = obl?.estado;

    // Si la obligación se completó, evaluar cierre total del mes y, si aplica,
    // crear obligaciones/facturas del siguiente período automáticamente.
    if (obligacionEstado === "completada" && obl) {
      nuevasObligacionesIds = await crearSiguienteMesSiCorresponde(obl.usuario_id, obl.periodo);

      // Única notificación permitida hacia el usuario para este flujo:
      // 'obligacion_cumplida' (campaña bot — "obligación pagada").
      const { data: usuarioObl } = await supabase
        .from('usuarios')
        .select('nombre')
        .eq('id', pago.usuario_id)
        .single();

      // Etiqueta y monto: preferir factura/obligación, caer a defaults.
      const etiquetaPago =
        pago.facturas?.etiqueta ||
        obl.etiqueta ||
        obl.servicio ||
        obl.descripcion ||
        'obligación';
      const valorPago = Number(obl.monto_pagado || obl.monto_total || pago.monto_aplicado || 0);

      const mensajeCumplida = generarMensajePagoObligacion({
        nombre: usuarioObl?.nombre || 'Usuario',
        etiqueta: etiquetaPago,
        valor: valorPago,
      });

      await crearNotificacionInterna({
        usuario_id: pago.usuario_id,
        tipo: "obligacion_cumplida",
        canal: "whatsapp",
        destinatario: "usuario",
        payload: {
          obligacion_id: obligacionId,
          servicio: obl.servicio || obl.descripcion || null,
          etiqueta: etiquetaPago,
          periodo: obl.periodo,
          monto_total: Number(obl.monto_total || 0),
          monto_pagado: Number(obl.monto_pagado || 0),
          nuevas_obligaciones_ids: nuevasObligacionesIds,
          mensaje: mensajeCumplida,
        },
      });
    }
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
    nuevas_obligaciones_ids: nuevasObligacionesIds,
    notificacion: null,
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
 * Crear automáticamente obligaciones/facturas del siguiente mes
 * cuando TODAS las obligaciones del periodo estén completas.
 */
async function crearSiguienteMesSiCorresponde(usuarioId, periodoActual, opciones = {}) {
  try {
    const { forzar = false } = opciones;
    const periodoNorm = normalizarPeriodo(periodoActual);
    if (!periodoNorm) return [];

    const { data: usuarioBase } = await supabase
      .from("usuarios")
      .select("plan")
      .eq("id", usuarioId)
      .single();
    const planUsuario = String(usuarioBase?.plan || "tranquilidad").toLowerCase();

    const { data: obligacionesPeriodo, error: oblErr } = await supabase
      .from("obligaciones")
      .select("id, usuario_id, descripcion, periodo, servicio, tipo_referencia, pagina_pago, periodicidad, receptor, grupo, estado")
      .eq("usuario_id", usuarioId)
      .eq("periodo", periodoNorm)
      .neq("estado", "cancelada");

    if (oblErr) {
      console.error("[PAGOS] Error consultando obligaciones del periodo:", oblErr.message);
      return [];
    }

    if (!obligacionesPeriodo || obligacionesPeriodo.length === 0) {
      return [];
    }

    const obligacionIds = obligacionesPeriodo.map((o) => o.id);
    const { data: facturasPeriodo, error: facErr } = await supabase
      .from("facturas")
      .select("id, obligacion_id, servicio, monto, origen, etiqueta, archivo_url, tipo_referencia, referencia_pago, grupo, estado, validacion_estado, fecha_emision, fecha_vencimiento")
      .in("obligacion_id", obligacionIds)
      .neq("validacion_estado", "rechazada");

    if (facErr) {
      console.error("[PAGOS] Error consultando facturas del periodo:", facErr.message);
      return [];
    }

    const facturasPorObligacion = new Map();
    for (const factura of facturasPeriodo || []) {
      if (!facturasPorObligacion.has(factura.obligacion_id)) {
        facturasPorObligacion.set(factura.obligacion_id, []);
      }
      facturasPorObligacion.get(factura.obligacion_id).push(factura);
    }

    // Solo cuentan obligaciones con al menos una factura activa.
    const obligacionesConFacturas = obligacionesPeriodo.filter((o) => (facturasPorObligacion.get(o.id) || []).length > 0);
    if (obligacionesConFacturas.length === 0) {
      return [];
    }

    // Cierre de mes: todas las obligaciones con facturas deben estar completadas
    // (o, equivalentemente, con todas sus facturas en estado pagada).
    const mesCompletado = obligacionesConFacturas.every((o) => {
      const facturas = facturasPorObligacion.get(o.id) || [];
      const todasPagadas = facturas.length > 0 && facturas.every((f) => f.estado === "pagada");
      return o.estado === "completada" || todasPagadas;
    });

    if (!mesCompletado && !forzar) {
      return [];
    }

    const basePeriodo = new Date(periodoNorm);
    const siguienteMes = new Date(basePeriodo);
    siguienteMes.setUTCMonth(siguienteMes.getUTCMonth() + 1);
    const nuevoPeriodo = `${siguienteMes.getUTCFullYear()}-${String(siguienteMes.getUTCMonth() + 1).padStart(2, "0")}-01`;

    const nuevasObligacionesIds = [];
    for (const obligacionActual of obligacionesConFacturas) {
      const facturasOrigen = facturasPorObligacion.get(obligacionActual.id) || [];

      // Buscar obligación equivalente en el siguiente mes para evitar duplicados.
      let matchQuery = supabase
        .from("obligaciones")
        .select("id")
        .eq("usuario_id", usuarioId)
        .eq("periodo", nuevoPeriodo)
        .limit(1);

      if (obligacionActual.descripcion != null) {
        matchQuery = matchQuery.eq("descripcion", obligacionActual.descripcion);
      } else {
        matchQuery = matchQuery.is("descripcion", null);
      }

      if (obligacionActual.servicio != null) {
        matchQuery = matchQuery.eq("servicio", obligacionActual.servicio);
      } else {
        matchQuery = matchQuery.is("servicio", null);
      }

      if (obligacionActual.grupo != null) {
        matchQuery = matchQuery.eq("grupo", obligacionActual.grupo);
      } else {
        matchQuery = matchQuery.is("grupo", null);
      }

      let { data: siguienteObligacion } = await matchQuery.maybeSingle();

      if (!siguienteObligacion) {
        const { data: creada, error: createErr } = await supabase
          .from("obligaciones")
          .insert({
            usuario_id: usuarioId,
            descripcion: obligacionActual.descripcion,
            periodo: nuevoPeriodo,
            servicio: obligacionActual.servicio || obligacionActual.descripcion,
            tipo_referencia: obligacionActual.tipo_referencia || "periodo",
            numero_referencia: `${nuevoPeriodo}-auto-${obligacionActual.id.slice(0, 8)}`,
            pagina_pago: obligacionActual.pagina_pago || null,
            periodicidad: obligacionActual.periodicidad || "mensual",
            receptor: obligacionActual.receptor || null,
            grupo: obligacionActual.grupo || null,
            estado: "activa",
            total_facturas: 0,
            facturas_pagadas: 0,
            monto_total: 0,
            monto_pagado: 0,
          })
          .select()
          .single();

        if (createErr) {
          console.error("[PAGOS] Error creando obligación siguiente:", createErr.message);
          continue;
        }

        siguienteObligacion = creada;
      }

      const { data: facturasDestino } = await supabase
        .from("facturas")
        .select("servicio, monto, etiqueta, archivo_url, tipo_referencia, referencia_pago, grupo, fecha_emision, fecha_vencimiento")
        .eq("obligacion_id", siguienteObligacion.id);

      const firmaFactura = (f) => [
        f.servicio || "",
        Number(f.monto || 0),
        f.etiqueta || "",
        f.archivo_url || "",
        f.tipo_referencia || "",
        f.referencia_pago || "",
        f.grupo || "",
        f.fecha_emision || "",
        f.fecha_vencimiento || "",
      ].join("|");

      const existentes = new Set((facturasDestino || []).map(firmaFactura));
      const firmasNuevas = new Set();
      const nuevasFacturas = [];
      for (const f of facturasOrigen) {
          const esSuscripcion = String(f.tipo_referencia || "").toLowerCase() === "suscripcion";

          if (esSuscripcion && !planTieneSuscripcion(planUsuario)) {
            // Si el plan no soporta suscripción, omitir factura de suscripción.
            continue;
          }

          const monto = esSuscripcion
            ? montoSuscripcionPorPlan(planUsuario)
            : Number(f.monto || 0);

          const estado = esSuscripcion
            ? (monto === 0 ? "pagada" : "pendiente")
            : "pendiente";

          const validacionEstado = esSuscripcion ? "validada" : "sin_validar";

          const fechaVencimiento = f.fecha_vencimiento || null;
          const fechaRecordatorio = calcularFechaRecordatorio(fechaVencimiento);

          const candidato = {
            usuario_id: usuarioId,
            obligacion_id: siguienteObligacion.id,
            servicio: f.servicio,
            periodo: nuevoPeriodo,
            fecha_emision: f.fecha_emision || null,
            fecha_vencimiento: fechaVencimiento,
            fecha_recordatorio: fechaRecordatorio,
            monto,
            estado,
            validacion_estado: validacionEstado,
            origen: "auto",
            extraccion_estado: "ok",
            etiqueta: f.etiqueta || null,
            archivo_url: f.archivo_url || null,
            tipo_referencia: f.tipo_referencia || null,
            referencia_pago: f.referencia_pago || null,
            grupo: esSuscripcion ? 1 : (f.grupo || null),
          };

          const firmaCandidato = firmaFactura(candidato);
          if (existentes.has(firmaCandidato) || firmasNuevas.has(firmaCandidato)) {
            continue;
          }

          firmasNuevas.add(firmaCandidato);
          nuevasFacturas.push(candidato);
      }

      if (nuevasFacturas.length > 0) {
        const { error: insertErr } = await supabase
          .from("facturas")
          .insert(nuevasFacturas);

        if (insertErr) {
          console.error("[PAGOS] Error copiando facturas al nuevo periodo:", insertErr.message);
        }
      }

      // Recalcular contadores de la obligación destino
      const { data: facturasDestinoFinal } = await supabase
        .from("facturas")
        .select("monto, estado")
        .eq("obligacion_id", siguienteObligacion.id)
        .neq("validacion_estado", "rechazada");

      const totalFacturas = (facturasDestinoFinal || []).length;
      const facturasPagadas = (facturasDestinoFinal || []).filter((f) => f.estado === "pagada").length;
      const montoTotal = (facturasDestinoFinal || []).reduce((s, f) => s + Number(f.monto || 0), 0);
      const montoPagado = (facturasDestinoFinal || [])
        .filter((f) => f.estado === "pagada")
        .reduce((s, f) => s + Number(f.monto || 0), 0);

      await supabase
        .from("obligaciones")
        .update({
          total_facturas: totalFacturas,
          facturas_pagadas: facturasPagadas,
          monto_total: montoTotal,
          monto_pagado: montoPagado,
          estado: totalFacturas > 0 && facturasPagadas === totalFacturas ? "completada" : "activa",
        })
        .eq("id", siguienteObligacion.id);

      nuevasObligacionesIds.push(siguienteObligacion.id);

      await registrarAuditLog({
        actor_tipo: "sistema",
        accion: "auto_crear_obligacion_siguiente",
        entidad: "obligaciones",
        entidad_id: siguienteObligacion.id,
        antes: { obligacion_origen_id: obligacionActual.id, periodo_origen: periodoNorm },
      });
    }

    console.log(`[PAGOS] ✅ Cierre de mes ${periodoNorm}: ${nuevasObligacionesIds.length} obligaciones listas para ${nuevoPeriodo}`);
    return nuevasObligacionesIds;
  } catch (err) {
    console.error("[PAGOS] Error en crearSiguienteMesSiCorresponde:", err.message);
    return [];
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

module.exports = { crearPago, confirmarPago, fallarPago, crearSiguienteMesSiCorresponde };
