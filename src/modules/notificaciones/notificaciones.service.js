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
async function crearNotificacion({ telefono, tipo, canal, payload }) {
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
async function crearNotificacionMasiva({ tipo, canal, payload, filtro_plan }) {
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
async function listarNotificaciones({ telefono, tipo, estado, limit, offset }) {
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

  const { data, error, count } = await query;
  if (error) throw new Error(`Error listando notificaciones: ${error.message}`);

  return success({ notificaciones: data, total: count, limit, offset });
}

/**
 * Obtener notificaciones pendientes de un usuario (para el bot).
 */
async function obtenerPendientesUsuario(telefono) {
  const usuario = await resolverUsuarioPorTelefono(telefono);
  if (!usuario) return errors.notFound("Usuario no encontrado con ese teléfono");

  const { data, error } = await supabase
    .from("notificaciones")
    .select("*")
    .eq("usuario_id", usuario.usuario_id)
    .eq("estado", "pendiente")
    .order("creado_en", { ascending: true });

  if (error) throw new Error(`Error buscando notificaciones pendientes: ${error.message}`);

  return success(data);
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
  return `${meses[now.getMonth()]} ${now.getFullYear()}`;
}

/**
 * Obtiene el nombre del mes anterior
 */
function getNombreMesAnterior() {
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const now = new Date();
  const mesAnterior = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${meses[mesAnterior.getMonth()]} ${mesAnterior.getFullYear()}`;
}

/**
 * Verifica si ya existe una notificación del mismo tipo creada HOY
 * Usa count para mayor eficiencia
 */
async function existeNotificacionHoy(usuarioId, tipo) {
  const ahora = new Date();
  const inicioDia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 0, 0, 0).toISOString();
  const finDia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 23, 59, 59).toISOString();
  
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
 * Genera mensaje de INICIO DE MES
 * Template exacto según especificación
 */
function generarMensajeInicioMes(datos) {
  const {
    nombre_usuario,
    mes_anterior,
    mes_actual,
    obligaciones,
    total_obligaciones,
    saldo_actual,
    valor_a_recargar
  } = datos;
  
  const fmtMonto = (v) => Number(v).toLocaleString('es-CO');
  
  let listaobligaciones = '';
  for (const obl of obligaciones) {
    listaobligaciones += `"@${obl.etiqueta}": "$ ${fmtMonto(obl.monto)}".\n`;
  }
  
  const mensaje = `Hola ${nombre_usuario} ✌🏼
Arrancamos mes!

En ${mes_anterior} pagaste "$ ${fmtMonto(total_obligaciones)}" y tienes un saldo de "$ ${fmtMonto(saldo_actual)}"

Para ${mes_actual}, tus obligaciones suman "$ ${fmtMonto(total_obligaciones)}", así:

${listaobligaciones}
La recarga total sugerida para ${mes_actual} es de "$ ${fmtMonto(valor_a_recargar)}".

Puedes hacer la recarga a la llave 0090944088.

Apenas la hagas, me envías el comprobante y yo me encargo del resto deOne! 🙌🏼`;
  
  return mensaje;
}

/**
 * Genera mensaje GENÉRICO
 * Template exacto según especificación
 */
function generarMensajeGenerico(datos) {
  const {
    nombre_usuario,
    obligaciones,
    total_obligaciones,
    saldo_actual,
    valor_a_recargar
  } = datos;
  
  const fmtMonto = (v) => Number(v).toLocaleString('es-CO');
  
  let listaobligaciones = '';
  for (const obl of obligaciones) {
    listaobligaciones += `"@${obl.etiqueta}": "$ ${fmtMonto(obl.monto)}".\n`;
  }
  
  const mensaje = `Hola ${nombre_usuario}! 👋🏼
Ya estamos listos para recibir tu recarga, con la que cubriremos:
${listaobligaciones}
Total: "$ ${fmtMonto(total_obligaciones)}"
Aplicamos tu saldo: "$ ${fmtMonto(saldo_actual)}"

Total a recargar: "$ ${fmtMonto(valor_a_recargar)}".
Puedes hacer la recarga a la llave 0090944088.

Apenas la hagas, me envías el comprobante y yo me encargo del resto deOne! 🙌🏼`;
  
  return mensaje;
}

/**
 * Genera mensaje de RECARGA CONFIRMADA
 */
function generarMensajeConfirmada(datos) {
  const { nombre, saldo } = datos;
  
  const fmtSaldo = (v) => Number(v).toLocaleString('es-CO');
  
  const mensaje = `Recibido, ${nombre} ✌🏼

Ya registré tu recarga. Tu saldo disponible en deOne es de $ ${fmtSaldo(saldo)}`;
  
  return mensaje;
}

/**
 * Prepara datos completos para notificación de recarga
 */
async function prepararDatosNotificacion(obligacionId, esPrimeraRecarga) {
  // Importar funciones del módulo de solicitudes
  const solicitudesModule = require('../solicitudes-recarga/solicitudes-recarga.service');
  
  // Obtener obligación con usuario
  const obligacion = await solicitudesModule.obtenerObligacionConUsuario(obligacionId);
  if (!obligacion) return null;
  
  // Obtener facturas
  const facturas = await solicitudesModule.obtenerFacturasValidadas(obligacionId);
  
  // Calcular totales
  const total_obligaciones = facturas.reduce((sum, f) => sum + Number(f.monto || 0), 0);
  const saldo_actual = await solicitudesModule.calcularSaldoUsuario(obligacion.usuario_id, obligacion.periodo);
  const valor_a_recargar = Math.max(0, total_obligaciones - saldo_actual);
  
  // Obtener nombre del mes actual y anterior
  const mesActual = getNombreMesActual();
  const mesAnterior = getNombreMesAnterior();
  
  // Obtener datos del usuario para nombre
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('nombre')
    .eq('id', obligacion.usuario_id)
    .single();
  
  // Obtener total del mes anterior (pagos realizados)
  const { data: pagosMesAnterior } = await supabase
    .from('pagos')
    .select('monto_aplicado')
    .eq('usuario_id', obligacion.usuario_id)
    .eq('estado', 'pagado');
  
  const totalMesAnterior = (pagosMesAnterior || []).reduce((sum, p) => sum + Number(p.monto_aplicado || 0), 0);
  
  // Preparar obligaciones con etiqueta
  const obligaciones = facturas.map(f => ({
    etiqueta: f.servicio || 'Servicio',
    monto: Number(f.monto || 0)
  }));
  
  return {
    obligacion_id: obligacionId,
    usuario_id: obligacion.usuario_id,
    nombre_usuario: usuario?.nombre || 'Usuario',
    periodo: obligacion.periodo,
    es_primera_recarga: esPrimeraRecarga,
    obligaciones: obligaciones,
    total_obligaciones: total_obligaciones,
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
    saldo_actual: datos.saldo_actual || 0,
    valor_a_recargar: datos.valor_a_recargar || 0,
    es_primera_recarga: datos.es_primera_recarga || false,
    obligacion_id: datos.obligacion_id,
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

module.exports = {
  crearNotificacion,
  crearNotificacionInterna,
  crearNotificacionMasiva,
  listarNotificaciones,
  obtenerPendientesUsuario,
  actualizarEstadoNotificacion,
  marcarEnviadasBatch,
  // Nuevas funciones para el flujo de recargas
  crearNotificacionRecarga,
  generarMensajeInicioMes,
  generarMensajeGenerico,
  generarMensajeConfirmada,
  prepararDatosNotificacion,
  existeNotificacionHoy,
};
