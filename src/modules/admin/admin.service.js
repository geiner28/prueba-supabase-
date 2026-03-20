// ===========================================
// Admin - Service
// Dashboard, listado de clientes, historial de pagos
// ===========================================
const supabase = require("../../config/supabase");
const { success, errors } = require("../../utils/response");
const { resolverUsuarioPorTelefono } = require("../../utils/resolverUsuario");
const { normalizarPeriodo } = require("../../utils/periodo");
const {
  distribuirFacturasEnCuotas,
  adaptarCuotasAProgamacion,
} = require("../../utils/cuotasDistribucion");

/**
 * Listar todos los clientes con paginación y búsqueda.
 */
async function listarClientes({ page, limit, search, plan, activo }) {
  const offset = (page - 1) * limit;

  let query = supabase
    .from("usuarios")
    .select("*", { count: "exact" })
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

  // Enriquecer cada cliente con datos de última obligación y saldo
  const clientesEnriquecidos = await Promise.all(
    data.map(async (cliente) => {
      try {
        // 1. Obtener la última obligación activa o en progreso
        const { data: ultimaObligacion } = await supabase
          .from("obligaciones")
          .select("id, periodo, estado")
          .eq("usuario_id", cliente.id)
          .in("estado", ["activa", "en_progreso"])
          .order("periodo", { ascending: false })
          .limit(1)
          .single();

        let datosObligacion = {
          total_facturas: 0,
          facturas_pagadas: 0,
          facturas_pendientes: 0
        };

        // 2. Si existe obligación, obtener sus facturas
        if (ultimaObligacion) {
          const { data: facturas } = await supabase
            .from("facturas")
            .select("id, estado")
            .eq("obligacion_id", ultimaObligacion.id);

          if (facturas && facturas.length > 0) {
            datosObligacion.total_facturas = facturas.length;
            datosObligacion.facturas_pagadas = facturas.filter(f => f.estado === "pagada").length;
            datosObligacion.facturas_pendientes = facturas.filter(f => f.estado !== "pagada").length;
          }
        }

        // 3. Calcular saldo global del usuario (recargas aprobadas - pagos realizados)
        const { data: recargasData } = await supabase
          .from("recargas")
          .select("monto")
          .eq("usuario_id", cliente.id)
          .eq("estado", "aprobada");

        const totalRecargas = (recargasData || []).reduce((sum, r) => sum + Number(r.monto || 0), 0);

        const { data: pagosData } = await supabase
          .from("pagos")
          .select("monto_aplicado")
          .eq("usuario_id", cliente.id)
          .eq("estado", "pagado");

        const totalPagos = (pagosData || []).reduce((sum, p) => sum + Number(p.monto_aplicado || 0), 0);

        const saldo = totalRecargas - totalPagos;

        return {
          ...cliente,
          ultima_obligacion: ultimaObligacion ? [{
            ...ultimaObligacion,
            ...datosObligacion
          }] : [],
          saldo
        };
      } catch (err) {
        console.error(`Error enriqueciendo cliente ${cliente.id}:`, err);
        return {
          ...cliente,
          ultima_obligacion: [],
          saldo: 0
        };
      }
    })
  );

  return success({
    clientes: clientesEnriquecidos,
    total: count,
    page,
    limit,
    total_pages: Math.ceil((count || 0) / limit),
  });
}

/**
 * Obtener perfil completo de un cliente con sus obligaciones, recargas y saldos.
 */
async function perfilCompletoCliente(telefono, periodo = null) {
  const usuario = await resolverUsuarioPorTelefono(telefono);
  if (!usuario) return errors.notFound("Usuario no encontrado con ese teléfono");

  const userId = usuario.usuario_id;

  // Determinar periodo: si no se proporciona, usar mes actual
  let periodoTarget = periodo;
  if (!periodoTarget) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    periodoTarget = `${year}-${month}-01`;
  } else {
    periodoTarget = normalizarPeriodo(periodoTarget);
  }

  // Obtener datos en paralelo
  const [
    { data: userData },
    { data: obligacionesTotal },
    { data: obligacionesMes },
    { data: recargasTotal },
    { data: recargasMes },
    { data: pagosTotal },
    { data: pagosMes },
    { data: notificaciones },
    { data: programacionRecargasData },
  ] = await Promise.all([
    supabase.from("usuarios").select("*, ajustes_usuario(*)").eq("id", userId).single(),
    // Obligaciones totales (para resumen global)
    supabase.from("obligaciones").select("*, facturas(*)").eq("usuario_id", userId).order("creado_en", { ascending: false }),
    // Obligaciones del mes
    supabase.from("obligaciones").select("*, facturas(*)").eq("usuario_id", userId).eq("periodo", periodoTarget).order("creado_en", { ascending: false }),
    // Recargas totales (para filtar después)
    supabase.from("recargas").select("*").eq("usuario_id", userId).order("creado_en", { ascending: false }),
    // Recargas aprobadas del mes específico
    supabase.from("recargas").select("*").eq("usuario_id", userId).eq("periodo", periodoTarget).eq("estado", "aprobada"),
    // Pagos totales (para filtrar después)
    supabase.from("pagos").select("*, facturas(servicio, monto, periodo)").eq("usuario_id", userId).order("creado_en", { ascending: false }),
    // Pagos pagados del mes - IMPORTANTE: join con facturas para poder filtrar por periodo
    supabase.from("pagos").select("*, facturas(periodo)").eq("usuario_id", userId).eq("estado", "pagado"),
    // Notificaciones recientes
    supabase.from("notificaciones").select("*").eq("usuario_id", userId).order("creado_en", { ascending: false }).limit(20),
    // Programación de recargas del usuario
    supabase.from("programacion_recargas").select("*").eq("usuario_id", userId).single(),
  ]);

  // Normalizar programacionRecargas - puede ser un objeto o null
  let programacionRecargas = programacionRecargasData;

  // ═══════════════════════════════════════════════════════════════
  // CÁLCULOS GLOBALES (sin filtro de periodo)
  // ═══════════════════════════════════════════════════════════════
  const totalRecargasAprobadas = (recargasTotal || [])
    .filter(r => r.estado === "aprobada")
    .reduce((sum, r) => sum + Number(r.monto), 0);

  const totalPagosPagados = (pagosTotal || [])
    .filter(p => p.estado === "pagado")
    .reduce((sum, p) => sum + Number(p.monto_aplicado), 0);

  const saldoDisponible = Math.max(0, totalRecargasAprobadas - totalPagosPagados);

  // ═══════════════════════════════════════════════════════════════
  // CÁLCULOS POR MES
  // ═══════════════════════════════════════════════════════════════
  
  // Total recargas aprobadas del mes
  const totalRecargasAprobadasMes = (recargasMes || [])
    .reduce((sum, r) => sum + Number(r.monto), 0);

  // Total pagos del mes (filtrado por periodo de las facturas)
  const totalPagosRealizadosMes = (pagosMes || [])
    .filter(p => p.facturas && p.facturas.periodo === periodoTarget)
    .reduce((sum, p) => sum + Number(p.monto_aplicado), 0);

  // Facturas del mes que son validadas (TODO excepto extraida y rechazada)
  const allFacturasMes = (obligacionesMes || []).reduce((acc, obl) => {
    return acc.concat(obl.facturas || []);
  }, []);

  const facturasValidadasMes = allFacturasMes.filter(
    f => !["extraida", "rechazada"].includes(f.estado)
  );

  const facturasPendienteMes = allFacturasMes.filter(
    f => !["extraida", "rechazada", "pagada"].includes(f.estado)
  );

  const totalPendienteMes = facturasPendienteMes.reduce(
    (sum, f) => sum + Number(f.monto || 0), 0
  );

  // Cantidad de recargas aprobadas del mes
  const recargasAprobadaCountMes = (recargasMes || []).length;

  // ═══════════════════════════════════════════════════════════════
  // CALCULAR CUOTAS DEL MES (debe hacerse ANTES de usarlas)
  // ═══════════════════════════════════════════════════════════════
  let cuotasDelMes = { grupo1: null, grupo2: null };
  let cuotasCalculadas = { cuota1: { facturas: [] }, cuota2: { facturas: [] } }; // Para mapear grupos a facturas
  try {
    // Extraer facturas validadas del mes (para cálculo de cuotas monetarias)
    const facturasValidadasDelMes = allFacturasMes.filter(
      f => ["validada"].includes(f.estado)
    );

    if (facturasValidadasDelMes.length > 0) {
      // Calcular cuotas según la lógica estándar (1-15, 16-31)
      cuotasCalculadas = distribuirFacturasEnCuotas(facturasValidadasDelMes, periodoTarget);

      // Adaptar cuotas a las preferencias del usuario (programacion_recargas)
      cuotasDelMes = adaptarCuotasAProgamacion(
        cuotasCalculadas,
        programacionRecargas,
        userData?.plan
      );
    } else {
      // Si no hay facturas validadas, pero hay otras facturas, distribuirlas aun así para grupos
      cuotasCalculadas = distribuirFacturasEnCuotas(allFacturasMes, periodoTarget);
    }
  } catch (err) {
    console.error("[ADMIN] Error calculando cuotas:", err.message);
    // Si hay error, retornar cuotas vacías pero sin fallar
    cuotasDelMes = { grupo1: null, grupo2: null };
    cuotasCalculadas = { cuota1: { facturas: [] }, cuota2: { facturas: [] } };
  }

  // ═══════════════════════════════════════════════════════════════
  // ASIGNAR GRUPO A CADA FACTURA EN obligaciones_mes
  // ═══════════════════════════════════════════════════════════════
  // Crear maps de IDs para búsqueda rápida
  // LÓGICA SIMPLE: Si cantidad_recargas = 1 → TODAS las facturas van a grupo 1
  //                Si cantidad_recargas = 2 → Usar distribución de cuotasCalculadas
  let idsGrupo1, idsGrupo2;

  const cantidadRecargas = programacionRecargas?.cantidad_recargas;
  // Convertir a número si es string
  const cantidadRecargasNum = Number(cantidadRecargas);
  
  if (cantidadRecargasNum === 1) {
    // UNA SOLA RECARGA: TODAS las facturas van a grupo 1, sin excepciones
    idsGrupo1 = new Set(allFacturasMes.map(f => f.id));
    idsGrupo2 = new Set(); // Vacío
  } else {
    // DOS RECARGAS O DEFAULT: Usar la distribución calculada
    idsGrupo1 = new Set((cuotasCalculadas.cuota1.facturas || []).map(f => f.id));
    idsGrupo2 = new Set((cuotasCalculadas.cuota2.facturas || []).map(f => f.id));
  }

  // Calcular progreso de obligaciones del mes
  const obligacionesDelMesConProgreso = (obligacionesMes || []).map(obl => {
    const facturas = (obl.facturas || []).map(f => {
      // Asignar grupo basado en cálculo previo
      let grupo = null;
      if (idsGrupo1.has(f.id)) grupo = 1;
      else if (idsGrupo2.has(f.id)) grupo = 2;
      
      return {
        ...f,
        grupo, // Viene del cálculo de distribuirFacturasEnCuotas
      };
    });
    
    const totalFacturas = facturas.length;
    const facturasPagadas = facturas.filter(f => f.estado === "pagada").length;
    const montoTotal = facturas.reduce((sum, f) => sum + Number(f.monto || 0), 0);
    const montoPagado = facturas.filter(f => f.estado === "pagada").reduce((sum, f) => sum + Number(f.monto || 0), 0);
    const progreso = totalFacturas > 0 ? Math.round((facturasPagadas / totalFacturas) * 100) : 0;

    return {
      ...obl,
      facturas, // Con grupo asignado
      total_facturas: totalFacturas,
      facturas_pagadas: facturasPagadas,
      monto_total: montoTotal,
      monto_pagado: montoPagado,
      progreso,
    };
  });

  // Calcular progreso de obligaciones totales (para mantener compatibilidad)
  const obligacionesTotalesConProgreso = (obligacionesTotal || []).map(obl => {
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
    periodo: periodoTarget,
    resumen: {
      // Datos globales (sin filtro de mes)
      total_obligaciones: (obligacionesTotal || []).length,
      obligaciones_activas: (obligacionesTotal || []).filter(o => ["activa", "en_progreso"].includes(o.estado)).length,
      obligaciones_completadas: (obligacionesTotal || []).filter(o => o.estado === "completada").length,
      total_recargas_aprobadas: totalRecargasAprobadas,
      total_pagos_realizados: totalPagosPagados,
      saldo_disponible: saldoDisponible,
      // Datos filtrados por mes
      total_recargas_aprobadas_mes: totalRecargasAprobadasMes,
      total_pagos_realizados_mes: totalPagosRealizadosMes,
      total_pendiente_mes: totalPendienteMes,
      facturas_validadas_count_mes: facturasValidadasMes.length,
      recargas_aprobadas_count_mes: recargasAprobadaCountMes,
    },
    obligaciones: obligacionesTotalesConProgreso,
    obligaciones_mes: obligacionesDelMesConProgreso,
    recargas: recargasTotal,
    pagos: pagosTotal,
    notificaciones_recientes: notificaciones,
    programacion_recargas: programacionRecargas,
    cuotas_mes: cuotasDelMes,
    cuotasCalculadas: cuotasCalculadas,  // Para que el frontend pueda calcular grupos si es necesario
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
 * Dashboard admin — métricas filtradas por período y plan.
 * Parámetros:
 *   - year: año (ej: 2026)
 *   - month: mes (ej: 2 para febrero, 1-12)
 *   - plan: plan a filtrar ('all', 'control', 'tranquilidad', 'respaldo')
 */
async function dashboard(params = {}) {
  const { year, month, plan = 'all' } = params;

  // 1. CONSTRUIR PERÍODO NORMALIZADO (YYYY-MM-01)
  let periodoTarget = null;
  let yearTarget = year;
  let monthTarget = month;

  if (year && month) {
    const monthStr = String(month).padStart(2, "0");
    periodoTarget = `${year}-${monthStr}-01`;
    yearTarget = year;
    monthTarget = month;
  } else {
    // Default: mes actual
    const now = new Date();
    yearTarget = now.getFullYear();
    monthTarget = now.getMonth() + 1;
    const monthStr = String(monthTarget).padStart(2, "0");
    periodoTarget = `${yearTarget}-${monthStr}-01`;
  }

  // 2. OBTENER USUARIOS (para aplicar filtro de plan)
  let usuariosQuery = supabase.from("usuarios").select("id, nombre, plan");
  if (plan && plan !== "all") {
    usuariosQuery = usuariosQuery.eq("plan", plan);
  }

  const { data: usuarios } = await usuariosQuery;
  const usuariosIds = (usuarios || []).map((u) => u.id);

  // 3. CONSULTAS DE DATOS EN PARALELO

  // 3.1 Recargas aprobadas en período específico
  let recargasQuery = supabase
    .from("recargas")
    .select("monto, usuario_id, periodo")
    .eq("estado", "aprobada")
    .eq("periodo", periodoTarget);
  if (usuariosIds.length > 0) {
    recargasQuery = recargasQuery.in("usuario_id", usuariosIds);
  }

  // 3.2 Obtener todas las facturas primero (para luego filtrar pagos por período)
  let todasFacturasQuery = supabase
    .from("facturas")
    .select("id, estado, usuario_id, periodo, fecha_vencimiento, monto")
    .eq("periodo", periodoTarget);
  if (usuariosIds.length > 0) {
    todasFacturasQuery = todasFacturasQuery.in("usuario_id", usuariosIds);
  }

  // 3.3 Facturas no pagadas en período específico
  let facturasNoPageQuery = supabase
    .from("facturas")
    .select("id, usuario_id, estado, fecha_vencimiento, periodo")
    .neq("estado", "pagada")
    .eq("periodo", periodoTarget);
  if (usuariosIds.length > 0) {
    facturasNoPageQuery = facturasNoPageQuery.in("usuario_id", usuariosIds);
  }

  // 3.5 Recargas aprobadas GLOBALES (sin filtro de período) — para saldo disponible
  let recargasGlobalQuery = supabase
    .from("recargas")
    .select("monto, usuario_id")
    .eq("estado", "aprobada");
  if (usuariosIds.length > 0) {
    recargasGlobalQuery = recargasGlobalQuery.in("usuario_id", usuariosIds);
  }

  // 3.6 Pagos completados GLOBALES (sin filtro de período) — para saldo disponible
  let pagosGlobalQuery = supabase
    .from("pagos")
    .select("monto_aplicado, usuario_id")
    .eq("estado", "pagado");
  if (usuariosIds.length > 0) {
    pagosGlobalQuery = pagosGlobalQuery.in("usuario_id", usuariosIds);
  }

  // Ejecutar primero: recargas y facturas (para después filtrar pagos)
  const [
    { data: recargasData },
    { data: facturasNoPagadas },
    { data: todasLasFacturas },
    { data: recargasGlobalData },
    { data: pagosGlobalData },
  ] = await Promise.all([
    recargasQuery,
    facturasNoPageQuery,
    todasFacturasQuery,
    recargasGlobalQuery,
    pagosGlobalQuery,
  ]);

  // 3.4 Pagos completados SOLO de facturas en este período
  let pagosData = [];
  if (todasLasFacturas && todasLasFacturas.length > 0) {
    const facturasIds = todasLasFacturas.map((f) => f.id);
    const { data: pagosPeriodo } = await supabase
      .from("pagos")
      .select("monto_aplicado, usuario_id, factura_id")
      .eq("estado", "pagado")
      .in("factura_id", facturasIds);
    pagosData = pagosPeriodo || [];
  }

  // 4. CALCULAR MÉTRICAS PRINCIPALES

  // Métrica 1: Total Recargas Aprobadas
  const totalRecargasAprobadas = (recargasData || []).reduce(
    (sum, r) => sum + Number(r.monto || 0),
    0
  );

  // Métrica 2: Total Pagado
  const totalPagado = (pagosData || []).reduce(
    (sum, p) => sum + Number(p.monto_aplicado || 0),
    0
  );

  // Métrica 3: Saldo Disponible GLOBAL (todas las recargas - todos los pagos, sin filtro de período)
  // El saldo es acumulativo como una cuenta bancaria, no depende del mes seleccionado.
  const totalRecargasGlobal = (recargasGlobalData || []).reduce(
    (sum, r) => sum + Number(r.monto || 0),
    0
  );
  const totalPagosGlobal = (pagosGlobalData || []).reduce(
    (sum, p) => sum + Number(p.monto_aplicado || 0),
    0
  );
  const saldoDisponible = Math.max(0, totalRecargasGlobal - totalPagosGlobal);

  // Métrica 4: Cantidad de Transacciones (recargas aprobadas)
  const cantidadTransacciones = (recargasData || []).length;

  // Métrica 5: Deuda Total (suma de todas las facturas validadas en el período)
  const deudaTotal = (todasLasFacturas || []).reduce(
    (sum, f) => sum + Number(f.monto || 0),
    0
  );

  // Métrica 6: Deuda Pendiente (deuda total - total pagado)
  const deudaPendiente = deudaTotal - totalPagado;

  // Métrica 7: Balance (saldo disponible - deuda pendiente)
  const balance = saldoDisponible - deudaPendiente;

  // 5. CALCULAR DISTRIBUCIONES

  // 5.1 Distribución de Saldo por Usuarios — GLOBAL (sin filtro de período)
  const saldoPorUsuario = {};

  for (const usuario of usuarios || []) {
    const sumaRecargas = (recargasGlobalData || [])
      .filter((r) => r.usuario_id === usuario.id)
      .reduce((sum, r) => sum + Number(r.monto || 0), 0);

    const sumaPagos = (pagosGlobalData || [])
      .filter((p) => p.usuario_id === usuario.id)
      .reduce((sum, p) => sum + Number(p.monto_aplicado || 0), 0);

    const saldo = sumaRecargas - sumaPagos;

    if (saldo > 0) {
      // Incluir TODOS los usuarios con saldo positivo
      saldoPorUsuario[usuario.id] = {
        usuario: usuario.nombre,
        saldo: Math.round(saldo * 100) / 100,
      };
    }
  }

  const distribucionSaldo = Object.values(saldoPorUsuario)
    .sort((a, b) => b.saldo - a.saldo); // Ordenar de mayor a menor, SIN limitar a TOP 3

  // 5.2 Distribución de Facturas por Estado
  const distribucionFacturas = {
    pagadas: (todasLasFacturas || []).filter((f) => f.estado === "pagada").length,
    pendientes: (todasLasFacturas || []).filter((f) => f.estado !== "pagada").length,
    vencidas: (facturasNoPagadas || []).filter(
      (f) =>
        f.fecha_vencimiento && 
        f.fecha_vencimiento < new Date().toISOString().split("T")[0]
    ).length,
    enRevision: (todasLasFacturas || []).filter((f) => f.estado === "en_revision")
      .length,
    rechazadas: (todasLasFacturas || []).filter((f) => f.estado === "rechazada")
      .length,
  };

  // 5.3 Distribución de Usuarios por Plan
  const distribucionPlanes = {
    control: (usuarios || []).filter((u) => u.plan === "control").length,
    tranquilidad: (usuarios || []).filter((u) => u.plan === "tranquilidad").length,
    respaldo: (usuarios || []).filter((u) => u.plan === "respaldo").length,
  };

  // 6. RETORNAR ESTRUCTURA COMPLETA
  return success({
    metricas: {
      totalRecargasAprobadas: Math.round(totalRecargasAprobadas * 100) / 100,
      totalPagado: Math.round(totalPagado * 100) / 100,
      saldoDisponible: Math.round(saldoDisponible * 100) / 100,
      cantidadTransacciones,
      deudaTotal: Math.round(deudaTotal * 100) / 100,
      deudaPendiente: Math.round(deudaPendiente * 100) / 100,
      balance: Math.round(balance * 100) / 100,
    },
    distribucionSaldo,
    distribucionFacturas,
    distribucionPlanes,
    periodo: {
      year: yearTarget,
      month: monthTarget,
      plan: plan || "all",
    },
  });
}

/**
 * Upsert usuario con campos extendidos (admin-only)
 * - Acepta: telefono, nombre, apellido, correo, direccion, plan
 * - Busca por telefono
 * - Si existe: actualiza campos enviados
 * - Si no existe: crea usuario + ajustes automáticos
 */
async function upsertUsuarioAdmin({ telefono, nombre, apellido, correo, direccion, plan }) {
  // 1. Buscar usuario existente
  const { data: existing, error: findErr } = await supabase
    .from("usuarios")
    .select("*")
    .eq("telefono", telefono)
    .single();

  if (findErr && findErr.code !== "PGRST116") {
    throw new Error(`Error buscando usuario: ${findErr.message}`);
  }

  if (existing) {
    // 2. Actualizar solo campos enviados (no sobrescribir con null)
    const updates = {};
    if (nombre !== undefined) updates.nombre = nombre;
    if (apellido !== undefined) updates.apellido = apellido;
    if (correo !== undefined) updates.correo = correo;
    if (direccion !== undefined) updates.direccion = direccion;
    if (plan !== undefined) updates.plan = plan;

    if (Object.keys(updates).length > 0) {
      const { error: updateErr } = await supabase
        .from("usuarios")
        .update(updates)
        .eq("id", existing.id);

      if (updateErr) throw new Error(`Error actualizando usuario: ${updateErr.message}`);
    }

    return success({
      usuario_id: existing.id,
      creado: false,
      nombre: existing.nombre,
      telefono: existing.telefono,
      plan: updates.plan || existing.plan,
    });
  }

  // 3. Crear usuario nuevo
  const { data: newUser, error: createErr } = await supabase
    .from("usuarios")
    .insert({
      telefono,
      nombre: nombre || telefono,
      apellido: apellido || "",
      correo: correo || null,
      direccion: direccion || null,
      plan: plan || undefined, // Dejar que DB use su DEFAULT 'control'
    })
    .select()
    .single();

  if (createErr) throw new Error(`Error creando usuario: ${createErr.message}`);

  // 4. Crear ajustes por defecto
  const { error: ajustesErr } = await supabase
    .from("ajustes_usuario")
    .insert({ usuario_id: newUser.id });

  if (ajustesErr) {
    console.error("[ADMIN-USERS] Error creando ajustes_usuario:", ajustesErr.message);
  }

  return success({
    usuario_id: newUser.id,
    creado: true,
    nombre: newUser.nombre,
    telefono: newUser.telefono,
    plan: newUser.plan,
  }, 201);
}

/**
 * Actualizar usuario por ID (ADMIN-ONLY)
 * Permite cambiar cualquier campo incluyendo teléfono.
 */
async function updateUsuarioAdmin(userId, fields) {
  // 1. Verificar que el usuario existe
  const { data: existing, error: findErr } = await supabase
    .from("usuarios")
    .select("*")
    .eq("id", userId)
    .single();

  if (findErr || !existing) {
    return errors.notFound("Usuario no encontrado");
  }

  // 2. Construir objeto de actualización con solo los campos enviados
  const updates = {};
  if (fields.telefono !== undefined) updates.telefono = fields.telefono;
  if (fields.nombre !== undefined) updates.nombre = fields.nombre;
  if (fields.apellido !== undefined) updates.apellido = fields.apellido;
  if (fields.correo !== undefined) updates.correo = fields.correo;
  if (fields.direccion !== undefined) updates.direccion = fields.direccion;
  if (fields.plan !== undefined) updates.plan = fields.plan;
  if (fields.activo !== undefined) updates.activo = fields.activo;

  if (Object.keys(updates).length === 0) {
    return errors.badRequest("No se enviaron campos para actualizar");
  }

  // 3. Si se cambia teléfono, verificar que no esté en uso por otro usuario
  if (updates.telefono && updates.telefono !== existing.telefono) {
    const { data: duplicado } = await supabase
      .from("usuarios")
      .select("id")
      .eq("telefono", updates.telefono)
      .neq("id", userId)
      .single();

    if (duplicado) {
      return errors.conflict("Ya existe otro usuario con ese número de teléfono");
    }
  }

  // 4. Actualizar
  const { data: updated, error: updateErr } = await supabase
    .from("usuarios")
    .update(updates)
    .eq("id", userId)
    .select()
    .single();

  if (updateErr) throw new Error(`Error actualizando usuario: ${updateErr.message}`);

  return success({
    usuario_id: updated.id,
    telefono: updated.telefono,
    nombre: updated.nombre,
    apellido: updated.apellido,
    correo: updated.correo,
    direccion: updated.direccion,
    plan: updated.plan,
    activo: updated.activo,
  });
}

/**
 * Buscar usuario por teléfono (ADMIN-ONLY)
 */
async function getUsuarioByTelefono(telefono) {
  if (!telefono) {
    return errors.badRequest("El teléfono es requerido");
  }

  const { data, error } = await supabase
    .from("usuarios")
    .select("id, telefono, nombre, apellido, correo, direccion, plan, activo")
    .eq("telefono", telefono.trim())
    .single();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Error buscando usuario: ${error.message}`);
  }

  if (!data) {
    return errors.notFound("Usuario no encontrado");
  }

  return success({
    usuario_id: data.id,
    telefono: data.telefono,
    nombre: data.nombre,
    apellido: data.apellido,
    correo: data.correo,
    direccion: data.direccion,
    plan: data.plan,
    activo: data.activo,
  });
}

// ===========================================
// FUNCIONES PARA GESTIÓN DE NOTIFICACIONES (ADMIN-ONLY)
// ===========================================

/**
 * Listar notificaciones con filtros avanzados
 * Parámetros:
 *   - tipo: tipo de notificación a filtrar (ej: 'solicitud_recarga_inicio_mes')
 *   - estado: 'pendiente', 'enviada', 'leida'
 *   - usuario_id: uuid del usuario
 *   - periodo: 'YYYY-MM' para filtrar por mes
 *   - desde: fecha inicio (YYYY-MM-DD)
 *   - hasta: fecha fin (YYYY-MM-DD)
 *   - page: número de página (default: 1)
 *   - limit: registros por página (default: 20)
 */
async function listarNotificacionesAdmin(filters = {}) {
  const { tipo, estado, usuario_id, periodo, desde, hasta, page = 1, limit = 20 } = filters;
  const offset = (page - 1) * limit;

  let query = supabase
    .from("notificaciones")
    .select("*, usuarios(nombre, apellido, telefono)", { count: "exact" })
    .order("creado_en", { ascending: false })
    .range(offset, offset + limit - 1);

  // Filtro por tipo
  if (tipo) {
    query = query.eq("tipo", tipo);
  }

  // Filtro por estado
  if (estado) {
    query = query.eq("estado", estado);
  }

  // Filtro por usuario
  if (usuario_id) {
    query = query.eq("usuario_id", usuario_id);
  }

  // Filtro por período (YYYY-MM)
  if (periodo) {
    const periodoStart = `${periodo}-01`;
    const [year, month] = periodo.split("-");
    const nextMonth = parseInt(month) + 1;
    let periodoEnd;
    if (nextMonth > 12) {
      const nextYear = parseInt(year) + 1;
      periodoEnd = `${nextYear}-01-01`;
    } else {
      periodoEnd = `${year}-${String(nextMonth).padStart(2, "0")}-01`;
    }
    query = query.gte("creado_en", periodoStart).lt("creado_en", periodoEnd);
  }

  // Filtro por rango de fechas
  if (desde) {
    query = query.gte("creado_en", `${desde}T00:00:00Z`);
  }
  if (hasta) {
    query = query.lte("creado_en", `${hasta}T23:59:59Z`);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(`Error listando notificaciones: ${error.message}`);

  return success({
    notificaciones: data || [],
    total: count || 0,
    page,
    limit,
    total_pages: Math.ceil((count || 0) / limit),
  });
}

/**
 * Obtener estadísticas de notificaciones
 * Parámetros:
 *   - usuario_id: uuid del usuario (opcional, si se proporciona filtra solo de ese usuario)
 *   - periodo: 'YYYY-MM' para filtrar por mes
 */
async function obtenerEstadisticasNotificaciones(filters = {}) {
  const { usuario_id, periodo, desde, hasta } = filters;

  // Construir query base con filtros
  let buildQuery = () => {
    let q = supabase.from("notificaciones").select("*", { count: "exact" });
    if (usuario_id) q = q.eq("usuario_id", usuario_id);
    if (periodo) {
      const periodoStart = `${periodo}-01`;
      const [year, month] = periodo.split("-");
      const nextMonth = parseInt(month) + 1;
      let periodoEnd;
      if (nextMonth > 12) {
        const nextYear = parseInt(year) + 1;
        periodoEnd = `${nextYear}-01-01`;
      } else {
        periodoEnd = `${year}-${String(nextMonth).padStart(2, "0")}-01`;
      }
      q = q.gte("creado_en", periodoStart).lt("creado_en", periodoEnd);
    }
    if (desde) q = q.gte("creado_en", `${desde}T00:00:00Z`);
    if (hasta) q = q.lte("creado_en", `${hasta}T23:59:59Z`);
    return q;
  };

  // Obtener totales por estado - CADA UNO necesita su propia query
  const { count: totalAll } = await buildQuery();
  const { count: totalPendiente } = await buildQuery().eq("estado", "pendiente");
  const { count: totalEnviada } = await buildQuery().eq("estado", "enviada");
  const { count: totalLeida } = await buildQuery().eq("estado", "leida");

  // Obtener TODAS las notificaciones para distribución por tipo
  const { data: notificacionesTodas } = await buildQuery();
  
  const distribucionTipos = {};
  (notificacionesTodas || []).forEach(notif => {
    if (!distribucionTipos[notif.tipo]) {
      distribucionTipos[notif.tipo] = { total: 0, pendiente: 0, enviada: 0, leida: 0 };
    }
    distribucionTipos[notif.tipo].total++;
    if (notif.estado === "pendiente") distribucionTipos[notif.tipo].pendiente++;
    else if (notif.estado === "enviada") distribucionTipos[notif.tipo].enviada++;
    else if (notif.estado === "leida") distribucionTipos[notif.tipo].leida++;
  });

  return success({
    estadisticas: {
      total: totalAll || 0,
      no_enviadas: totalPendiente || 0,
      enviadas: totalEnviada || 0,
      leidas: totalLeida || 0,
      por_tipo: distribucionTipos,
    },
  });
}

/**
 * Obtener notificaciones de un cliente específico
 * Parámetros:
 *   - usuario_id: uuid del usuario
 *   - tipo: filtrar por tipo (opcional)
 *   - periodo: filtrar por período YYYY-MM (opcional)
 */
async function obtenerNotificacionesCliente(usuario_id, filters = {}) {
  const { tipo, periodo } = filters;

  let query = supabase
    .from("notificaciones")
    .select("*")
    .eq("usuario_id", usuario_id)
    .order("creado_en", { ascending: false });

  if (tipo) {
    query = query.eq("tipo", tipo);
  }

  if (periodo) {
    const periodoStart = `${periodo}-01`;
    const [year, month] = periodo.split("-");
    const nextMonth = parseInt(month) + 1;
    let periodoEnd;
    if (nextMonth > 12) {
      const nextYear = parseInt(year) + 1;
      periodoEnd = `${nextYear}-01-01`;
    } else {
      periodoEnd = `${year}-${String(nextMonth).padStart(2, "0")}-01`;
    }
    query = query.gte("creado_en", periodoStart).lt("creado_en", periodoEnd);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Error obteniendo notificaciones del cliente: ${error.message}`);

  // Obtener datos del usuario
  const { data: usuario } = await supabase
    .from("usuarios")
    .select("nombre, apellido, telefono")
    .eq("id", usuario_id)
    .single();

  return success({
    usuario: usuario,
    notificaciones: data || [],
    total: (data || []).length,
  });
}

/**
 * Marcar una notificación como enviada (manualmente por admin)
 * Crea un registro de auditoría
 */
async function marcarNotificacionEnviada(notificacion_id, admin_id = null) {
  // Obtener la notificación actual
  const { data: notif, error: findErr } = await supabase
    .from("notificaciones")
    .select("*")
    .eq("id", notificacion_id)
    .single();

  if (findErr || !notif) {
    return errors.notFound("Notificación no encontrada");
  }

  // Actualizar estado a 'enviada'
  const { data: updated, error: updateErr } = await supabase
    .from("notificaciones")
    .update({
      estado: "enviada",
      ultimo_error: null,
    })
    .eq("id", notificacion_id)
    .select()
    .single();

  if (updateErr) throw new Error(`Error actualizando notificación: ${updateErr.message}`);

  // Registrar en audit_log
  try {
    await supabase
      .from("audit_log")
      .insert({
        actor_tipo: "admin",
        actor_id: admin_id,
        accion: "marcar_notificacion_enviada",
        entidad: "notificaciones",
        entidad_id: notificacion_id,
        antes: { estado: notif.estado },
        despues: { estado: "enviada" },
      });
  } catch (auditErr) {
    console.error("[ADMIN] Error registrando en audit_log:", auditErr.message);
    // No fallar la operación si falla el audit
  }

  return success(updated);
}

/**
 * Marcar múltiples notificaciones como enviadas (batch)
 */
async function marcarNotificacionesEnviadasBatch(notificacion_ids = [], admin_id = null) {
  if (!notificacion_ids || notificacion_ids.length === 0) {
    return errors.badRequest("Se requiere un array de IDs de notificaciones");
  }

  const { data: updated, error: updateErr } = await supabase
    .from("notificaciones")
    .update({
      estado: "enviada",
      ultimo_error: null,
    })
    .in("id", notificacion_ids)
    .select();

  if (updateErr) throw new Error(`Error actualizando notificaciones: ${updateErr.message}`);

  // Registrar en audit_log (una entrada por lote)
  try {
    await supabase
      .from("audit_log")
      .insert({
        actor_tipo: "admin",
        actor_id: admin_id,
        accion: "marcar_notificaciones_enviadas_batch",
        entidad: "notificaciones",
        entidad_id: null,
        antes: { cantidad: notificacion_ids.length },
        despues: { cantidad: (updated || []).length, estado: "enviada" },
      });
  } catch (auditErr) {
    console.error("[ADMIN] Error en audit_log batch:", auditErr.message);
  }

  return success({
    actualizadas: (updated || []).length,
    notificaciones: updated,
  });
}

/**
 * 🧪 SOLO PARA TESTING: Generar notificaciones de prueba
 */
async function generarNotificacionesMock() {
  try {
    console.warn('🧪 Generando notificaciones de prueba...');
    
    // Obtener algunos usuarios existentes
    const { data: usuarios } = await supabase
      .from("usuarios")
      .select("id, nombre, apellido, telefono")
      .limit(10);

    if (!usuarios || usuarios.length === 0) {
      return errors('No hay usuarios para crear notificaciones de prueba', 400);
    }

    const tiposNotificacion = [
      'solicitud_recarga',
      'recarga_confirmada',
      'factura_vencida',
      'pago_registrado',
      'obligacion_activa',
      'notificacion_especial',
    ];

    const estados = ['pendiente', 'enviada'];
    const mockData = [];

    // Generar 30 notificaciones de prueba
    for (let i = 0; i < 30; i++) {
      const usuario = usuarios[i % usuarios.length];
      const tipo = tiposNotificacion[i % tiposNotificacion.length];
      const estado = estados[Math.floor(Math.random() * estados.length)];
      
      // Crear mensaje según tipo
      let mensajePayload = '';
      switch (tipo) {
        case 'solicitud_recarga':
          mensajePayload = `Solicitud de recarga por $${(Math.random() * 100000).toFixed(0)} recibida`;
          break;
        case 'recarga_confirmada':
          mensajePayload = `Tu recarga de $${(Math.random() * 100000).toFixed(0)} ha sido confirmada`;
          break;
        case 'factura_vencida':
          mensajePayload = `Tienes una factura vencida desde hace ${Math.floor(Math.random() * 30)} días`;
          break;
        case 'pago_registrado':
          mensajePayload = `Pago de $${(Math.random() * 100000).toFixed(0)} registrado correctamente`;
          break;
        case 'obligacion_activa':
          mensajePayload = `Tienes una obligación activa de ${Math.floor(Math.random() * 12)} cuotas`;
          break;
        default:
          mensajePayload = `Notificación especial para ${usuario.nombre}`;
      }

      mockData.push({
        usuario_id: usuario.id,
        tipo,
        estado,
        payload: { mensaje: mensajePayload },
        creado_en: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    // Insertar en la base de datos
    const { data: insertados, error } = await supabase
      .from("notificaciones")
      .insert(mockData)
      .select("*, usuarios(nombre, apellido, telefono)");

    if (error) {
      return errors(`Error insertando notificaciones mock: ${error.message}`, 500);
    }

    console.warn(`✅ ${insertados.length} notificaciones de prueba creadas`);

    return success({
      mensaje: `${insertados.length} notificaciones de prueba creadas exitosamente`,
      notificaciones: insertados,
    });
  } catch (err) {
    console.error('[ADMIN] Error generando mock:', err.message);
    return errors(`Error: ${err.message}`, 500);
  }
}

/**
 * Listar SOLO alertas del admin (notificaciones con tipo: 'alerta_admin')
 * Parámetros:
 *   - desde/hasta: filtro por fecha
 *   - page/limit: paginación
 */
async function listarAlertasAdmin(filters = {}) {
  const { desde, hasta, page = 1, limit = 20 } = filters;
  const offset = (page - 1) * limit;

  let query = supabase
    .from("notificaciones")
    .select("*", { count: "exact" })
    .eq("tipo", "alerta_admin")
    .order("creado_en", { ascending: false })
    .range(offset, offset + limit - 1);

  // Filtro por rango de fechas
  if (desde) {
    query = query.gte("creado_en", `${desde}T00:00:00Z`);
  }
  if (hasta) {
    query = query.lte("creado_en", `${hasta}T23:59:59Z`);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(`Error listando alertas: ${error.message}`);

  return success({
    alertas: data || [],
    total: count || 0,
    page,
    limit,
    total_pages: Math.ceil((count || 0) / limit),
  });
}

/**
 * Obtener la solicitud de recarga original que generó una alerta
 * Parámetros:
 *   - alerta_id: ID de la alerta
 */
async function obtenerSolicitudOriginal(alerta_id) {
  // 1. Obtener la alerta
  const { data: alerta, error: alertaError } = await supabase
    .from("notificaciones")
    .select("*")
    .eq("id", alerta_id)
    .eq("tipo", "alerta_admin")
    .single();

  if (alertaError || !alerta) {
    return errors("Alerta no encontrada", 404);
  }

  // 2. Obtener ID de la notificación de cobro original desde el payload
  const notificacion_cobro_id = alerta.payload?.notificacion_cobro_id;
  
  if (!notificacion_cobro_id) {
    return errors("No hay solicitud original asociada", 400);
  }

  // 3. Buscar la notificación de solicitud de recarga original
  const { data: solicitud, error: solicitudError } = await supabase
    .from("notificaciones")
    .select("*, usuarios(nombre, apellido, telefono)")
    .eq("id", notificacion_cobro_id)
    .in("tipo", ["solicitud_recarga", "solicitud_recarga_inicio_mes"])
    .single();

  if (solicitudError || !solicitud) {
    return errors("Solicitud de recarga original no encontrada", 404);
  }

  return success({
    alerta,
    solicitud_original: solicitud,
  });
}

/**
 * Listar SOLO notificaciones automáticas del BOT
 * (solicitud_recarga_inicio_mes, recordatorio_recarga, recarga_confirmada, etc.)
 */
async function listarNotificacionesAutomaticas(filters = {}) {
  const { desde, hasta, page = 1, limit = 20 } = filters;
  const offset = (page - 1) * limit;

  let query = supabase
    .from("notificaciones")
    .select("*, usuarios(nombre, apellido, telefono)", { count: "exact" })
    .in("tipo", [
      "solicitud_recarga_inicio_mes",
      "solicitud_recarga",
      "recarga_confirmada",
      "factura_validada",
      "recordatorio_recarga"
    ])
    .order("creado_en", { ascending: false })
    .range(offset, offset + limit - 1);

  // Filtro por rango de fechas
  if (desde) {
    query = query.gte("creado_en", `${desde}T00:00:00Z`);
  }
  if (hasta) {
    query = query.lte("creado_en", `${hasta}T23:59:59Z`);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(`Error listando notificaciones automáticas: ${error.message}`);

  return success({
    notificaciones: data || [],
    total: count || 0,
    page,
    limit,
    total_pages: Math.ceil((count || 0) / limit),
  });
}

/**
 * Listar todas las facturas con información del usuario
 * Usado para el panel de facturas (Timeline + Tabla)
 */
async function listarTodasLasFacturas({ estado, usuario_id, periodo, page = 1, limit = 50 } = {}) {
  try {
    let query = supabase
      .from("facturas")
      .select(`
        id,
        usuario_id,
        obligacion_id,
        servicio,
        monto,
        estado,
        periodo,
        fecha_vencimiento,
        fecha_emision,
        referencia_pago,
        archivo_url,
        etiqueta,
        creado_en,
        extraccion_estado,
        origen,
        motivo_rechazo,
        usuario:usuario_id(id, nombre, apellido, telefono, plan),
        obligaciones!obligacion_id(id, descripcion, numero_referencia, tipo_referencia)
      `, { count: "exact" })
      .order("fecha_vencimiento", { ascending: true, nullsFirst: true })
      .order("creado_en", { ascending: false });

    // Filtros
    if (estado) {
      if (estado === "pagada") {
        query = query.eq("estado", "pagada");
      } else if (estado === "pendiente") {
        // Pendientes = facturas validadas (no pagadas)
        query = query.eq("estado", "validada");
      } else if (estado === "sin_factura") {
        // Sin factura = sin validar (extraida) Y origen auto
        query = query.eq("estado", "extraida").eq("origen", "auto");
      } else if (estado === "sin_validar") {
        // Sin validar = sin validar (extraida) pero NO auto
        query = query.eq("estado", "extraida").neq("origen", "auto");
      } else {
        query = query.eq("estado", estado);
      }
    }

    if (usuario_id) query = query.eq("usuario_id", usuario_id);
    if (periodo) query = query.eq("periodo", periodo);

    // Paginación
    const offset = (page - 1) * limit;
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw new Error(`Error listando facturas: ${error.message}`);

    // Enriquecer datos con información adicional
    const facturasEnriquecidas = (data || []).map(f => ({
      id: f.id,
      factura_id: f.id,
      usuario_id: f.usuario_id,
      obligacion_id: f.obligacion_id,
      servicio: f.servicio,
      monto: f.monto,
      estado: f.estado,
      periodo: f.periodo,
      fecha_vencimiento: f.fecha_vencimiento,
      fecha_emision: f.fecha_emision,
      referencia_pago: f.referencia_pago,
      archivo_url: f.archivo_url,
      etiqueta: f.etiqueta,
      creado_en: f.creado_en,
      extraccion_estado: f.extraccion_estado,
      origen: f.origen,
      motivo_rechazo: f.motivo_rechazo,
      usuario: f.usuario ? {
        id: f.usuario.id,
        nombre: f.usuario.nombre,
        apellido: f.usuario.apellido,
        telefono: f.usuario.telefono,
        plan: f.usuario.plan
      } : null,
      obligacion: f.obligaciones ? {
        id: f.obligaciones.id,
        descripcion: f.obligaciones.descripcion,
        numero_referencia: f.obligaciones.numero_referencia,
        tipo_referencia: f.obligaciones.tipo_referencia
      } : null,
      usuario_nombre: f.usuario ? `${f.usuario.nombre} ${f.usuario.apellido}` : "Sin usuario",
      badge_color: f.estado === "pagada" ? "green" : f.estado === "validada" ? "blue" : f.estado === "rechazada" ? "red" : "gray"
    }));

    return success({
      facturas: facturasEnriquecidas,
      pagination: {
        page,
        limit,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / limit)
      }
    });
  } catch (err) {
    console.error("Error en listarTodasLasFacturas:", err.message);
    return errors(err.message, 500);
  }
}

/**
 * Obtener acciones pendientes por usuario (facturas y recargas directas)
 * Muestra facturas con estado 'extraida' o 'en_revision' y recargas con estado 'reportada' o 'en_validacion'
 * Se consulta directamente de las tablas, sin pasar por revisiones_admin (tabla obsoleta)
 */
async function obtenerNotificacionesAcciones(filters = {}) {
  const { usuario_id, tipo, page = 1, limit = 20 } = filters;

  try {
    // 1. Obtener facturas pendientes de validación
    let queryFacturas = supabase
      .from("facturas")
      .select(`
        id,
        usuario_id,
        servicio,
        monto,
        estado,
        periodo,
        creado_en,
        extraccion_estado,
        origen,
        usuarios(id, nombre, apellido, telefono)
      `)
      .in("estado", ["extraida", "en_revision"])
      .order("creado_en", { ascending: false });

    if (usuario_id) queryFacturas = queryFacturas.eq("usuario_id", usuario_id);
    if (tipo === "factura") queryFacturas = queryFacturas.select("*");

    const { data: facturas, error: facErr } = await queryFacturas;
    if (facErr) throw new Error(`Error obteniendo facturas: ${facErr.message}`);

    // 2. Obtener recargas pendientes de validación
    let queryRecargas = supabase
      .from("recargas")
      .select(`
        id,
        usuario_id,
        monto,
        estado,
        periodo,
        creado_en,
        comprobante_url,
        usuarios(id, nombre, apellido, telefono)
      `)
      .in("estado", ["reportada", "en_validacion"])
      .order("creado_en", { ascending: false });

    if (usuario_id) queryRecargas = queryRecargas.eq("usuario_id", usuario_id);
    if (tipo === "recarga") queryRecargas = queryRecargas.select("*");

    const { data: recargas, error: recErr } = await queryRecargas;
    if (recErr) throw new Error(`Error obteniendo recargas: ${recErr.message}`);

    // 3. Procesar y agrupar por usuario
    const accionesPorUsuario = {};

    // Procesar facturas
    for (const fac of facturas || []) {
      if (!fac.usuario_id) continue;

      const usuarioId = fac.usuario_id;
      if (!accionesPorUsuario[usuarioId]) {
        accionesPorUsuario[usuarioId] = {
          usuario_id: usuarioId,
          usuario: fac.usuarios,
          acciones: [],
          total: 0
        };
      }

      const accion = {
        id: fac.id,
        tipo: "factura",
        factura_id: fac.id,
        servicio: fac.servicio || "Sin servicio",
        monto: fac.monto,
        periodo: fac.periodo,
        estado: fac.estado,
        extraccion_estado: fac.extraccion_estado,
        origen: fac.origen,
        es_heredada: fac.origen === 'auto',
        creado_en: fac.creado_en,
        display_label: `📄 ${fac.servicio || 'Sin servicio'} - $${Number(fac.monto || 0).toLocaleString()}`
      };

      accionesPorUsuario[usuarioId].acciones.push(accion);
      accionesPorUsuario[usuarioId].total++;
    }

    // Procesar recargas
    for (const rec of recargas || []) {
      if (!rec.usuario_id) continue;

      const usuarioId = rec.usuario_id;
      if (!accionesPorUsuario[usuarioId]) {
        accionesPorUsuario[usuarioId] = {
          usuario_id: usuarioId,
          usuario: rec.usuarios,
          acciones: [],
          total: 0
        };
      }

      const accion = {
        id: rec.id,
        tipo: "recarga",
        recarga_id: rec.id,
        monto: rec.monto,
        periodo: rec.periodo,
        estado: rec.estado,
        comprobante_url: rec.comprobante_url,
        creado_en: rec.creado_en,
        display_label: `💳 Recarga - $${Number(rec.monto || 0).toLocaleString()}`
      };

      accionesPorUsuario[usuarioId].acciones.push(accion);
      accionesPorUsuario[usuarioId].total++;
    }

    // 4. Convertir a array y ordenar por último acontecimiento
    const accionesArray = Object.values(accionesPorUsuario)
      .sort((a, b) => {
        const ultimoA = new Date(a.acciones[0]?.creado_en || 0).getTime();
        const ultimoB = new Date(b.acciones[0]?.creado_en || 0).getTime();
        return ultimoB - ultimoA;
      });

    // 5. Paginar
    const totalUsuarios = accionesArray.length;
    const totalAcciones = (facturas?.length || 0) + (recargas?.length || 0);
    const paginadas = accionesArray.slice((page - 1) * limit, page * limit);

    return success({
      acciones_por_usuario: paginadas,
      total_usuarios: totalUsuarios,
      total_acciones: totalAcciones,
      page,
      limit,
      total_pages: Math.ceil(totalUsuarios / limit)
    });

  } catch (err) {
    console.error("Error en obtenerNotificacionesAcciones:", err.message);
    return errors(err.message, 500);
  }
}

/**
 * Historial unificado para el admin panel.
 * Une recargas, obligaciones, pagos y usuarios en una sola timeline.
 */
async function historialUnificado({ page = 1, limit = 8, tipo, usuario_id, desde, hasta }) {
  try {
    const fuentes = [];

    // ── 1. Recargas ──
    if (!tipo || tipo === "recarga") {
      let q = supabase
        .from("recargas")
        .select("id, creado_en, usuario_id, monto, referencia_tx, usuarios(nombre, apellido)");
      if (usuario_id) q = q.eq("usuario_id", usuario_id);
      if (desde) q = q.gte("creado_en", desde);
      if (hasta) q = q.lte("creado_en", hasta);
      const { data, error } = await q;
      if (error) throw new Error(`Error consultando recargas: ${error.message}`);
      (data || []).forEach((r) => {
        fuentes.push({
          id: r.id,
          tipo: "recarga",
          usuario_id: r.usuario_id,
          usuario_nombre: [r.usuarios?.nombre, r.usuarios?.apellido].filter(Boolean).join(" "),
          numero_referencia: r.referencia_tx || null,
          fecha: r.creado_en,
          monto: Number(r.monto || 0),
        });
      });
    }

    // ── 2. Obligaciones ──
    if (!tipo || tipo === "obligacion_agregada") {
      let q = supabase
        .from("obligaciones")
        .select("id, creado_en, usuario_id, monto_total, numero_referencia, usuarios(nombre, apellido)");
      if (usuario_id) q = q.eq("usuario_id", usuario_id);
      if (desde) q = q.gte("creado_en", desde);
      if (hasta) q = q.lte("creado_en", hasta);
      const { data, error } = await q;
      if (error) throw new Error(`Error consultando obligaciones: ${error.message}`);
      (data || []).forEach((o) => {
        fuentes.push({
          id: o.id,
          tipo: "obligacion_agregada",
          usuario_id: o.usuario_id,
          usuario_nombre: [o.usuarios?.nombre, o.usuarios?.apellido].filter(Boolean).join(" "),
          numero_referencia: o.numero_referencia || null,
          fecha: o.creado_en,
          monto: Number(o.monto_total || 0),
        });
      });
    }

    // ── 3. Pagos ──
    if (!tipo || tipo === "pago_factura") {
      let q = supabase
        .from("pagos")
        .select("id, creado_en, ejecutado_en, usuario_id, monto_aplicado, referencia_pago, usuarios(nombre, apellido)");
      if (usuario_id) q = q.eq("usuario_id", usuario_id);
      if (desde) q = q.gte("creado_en", desde);
      if (hasta) q = q.lte("creado_en", hasta);
      const { data, error } = await q;
      if (error) throw new Error(`Error consultando pagos: ${error.message}`);
      (data || []).forEach((p) => {
        fuentes.push({
          id: p.id,
          tipo: "pago_factura",
          usuario_id: p.usuario_id,
          usuario_nombre: [p.usuarios?.nombre, p.usuarios?.apellido].filter(Boolean).join(" "),
          numero_referencia: p.referencia_pago || null,
          fecha: p.ejecutado_en || p.creado_en,
          monto: Number(p.monto_aplicado || 0),
        });
      });
    }

    // ── 4. Usuarios creados ──
    if (!tipo || tipo === "usuario_creado") {
      let q = supabase
        .from("usuarios")
        .select("id, creado_en, nombre, apellido");
      if (usuario_id) q = q.eq("id", usuario_id);
      if (desde) q = q.gte("creado_en", desde);
      if (hasta) q = q.lte("creado_en", hasta);
      const { data, error } = await q;
      if (error) throw new Error(`Error consultando usuarios: ${error.message}`);
      (data || []).forEach((u) => {
        fuentes.push({
          id: u.id,
          tipo: "usuario_creado",
          usuario_id: u.id,
          usuario_nombre: [u.nombre, u.apellido].filter(Boolean).join(" "),
          numero_referencia: null,
          fecha: u.creado_en,
          monto: 0,
        });
      });
    }

    // ── Ordenar por fecha descendente ──
    fuentes.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    // ── Paginar ──
    const total = fuentes.length;
    const total_pages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const historial = fuentes.slice(offset, offset + limit);

    return success({ historial, total, page, limit, total_pages });
  } catch (err) {
    console.error("Error en historialUnificado:", err.message);
    return errors.internal(err.message);
  }
}

/**
 * Transacciones unificadas (pagos + recargas) para vista admin.
 */
async function listarTransacciones({ page = 1, limit = 8, tipo, usuario_id, search }) {
  try {
    const items = [];

    // ── 1. Pagos ──
    if (!tipo || tipo === "pago") {
      let q = supabase
        .from("pagos")
        .select("id, creado_en, ejecutado_en, usuario_id, monto_aplicado, proveedor_pago, referencia_pago, estado, facturas(servicio, obligacion_id, obligaciones(servicio, tipo_referencia, numero_referencia)), usuarios(nombre, apellido)");
      if (usuario_id) q = q.eq("usuario_id", usuario_id);
      const { data, error } = await q;
      if (error) throw new Error(`Error consultando pagos: ${error.message}`);
      (data || []).forEach((p) => {
        const obligacion = p.facturas?.obligaciones;
        const nombre = p.facturas?.servicio || obligacion?.servicio || null;
        const nombreCompleto = [p.usuarios?.nombre, p.usuarios?.apellido].filter(Boolean).join(" ");
        items.push({
          id: p.id,
          tipo: "pago",
          nombre: nombre,
          tipo_referencia: obligacion?.tipo_referencia || null,
          numero_referencia: obligacion?.numero_referencia || p.referencia_pago || null,
          fecha: p.ejecutado_en || p.creado_en,
          usuario_nombre: nombreCompleto,
          usuario_id: p.usuario_id,
          pagador: p.proveedor_pago || "deOne",
          monto: Number(p.monto_aplicado || 0),
        });
      });
    }

    // ── 2. Recargas ──
    if (!tipo || tipo === "recarga") {
      let q = supabase
        .from("recargas")
        .select("id, creado_en, usuario_id, monto, referencia_tx, estado, usuarios(nombre, apellido)");
      if (usuario_id) q = q.eq("usuario_id", usuario_id);
      const { data, error } = await q;
      if (error) throw new Error(`Error consultando recargas: ${error.message}`);
      (data || []).forEach((r) => {
        const nombreCompleto = [r.usuarios?.nombre, r.usuarios?.apellido].filter(Boolean).join(" ");
        items.push({
          id: r.id,
          tipo: "recarga",
          nombre: "Recarga",
          tipo_referencia: null,
          numero_referencia: r.referencia_tx || null,
          fecha: r.creado_en,
          usuario_nombre: nombreCompleto,
          usuario_id: r.usuario_id,
          pagador: null,
          monto: Number(r.monto || 0),
        });
      });
    }

    // ── Filtro por búsqueda ──
    let filtered = items;
    if (search) {
      const term = search.toLowerCase();
      filtered = items.filter((t) =>
        (t.usuario_nombre && t.usuario_nombre.toLowerCase().includes(term)) ||
        (t.nombre && t.nombre.toLowerCase().includes(term)) ||
        (t.numero_referencia && t.numero_referencia.toLowerCase().includes(term))
      );
    }

    // ── Ordenar por fecha descendente ──
    filtered.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    // ── Paginar ──
    const total = filtered.length;
    const total_pages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const transacciones = filtered.slice(offset, offset + limit);

    return success({ transacciones, total, page, limit, total_pages });
  } catch (err) {
    console.error("Error en listarTransacciones:", err.message);
    return errors.internal(err.message);
  }
}

module.exports = {
  listarClientes,
  perfilCompletoCliente,
  historialPagos,
  dashboard,
  upsertUsuarioAdmin,
  updateUsuarioAdmin,
  getUsuarioByTelefono,
  // Nuevas funciones para notificaciones
  listarNotificacionesAdmin,
  obtenerEstadisticasNotificaciones,
  obtenerNotificacionesCliente,
  marcarNotificacionEnviada,
  marcarNotificacionesEnviadasBatch,
  generarNotificacionesMock,
  // Funciones para alertas y automáticas
  listarAlertasAdmin,
  obtenerSolicitudOriginal,
  listarNotificacionesAutomaticas,
  // Funciones para acciones
  obtenerNotificacionesAcciones,
  // Funciones para facturas
  listarTodasLasFacturas,
  // Historial unificado
  historialUnificado,
  // Transacciones unificadas
  listarTransacciones,
};
