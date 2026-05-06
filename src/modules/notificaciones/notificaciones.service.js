// ===========================================
// Notificaciones - Service
// Usa la tabla 'notificaciones' existente en la DB
// Tipos: recarga_aprobada, recarga_rechazada,
//        obligacion_completada, pago_confirmado,
//        factura_validada, factura_rechazada,
//        nueva_obligacion, recordatorio_recarga
// ===========================================
const supabase = require("../../config/supabase");
const { success, errors } = require("../../utils/response");
const { resolverUsuarioPorTelefono } = require("../../utils/resolverUsuario");

/**
 * Crear una notificación para un usuario.
 */
async function crearNotificacion({ telefono, tipo, canal, destinatario, payload }) {
  const usuario = await resolverUsuarioPorTelefono(telefono);
  if (!usuario) return errors.notFound("Usuario no encontrado con ese teléfono");

  const { data, error } = await supabase
    .from("notificaciones")
    .insert({
      usuario_id: usuario.usuario_id,
      tipo,
      canal: canal || "whatsapp",
      payload: payload || {},
      estado: "pendiente",
    })
    .select()
    .single();

  if (error) throw new Error(`Error creando notificación: ${error.message}`);

  return success(data, 201);
}

/**
 * Crear notificación interna (desde otros servicios, sin resolver teléfono).
 * Recibe directamente usuario_id.
 */
async function crearNotificacionInterna({ usuario_id, tipo, canal, payload }) {
  const { data, error } = await supabase
    .from("notificaciones")
    .insert({
      usuario_id,
      tipo,
      canal: canal || "whatsapp",
      payload: payload || {},
      estado: "pendiente",
    })
    .select()
    .single();

  if (error) {
    console.error("[NOTIFICACIONES] Error creando notificación interna:", error.message);
    return null;
  }

  return data;
}

/**
 * Crear notificación masiva (a todos los usuarios activos, filtro opcional por plan).
 */
async function crearNotificacionMasiva({ tipo, canal, destinatario, payload, filtro_plan }) {
  let query = supabase
    .from("usuarios")
    .select("id")
    .eq("activo", true);

  if (filtro_plan) {
    query = query.eq("plan", filtro_plan);
  }

  const { data: usuarios, error: usrErr } = await query;
  if (usrErr) throw new Error(`Error buscando usuarios: ${usrErr.message}`);

  if (!usuarios || usuarios.length === 0) {
    return success({ total_enviadas: 0, mensaje: "No hay usuarios activos que coincidan con el filtro" });
  }

  const rows = usuarios.map(u => ({
    usuario_id: u.id,
    tipo,
    canal: canal || "whatsapp",
    payload: payload || {},
    estado: "pendiente",
  }));

  const { data, error } = await supabase
    .from("notificaciones")
    .insert(rows)
    .select("id");

  if (error) throw new Error(`Error creando notificaciones masivas: ${error.message}`);

  return success({ total_enviadas: (data || []).length }, 201);
}

/**
 * Listar notificaciones con filtros.
 */
async function listarNotificaciones({ telefono, tipo, estado, canal, canal_grupo, destinatario, limit, offset }) {
  const normalizarDestinatario = (n) => n?.destinatario || (n?.usuario_id ? "usuario" : "admin");

  let query = supabase
    .from("notificaciones")
    .select("*, usuarios(nombre, apellido, telefono)", { count: "exact" })
    .order("creado_en", { ascending: false })
    .range(offset, offset + limit - 1);

  if (telefono) {
    const usuario = await resolverUsuarioPorTelefono(telefono);
    if (!usuario) return errors.notFound("Usuario no encontrado con ese teléfono");
    query = query.eq("usuario_id", usuario.usuario_id);
  }
  if (tipo) query = query.eq("tipo", tipo);
  if (estado) query = query.eq("estado", estado);
  if (canal) query = query.eq("canal", canal);
  if (canal_grupo === "bot") query = query.in("canal", ["whatsapp", "telegram"]);
  if (canal_grupo === "admin") query = query.in("canal", ["admin", "interno", "sistema"]);
  if (destinatario) query = query.eq("destinatario", destinatario);

  const { data, error, count } = await query;
  if (error && error.message && error.message.includes("notificaciones.destinatario") && destinatario) {
    let legacyQuery = supabase
      .from("notificaciones")
      .select("*, usuarios(nombre, apellido, telefono)")
      .order("creado_en", { ascending: false });

    if (telefono) {
      const usuario = await resolverUsuarioPorTelefono(telefono);
      if (!usuario) return errors.notFound("Usuario no encontrado con ese teléfono");
      legacyQuery = legacyQuery.eq("usuario_id", usuario.usuario_id);
    }
    if (tipo) legacyQuery = legacyQuery.eq("tipo", tipo);
    if (estado) legacyQuery = legacyQuery.eq("estado", estado);
    if (canal) legacyQuery = legacyQuery.eq("canal", canal);
    if (canal_grupo === "bot") legacyQuery = legacyQuery.in("canal", ["whatsapp", "telegram"]);
    if (canal_grupo === "admin") legacyQuery = legacyQuery.in("canal", ["admin", "interno", "sistema"]);

    const { data: legacyData, error: legacyError } = await legacyQuery;
    if (legacyError) throw new Error(`Error listando notificaciones: ${legacyError.message}`);

    const filtradas = (legacyData || []).filter((n) => normalizarDestinatario(n) === destinatario);
    const paginadas = filtradas.slice(offset, offset + limit);
    return success({ notificaciones: paginadas, total: filtradas.length, limit, offset });
  }

  if (error) throw new Error(`Error listando notificaciones: ${error.message}`);

  return success({ notificaciones: data, total: count, limit, offset });
}

/**
 * Obtener notificaciones pendientes de un usuario (para el bot).
 * CHATBOT PASIVO: Al consultar, cambia automáticamente el estado a 'enviada'
 * para evitar duplicados si el chatbot se reinicia.
 */
async function obtenerPendientesUsuario(telefono) {
  const usuario = await resolverUsuarioPorTelefono(telefono);
  if (!usuario) return errors.notFound("Usuario no encontrado con ese teléfono");

  // 1. Obtener notificaciones pendientes (excluyendo alertas admin)
  const { data: pendientes, error: queryError } = await supabase
    .from("notificaciones")
    .select("*")
    .eq("usuario_id", usuario.usuario_id)
    .eq("estado", "pendiente")
    .not("tipo", "eq", "alerta_admin") // Excluir alertas de admin
    .order("creado_en", { ascending: true });

  if (queryError) throw new Error(`Error buscando notificaciones pendientes: ${queryError.message}`);

  // 2. Si hay notificaciones pendientes, cambiar estado a 'enviada' automáticamente
  if (pendientes && pendientes.length > 0) {
    const idsActualizar = pendientes.map(n => n.id);
    
    const { error: updateError } = await supabase
      .from("notificaciones")
      .update({ 
        estado: "enviada",
        ultimo_error: null // Limpiar errores previos
      })
      .in("id", idsActualizar);

    if (updateError) {
      console.error("[NOTIFICACIONES] Error cambiando estado a enviada:", updateError.message);
      // No fallamos, retornamos las notificaciones de todos modos
    } else {
      console.log(`[NOTIFICACIONES] ${idsActualizar.length} notificaciones marcadas como enviadas para usuario ${telefono}`);
    }
  }

  return success(pendientes || []);
}

/**
 * Obtener notificaciones pendientes de HOY para TODOS los usuarios (uso bot global).
 * CHATBOT PASIVO GLOBAL: Al consultar, cambia automáticamente el estado a 'enviada'
 * para evitar duplicados cuando múltiples workers/procesos consumen cola.
 */
async function obtenerPendientesHoyGlobal() {
  const ahora = new Date();
  const inicioDia = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate(), 0, 0, 0)).toISOString();
  const finDia = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate(), 23, 59, 59)).toISOString();

  const { data: pendientes, error: queryError } = await supabase
    .from("notificaciones")
    .select("*, usuarios(nombre, apellido, telefono)")
    .in("estado", ["pendiente", "entregada"])
    .eq("tipo", "solicitud_recarga_inicio_mes")
    .gte("creado_en", inicioDia)
    .lte("creado_en", finDia)
    .order("creado_en", { ascending: true });

  if (queryError) throw new Error(`Error buscando notificaciones pendientes de hoy: ${queryError.message}`);

  if (pendientes && pendientes.length > 0) {
    const idsActualizar = pendientes.map((notificacion) => notificacion.id);

    const { error: updateError } = await supabase
      .from("notificaciones")
      .update({
        estado: "entregada",
        ultimo_error: null,
      })
      .in("id", idsActualizar);

    if (updateError) {
      console.error("[NOTIFICACIONES] Error cambiando estado a entregada (global):", updateError.message);
    } else {
      console.log(`[NOTIFICACIONES] ${idsActualizar.length} notificaciones de hoy marcadas como entregadas (global)`);
    }
  }

  return success({
    total: (pendientes || []).length,
    notificaciones: pendientes || [],
  });
}

/**
 * Marcar notificación como enviada/fallida/leída.
 */
async function actualizarEstadoNotificacion(notificacionId, { estado, ultimo_error }) {
  const { data: existing, error: findErr } = await supabase
    .from("notificaciones")
    .select("*")
    .eq("id", notificacionId)
    .single();

  if (findErr || !existing) return errors.notFound("Notificación no encontrada");

  const updates = { estado };
  if (ultimo_error) updates.ultimo_error = ultimo_error;

  const { data, error } = await supabase
    .from("notificaciones")
    .update(updates)
    .eq("id", notificacionId)
    .select()
    .single();

  if (error) throw new Error(`Error actualizando notificación: ${error.message}`);

  return success(data);
}

/**
 * Marcar múltiples notificaciones como enviadas (batch).
 */
async function marcarEnviadasBatch(ids) {
  const { data, error } = await supabase
    .from("notificaciones")
    .update({ estado: "enviada" })
    .in("id", ids)
    .select("id");

  if (error) throw new Error(`Error marcando notificaciones: ${error.message}`);

  return success({ actualizadas: (data || []).length });
}

// ===========================================
// FUNCIONES DE NOTIFICACIÓN DE RECARGA
// ===========================================

/**
 * Obtiene el nombre del mes actual
 */
function getNombreMesActual() {
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const now = new Date();
  return `${meses[now.getUTCMonth()]} ${now.getUTCFullYear()}`;
}

/**
 * Obtiene el nombre del mes anterior
 */
function getNombreMesAnterior() {
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const now = new Date();
  const mesAnterior = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${meses[mesAnterior.getUTCMonth()]} ${mesAnterior.getUTCFullYear()}`;
}

/**
 * Verifica si ya existe una notificación del mismo tipo creada HOY
 * Usa count para mayor eficiencia
 */
async function existeNotificacionHoy(usuarioId, tipo) {
  const ahora = new Date();
  const inicioDia = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate(), 0, 0, 0)).toISOString();
  const finDia = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate(), 23, 59, 59)).toISOString();
  
  const { count, error } = await supabase
    .from('notificaciones')
    .select('*', { count: 'exact', head: true })
    .eq('usuario_id', usuarioId)
    .eq('tipo', tipo)
    .gte('creado_en', inicioDia)
    .lte('creado_en', finDia);
  
  if (error) {
    console.error("[NOTIFICACIONES] Error verificando notificación:", error.message);
    return false;
  }
  
  return (count || 0) > 0;
}

/**
 * Genera mensaje de SOLICITUD DE RECARGA (template unificado).
 * Uno de los 3 únicos mensajes que el bot envía al usuario.
 */
function generarMensajeSolicitudRecarga(datos) {
  const { nombre_usuario, saldo_actual, valor_a_recargar } = datos;
  const fmt = (v) => `$ ${Number(v || 0).toLocaleString('es-CO')}`;

  return `${nombre_usuario} 👋🏼

Es momento de recargar tu cuenta para cubrir tus próximas obligaciones 🙌🏼

Tu saldo actual en deOne es de ${fmt(saldo_actual)}

Valor a recargar: ${fmt(valor_a_recargar)}

Puedes hacer la recarga a la llave 0090944088.

Cuando la hagas, envíame el comprobante y yo me encargo del resto deOne 👍🏼`;
}

// Aliases por retrocompatibilidad: mismo template para inicio_mes / genérico / recordatorio.
function generarMensajeInicioMes(datos) { return generarMensajeSolicitudRecarga(datos); }
function generarMensajeGenerico(datos) { return generarMensajeSolicitudRecarga(datos); }

/**
 * Genera mensaje de RECARGA CONFIRMADA.
 * Uno de los 3 únicos mensajes que el bot envía al usuario.
 */
function generarMensajeConfirmada(datos) {
  const { nombre, saldo } = datos;
  const fmt = (v) => `$ ${Number(v || 0).toLocaleString('es-CO')}`;

  return `Recibido, ¡${nombre}! 🙌🏼
Ya registré tu recarga. Tu saldo disponible en deOne es de ${fmt(saldo)}

Te aviso cuando pague tus obligaciones.`;
}

/**
 * Genera mensaje de PAGO DE OBLIGACIÓN.
 * Uno de los 3 únicos mensajes que el bot envía al usuario.
 */
function generarMensajePagoObligacion(datos) {
  const { nombre, etiqueta, valor } = datos;
  const fmt = (v) => `$ ${Number(v || 0).toLocaleString('es-CO')}`;

  return `¡${nombre}! 🙌🏼
Ya hice el pago de @${etiqueta} por ${fmt(valor)}.

El comprobante ya quedó cargado en tu enlace habitual.`;
}

/**
 * Prepara datos completos para notificación de recarga
 * MODIFICADO: Ahora acepta usuario_id y periodo en lugar de obligacionId
 * para obtener TODAS las obligaciones del usuario en ese periodo
 */
async function prepararDatosNotificacion(usuarioId, periodo, esPrimeraRecarga) {
  // Importar funciones del módulo de solicitudes
  const solicitudesModule = require('../solicitudes-recarga/solicitudes-recarga.service');
  
  // Obtener datos del usuario
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('nombre')
    .eq('id', usuarioId)
    .single();
  
  if (!usuario) return null;
  
  // PASO 1: Obtener TODAS las obligaciones del usuario para este periodo
  const { data: obligacionesDelMes } = await supabase
    .from('obligaciones')
    .select('id')
    .eq('usuario_id', usuarioId)
    .eq('periodo', periodo);
  
  if (!obligacionesDelMes || obligacionesDelMes.length === 0) {
    console.log(`[NOTIFICACIONES] No hay obligaciones para usuario ${usuarioId} en periodo ${periodo}`);
    return null;
  }
  
  const obligacionIds = obligacionesDelMes.map(o => o.id);
  
  // PASO 2: Obtener TODAS las facturas de TODAS las obligaciones
  const { data: facturasDelMes } = await supabase
    .from('facturas')
    .select('id, servicio, etiqueta, monto, estado, validacion_estado')
    .in('obligacion_id', obligacionIds)
    .eq('validacion_estado', 'validada')
    .order('etiqueta', { ascending: true });
  
  if (!facturasDelMes || facturasDelMes.length === 0) {
    console.log(`[NOTIFICACIONES] No hay facturas validadas para usuario ${usuarioId} en periodo ${periodo}`);
    return null;
  }
  
  // PASO 3: Calcular totales acumulados de TODAS las facturas
  const total_obligaciones = facturasDelMes.reduce((sum, f) => sum + Number(f.monto || 0), 0);
  const saldo_actual = await solicitudesModule.calcularSaldoUsuario(usuarioId, periodo);
  const valor_a_recargar = Math.max(0, total_obligaciones - saldo_actual);
  
  // Obtener nombre del mes actual y anterior
  const mesActual = getNombreMesActual();
  const mesAnterior = getNombreMesAnterior();
  
  // Obtener total del mes anterior (pagos realizados SOLO del mes anterior)
  // Rango: desde primer día de mes anterior hasta primer día del mes actual
  const [year, month] = periodo.split('-').map(Number);
  const inicioMesAnterior = new Date(Date.UTC(year, month - 2, 1)).toISOString();
  const inicioMesActual = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  
  const { data: pagosMesAnterior } = await supabase
    .from('pagos')
    .select('monto_aplicado')
    .eq('usuario_id', usuarioId)
    .eq('estado', 'pagado')
    .gte('ejecutado_en', inicioMesAnterior)
    .lt('ejecutado_en', inicioMesActual);

  const totalMesAnterior = (pagosMesAnterior || []).reduce((sum, p) => {
    return sum + Number(p.monto_aplicado || 0);
  }, 0);
  
  // PASO 4: Preparar obligaciones - cada factura es una línea individual (sin agrupar)
  // Mostrar cada factura por separado, aunque sea del mismo servicio
  const obligaciones = facturasDelMes.map(factura => ({
    etiqueta: factura.etiqueta || factura.servicio || 'Servicio',
    monto: Number(factura.monto || 0)
  }));
  
  return {
    usuario_id: usuarioId,
    nombre_usuario: usuario?.nombre || 'Usuario',
    periodo: periodo,
    es_primera_recarga: esPrimeraRecarga,
    obligaciones: obligaciones,  // TODAS las obligaciones del mes
    total_obligaciones: total_obligaciones,  // TOTAL CORRECTO
    saldo_actual: saldo_actual,
    valor_a_recargar: valor_a_recargar,
    mes_actual: mesActual,
    mes_anterior: mesAnterior,
    total_mes_anterior: totalMesAnterior
  };
}

/**
 * Crea una notificación de recarga estructurada
 */
async function crearNotificacionRecarga(usuarioId, tipo, datos) {
  // Obtener datos del usuario
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('nombre')
    .eq('id', usuarioId)
    .single();
  
  const nombreUsuario = usuario?.nombre || 'Usuario';
  
  // Preparar payload estructurado
  const payload = {
    tipo_mensaje: tipo === 'solicitud_recarga_inicio_mes' ? 'inicio_mes' : (tipo === 'recarga_confirmada' ? 'confirmada' : 'generico'),
    nombre_usuario: nombreUsuario,
    mes_actual: datos.mes_actual || getNombreMesActual(),
    mes_anterior: datos.mes_anterior || getNombreMesAnterior(),
    obligaciones: datos.obligaciones || [],
    total_obligaciones: datos.total_obligaciones || 0,
    total_mes_anterior: datos.total_mes_anterior || 0,
    saldo_actual: datos.saldo_actual || 0,
    valor_a_recargar: datos.valor_a_recargar || 0,
    es_primera_recarga: datos.es_primera_recarga || false,
    periodo: datos.periodo,
    mensaje: ''
  };
  
  // Generar mensaje según tipo
  if (tipo === 'solicitud_recarga_inicio_mes') {
    payload.mensaje = generarMensajeInicioMes({
      nombre_usuario: nombreUsuario,
      mes_anterior: datos.mes_anterior || getNombreMesAnterior(),
      mes_actual: datos.mes_actual || getNombreMesActual(),
      obligaciones: datos.obligaciones || [],
      total_obligaciones: datos.total_obligaciones || 0,
      total_mes_anterior: datos.total_mes_anterior || 0,
      saldo_actual: datos.saldo_actual || 0,
      valor_a_recargar: datos.valor_a_recargar || 0
    });
  } else if (tipo === 'solicitud_recarga') {
    payload.mensaje = generarMensajeGenerico({
      nombre_usuario: nombreUsuario,
      obligaciones: datos.obligaciones || [],
      total_obligaciones: datos.total_obligaciones || 0,
      saldo_actual: datos.saldo_actual || 0,
      valor_a_recargar: datos.valor_a_recargar || 0
    });
  } else if (tipo === 'recarga_confirmada') {
    payload.mensaje = generarMensajeConfirmada({
      nombre: nombreUsuario,
      monto: datos.monto,
      saldo: datos.saldo
    });
  }
  
  // Crear notificación
  const notificacion = await crearNotificacionInterna({
    usuario_id: usuarioId,
    tipo: tipo,
    canal: 'whatsapp',
    payload: payload
  });
  
  return notificacion;
}

// ============================================================
// FUNCIONES DE ALERTAS AL ADMINISTRADOR
// ============================================================

/**
 * Crea una alerta para el administrador.
 * Se usa cuando un usuario no responde a una solicitud de cobro.
 * La notificación se crea con usuario_id: null para que el chatbot no la vea.
 */
async function crearAlertaAdmin(datos) {
  const {
    tipo_alerta,
    mensaje,
    usuario_id,
    usuario_nombre,
    usuario_telefono,
    notificacion_cobro_id,
    periodo,
    dias_sin_respuesta
  } = datos;

  // Crear notificación con usuario_id: null (el chatbot no la verá)
  const { data, error } = await supabase
    .from("notificaciones")
    .insert({
      usuario_id: null, // ⚠️ Clave: NO asociar a ningún usuario
      tipo: "alerta_admin",
      canal: "sistema",
      payload: {
        tipo_alerta: tipo_alerta || "usuario_sin_respuesta",
        mensaje: mensaje,
        usuario_id: usuario_id,
        usuario_nombre: usuario_nombre,
        usuario_telefono: usuario_telefono,
        notificacion_cobro_id: notificacion_cobro_id,
        periodo: periodo,
        dias_sin_respuesta: dias_sin_respuesta,
        fecha_deteccion: new Date().toISOString()
      },
      estado: "pendiente"
    })
    .select()
    .single();

  if (error) {
    console.error("[NOTIFICACIONES] Error creando alerta admin:", error.message);
    return null;
  }

  console.log(`[NOTIFICACIONES] Alerta admin creada: ${tipo_alerta} para usuario ${usuario_telefono}`);
  return data;
}

// ============================================================
// NOTIFICACIONES INTERNAS DE ADMIN (sin mensaje al usuario)
// ============================================================
// Estas notificaciones SOLO aparecen en el panel admin para acciones internas.
// NO tienen `mensaje` porque NO se envían al usuario.
// Identificación implícita: usuario_id=null + canal='sistema'.

/**
 * Notificación admin: una factura recién creada quedó en sin_validar
 * y necesita revisión interna del admin (validar/rechazar/aproximar).
 */
async function crearNotificacionAdminFacturaPorValidar({ factura, usuario }) {
  // Número de referencia mostrado en el panel admin: número factura > etiqueta > id corto.
  const numeroRef = factura.numero_factura || factura.etiqueta || (factura.id || '').toString().slice(0, 8);
  const { data, error } = await supabase
    .from("notificaciones")
    .insert({
      usuario_id: null,
      tipo: "factura_por_validar",
      canal: "sistema",
      payload: {
        tipo_accion: "validar_factura",
        factura_id: factura.id,
        usuario_id: usuario?.id || factura.usuario_id,
        usuario_nombre: usuario?.nombre || null,
        usuario_telefono: usuario?.telefono || null,
        servicio: factura.servicio,
        etiqueta: factura.etiqueta,
        numero_ref: numeroRef,
        periodo: factura.periodo,
        monto: factura.monto,
        validacion_estado: factura.validacion_estado || "sin_validar",
        creada_en: new Date().toISOString(),
      },
      estado: "sin_revisar",
    })
    .select()
    .single();

  if (error) {
    console.error("[NOTIFICACIONES] Error creando notificación admin (factura_por_validar):", error.message);
    return null;
  }

  console.log(`[NOTIFICACIONES] Notificación admin creada: factura_por_validar (factura_id=${factura.id})`);
  return data;
}

/**
 * Notificación admin: una recarga fue reportada por el usuario
 * y queda en en_validacion para que el admin apruebe o rechace.
 */
async function crearNotificacionAdminRecargaPorValidar({ recarga, usuario }) {
  const numeroRef = recarga.referencia_pago || recarga.numero_ref || (recarga.id || '').toString().slice(0, 8);
  const { data, error } = await supabase
    .from("notificaciones")
    .insert({
      usuario_id: null,
      tipo: "recarga_por_validar",
      canal: "sistema",
      payload: {
        tipo_accion: "validar_recarga",
        recarga_id: recarga.id,
        usuario_id: usuario?.usuario_id || usuario?.id || recarga.usuario_id,
        usuario_nombre: usuario?.nombre || null,
        usuario_telefono: usuario?.telefono || null,
        numero_ref: numeroRef,
        monto: recarga.monto,
        periodo: recarga.periodo,
        comprobante_url: recarga.comprobante_url || null,
        estado_recarga: recarga.estado || "en_validacion",
        creada_en: new Date().toISOString(),
      },
      estado: "sin_revisar",
    })
    .select()
    .single();

  if (error) {
    console.error("[NOTIFICACIONES] Error creando notificación admin (recarga_por_validar):", error.message);
    return null;
  }

  console.log(`[NOTIFICACIONES] Notificación admin creada: recarga_por_validar (recarga_id=${recarga.id})`);
  return data;
}

/**
 * Job: Verificar usuarios sin respuesta
 * Se ejecuta cada 6 horas para detectar usuarios que recibieron
 * notificaciones de cobro pero no han respondido en 24 horas.
 */
async function jobVerificarInactividad() {
  console.log("[JOBS] ════════════════════════════════════════");
  console.log("[JOBS] INICIANDO VERIFICACIÓN DE INACTIVIDAD");
  console.log("[JOBS] ════════════════════════════════════════");

  // Calcular rango de tiempo: entre 24h y 48h atrás
  const ahora = new Date();
  const hace24h = new Date(ahora.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const hace48h = new Date(ahora.getTime() - 48 * 60 * 60 * 1000).toISOString();

  try {
    // 1. Buscar notificaciones de cobro enviadas hace 24-48 horas
    const { data: notificaciones, error } = await supabase
      .from('notificaciones')
      .select('id, usuario_id, tipo, estado, creado_en, payload')
      .in('tipo', ['solicitud_recarga', 'solicitud_recarga_inicio_mes'])
      .eq('estado', 'enviada')
      .gte('creado_en', hace48h)
      .lte('creado_en', hace24h);

    if (error) throw new Error(`Error consultando notificaciones: ${error.message}`);

    console.log(`[JOBS] ${notificaciones?.length || 0} notificaciones de cobro enviadas hace 24-48h`);

    let alertasCreadas = 0;

    // 2. Para cada notificación, verificar si hay recarga después
    for (const notif of (notificaciones || [])) {
      // Verificar si ya se creó una alerta para esta notificación
      const { data: alertaExistente } = await supabase
        .from('notificaciones')
        .select('id')
        .eq('tipo', 'alerta_admin')
        .eq('estado', 'pendiente')
        .contains('payload', { notificacion_cobro_id: notif.id })
        .limit(1)
        .single();

      if (alertaExistente) {
        console.log(`[JOBS] Ya existe alerta para notificación ${notif.id}, omitiendo`);
        continue;
      }

      // Buscar recargas después de la notificación
      const { data: recargas } = await supabase
        .from('recargas')
        .select('id, estado')
        .eq('usuario_id', notif.usuario_id)
        .gt('creado_en', notif.creado_en)
        .in('estado', ['en_validacion', 'aprobada'])
        .limit(1);

      // Si NO hay recarga → crear alerta
      if (!recargas || recargas.length === 0) {
        // Obtener datos del usuario
        const { data: usuario } = await supabase
          .from('usuarios')
          .select('nombre, telefono')
          .eq('id', notif.usuario_id)
          .single();

        await crearAlertaAdmin({
          tipo_alerta: 'usuario_sin_respuesta',
          mensaje: `El usuario ${usuario?.nombre || 'Desconocido'} (${usuario?.telefono || 'N/A'}) no ha respondido a la solicitud de recarga hace más de 24 horas.`,
          usuario_id: notif.usuario_id,
          usuario_nombre: usuario?.nombre,
          usuario_telefono: usuario?.telefono,
          notificacion_cobro_id: notif.id,
          periodo: notif.payload?.periodo,
          dias_sin_respuesta: 1
        });

        alertasCreadas++;
      }
    }

    console.log(`[JOBS] ════════════════════════════════════════`);
    console.log(`[JOBS] RESUMEN VERIFICACIÓN INACTIVIDAD:`);
    console.log(`[JOBS] - Notificaciones procesadas: ${notificaciones?.length || 0}`);
    console.log(`[JOBS] - Alertas creadas: ${alertasCreadas}`);
    console.log(`[JOBS] ════════════════════════════════════════`);

    return {
      notificaciones_procesadas: notificaciones?.length || 0,
      alertas_creadas: alertasCreadas
    };

  } catch (err) {
    console.error("[JOBS] Error en jobVerificarInactividad:", err.message);
    throw err;
  }
}

/**
 * Obtiene las alertas pendientes para el admin
 */
async function obtenerAlertasAdmin() {
  const { data, error } = await supabase
    .from("notificaciones")
    .select("*")
    .eq("tipo", "alerta_admin")
    .eq("estado", "pendiente")
    .order("creado_en", { ascending: false });

  if (error) throw new Error(`Error obteniendo alertas: ${error.message}`);

  return success(data || []);
}

/**
 * Eliminar una notificación por ID (admin).
 */
async function eliminarNotificacion(id) {
  const { error } = await supabase
    .from("notificaciones")
    .delete()
    .eq("id", id);

  if (error) throw new Error(`Error eliminando notificación: ${error.message}`);

  return success({ eliminada: true, id });
}

/**
 * Eliminar múltiples notificaciones (batch, admin).
 */
async function eliminarNotificacionesBatch(ids) {
  if (!ids || ids.length === 0) return success({ eliminadas: 0 });

  const { error } = await supabase
    .from("notificaciones")
    .delete()
    .in("id", ids);

  if (error) throw new Error(`Error eliminando notificaciones: ${error.message}`);

  return success({ eliminadas: ids.length });
}

module.exports = {
  crearNotificacion,
  crearNotificacionInterna,
  crearNotificacionMasiva,
  listarNotificaciones,
  obtenerPendientesUsuario,
  obtenerPendientesHoyGlobal,
  actualizarEstadoNotificacion,
  marcarEnviadasBatch,
  eliminarNotificacion,
  eliminarNotificacionesBatch,
  // Nuevas funciones para el flujo de recargas
  crearNotificacionRecarga,
  generarMensajeInicioMes,
  generarMensajeGenerico,
  generarMensajeConfirmada,
  generarMensajeSolicitudRecarga,
  generarMensajePagoObligacion,
  prepararDatosNotificacion,
  existeNotificacionHoy,
  // Funciones de alertas admin
  crearAlertaAdmin,
  jobVerificarInactividad,
  obtenerAlertasAdmin,
  // Notificaciones internas admin (sin mensaje al usuario)
  crearNotificacionAdminFacturaPorValidar,
  crearNotificacionAdminRecargaPorValidar
};
