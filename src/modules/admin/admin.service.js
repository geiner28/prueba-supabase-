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

  // Ejecutar primero: recargas y facturas (para después filtrar pagos)
  const [
    { data: recargasData },
    { data: facturasNoPagadas },
    { data: todasLasFacturas },
  ] = await Promise.all([
    recargasQuery,
    facturasNoPageQuery,
    todasFacturasQuery,
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

  // Métrica 3: Saldo Disponible (recargas - pagos)
  const saldoDisponible = totalRecargasAprobadas - totalPagado;

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

  // 5.1 Distribución de Saldo por Usuarios (TODOS con saldo > 0, ordenados descendente)
  const saldoPorUsuario = {};

  for (const usuario of usuarios || []) {
    const sumaRecargas = (recargasData || [])
      .filter((r) => r.usuario_id === usuario.id)
      .reduce((sum, r) => sum + Number(r.monto || 0), 0);

    const sumaPagos = (pagosData || [])
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

module.exports = {
  listarClientes,
  perfilCompletoCliente,
  historialPagos,
  dashboard,
  upsertUsuarioAdmin,
};
