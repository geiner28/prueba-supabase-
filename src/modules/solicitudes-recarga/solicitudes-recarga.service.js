// ===========================================
// Solicitudes Recarga - Service
// Genera solicitudes automáticas de recarga
// según el plan del usuario y sus facturas
// ===========================================
const supabase = require("../../config/supabase");
const { success, errors } = require("../../utils/response");
const { resolverUsuarioPorTelefono } = require("../../utils/resolverUsuario");
const { registrarAuditLog } = require("../../utils/auditLog");

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
  const { data: facturas, error: factErr } = await supabase
    .from("facturas")
    .select("id, servicio, monto, fecha_vencimiento, estado")
    .eq("obligacion_id", obligacion_id)
    .in("estado", ["validada", "extraida"])
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
 * Para plan control: la fecha límite es la fecha de vencimiento
 * más próxima de todas las facturas (o el día 1 del periodo).
 */
function calcularFechaLimiteCuota1(facturas, periodo) {
  const facturasConFecha = facturas.filter(f => f.fecha_vencimiento);
  if (facturasConFecha.length > 0) {
    // La más pronta
    facturasConFecha.sort((a, b) => new Date(a.fecha_vencimiento) - new Date(b.fecha_vencimiento));
    return facturasConFecha[0].fecha_vencimiento;
  }
  // Si no hay fechas, usar el día 1 del periodo
  return periodo;
}

/**
 * Distribuye facturas en 2 cuotas basándose en fechas de vencimiento.
 * Cuota 1 → facturas que vencen del 1 al 15
 * Cuota 2 → facturas que vencen del 16 al 31
 * Si todas caen en la misma mitad → divide 50/50 por monto
 */
function distribuirFacturasEnCuotas(facturas, periodo) {
  const periodoDate = new Date(periodo + "T00:00:00Z");
  const anio = periodoDate.getUTCFullYear();
  const mes = periodoDate.getUTCMonth();

  // Fechas por defecto: día 1 y día 15
  const fechaLimite1 = formatFecha(new Date(Date.UTC(anio, mes, 1)));
  const fechaLimite2 = formatFecha(new Date(Date.UTC(anio, mes, 15)));

  const cuota1 = { facturas: [], monto: 0, fechaLimite: fechaLimite1 };
  const cuota2 = { facturas: [], monto: 0, fechaLimite: fechaLimite2 };

  // Clasificar por fecha de vencimiento
  for (const f of facturas) {
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
      // Sin fecha de vencimiento → asignar a cuota 1 por defecto
      cuota1.facturas.push(f);
      cuota1.monto += Number(f.monto || 0);
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
    }
  }

  // Ajustar fecha límite de cuota 2
  if (cuota2.facturas.length > 0) {
    const conFecha = cuota2.facturas.filter(f => f.fecha_vencimiento);
    if (conFecha.length > 0) {
      conFecha.sort((a, b) => new Date(a.fecha_vencimiento) - new Date(b.fecha_vencimiento));
      cuota2.fechaLimite = conFecha[0].fecha_vencimiento;
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

function formatFecha(date) {
  return date.toISOString().split("T")[0];
}

module.exports = {
  generarSolicitudes,
  listarSolicitudes,
  verificarRecordatorios,
  actualizarFechasSolicitud,
};
