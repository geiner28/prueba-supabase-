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
const { crearNotificacionInterna, crearNotificacionRecarga, prepararDatosNotificacion, existeNotificacionHoy, crearNotificacionAdminFacturaPorValidar, generarMensajePagoObligacion } = require("../notificaciones/notificaciones.service");
const { evaluarObligacion, detectarPrimeraRecargaDelMes } = require("../solicitudes-recarga/solicitudes-recarga.service");

function esSuscripcionFactura(factura, obligacion = null) {
  const tipoRef = String(factura?.tipo_referencia || "").toLowerCase();
  if (tipoRef === "suscripcion") return true;

  const texto = [
    factura?.servicio,
    factura?.etiqueta,
    obligacion?.servicio,
    obligacion?.descripcion,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return texto.includes("suscrip");
}

async function usuarioPermiteGrupo2(usuarioId) {
  const { data: programacion } = await supabase
    .from("programacion_recargas")
    .select("cantidad_recargas")
    .eq("usuario_id", usuarioId)
    .single();

  return Number(programacion?.cantidad_recargas || 1) === 2;
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
 * Capturar factura (registrar un servicio dentro de una obligación).
 */
async function capturaFactura(body, actorTipo = "bot") {
  const {
    telefono, obligacion_id, servicio, monto,
    fecha_vencimiento, fecha_emision, fecha_recordatorio, periodo,
    origen, archivo_url, pagina_pago, referencia_pago, tipo_referencia, etiqueta, grupo,
    extraccion_estado, extraccion_json, extraccion_confianza
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
  const fechaRecordatorioAuto = fecha_recordatorio || calcularFechaRecordatorio(fecha_vencimiento);

  // 4. Determinar si requiere revisión manual del admin
  const requiereRevision = ["dudosa", "fallida"].includes(extraccion_estado) || monto == null;

  const grupoObjetivo = grupo || obligacion.grupo || null;
  if (Number(grupoObjetivo) === 2) {
    const permiteGrupo2 = await usuarioPermiteGrupo2(usuario.usuario_id);
    if (!permiteGrupo2) {
      return errors.validation("No se puede asignar Grupo 2 cuando el usuario tiene una sola fecha de recarga");
    }
  }

  // En el nuevo modelo TODA factura nueva nace con:
  //   estado = 'pendiente'        (visible al usuario)
  //   validacion_estado = 'sin_revisar' (proceso admin pendiente)
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
      fecha_recordatorio: fechaRecordatorioAuto || null,
      monto: monto != null ? monto : null,
      referencia_pago: referencia_pago || null,
      tipo_referencia: tipo_referencia || null,
      etiqueta: etiqueta || null,
      grupo: grupoObjetivo,
      estado: "pendiente",
      validacion_estado: "sin_revisar",
      origen: origen || null,
      archivo_url: archivo_url || null,
      pagina_pago: pagina_pago || null,
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

  // 8b. Notificación INTERNA para admin: factura por validar (sin mensaje al usuario).
  if (factura.validacion_estado === "sin_revisar") {
    crearNotificacionAdminFacturaPorValidar({ factura, usuario }).catch(err => {
      console.error("[FACTURAS] Error creando notificación admin factura_por_validar:", err.message);
    });
  }

  // 9. Evaluar obligación para generar solicitud de recarga y notificación
  evaluarYNotificarObligacion(obligacion_id, obligacion.periodo).catch(err => {
    console.error("[FACTURAS] Error en evaluación post-creación:", err.message);
  });

  return success({
    factura_id: factura.id,
    servicio,
    monto,
    estado: factura.estado,
    validacion_estado: factura.validacion_estado,
    requiere_revision: requiereRevision,
  }, 201);
}

/**
 * Admin valida una factura.
 * - Cambia validacion_estado='revisada' (NO toca `estado` visible al usuario).
 * - Permite editar campos opcionales en la misma operación.
 * - NO envía mensaje al usuario (solo se le notifica recarga / pago / cumplimiento).
 */
async function validarFactura(facturaId, body, adminId) {
  const { monto, servicio, fecha_vencimiento, fecha_emision,
          referencia_pago, tipo_referencia, etiqueta, archivo_url, pagina_pago,
          observaciones_admin, periodo, grupo } = body;

  const { data: factura, error: findErr } = await supabase
    .from("facturas")
    .select("*")
    .eq("id", facturaId)
    .single();

  if (findErr || !factura) return errors.notFound("Factura no encontrada");

  if (!isValidTransition("facturas_validacion", factura.validacion_estado, "revisada")) {
    return errors.invalidTransition(
      `No se puede validar factura con validacion_estado='${factura.validacion_estado}'.`
    );
  }

  const antes = { ...factura };
  const updateData = {
    validacion_estado: "revisada",
    motivo_rechazo: null,
    validada_por: adminId,
    validada_en: new Date().toISOString(),
  };
  if (monto !== undefined) updateData.monto = monto;
  if (servicio !== undefined) updateData.servicio = servicio;
  if (fecha_vencimiento !== undefined) updateData.fecha_vencimiento = fecha_vencimiento;
  if (fecha_emision !== undefined) updateData.fecha_emision = fecha_emision;

  // Regla de negocio: al validar, el recordatorio se asigna automáticamente
  // 5 días antes del vencimiento validado.
  const fechaVencimientoValidada = fecha_vencimiento !== undefined
    ? fecha_vencimiento
    : factura.fecha_vencimiento;
  const fechaRecordatorioAuto = calcularFechaRecordatorio(fechaVencimientoValidada);
  if (fechaRecordatorioAuto) updateData.fecha_recordatorio = fechaRecordatorioAuto;

  if (referencia_pago !== undefined) updateData.referencia_pago = referencia_pago;
  if (tipo_referencia !== undefined) {
    updateData.tipo_referencia = String(tipo_referencia).trim() === "" ? null : tipo_referencia;
  }
  if (etiqueta !== undefined) updateData.etiqueta = etiqueta;
  if (archivo_url !== undefined) updateData.archivo_url = archivo_url;
  if (pagina_pago !== undefined) updateData.pagina_pago = pagina_pago;
  if (observaciones_admin !== undefined) updateData.observaciones_admin = observaciones_admin;
  if (grupo !== undefined) {
    if (Number(grupo) === 2) {
      const permiteGrupo2 = await usuarioPermiteGrupo2(factura.usuario_id);
      if (!permiteGrupo2) {
        return errors.validation("No se puede asignar Grupo 2 cuando el usuario tiene una sola fecha de recarga");
      }
    }
    updateData.grupo = grupo;
  }
  if (periodo) {
    const periodoNorm = normalizarPeriodo(periodo);
    if (!periodoNorm) return errors.validation("Periodo inválido");
    updateData.periodo = periodoNorm;
  }

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

  // Auto-resolver notificación admin factura_por_validar (si existe).
  await supabase
    .from("notificaciones")
    .update({ estado: "revisada" })
    .eq("tipo", "factura_por_validar")
    .in("estado", ["pendiente", "sin_revisar"])
    .contains("payload", { factura_id: facturaId });

  // No se envía notificación al usuario: la validación es interna del admin.

  return success({
    factura_id: facturaId,
    servicio: updated.servicio,
    estado: updated.estado,
    validacion_estado: updated.validacion_estado,
  });
}

/**
 * Admin rechaza una factura.
 * - Cambia validacion_estado='revisada' y registra motivo_rechazo (NO toca `estado` visible al usuario).
 * - NO envía mensaje al usuario.
 */
async function rechazarFactura(facturaId, body, adminId) {
  const { motivo_rechazo } = body;

  const { data: factura, error: findErr } = await supabase
    .from("facturas")
    .select("*")
    .eq("id", facturaId)
    .single();

  if (findErr || !factura) return errors.notFound("Factura no encontrada");

  if (!isValidTransition("facturas_validacion", factura.validacion_estado, "revisada")) {
    return errors.invalidTransition(
      `No se puede rechazar factura con validacion_estado='${factura.validacion_estado}'.`
    );
  }

  const antes = { ...factura };
  const { data: updated, error: updateErr } = await supabase
    .from("facturas")
    .update({
      validacion_estado: "revisada",
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

  // Auto-resolver notificación admin factura_por_validar (si existe).
  await supabase
    .from("notificaciones")
    .update({ estado: "revisada" })
    .eq("tipo", "factura_por_validar")
    .in("estado", ["pendiente", "sin_revisar"])
    .contains("payload", { factura_id: facturaId });

  // No se envía notificación al usuario.

  return success(updated);
}

/**
 * Listar facturas de una obligación.
 * @param {string} obligacionId
 * @param {{ excluirSuscripcion?: boolean }} [opts] Si excluirSuscripcion=true se omiten
 *        facturas con tipo_referencia="suscripcion" (útil para mensajes del bot que
 *        confirman las obligaciones registradas, sin mostrar el cobro de la suscripción).
 */
async function listarFacturasPorObligacion(obligacionId, opts = {}) {
  const { excluirSuscripcion = false } = opts;
  const { data, error } = await supabase
    .from("facturas")
    .select("*")
    .eq("obligacion_id", obligacionId)
    .order("creado_en", { ascending: true });

  if (error) throw new Error(`Error listando facturas: ${error.message}`);
  const filtradas = excluirSuscripcion
    ? (data || []).filter(f => String(f.tipo_referencia || "").toLowerCase() !== "suscripcion")
    : (data || []);
  // Mapear para devolver referencia_pago como campo principal
  const facturas = filtradas.map(f => ({
    referencia_pago: f.referencia_pago,
    tipo_referencia: f.tipo_referencia,
    servicio: f.servicio,
    monto: f.monto,
    estado: f.estado,
    validacion_estado: f.validacion_estado,
    grupo: f.grupo,
    aproximacion_porcentaje: f.aproximacion_porcentaje,
    origen: f.origen,
    archivo_url: f.archivo_url,
    pagina_pago: f.pagina_pago,
    etiqueta: f.etiqueta,
    fecha_emision: f.fecha_emision,
    fecha_vencimiento: f.fecha_vencimiento,
    fecha_recordatorio: f.fecha_recordatorio,
    periodo: f.periodo,
    extraccion_estado: f.extraccion_estado,
    extraccion_json: f.extraccion_json,
    extraccion_confianza: f.extraccion_confianza,
    observaciones_admin: f.observaciones_admin,
    motivo_rechazo: f.motivo_rechazo,
    // Si necesitas el id interno para uso técnico, puedes incluirlo como _id
    _id: f.id
  }));
  return success(facturas);
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

/**
 * Aproximar el monto de una factura.
 * Acepta `monto` directo o un `porcentaje` (default 10) sobre el último monto
 * conocido de la misma factura. Si la factura no tiene monto previo, busca el
 * último monto del mismo servicio para el mismo usuario.
 * Cambia estado='aproximada' y guarda aproximacion_porcentaje (si aplica).
 */
async function actualizarMontoFactura(facturaId, body) {
  const { monto: montoDirecto, porcentaje, observaciones_admin } = body;

  const { data: factura, error: findErr } = await supabase
    .from("facturas")
    .select("*")
    .eq("id", facturaId)
    .single();

  if (findErr || !factura) return errors.notFound("Factura no encontrada");

  // Solo se puede aproximar si la factura todavía no está pagada
  if (factura.estado === "pagada") {
    return errors.invalidTransition("No se puede aproximar una factura ya pagada.");
  }

  // Calcular el monto final
  let montoFinal = montoDirecto;
  let porcentajeAplicado = null;

  if (montoFinal == null && porcentaje != null) {
    // Buscar monto base: la factura misma o el último del mismo servicio del usuario
    let montoBase = factura.monto != null ? Number(factura.monto) : null;
    if (montoBase == null && factura.servicio) {
      const { data: previa } = await supabase
        .from("facturas")
        .select("monto")
        .eq("usuario_id", factura.usuario_id)
        .eq("servicio", factura.servicio)
        .not("monto", "is", null)
        .order("creado_en", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (previa && previa.monto != null) montoBase = Number(previa.monto);
    }
    if (montoBase == null) {
      return errors.validation("No hay monto base histórico para calcular el porcentaje. Envía 'monto' directamente.");
    }
    porcentajeAplicado = porcentaje;
    montoFinal = Math.round(montoBase * (1 + porcentaje / 100));
  }

  if (montoFinal == null) {
    return errors.validation("Debes enviar 'monto' o 'porcentaje'.");
  }

  const antes = { ...factura };
  const updateData = {
    monto: montoFinal,
    estado: "aproximada",
    observaciones_admin: observaciones_admin !== undefined ? observaciones_admin : factura.observaciones_admin,
  };
  if (porcentajeAplicado != null) updateData.aproximacion_porcentaje = porcentajeAplicado;

  const { data: updated, error: updateErr } = await supabase
    .from("facturas")
    .update(updateData)
    .eq("id", facturaId)
    .select()
    .single();

  if (updateErr) throw new Error(`Error actualizando monto: ${updateErr.message}`);

  if (factura.obligacion_id) {
    try { await actualizarContadoresObligacion(factura.obligacion_id); } catch (e) { /* noop */ }
  }

  await registrarAuditLog({
    actor_tipo: "admin",
    accion: "aproximar_factura",
    entidad: "facturas",
    entidad_id: facturaId,
    antes,
    despues: updated,
  });

  return success({
    factura_id: facturaId,
    servicio: updated.servicio,
    monto_anterior: factura.monto,
    monto_nuevo: updated.monto,
    porcentaje_aplicado: porcentajeAplicado,
    estado: updated.estado,
  });
}

/**
 * Edición libre de cualquier campo de una factura por parte del admin.
 * - Permite modificar servicio, monto, fechas, etiqueta, grupo, periodo,
 *   referencia_pago, tipo_referencia, archivo_url, observaciones,
 *   estado y validacion_estado.
 * - Si se cambia `estado` a 'pagada' manualmente, recalcula contadores y,
 *   cuando la obligación queda completada, crea campaña 'obligacion_cumplida'
 *   (excepto suscripciones).
 */
async function actualizarFactura(facturaId, body, actorTipo = "admin", actorId = null) {
  const { data: factura, error: findErr } = await supabase
    .from("facturas")
    .select("*")
    .eq("id", facturaId)
    .single();

  if (findErr || !factura) return errors.notFound("Factura no encontrada");

  const updates = {};
  const editable = [
    "servicio", "monto", "fecha_vencimiento", "fecha_emision", "fecha_recordatorio",
    "referencia_pago", "tipo_referencia", "etiqueta", "archivo_url", "pagina_pago",
    "observaciones_admin", "motivo_rechazo", "grupo",
    "estado", "validacion_estado", "aproximacion_porcentaje",
  ];
  for (const k of editable) {
    if (body[k] !== undefined) updates[k] = body[k];
  }

  if (updates.tipo_referencia !== undefined) {
    updates.tipo_referencia = String(updates.tipo_referencia).trim() === "" ? null : updates.tipo_referencia;
  }

  if (body.periodo) {
    const periodoNorm = normalizarPeriodo(body.periodo);
    if (!periodoNorm) return errors.validation("Periodo inválido");
    updates.periodo = periodoNorm;
  }

  // Si cambia fecha_vencimiento y no viene fecha_recordatorio explícita,
  // recalcular automáticamente el recordatorio a -5 días.
  if (updates.fecha_vencimiento !== undefined && updates.fecha_recordatorio === undefined) {
    updates.fecha_recordatorio = calcularFechaRecordatorio(updates.fecha_vencimiento);
  }

  if (Object.keys(updates).length === 0) {
    return errors.validation("No se enviaron campos para actualizar");
  }

  // Regla de negocio: con una sola recarga configurada, no se puede asignar grupo 2.
  if (updates.grupo !== undefined && Number(updates.grupo) === 2) {
    const permiteGrupo2 = await usuarioPermiteGrupo2(factura.usuario_id);
    if (!permiteGrupo2) {
      return errors.validation("No se puede asignar Grupo 2 cuando el usuario tiene una sola fecha de recarga");
    }
  }

  // Validar transición si se cambia validacion_estado
  if (updates.validacion_estado && updates.validacion_estado !== factura.validacion_estado) {
    if (!isValidTransition("facturas_validacion", factura.validacion_estado, updates.validacion_estado)) {
      return errors.invalidTransition(
        `Transición inválida: validacion_estado '${factura.validacion_estado}' → '${updates.validacion_estado}'.`
      );
    }
  }

  // Validar transición si se cambia estado
  if (updates.estado && updates.estado !== factura.estado) {
    if (!isValidTransition("facturas", factura.estado, updates.estado)) {
      return errors.invalidTransition(
        `Transición inválida: estado '${factura.estado}' → '${updates.estado}'.`
      );
    }
  }

  const antes = { ...factura };
  const { data: updated, error: updateErr } = await supabase
    .from("facturas")
    .update(updates)
    .eq("id", facturaId)
    .select()
    .single();

  if (updateErr) throw new Error(`Error actualizando factura: ${updateErr.message}`);

  let obligacionActualizada = null;
  const cambioAPagada = updates.estado === "pagada" && factura.estado !== "pagada";

  if (factura.obligacion_id) {
    try {
      await actualizarContadoresObligacion(factura.obligacion_id);
      const { data: obl } = await supabase
        .from("obligaciones")
        .select("id, usuario_id, estado, periodo, servicio, descripcion, monto_total, monto_pagado")
        .eq("id", factura.obligacion_id)
        .single();
      obligacionActualizada = obl || null;
    } catch (e) {
      // noop
    }
  }

  if (cambioAPagada && obligacionActualizada?.estado === "completada") {
    const facturaEvaluada = {
      ...factura,
      ...updates,
      ...updated,
    };

    if (!esSuscripcionFactura(facturaEvaluada, obligacionActualizada)) {
      // Evitar duplicados para la misma obligación cuando ya existe campaña previa.
      const { data: previas } = await supabase
        .from("notificaciones")
        .select("id, payload")
        .eq("usuario_id", factura.usuario_id)
        .eq("tipo", "obligacion_cumplida")
        .order("creado_en", { ascending: false })
        .limit(30);

      const yaExiste = (previas || []).some((n) => String(n?.payload?.obligacion_id || "") === String(factura.obligacion_id));

      if (!yaExiste) {
        const { data: usuario } = await supabase
          .from("usuarios")
          .select("nombre")
          .eq("id", factura.usuario_id)
          .single();

        const etiquetaPago =
          facturaEvaluada.etiqueta ||
          facturaEvaluada.servicio ||
          obligacionActualizada.servicio ||
          obligacionActualizada.descripcion ||
          "obligación";

        const valorPago = Number(
          obligacionActualizada.monto_pagado ||
          obligacionActualizada.monto_total ||
          facturaEvaluada.monto ||
          0
        );

        const mensaje = generarMensajePagoObligacion({
          nombre: usuario?.nombre || "Usuario",
          etiqueta: etiquetaPago,
          valor: valorPago,
        });

        await crearNotificacionInterna({
          usuario_id: factura.usuario_id,
          tipo: "obligacion_cumplida",
          canal: "whatsapp",
          destinatario: "usuario",
          payload: {
            obligacion_id: factura.obligacion_id,
            servicio: obligacionActualizada.servicio || obligacionActualizada.descripcion || null,
            etiqueta: etiquetaPago,
            tipo_referencia: facturaEvaluada.tipo_referencia || null,
            periodo: obligacionActualizada.periodo,
            monto: Number(valorPago || 0),
            monto_aplicado: Number(valorPago || 0),
            monto_total: Number(obligacionActualizada.monto_total || 0),
            monto_pagado: Number(obligacionActualizada.monto_pagado || 0),
            mensaje,
          },
        });
      }
    }
  }

  await registrarAuditLog({
    actor_tipo: actorTipo, actor_id: actorId,
    accion: "actualizar_factura",
    entidad: "facturas", entidad_id: facturaId,
    antes, despues: updated,
  });

  return success(updated);
}

/**
 * Evalúa la obligación y genera solicitud de recarga + notificación si aplica.
 * Se llama automáticamente cada vez que se crea una factura.
 */
async function evaluarYNotificarObligacion(obligacionId, periodo) {
  try {
    const resultado = await evaluarObligacion(obligacionId);

    if (resultado && resultado.solicitudCargada) {
      const esPrimeraRecarga = await detectarPrimeraRecargaDelMes(resultado.usuarioId);
      const tipoNotificacion = 'solicitud_recarga';

      const yaEnviadaHoy = await existeNotificacionHoy(resultado.usuarioId, tipoNotificacion);

      if (!yaEnviadaHoy) {
        const datos = await prepararDatosNotificacion(resultado.usuarioId, periodo, esPrimeraRecarga);
        if (datos) {
          await crearNotificacionRecarga(resultado.usuarioId, tipoNotificacion, datos);
          console.log(`[FACTURAS] Notificación ${tipoNotificacion} creada para usuario ${resultado.usuarioId}`);
        }
      } else {
        console.log(`[FACTURAS] Notificación ${tipoNotificacion} ya existe hoy para usuario ${resultado.usuarioId}, omitiendo`);
      }
    }
  } catch (err) {
    console.error("[FACTURAS] Error en evaluarYNotificarObligacion:", err.message);
  }
}

/**
 * Eliminar factura sin importar su estado.
 * - Borra primero los pagos asociados (FK ON DELETE RESTRICT en pagos.factura_id).
 * - Las revisiones_admin se borran por CASCADE.
 * - Recalcula contadores de la obligación al final.
 */
async function eliminarFactura(facturaId, { actor = "admin" } = {}) {
  const { data: factura, error: findErr } = await supabase
    .from("facturas")
    .select("*")
    .eq("id", facturaId)
    .single();

  if (findErr || !factura) return errors.notFound("Factura no encontrada");

  // 1. Borrar pagos asociados (FK RESTRICT impide borrar la factura si existen)
  const { data: pagosBorrados, error: delPagosErr } = await supabase
    .from("pagos")
    .delete()
    .eq("factura_id", facturaId)
    .select("id");
  if (delPagosErr) throw new Error(`Error eliminando pagos asociados: ${delPagosErr.message}`);

  // 2. Borrar la factura (revisiones_admin caen por CASCADE)
  const { error: delErr } = await supabase
    .from("facturas")
    .delete()
    .eq("id", facturaId);
  if (delErr) throw new Error(`Error eliminando factura: ${delErr.message}`);

  // 3. Recalcular contadores de la obligación
  if (factura.obligacion_id) {
    try {
      await actualizarContadoresObligacion(factura.obligacion_id);
    } catch (e) {
      console.error("[FACTURAS] Error recalculando contadores tras eliminar:", e.message);
    }
  }

  await registrarAuditLog({
    actor_tipo: actor,
    accion: "eliminar_factura",
    entidad: "facturas",
    entidad_id: facturaId,
    antes: { ...factura, pagos_eliminados: (pagosBorrados || []).length },
  });

  return success({
    factura_id: facturaId,
    eliminada: true,
    estado_anterior: factura.estado,
    pagos_eliminados: (pagosBorrados || []).length,
    obligacion_id: factura.obligacion_id,
  });
}

/**
 * Catálogo simple de etiquetas usadas en el sistema (Opción B del requerimiento).
 * Devuelve los valores DISTINCT de la columna `etiqueta` ordenados alfabéticamente.
 */
async function listarEtiquetasDistinct() {
  const { data, error } = await supabase
    .from("facturas")
    .select("etiqueta")
    .not("etiqueta", "is", null);

  if (error) throw new Error(`Error listando etiquetas: ${error.message}`);

  const set = new Set();
  for (const row of data || []) {
    const v = (row.etiqueta || "").trim();
    if (v) set.add(v);
  }
  const etiquetas = Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  return success({ total: etiquetas.length, etiquetas });
}

async function getFacturaById(facturaId) {
  const { data, error } = await supabase
    .from("facturas")
    .select("*")
    .eq("id", facturaId)
    .single();

  if (error || !data) {
    return errors.notFound("Factura no encontrada");
  }
  return success(data);
}

module.exports = {
  capturaFactura,
  validarFactura,
  rechazarFactura,
  actualizarMontoFactura,
  actualizarFactura,
  listarFacturasPorObligacion,
  actualizarContadoresObligacion,
  eliminarFactura,
  listarEtiquetasDistinct,
  getFacturaById,
};
