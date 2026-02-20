// ===========================================
// Admin - Service
// Dashboard, listado de clientes, historial de pagos
// ===========================================
const supabase = require("../../config/supabase");
const { success, errors } = require("../../utils/response");
const { resolverUsuarioPorTelefono } = require("../../utils/resolverUsuario");
const { normalizarPeriodo } = require("../../utils/periodo");

/**
 * Listar todos los clientes con paginación y búsqueda.
 */
async function listarClientes({ page, limit, search, plan, activo }) {
  const offset = (page - 1) * limit;

  let query = supabase
    .from("usuarios")
    .select("*, ajustes_usuario(*)", { count: "exact" })
    .order("creado_en", { ascending: false })
    .range(offset, offset + limit - 1);

  // Filtro por plan
  if (plan) {
    query = query.eq("plan", plan);
  }

  // Filtro por activo
  if (activo !== undefined) {
    query = query.eq("activo", activo);
  }

  // Búsqueda por nombre, teléfono o correo
  if (search) {
    query = query.or(`nombre.ilike.%${search}%,telefono.ilike.%${search}%,correo.ilike.%${search}%`);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(`Error listando clientes: ${error.message}`);

  return success({
    clientes: data,
    total: count,
    page,
    limit,
    total_pages: Math.ceil((count || 0) / limit),
  });
}

/**
 * Obtener perfil completo de un cliente con sus obligaciones, recargas y saldos.
 */
async function perfilCompletoCliente(telefono) {
  const usuario = await resolverUsuarioPorTelefono(telefono);
  if (!usuario) return errors.notFound("Usuario no encontrado con ese teléfono");

  const userId = usuario.usuario_id;

  // Obtener datos en paralelo
  const [
    { data: userData },
    { data: obligaciones },
    { data: recargas },
    { data: pagos },
    { data: notificaciones },
  ] = await Promise.all([
    supabase.from("usuarios").select("*, ajustes_usuario(*)").eq("id", userId).single(),
    supabase.from("obligaciones").select("*, facturas(*)").eq("usuario_id", userId).order("creado_en", { ascending: false }),
    supabase.from("recargas").select("*").eq("usuario_id", userId).order("creado_en", { ascending: false }),
    supabase.from("pagos").select("*, facturas(servicio, monto, periodo)").eq("usuario_id", userId).order("creado_en", { ascending: false }),
    supabase.from("notificaciones").select("*").eq("usuario_id", userId).order("creado_en", { ascending: false }).limit(20),
  ]);

  // Calcular totales
  const totalRecargasAprobadas = (recargas || [])
    .filter(r => r.estado === "aprobada")
    .reduce((sum, r) => sum + Number(r.monto), 0);

  const totalPagosPagados = (pagos || [])
    .filter(p => p.estado === "pagado")
    .reduce((sum, p) => sum + Number(p.monto_aplicado), 0);

  const saldoDisponible = totalRecargasAprobadas - totalPagosPagados;

  // Calcular progreso de obligaciones
  const obligacionesConProgreso = (obligaciones || []).map(obl => {
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

  return success({
    usuario: userData,
    resumen: {
      total_obligaciones: (obligaciones || []).length,
      obligaciones_activas: (obligaciones || []).filter(o => ["activa", "en_progreso"].includes(o.estado)).length,
      obligaciones_completadas: (obligaciones || []).filter(o => o.estado === "completada").length,
      total_recargas_aprobadas: totalRecargasAprobadas,
      total_pagos_realizados: totalPagosPagados,
      saldo_disponible: saldoDisponible,
    },
    obligaciones: obligacionesConProgreso,
    recargas,
    pagos,
    notificaciones_recientes: notificaciones,
  });
}

/**
 * Historial de pagos con filtros.
 */
async function historialPagos({ telefono, periodo, estado, page, limit }) {
  const offset = (page - 1) * limit;

  let query = supabase
    .from("pagos")
    .select("*, facturas(servicio, monto, periodo, obligacion_id), usuarios(nombre, apellido, telefono)", { count: "exact" })
    .order("creado_en", { ascending: false })
    .range(offset, offset + limit - 1);

  // Filtro por usuario
  if (telefono) {
    const usuario = await resolverUsuarioPorTelefono(telefono);
    if (!usuario) return errors.notFound("Usuario no encontrado con ese teléfono");
    query = query.eq("usuario_id", usuario.usuario_id);
  }

  // Filtro por estado
  if (estado) {
    query = query.eq("estado", estado);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(`Error listando pagos: ${error.message}`);

  // Filtrar por periodo si aplica (se filtra post-query por el join)
  let resultado = data || [];
  if (periodo) {
    const periodoNorm = normalizarPeriodo(periodo);
    resultado = resultado.filter(p => p.facturas && p.facturas.periodo === periodoNorm);
  }

  return success({
    pagos: resultado,
    total: count,
    page,
    limit,
    total_pages: Math.ceil((count || 0) / limit),
  });
}

/**
 * Dashboard admin — métricas globales.
 */
async function dashboard() {
  // Obtener conteos en paralelo
  const [
    { count: totalClientes },
    { count: clientesActivos },
    { data: obligacionesActivas },
    { data: obligacionesCompletadas },
    { data: recargasPendientes },
    { data: recargasAprobadas },
    { data: revisionesPendientes },
    { data: todosLosPagos },
    { data: todasLasRecargas },
    { data: notificacionesPendientes },
  ] = await Promise.all([
    supabase.from("usuarios").select("*", { count: "exact", head: true }),
    supabase.from("usuarios").select("*", { count: "exact", head: true }).eq("activo", true),
    supabase.from("obligaciones").select("id").in("estado", ["activa", "en_progreso"]),
    supabase.from("obligaciones").select("id").eq("estado", "completada"),
    supabase.from("recargas").select("id, monto").eq("estado", "en_validacion"),
    supabase.from("recargas").select("id, monto").eq("estado", "aprobada"),
    supabase.from("revisiones_admin").select("id, tipo").in("estado", ["pendiente", "en_proceso"]),
    supabase.from("pagos").select("estado, monto_aplicado"),
    supabase.from("recargas").select("estado, monto"),
    supabase.from("notificaciones").select("id").eq("estado", "pendiente"),
  ]);

  // Calcular totales de dinero
  const totalRecargasAprobadas = (todasLasRecargas || [])
    .filter(r => r.estado === "aprobada")
    .reduce((sum, r) => sum + Number(r.monto), 0);

  const totalPagosPagados = (todosLosPagos || [])
    .filter(p => p.estado === "pagado")
    .reduce((sum, p) => sum + Number(p.monto_aplicado), 0);

  const totalPagosEnProceso = (todosLosPagos || [])
    .filter(p => p.estado === "en_proceso")
    .reduce((sum, p) => sum + Number(p.monto_aplicado), 0);

  const totalRecargasPendientes = (recargasPendientes || [])
    .reduce((sum, r) => sum + Number(r.monto), 0);

  // Desglose de revisiones pendientes
  const revisionesFacturas = (revisionesPendientes || []).filter(r => r.tipo === "factura").length;
  const revisionesRecargas = (revisionesPendientes || []).filter(r => r.tipo === "recarga").length;

  return success({
    clientes: {
      total: totalClientes || 0,
      activos: clientesActivos || 0,
    },
    obligaciones: {
      activas: (obligacionesActivas || []).length,
      completadas: (obligacionesCompletadas || []).length,
    },
    financiero: {
      total_recargas_aprobadas: totalRecargasAprobadas,
      total_pagos_realizados: totalPagosPagados,
      pagos_en_proceso: totalPagosEnProceso,
      recargas_pendientes_validacion: totalRecargasPendientes,
      saldo_global: totalRecargasAprobadas - totalPagosPagados,
    },
    revisiones_pendientes: {
      total: (revisionesPendientes || []).length,
      facturas: revisionesFacturas,
      recargas: revisionesRecargas,
    },
    notificaciones_pendientes: (notificacionesPendientes || []).length,
  });
}

module.exports = {
  listarClientes,
  perfilCompletoCliente,
  historialPagos,
  dashboard,
};
