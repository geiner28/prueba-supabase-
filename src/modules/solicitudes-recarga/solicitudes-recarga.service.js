// ===========================================
// Solicitudes Recarga - Service
// Genera solicitudes automáticas de recarga
// según el plan del usuario y sus facturas
// ===========================================
const supabase = require("../../config/supabase");
const { success, errors } = require("../../utils/response");
const { resolverUsuarioPorTelefono } = require("../../utils/resolverUsuario");
const { registrarAuditLog } = require("../../utils/auditLog");

// Constantes para recordatorios
const DIAS_ANTICIPACION_RECORDATORIO = 5;
const DIAS_SIN_VENCIMIENTO = 15;

// Importar la función interna (sin resolver teléfono)
let crearNotificacionInterna;
try {
  crearNotificacionInterna = require("../notificaciones/notificaciones.service").crearNotificacionInterna;
} catch (e) {
  // Fallback si el módulo no existe
  crearNotificacionInterna = async () => null;
}

/**
 * Genera solicitudes de recarga automáticas basadas en el plan del usuario.
 * 
 * Plan CONTROL: 1 cuota = monto total de todas las facturas validadas
 * Plan TRANQUILIDAD/RESPALDO: 2 cuotas distribuidas por fecha de vencimiento
 * 
 * Lógica de distribución para 2 cuotas:
 * - Ordena facturas por fecha_vencimiento ASC
 * - Cuota 1 (día 1): facturas que vencen en la primera mitad del mes
 * - Cuota 2 (día 15): facturas que vencen en la segunda mitad del mes
 * - Si todas vencen en la misma mitad, se divide 50/50 por monto
 */
async function generarSolicitudes(body) {
  const { telefono, obligacion_id } = body;

  // 1. Resolver usuario
  const usuario = await resolverUsuarioPorTelefono(telefono);
  if (!usuario) return errors.notFound("Usuario no encontrado con ese teléfono");

  // 2. Obtener datos del usuario (plan)
  const { data: userData, error: userErr } = await supabase
    .from("usuarios")
    .select("id, plan, telefono")
    .eq("id", usuario.usuario_id)
    .single();

  if (userErr || !userData) return errors.notFound("Usuario no encontrado");

  const plan = userData.plan;

  // 3. Obtener la obligación
  const { data: obligacion, error: oblErr } = await supabase
    .from("obligaciones")
    .select("*")
    .eq("id", obligacion_id)
    .eq("usuario_id", usuario.usuario_id)
    .single();

  if (oblErr || !obligacion) {
    return errors.notFound("Obligación no encontrada o no pertenece al usuario");
  }

  // 4. Obtener facturas VALIDADAS de la obligación
  // Incluimos creado_en para calcular fecha_recordatorio de facturas sin fecha_vencimiento
  const { data: facturas, error: factErr } = await supabase
    .from("facturas")
    .select("id, servicio, monto, fecha_vencimiento, estado, creado_en")
    .eq("obligacion_id", obligacion_id)
    .in("estado", ["validada"])
    .order("fecha_vencimiento", { ascending: true });

  if (factErr) throw new Error(`Error obteniendo facturas: ${factErr.message}`);

  if (!facturas || facturas.length === 0) {
    return errors.badRequest("No hay facturas validadas o extraídas en esta obligación");
  }

  // 5. Verificar si ya existen solicitudes activas para esta obligación
  const { data: existentes } = await supabase
    .from("solicitudes_recarga")
    .select("id, estado")
    .eq("obligacion_id", obligacion_id)
    .in("estado", ["pendiente", "parcial"]);

  if (existentes && existentes.length > 0) {
    return errors.conflict("Ya existen solicitudes de recarga activas para esta obligación. Cancélalas primero si deseas regenerar.");
  }

  // 6. Calcular monto total
  const montoTotal = facturas.reduce((sum, f) => sum + Number(f.monto || 0), 0);

  if (montoTotal <= 0) {
    return errors.badRequest("El monto total de las facturas es 0. No se puede generar solicitud.");
  }

  // 7. Generar solicitudes según el plan
  const solicitudes = [];
  const periodo = obligacion.periodo;

  if (plan === "control") {
    // PLAN CONTROL: 1 sola cuota por el total
    const fechaLimite = calcularFechaLimiteCuota1(facturas, periodo);
    const fechaRecordatorio = restarDias(fechaLimite, 5);

    solicitudes.push({
      usuario_id: usuario.usuario_id,
      obligacion_id,
      numero_cuota: 1,
      total_cuotas: 1,
      monto_solicitado: montoTotal,
      fecha_limite: fechaLimite,
      fecha_recordatorio: fechaRecordatorio,
      facturas_ids: facturas.map(f => f.id),
      plan,
      estado: "pendiente",
    });

  } else {
    // PLAN TRANQUILIDAD / RESPALDO: 2 cuotas
    const distribucion = distribuirFacturasEnCuotas(facturas, periodo);

    // Cuota 1
    if (distribucion.cuota1.facturas.length > 0) {
      const fechaLimite1 = distribucion.cuota1.fechaLimite;
      solicitudes.push({
        usuario_id: usuario.usuario_id,
        obligacion_id,
        numero_cuota: 1,
        total_cuotas: 2,
        monto_solicitado: distribucion.cuota1.monto,
        fecha_limite: fechaLimite1,
        fecha_recordatorio: restarDias(fechaLimite1, 5),
        facturas_ids: distribucion.cuota1.facturas.map(f => f.id),
        plan,
        estado: "pendiente",
      });
    }

    // Cuota 2
    if (distribucion.cuota2.facturas.length > 0) {
      const fechaLimite2 = distribucion.cuota2.fechaLimite;
      solicitudes.push({
        usuario_id: usuario.usuario_id,
        obligacion_id,
        numero_cuota: 2,
        total_cuotas: 2,
        monto_solicitado: distribucion.cuota2.monto,
        fecha_limite: fechaLimite2,
        fecha_recordatorio: restarDias(fechaLimite2, 5),
        facturas_ids: distribucion.cuota2.facturas.map(f => f.id),
        plan,
        estado: "pendiente",
      });
    }
  }

  // 8. Insertar solicitudes en BD
  const { data: insertadas, error: insertErr } = await supabase
    .from("solicitudes_recarga")
    .insert(solicitudes)
    .select();

  if (insertErr) throw new Error(`Error creando solicitudes: ${insertErr.message}`);

  // 9. Generar notificación para la primera cuota
  const primeraCuota = insertadas[0];
  await crearNotificacionInterna({
    usuario_id: usuario.usuario_id,
    tipo: "solicitud_recarga",
    canal: "whatsapp",
    payload: {
      solicitud_id: primeraCuota.id,
      numero_cuota: primeraCuota.numero_cuota,
      total_cuotas: primeraCuota.total_cuotas,
      monto: primeraCuota.monto_solicitado,
      fecha_limite: primeraCuota.fecha_limite,
      plan,
      mensaje: plan === "control"
        ? `Hola, para cubrir tus facturas del periodo necesitas recargar $${Number(primeraCuota.monto_solicitado).toLocaleString()}. Fecha límite: ${primeraCuota.fecha_limite}.`
        : `Hola, tu primera cuota es de $${Number(primeraCuota.monto_solicitado).toLocaleString()}. Fecha límite: ${primeraCuota.fecha_limite}. Cuota 1 de 2.`,
    },
  });

  // 10. Audit log
  await registrarAuditLog({
    actor_tipo: "sistema",
    accion: "generar_solicitudes_recarga",
    entidad: "solicitudes_recarga",
    entidad_id: primeraCuota.id,
    despues: insertadas,
  });

  return success({
    solicitudes: insertadas.map(s => ({
      id: s.id,
      numero_cuota: s.numero_cuota,
      total_cuotas: s.total_cuotas,
      monto_solicitado: s.monto_solicitado,
      fecha_limite: s.fecha_limite,
      fecha_recordatorio: s.fecha_recordatorio,
      facturas_ids: s.facturas_ids,
      estado: s.estado,
      plan: s.plan,
    })),
    plan,
    monto_total: montoTotal,
    total_cuotas: solicitudes.length,
  }, 201);
}

/**
 * Listar solicitudes de recarga de un usuario.
 */
async function listarSolicitudes(query) {
  const { telefono, estado, obligacion_id } = query;

  const usuario = await resolverUsuarioPorTelefono(telefono);
  if (!usuario) return errors.notFound("Usuario no encontrado");

  let q = supabase
    .from("solicitudes_recarga")
    .select("*")
    .eq("usuario_id", usuario.usuario_id)
    .order("numero_cuota", { ascending: true })
    .order("creado_en", { ascending: false });

  if (estado) q = q.eq("estado", estado);
  if (obligacion_id) q = q.eq("obligacion_id", obligacion_id);

  const { data, error } = await q;
  if (error) throw new Error(`Error listando solicitudes: ${error.message}`);

  return success(data);
}

/**
 * Verificar recordatorios: busca solicitudes pendientes donde la fecha de
 * recordatorio ya pasó o es hoy, y genera notificaciones si no se han enviado.
 * También verifica si hay facturas próximas a vencer sin saldo suficiente.
 */
async function verificarRecordatorios(body) {
  const { telefono } = body;

  const usuario = await resolverUsuarioPorTelefono(telefono);
  if (!usuario) return errors.notFound("Usuario no encontrado");

  const hoy = new Date().toISOString().split("T")[0];

  // 1. Buscar solicitudes pendientes con recordatorio no enviado y fecha <= hoy
  const { data: solicitudes, error: solErr } = await supabase
    .from("solicitudes_recarga")
    .select("*")
    .eq("usuario_id", usuario.usuario_id)
    .in("estado", ["pendiente", "parcial"])
    .eq("recordatorio_enviado", false)
    .lte("fecha_recordatorio", hoy);

  if (solErr) throw new Error(`Error consultando solicitudes: ${solErr.message}`);

  const notificacionesGeneradas = [];

  for (const sol of (solicitudes || [])) {
    // Verificar saldo disponible
    const { data: recargas } = await supabase
      .from("recargas")
      .select("monto")
      .eq("usuario_id", usuario.usuario_id)
      .eq("estado", "aprobada");

    const { data: pagos } = await supabase
      .from("pagos")
      .select("monto_aplicado")
      .eq("estado", "pagado")
      .in("factura_id", sol.facturas_ids || []);

    const totalRecargas = (recargas || []).reduce((s, r) => s + Number(r.monto || 0), 0);
    const totalPagos = (pagos || []).reduce((s, p) => s + Number(p.monto_aplicado || 0), 0);
    const disponible = totalRecargas - totalPagos;
    const faltante = sol.monto_solicitado - sol.monto_recargado;

    if (disponible < faltante) {
      // No tiene saldo suficiente → generar recordatorio
      await crearNotificacionInterna({
        usuario_id: usuario.usuario_id,
        tipo: "recordatorio_recarga",
        canal: "whatsapp",
        payload: {
          solicitud_id: sol.id,
          numero_cuota: sol.numero_cuota,
          total_cuotas: sol.total_cuotas,
          monto_faltante: faltante - disponible,
          fecha_limite: sol.fecha_limite,
          mensaje: `Recuerda que tienes una recarga pendiente de $${Number(faltante - disponible).toLocaleString()} antes del ${sol.fecha_limite}. Cuota ${sol.numero_cuota} de ${sol.total_cuotas}.`,
        },
      });

      // Marcar recordatorio como enviado
      await supabase
        .from("solicitudes_recarga")
        .update({ recordatorio_enviado: true, actualizado_en: new Date().toISOString() })
        .eq("id", sol.id);

      notificacionesGeneradas.push({
        solicitud_id: sol.id,
        monto_faltante: faltante - disponible,
        fecha_limite: sol.fecha_limite,
      });
    }
  }

  return success({
    recordatorios_generados: notificacionesGeneradas.length,
    detalle: notificacionesGeneradas,
  });
}

/**
 * Actualizar fechas de cuotas (el usuario puede personalizar).
 */
async function actualizarFechasSolicitud(solicitudId, body) {
  const { fecha_cuota_1, fecha_cuota_2 } = body;

  // Buscar la solicitud
  const { data: solicitud, error: findErr } = await supabase
    .from("solicitudes_recarga")
    .select("*")
    .eq("id", solicitudId)
    .single();

  if (findErr || !solicitud) return errors.notFound("Solicitud no encontrada");

  if (!["pendiente", "parcial"].includes(solicitud.estado)) {
    return errors.badRequest("Solo se pueden modificar solicitudes pendientes o parciales");
  }

  const updateData = { actualizado_en: new Date().toISOString() };

  if (solicitud.numero_cuota === 1 && fecha_cuota_1) {
    updateData.fecha_limite = fecha_cuota_1;
    updateData.fecha_recordatorio = restarDias(fecha_cuota_1, 5);
    updateData.recordatorio_enviado = false; // resetear recordatorio
  }

  if (solicitud.numero_cuota === 2 && fecha_cuota_2) {
    updateData.fecha_limite = fecha_cuota_2;
    updateData.fecha_recordatorio = restarDias(fecha_cuota_2, 5);
    updateData.recordatorio_enviado = false;
  }

  // Si envían ambas fechas, actualizar las dos solicitudes de la misma obligación
  if (fecha_cuota_1 && fecha_cuota_2 && solicitud.total_cuotas === 2) {
    // Actualizar cuota 1
    await supabase
      .from("solicitudes_recarga")
      .update({
        fecha_limite: fecha_cuota_1,
        fecha_recordatorio: restarDias(fecha_cuota_1, 5),
        recordatorio_enviado: false,
        actualizado_en: new Date().toISOString(),
      })
      .eq("obligacion_id", solicitud.obligacion_id)
      .eq("numero_cuota", 1);

    // Actualizar cuota 2
    await supabase
      .from("solicitudes_recarga")
      .update({
        fecha_limite: fecha_cuota_2,
        fecha_recordatorio: restarDias(fecha_cuota_2, 5),
        recordatorio_enviado: false,
        actualizado_en: new Date().toISOString(),
      })
      .eq("obligacion_id", solicitud.obligacion_id)
      .eq("numero_cuota", 2);

    // Retornar ambas actualizadas
    const { data: actualizadas } = await supabase
      .from("solicitudes_recarga")
      .select("*")
      .eq("obligacion_id", solicitud.obligacion_id)
      .order("numero_cuota", { ascending: true });

    return success(actualizadas);
  }

  const { data: updated, error: updateErr } = await supabase
    .from("solicitudes_recarga")
    .update(updateData)
    .eq("id", solicitudId)
    .select()
    .single();

  if (updateErr) throw new Error(`Error actualizando solicitud: ${updateErr.message}`);

  return success(updated);
}

// ===========================================
// Funciones auxiliares
// ===========================================

/**
 * Calcula la fecha de recordatorio para una factura.
 * Si tiene fecha_vencimiento → fecha_vencimiento - 5 días
 * Si NO tiene fecha_vencimiento → creado_en + 15 días
 */
function calcularFechaRecordatorioFactura(factura) {
  if (factura.fecha_vencimiento) {
    // Factura con vencimiento: 5 días antes del vencimiento
    return restarDias(factura.fecha_vencimiento, DIAS_ANTICIPACION_RECORDATORIO);
  } else {
    // Factura sin vencimiento: 15 días después de creación
    return sumarDias(factura.creado_en, DIAS_SIN_VENCIMIENTO);
  }
}

/**
 * Para plan control: la fecha límite es la fecha de vencimiento
 * más próxima de todas las facturas.
 * 
 * Para facturas sin fecha_vencimiento, se usa creado_en + 15 días.
 * Se toma la fecha más próxima entre todas las facturas.
 */
function calcularFechaLimiteCuota1(facturas, periodo) {
  if (!facturas || facturas.length === 0) {
    return periodo;
  }

  // Calcular fecha recordatorio para cada factura
  const fechasRecordatorio = facturas.map(f => ({
    factura: f,
    fechaRecordatorio: calcularFechaRecordatorioFactura(f)
  }));

  // Ordenar por fecha de recordatorio (la más próxima primero)
  fechasRecordatorio.sort((a, b) => new Date(a.fechaRecordatorio) - new Date(b.fechaRecordatorio));

  // La fecha límite es 5 días después del recordatorio más próximo
  // (porque fecha_recordatorio = fecha_limite - 5)
  return sumarDias(fechasRecordatorio[0].fechaRecordatorio, DIAS_ANTICIPACION_RECORDATORIO);
}

/**
 * Distribuye facturas en 2 cuotas basándose en fechas de vencimiento.
 * Cuota 1 → facturas que vencen del 1 al 15
 * Cuota 2 → facturas que vencen del 16 al 31
 * Si todas caen en la misma mitad → divide 50/50 por monto
 * 
 * Para facturas sin fecha_vencimiento, se usa su fecha de recordatorio (creado_en + 15 días).
 */
function distribuirFacturasEnCuotas(facturas, periodo) {
  const periodoDate = new Date(periodo + "T00:00:00Z");
  const anio = periodoDate.getUTCFullYear();
  const mes = periodoDate.getUTCMonth();

  // Fechas por defecto: día 1 y día 15
  const fechaLimite1 = formatFecha(new Date(Date.UTC(anio, mes, 1)));
  const fechaLimite2 = formatFecha(new Date(Date.UTC(anio, mes, 15)));

  const cuota1 = { facturas: [], monto: 0, fechaLimite: fechaLimite1, fechaRecordatorio: restarDias(fechaLimite1, DIAS_ANTICIPACION_RECORDATORIO) };
  const cuota2 = { facturas: [], monto: 0, fechaLimite: fechaLimite2, fechaRecordatorio: restarDias(fechaLimite2, DIAS_ANTICIPACION_RECORDATORIO) };

  // Clasificar por fecha de vencimiento o fecha de recordatorio
  for (const f of facturas) {
    const fechaComparar = f.fecha_vencimiento || calcularFechaRecordatorioFactura(f);
    
    if (f.fecha_vencimiento) {
      const dia = new Date(f.fecha_vencimiento + "T00:00:00Z").getUTCDate();
      if (dia <= 15) {
        cuota1.facturas.push(f);
        cuota1.monto += Number(f.monto || 0);
      } else {
        cuota2.facturas.push(f);
        cuota2.monto += Number(f.monto || 0);
      }
    } else {
      // Sin fecha de vencimiento → usar fecha de recordatorio (creado_en + 15 días) para clasificar
      const fechaCalculada = calcularFechaRecordatorioFactura(f);
      const dia = new Date(fechaCalculada + "T00:00:00Z").getUTCDate();
      if (dia <= 15) {
        cuota1.facturas.push(f);
        cuota1.monto += Number(f.monto || 0);
      } else {
        cuota2.facturas.push(f);
        cuota2.monto += Number(f.monto || 0);
      }
    }
  }

  // Si todas las facturas cayeron en una sola cuota → dividir 50/50
  if (cuota1.facturas.length === 0 && cuota2.facturas.length > 0) {
    return dividir5050(facturas, fechaLimite1, fechaLimite2);
  }
  if (cuota2.facturas.length === 0 && cuota1.facturas.length > 0) {
    return dividir5050(facturas, fechaLimite1, fechaLimite2);
  }

  // Ajustar fecha límite de cuota 1 a la fecha de vencimiento más pronta de sus facturas
  if (cuota1.facturas.length > 0) {
    const conFecha = cuota1.facturas.filter(f => f.fecha_vencimiento);
    if (conFecha.length > 0) {
      conFecha.sort((a, b) => new Date(a.fecha_vencimiento) - new Date(b.fecha_vencimiento));
      cuota1.fechaLimite = conFecha[0].fecha_vencimiento;
      cuota1.fechaRecordatorio = restarDias(cuota1.fechaLimite, DIAS_ANTICIPACION_RECORDATORIO);
    } else {
      // Solo facturas sin vencimiento → usar la fecha de recordatorio más pronta
      const fechasRecord = cuota1.facturas.map(f => calcularFechaRecordatorioFactura(f));
      fechasRecord.sort((a, b) => new Date(a) - new Date(b));
      cuota1.fechaRecordatorio = fechasRecord[0];
      cuota1.fechaLimite = sumarDias(cuota1.fechaRecordatorio, DIAS_ANTICIPACION_RECORDATORIO);
    }
  }

  // Ajustar fecha límite de cuota 2
  if (cuota2.facturas.length > 0) {
    const conFecha = cuota2.facturas.filter(f => f.fecha_vencimiento);
    if (conFecha.length > 0) {
      conFecha.sort((a, b) => new Date(a.fecha_vencimiento) - new Date(b.fecha_vencimiento));
      cuota2.fechaLimite = conFecha[0].fecha_vencimiento;
      cuota2.fechaRecordatorio = restarDias(cuota2.fechaLimite, DIAS_ANTICIPACION_RECORDATORIO);
    } else {
      // Solo facturas sin vencimiento → usar la fecha de recordatorio más pronta
      const fechasRecord = cuota2.facturas.map(f => calcularFechaRecordatorioFactura(f));
      fechasRecord.sort((a, b) => new Date(a) - new Date(b));
      cuota2.fechaRecordatorio = fechasRecord[0];
      cuota2.fechaLimite = sumarDias(cuota2.fechaRecordatorio, DIAS_ANTICIPACION_RECORDATORIO);
    }
  }

  return { cuota1, cuota2 };
}

/**
 * Divide facturas 50/50 cuando todas caen en la misma mitad del mes.
 */
function dividir5050(facturas, fechaLimite1, fechaLimite2) {
  const sorted = [...facturas].sort((a, b) => Number(b.monto || 0) - Number(a.monto || 0));
  const cuota1 = { facturas: [], monto: 0, fechaLimite: fechaLimite1 };
  const cuota2 = { facturas: [], monto: 0, fechaLimite: fechaLimite2 };

  // Distribuir alternando para equilibrar montos
  for (const f of sorted) {
    if (cuota1.monto <= cuota2.monto) {
      cuota1.facturas.push(f);
      cuota1.monto += Number(f.monto || 0);
    } else {
      cuota2.facturas.push(f);
      cuota2.monto += Number(f.monto || 0);
    }
  }

  return { cuota1, cuota2 };
}

function restarDias(fechaStr, dias) {
  const fecha = new Date(fechaStr + "T00:00:00Z");
  fecha.setUTCDate(fecha.getUTCDate() - dias);
  return formatFecha(fecha);
}

function sumarDias(fechaStr, dias) {
  const fecha = new Date(fechaStr + "T00:00:00Z");
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return formatFecha(fecha);
}

function formatFecha(date) {
  return date.toISOString().split("T")[0];
}

/**
 * Recalcula las solicitudes de recarga de una obligación.
 * Actualiza únicamente las solicitudes en estado 'pendiente' o 'parcial'.
 * No modifica solicitudes cumplidas, vencidas o canceladas.
 * 
 * Esta función debe llamarse cuando:
 * - Se captura o valida una nueva factura
 * - Se confirma un pago
 * - Cambia el estado de una obligación
 */
async function recalcularSolicitudesPorObligacion(obligacionId) {
  if (!obligacionId) {
    console.error("[SOLICITUDES_RECARGA] obligacionId requerido para recalcular");
    return null;
  }

  // 1. Obtener la obligación y su usuario
  const { data: obligacion, error: oblErr } = await supabase
    .from("obligaciones")
    .select("*, usuarios!inner(id, plan)")
    .eq("id", obligacionId)
    .single();

  if (oblErr || !obligacion) {
    console.error("[SOLICITUDES_RECARGA] Obligación no encontrada:", obligacionId);
    return null;
  }

  // 2. Obtener facturas validadas de la obligación
  const { data: facturas, error: factErr } = await supabase
    .from("facturas")
    .select("id, servicio, monto, fecha_vencimiento, estado, creado_en")
    .eq("obligacion_id", obligacionId)
    .in("estado", ["validada"]);

  if (factErr) {
    console.error("[SOLICITUDES_RECARGA] Error obteniendo facturas:", factErr.message);
    return null;
  }

  // 3. Obtener solicitudes pendientes/parciales existentes
  const { data: solicitudesExistentes, error: solErr } = await supabase
    .from("solicitudes_recarga")
    .select("*")
    .eq("obligacion_id", obligacionId)
    .in("estado", ["pendiente", "parcial"]);

  if (solErr) {
    console.error("[SOLICITUDES_RECARGA] Error obteniendo solicitudes:", solErr.message);
    return null;
  }

  // Si no hay facturas validadas, marcar solicitudes como canceladas
  if (!facturas || facturas.length === 0) {
    if (solicitudesExistentes && solicitudesExistentes.length > 0) {
      await supabase
        .from("solicitudes_recarga")
        .update({ estado: "cancelada", actualizado_en: new Date().toISOString() })
        .in("id", solicitudesExistentes.map(s => s.id));
      console.log("[SOLICITUDES_RECARGA] Solicitudes canceladas - sin facturas validadas");
    }
    return { canceladas: solicitudesExistentes?.length || 0 };
  }

  // 4. Recalcular monto total
  const montoTotal = facturas.reduce((sum, f) => sum + Number(f.monto || 0), 0);

  // 5. Obtener monto ya recargado (suma de monto_recargado de todas las solicitudes)
  const montoRecargado = (solicitudesExistentes || []).reduce(
    (sum, s) => sum + Number(s.monto_recargado || 0), 0
  );

  // 6. Calcular nuevas fechas y distribución según el plan
  // IMPORTANTE: Calcular distribución UNA SOLA VEZ antes del loop
  const plan = obligacion.usuarios?.plan || "control";
  const periodo = obligacion.periodo;

  let distribucion = null;
  let nuevaFechaLimiteCuota1, nuevaFechaRecordatorioCuota1;
  let nuevaFechaLimiteCuota2, nuevaFechaRecordatorioCuota2;
  let montoCuota1, montoCuota2;

  if (plan === "control") {
    // Plan control: 1 cuota por el total
    nuevaFechaLimiteCuota1 = calcularFechaLimiteCuota1(facturas, periodo);
    nuevaFechaRecordatorioCuota1 = restarDias(nuevaFechaLimiteCuota1, DIAS_ANTICIPACION_RECORDATORIO);
    montoCuota1 = montoTotal;
    montoCuota2 = 0;
  } else {
    // Planes con 2 cuotas: calcular distribución UNA sola vez
    distribucion = distribuirFacturasEnCuotas(facturas, periodo);
    
    nuevaFechaLimiteCuota1 = distribucion.cuota1.fechaLimite;
    nuevaFechaRecordatorioCuota1 = distribucion.cuota1.fechaRecordatorio;
    montoCuota1 = distribucion.cuota1.monto;
    
    nuevaFechaLimiteCuota2 = distribucion.cuota2.fechaLimite;
    nuevaFechaRecordatorioCuota2 = distribucion.cuota2.fechaRecordatorio;
    montoCuota2 = distribucion.cuota2.monto;
  }

  console.log(`[SOLICITUDES_RECARGA] Distribución calculada: cuota1=${montoCuota1}, cuota2=${montoCuota2}`);
  console.log(`[SOLICITUDES_RECARGA] Fechas - Cuota1: limite=${nuevaFechaLimiteCuota1}, recordatorio=${nuevaFechaRecordatorioCuota1}`);
  if (plan !== "control") {
    console.log(`[SOLICITUDES_RECARGA] Fechas - Cuota2: limite=${nuevaFechaLimiteCuota2}, recordatorio=${nuevaFechaRecordatorioCuota2}`);
  }

  // 7. Actualizar las solicitudes existentes
  const actualizaciones = [];
  for (const sol of (solicitudesExistentes || [])) {
    console.log(`[SOLICITUDES_RECARGA] Procesando solicitud ${sol.id} - cuota ${sol.numero_cuota}, estado=${sol.estado}`);
    
    const updateData = {
      monto_recargado: montoRecargado, // mantiene lo ya recargado
      facturas_ids: facturas.map(f => f.id),
      actualizado_en: new Date().toISOString(),
    };

    // Asignar monto_solicitado correcto según el número de cuota
    if (sol.numero_cuota === 1) {
      updateData.monto_solicitado = montoCuota1;
      updateData.fecha_limite = nuevaFechaLimiteCuota1;
      updateData.fecha_recordatorio = nuevaFechaRecordatorioCuota1;
    } else if (sol.numero_cuota === 2 && plan !== "control") {
      updateData.monto_solicitado = montoCuota2;
      if (distribucion.cuota2.facturas.length > 0) {
        updateData.fecha_limite = nuevaFechaLimiteCuota2;
        updateData.fecha_recordatorio = nuevaFechaRecordatorioCuota2;
      }
    }

    // Resetear recordatorio_enviado solo cuando la fecha correspondiente CAMBIA
    // Comparar con la fecha correcta según el número de cuota
    const fechaRecordatorioAnterior = sol.fecha_recordatorio;
    const nuevaFechaRecordatorio = sol.numero_cuota === 1 ? nuevaFechaRecordatorioCuota1 : nuevaFechaRecordatorioCuota2;
    
    if (fechaRecordatorioAnterior !== nuevaFechaRecordatorio) {
      console.log(`[SOLICITUDES_RECARGA] Solicitud ${sol.id}: fecha_recordatorio cambió de ${fechaRecordatorioAnterior} a ${nuevaFechaRecordatorio} - reseteando recordatorio_enviado`);
      updateData.recordatorio_enviado = false;
    }

    console.log(`[SOLICITUDES_RECARGA] Actualizando solicitud ${sol.id}:`, JSON.stringify(updateData));

    await supabase
      .from("solicitudes_recarga")
      .update(updateData)
      .eq("id", sol.id);

    actualizaciones.push(sol.id);
  }

  console.log(`[SOLICITUDES_RECARGA] Actualizadas ${actualizaciones.length} solicitudes para obligación ${obligacionId}`);
  return {
    actualizadas: actualizaciones.length,
    monto_total: montoTotal,
    monto_recargado: montoRecargado,
  };
}

/**
 * Verifica recordatorios para TODOS los usuarios.
 * Esta función está diseñada para ser llamada por un job/cron.
 */
async function verificarRecordatoriosGlobal() {
  console.log("[JOBS] Iniciando verificación de recordatorios global...");

  // Obtener todos los usuarios con solicitudes pendientes
  const { data: solicitudes, error } = await supabase
    .from("solicitudes_recarga")
    .select("usuario_id, obligacion_id")
    .in("estado", ["pendiente", "parcial"])
    .eq("recordatorio_enviado", false);

  if (error) {
    console.error("[JOBS] Error consultando solicitudes:", error.message);
    return;
  }

  // Obtener usuarios únicos
  const usuariosUnicos = [...new Set((solicitudes || []).map(s => s.usuario_id))];
  console.log(`[JOBS] Verificando recordatorios para ${usuariosUnicos.length} usuarios`);

  let notificacionesEnviadas = 0;

  for (const usuarioId of usuariosUnicos) {
    try {
      // Obtener teléfono del usuario
      const { data: usuario } = await supabase
        .from("usuarios")
        .select("telefono")
        .eq("id", usuarioId)
        .single();

      if (!usuario) continue;

      // Llamar a verificarRecordatorios para este usuario
      const result = await verificarRecordatorios({ telefono: usuario.telefono });
      if (result.body?.data?.recordatorios_generados) {
        notificacionesEnviadas += result.body.data.recordatorios_generados;
      }
    } catch (err) {
      console.error(`[JOBS] Error verificando recordatorios para usuario ${usuarioId}:`, err.message);
    }
  }

  console.log(`[JOBS] Verificación de recordatorios completada. Notificaciones enviadas: ${notificacionesEnviadas}`);
  return { notificaciones_enviadas: notificacionesEnviadas };
}

// ===========================================
// NUEVAS FUNCIONES PARA EL FLUJO DE RECARGAS
// ===========================================

/**
 * Obtiene una obligación con los datos del usuario
 */
async function obtenerObligacionConUsuario(obligacionId) {
  const { data, error } = await supabase
    .from('obligaciones')
    .select('*, usuarios!inner(id, nombre, telefono, plan)')
    .eq('id', obligacionId)
    .single();
  
  if (error || !data) return null;
  return data;
}

/**
 * Obtiene facturas validadas de una obligación
 */
async function obtenerFacturasValidadas(obligacionId) {
  const { data, error } = await supabase
    .from('facturas')
    .select('id, servicio, monto, fecha_vencimiento, creado_en, periodo')
    .eq('obligacion_id', obligacionId)
    .in('estado', ['validada']);
  
  if (error) throw new Error(`Error obteniendo facturas: ${error.message}`);
  return data || [];
}

/**
 * Calcula el saldo disponible del usuario para un periodo
 * saldo = recargas aprobadas - pagos realizados
 */
async function calcularSaldoUsuario(usuarioId, periodo) {
  // Si no hay periodo, retornar 0
  if (!periodo) {
    console.log('[SOLICITUDES] Warning: periodo es null, retornando saldo 0');
    return 0;
  }
  
  // Obtener recargas aprobadas (TODAS históricamente, no filtradas por periodo)
  // El saldo es acumulativo: si cargué en Febrero, está disponible en Marzo
  const { data: recargas, error: recErr } = await supabase
    .from('recargas')
    .select('monto')
    .eq('usuario_id', usuarioId)
    .eq('estado', 'aprobada');
  
  if (recErr) throw new Error(`Error obteniendo recargas: ${recErr.message}`);
  
  const totalRecargas = (recargas || []).reduce((sum, r) => sum + Number(r.monto || 0), 0);
  
  // Obtener TODOS los pagos realizados históricamente (acumulativo como las recargas)
  const { data: pagos, error: pagErr } = await supabase
    .from('pagos')
    .select('monto_aplicado')
    .eq('usuario_id', usuarioId)
    .eq('estado', 'pagado');
  
  if (pagErr) throw new Error(`Error obteniendo pagos: ${pagErr.message}`);
  
  // Sumar TODOS los pagos sin filtrar por periodo (saldo acumulativo consistente con recargas)
  const totalPagos = (pagos || []).reduce((sum, p) => {
    return sum + Number(p.monto_aplicado || 0);
  }, 0);
  
  return totalRecargas - totalPagos;
}

/**
 * Calcula la fecha de recordatorio para una factura (VERSIÓN CORREGIDA)
 * 
 * Si tiene fecha_vencimiento:
 *   fecha_recordatorio = fecha_vencimiento - 5 días (fecha absoluta)
 * 
 * Si NO tiene vencimiento (incluye heredadas):
 *   1. Obtener día de creado_en
 *   2. dia_recordatorio = dia_creado + 15
 *   3. Si pasa del mes, ajustar al siguiente mes
 *   4. Construir fecha usando dia_recordatorio en el MES ACTUAL
 * 
 * Ejemplo: creado_en = 28-feb → dia_recordatorio = 13 (28+15=43→43-30=13) → fecha = 13-mar
 */
function calcularFechaRecordatorioFacturaV2(factura) {
  const hoy = new Date();
  const anioActual = hoy.getUTCFullYear();
  const mesActual = hoy.getUTCMonth(); // 0-11
  
  // Si tiene fecha de vencimiento -> usar vencimiento - 5 días
  if (factura.fecha_vencimiento) {
    const venc = new Date(factura.fecha_vencimiento + 'T00:00:00Z');
    venc.setUTCDate(venc.getUTCDate() - 5);
    return venc.toISOString().split('T')[0];
  }
  
  // Si NO tiene vencimiento -> usar día de creado_en + 15 en mes actual
  const creado = new Date(factura.creado_en);
  let diaCreacion = creado.getUTCDate();
  let diaRecordatorio = diaCreacion + 15;
  
  // Obtener días del mes actual
  const diasEnMes = new Date(Date.UTC(anioActual, mesActual + 1, 0)).getUTCDate();
  
  // Ajustar si pasa del mes
  let mesAplicar = mesActual;
  let anioAplicar = anioActual;
  
  if (diaRecordatorio > diasEnMes) {
    diaRecordatorio = diaRecordatorio - diasEnMes;
    // Rotar al siguiente mes
    mesAplicar = mesAplicar + 1;
    if (mesAplicar > 11) {
      mesAplicar = 0;
      anioAplicar = anioAplicar + 1;
    }
    
    // Verificar si sigue siendo mayor (febrero con 28+15=43 -> 13, pero si es 31+15=46 -> 15)
    const diasSigMes = new Date(Date.UTC(anioAplicar, mesAplicar + 1, 0)).getUTCDate();
    if (diaRecordatorio > diasSigMes) {
      diaRecordatorio = diaRecordatorio - diasSigMes;
      mesAplicar = mesAplicar + 1;
      if (mesAplicar > 11) {
        mesAplicar = 0;
        anioAplicar = anioAplicar + 1;
      }
    }
  }
  
  // Construir fecha en UTC
  const fechaRecordatorio = new Date(Date.UTC(anioAplicar, mesAplicar, diaRecordatorio));
  return fechaRecordatorio.toISOString().split('T')[0];
}

/**
 * Obtiene obligaciones activas para procesar
 */
async function obtenerObligacionesActivas() {
  const { data, error } = await supabase
    .from('obligaciones')
    .select('*')
    .eq('estado', 'activa');
  
  if (error) throw new Error(`Error obteniendo obligaciones: ${error.message}`);
  return data || [];
}

/**
 * Crea o actualiza una solicitud de recarga
 * Usa maybeSingle() para evitar error si no existe
 * @param {Object} obligacion - Objeto obligación
 * @param {Number} montoPendiente - Monto pendiente calculado
 * @param {String} fechaRecordatorioCalculada - Fecha recordatorio calculada (vencimiento - 5 días)
 * @param {Array} facturasValidadas - Array de facturas validadas con sus IDs
 */
async function crearOActualizarSolicitud(obligacion, montoPendiente, fechaRecordatorioCalculada, facturasValidadas) {
  // Buscar solicitud existente
  const { data: existente, error: findErr } = await supabase
    .from('solicitudes_recarga')
    .select('*')
    .eq('obligacion_id', obligacion.id)
    .in('estado', ['pendiente', 'parcial'])
    .maybeSingle();
  
  if (findErr) {
    console.error("[SOLICITUDES] Error buscando solicitud:", findErr.message);
  }
  
  if (existente) {
    // Actualizar si el monto cambió
    if (Number(existente.monto_solicitado) !== montoPendiente) {
      await supabase
        .from('solicitudes_recarga')
        .update({
          monto_solicitado: montoPendiente,
          actualizado_en: new Date().toISOString()
        })
        .eq('id', existente.id);
      console.log(`[SOLICITUDES] Solicitud ${existente.id} actualizada a $${montoPendiente}`);
    }
    return existente;
  }
  
  // Usar las fechas calculadas desde evaluarObligacion()
  // fechaRecordatorio = vencimiento - 5 días (viene en parámetro)
  // fechaLimite = vencimiento (recordatorio + 5 días)
  const fechaRecordatorio = fechaRecordatorioCalculada;
  let fechaLimite = new Date().toISOString().split('T')[0]; // Fallback
  
  if (fechaRecordatorioCalculada) {
    // Parsear fecha en formato YYYY-MM-DD y sumar 5 días en UTC
    const fechaRecordatorioDate = new Date(fechaRecordatorioCalculada + 'T00:00:00Z');
    fechaRecordatorioDate.setUTCDate(fechaRecordatorioDate.getUTCDate() + 5);
    // Formatear de vuelta a YYYY-MM-DD
    const año = fechaRecordatorioDate.getUTCFullYear();
    const mes = String(fechaRecordatorioDate.getUTCMonth() + 1).padStart(2, '0');
    const dia = String(fechaRecordatorioDate.getUTCDate()).padStart(2, '0');
    fechaLimite = `${año}-${mes}-${dia}`;
  }
  
  // Crear nueva solicitud
  const { data: nueva, error } = await supabase
    .from('solicitudes_recarga')
    .insert({
      usuario_id: obligacion.usuario_id,
      obligacion_id: obligacion.id,
      monto_solicitado: montoPendiente,
      monto_recargado: 0,
      estado: 'pendiente',
      numero_cuota: 1,
      total_cuotas: 1,
      plan: obligacion.usuarios?.plan || 'control',
      fecha_limite: fechaLimite,
      fecha_recordatorio: fechaRecordatorio,
      facturas_ids: (facturasValidadas || []).map(f => f.id),
    })
    .select()
    .single();
  
  if (error) throw new Error(`Error creando solicitud: ${error.message}`);
  console.log(`[SOLICITUDES] Nueva solicitud creada ${nueva.id} por $${montoPendiente}, fecha_limite: ${fechaLimite}`);
  return nueva;
}

/**
 * Marca una solicitud como cumplida
 */
async function marcarSolicitudCUMPLIDA(obligacionId) {
  const { data, error } = await supabase
    .from('solicitudes_recarga')
    .update({
      estado: 'cumplida',
      actualizado_en: new Date().toISOString()
    })
    .eq('obligacion_id', obligacionId)
    .in('estado', ['pendiente', 'parcial'])
    .select();
  
  if (error) {
    console.error("[SOLICITUDES] Error marcando cumplida:", error.message);
    return null;
  }
  console.log(`[SOLICITUDES] Solicitud(es) marcadas como cumplidas para obligación ${obligacionId}`);
  return data;
}

/**
 * Detecta si es la primera recarga del mes
 * Cuenta recargas aprobadas en el mes actual
 */
async function detectarPrimeraRecargaDelMes(usuarioId) {
  const ahora = new Date();
  const inicioMes = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1)).toISOString();
  const finMes = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() + 1, 0, 23, 59, 59)).toISOString();
  
  // Prioridad: usar validada_en si existe, sino creado_en
  const { count, error } = await supabase
    .from('recargas')
    .select('id', { count: 'exact', head: true })
    .eq('usuario_id', usuarioId)
    .eq('estado', 'aprobada')
    .gte('validada_en', inicioMes)
    .lte('validada_en', finMes);
  
  // Si no tiene validada_en o no encontró, usar creado_en
  if ((count === 0 || error) && !error) {
    const { count: count2 } = await supabase
      .from('recargas')
      .select('id', { count: 'exact', head: true })
      .eq('usuario_id', usuarioId)
      .eq('estado', 'aprobada')
      .gte('creado_en', inicioMes)
      .lte('creado_en', finMes);
    
    return (count2 || 0) === 0;
  }
  
  return (count || 0) === 0;
}

/**
 * Evalúa una obligación y crea/actualiza solicitud de recarga
 * Retorna información sobre el resultado
 */
async function evaluarObligacion(obligacionId) {
  // 1. Obtener obligación con usuario
  const obligacion = await obtenerObligacionConUsuario(obligacionId);
  if (!obligacion) return null;
  
  // 2. Obtener facturas validadas
  const facturas = await obtenerFacturasValidadas(obligacionId);
  
  // Si no hay facturas, omitir
  if (!facturas.length) {
    console.log(`[JOBS] Obligación ${obligacionId}: sin facturas validadas, omitiendo`);
    return null;
  }
  
  // 3. Calcular fecha de recordatorio por factura
  const fechasRecordatorio = facturas.map(f => calcularFechaRecordatorioFacturaV2(f));
  const fechaRecordatorioObligacion = fechasRecordatorio.reduce((min, f) => f < min ? f : min, fechasRecordatorio[0]);
  
  // 4. Obtener fecha de hoy
  const hoy = new Date().toISOString().split('T')[0];
  
  // 5. Si hoy < fechaRecordatorio -> solo actualizar solicitud y SKIP
  if (hoy < fechaRecordatorioObligacion) {
    const totalObligaciones = facturas.reduce((sum, f) => sum + Number(f.monto || 0), 0);
    const saldoUsuario = await calcularSaldoUsuario(obligacion.usuario_id, obligacion.periodo);
    const montoPendiente = Math.max(0, totalObligaciones - saldoUsuario);
    
    if (montoPendiente > 0) {
      await crearOActualizarSolicitud(obligacion, montoPendiente, fechaRecordatorioObligacion, facturas);
    }
    console.log(`[JOBS] Obligación ${obligacionId}: fecha recordatorio ${fechaRecordatorioObligacion} > ${hoy}, sin notificación`);
    return { 
      skipped: true, 
      motivo: 'fecha_recordatorio_no_llegada',
      fechaRecordatorio: fechaRecordatorioObligacion,
      montoPendiente
    };
  }
  
  // 6. Calcular montos
  const totalObligaciones = facturas.reduce((sum, f) => sum + Number(f.monto || 0), 0);
  const saldoUsuario = await calcularSaldoUsuario(obligacion.usuario_id, obligacion.periodo);
  const montoPendiente = Math.max(0, totalObligaciones - saldoUsuario);
  
  // 7. Si montoPendiente <= 0 -> marcar cumplida
  if (montoPendiente <= 0) {
    await marcarSolicitudCUMPLIDA(obligacionId);
    console.log(`[JOBS] Obligación ${obligacionId}: saldo suficiente, marcada como cumplida`);
    return { 
      cumple: true, 
      montoPendiente: 0,
      saldoUsuario,
      totalObligaciones
    };
  }
  
  // 8. Crear o actualizar solicitud
  const solicitud = await crearOActualizarSolicitud(obligacion, montoPendiente, fechaRecordatorioObligacion, facturas);
  
  return {
    solicitudCargada: true,
    montoPendiente,
    totalObligaciones,
    saldoUsuario,
    fechaRecordatorio: fechaRecordatorioObligacion,
    obligacionId,
    usuarioId: obligacion.usuario_id
  };
}

module.exports = {
  generarSolicitudes,
  listarSolicitudes,
  verificarRecordatorios,
  verificarRecordatoriosGlobal,
  actualizarFechasSolicitud,
  // Exportar funciones auxiliares para uso en otros módulos
  calcularFechaRecordatorioFactura,
  recalcularSolicitudesPorObligacion,
  // Nuevas funciones para el nuevo flujo de recargas
  obtenerObligacionConUsuario,
  obtenerFacturasValidadas,
  calcularSaldoUsuario,
  calcularFechaRecordatorioFacturaV2,
  crearOActualizarSolicitud,
  marcarSolicitudCUMPLIDA,
  detectarPrimeraRecargaDelMes,
  obtenerObligacionesActivas,
  evaluarObligacion,
};
