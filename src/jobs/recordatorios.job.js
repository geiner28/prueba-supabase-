// ===========================================
// Jobs - Recordatorios Automáticos
// Tareas programadas para verificar y enviar recordatorios
// ===========================================

// Intentar importar node-cron, si no está instalado, el job no se ejecutará
let cron;
try {
  cron = require("node-cron");
} catch (e) {
  console.warn("[JOBS] node-cron no está instalado. Los jobs no se ejecutarán automáticamente.");
  console.warn("[JOBS] Para habilitar, ejecutar: npm install node-cron");
  cron = null;
}

// Variable global para prevenir ejecución concurrente del job
let isJobRunning = false;

const supabase = require("../config/supabase");

// Importar funciones del módulo de solicitudes
const { 
  evaluarObligacion,
  obtenerObligacionesActivas,
  detectarPrimeraRecargaDelMes,
  obtenerFacturasValidadas,
  calcularSaldoUsuario
} = require("../modules/solicitudes-recarga/solicitudes-recarga.service");

// Importar funciones de notificaciones
const {
  crearNotificacionRecarga,
  prepararDatosNotificacion,
  existeNotificacionHoy
} = require("../modules/notificaciones/notificaciones.service");

/**
 * JOB PRINCIPAL: jobEvaluacionRecargas
 * Se ejecuta todos los días a las 9:00 AM
 * Orchestras la evaluación de todas las obligaciones
 */
async function jobEvaluacionRecargas() {
  // Verificar si ya hay una ejecución en curso
  if (isJobRunning) {
    console.log("[JOBS] ⚠️ Job ya está en ejecución. Omitiendo esta ejecución.");
    return { skipped: true, motivo: "ejecucion_concurrente" };
  }
  
  // Marcar como en ejecución
  isJobRunning = true;
  
  console.log("[JOBS] ════════════════════════════════════════");
  console.log("[JOBS] INICIANDO EVALUACIÓN DE RECARGAS - 9:00 AM");
  console.log("[JOBS] ════════════════════════════════════════");
  
  const hoy = new Date().toISOString().split('T')[0];
  console.log(`[JOBS] Fecha de ejecución: ${hoy}`);
  
  try {
    // Paso 1: Obtener obligaciones activas
    console.log("[JOBS] Obteniendo obligaciones activas...");
    const obligaciones = await obtenerObligacionesActivas();
    console.log(`[JOBS] ${obligaciones.length} obligaciones activas encontradas`);
    
    let procesadas = 0;
    let notificacionesCreadas = 0;
    let errores = 0;
    
    // Paso 2: Evaluar cada obligación
    for (const obligacion of obligaciones) {
      try {
        console.log(`[JOBS] Procesando obligación: ${obligacion.id}`);
        
        // 2.1: Evaluar y crear/actualizar solicitud de recarga
        const resultado = await evaluarObligacion(obligacion.id);
        
        // 2.2: Si hay resultado con solicitud cargada, crear notificación
        if (resultado && resultado.solicitudCargada) {
          
          // 2.3: Detectar si es primera recarga del mes
          const esPrimeraRecarga = await detectarPrimeraRecargaDelMes(resultado.usuarioId);
          
          // 2.4: Determinar tipo de notificación
          const tipoNotificacion = esPrimeraRecarga 
            ? 'solicitud_recarga_inicio_mes' 
            : 'solicitud_recarga';
          
          console.log(`[JOBS] Es primera recarga del mes: ${esPrimeraRecarga}, tipo: ${tipoNotificacion}`);
          
          // 2.5: Verificar si ya se envió notificación hoy (prevenir duplicados)
          const yaEnviadaHoy = await existeNotificacionHoy(
            resultado.usuarioId, 
            tipoNotificacion
          );
          
          if (!yaEnviadaHoy) {
            // 2.6: Preparar datos y crear notificación estructurada
            const datos = await prepararDatosNotificacion(
              resultado.obligacionId, 
              esPrimeraRecarga
            );
            
            if (datos) {
              await crearNotificacionRecarga(
                resultado.usuarioId,
                tipoNotificacion,
                datos
              );
              notificacionesCreadas++;
              console.log(`[JOBS] Notificación creada: ${tipoNotificacion}`);
            }
          } else {
            console.log(`[JOBS] Notificación ya enviada hoy para usuario ${resultado.usuarioId}, omitiendo`);
          }
        } else if (resultado && resultado.skipped) {
          console.log(`[JOBS] Obligación ${obligacion.id}: saltada (fecha recordatorio no llegada)`);
        } else if (resultado && resultado.cumple) {
          console.log(`[JOBS] Obligación ${obligacion.id}: cumple (saldo suficiente)`);
        }
        
        procesadas++;
        
      } catch (err) {
        console.error(`[JOBS] Error procesando obligación ${obligacion.id}:`, err.message);
        errores++;
      }
    }
    
    console.log(`[JOBS] ════════════════════════════════════════`);
    console.log(`[JOBS] RESUMEN:`);
    console.log(`[JOBS] - Obligaciones procesadas: ${procesadas}`);
    console.log(`[JOBS] - Notificaciones creadas: ${notificacionesCreadas}`);
    console.log(`[JOBS] - Errores: ${errores}`);
    console.log(`[JOBS] ════════════════════════════════════════`);
    
    return {
      obligacionesProcesadas: procesadas,
      notificacionesCreadas: notificacionesCreadas,
      errores: errores
    };
    
  } catch (error) {
    console.error("[JOBS] Error en jobEvaluacionRecargas:", error.message);
    throw error;
  } finally {
    // Liberar el lock al terminar (éxito o error)
    isJobRunning = false;
    console.log("[JOBS] Lock de job liberado");
  }
}

/**
 * Job principal: Recalcula solicitudes y luego verifica recordatorios.
 * Este es el flujo recomendado:
 * 1. Recalcular todas las solicitudes para asegurar datos actualizados
 * 2. Verificar y enviar recordatorios según las fechas
 */
async function jobRecordatoriosCompleto() {
  console.log("[JOBS] ===========================================");
  console.log("[JOBS] Iniciando job de recordatorios completo...");
  console.log("[JOBS] ===========================================");

  try {
    // Paso 1: Recalcular solicitudes existentes
    console.log("[JOBS] Paso 1: Recalculando solicitudes de recarga...");
    const resultadoRecalculo = await recalcularTodasSolicitudes();
    console.log(`[JOBS] Recalculo completado: ${resultadoRecalculo.obligacionesProcesadas} obligaciones procesadas`);

    // Paso 2: Verificar y enviar recordatorios
    console.log("[JOBS] Paso 2: Verificando recordatorios...");
    const resultadoRecordatorios = await verificarRecordatoriosGlobal();
    console.log(`[JOBS] Recordatorios verificados: ${resultadoRecordatorios?.notificaciones_enviadas || 0} notificaciones enviadas`);

    console.log("[JOBS] ===========================================");
    console.log("[JOBS] Job de recordatorios completado exitosamente");
    console.log("[JOBS] ===========================================");

    return {
      recalculo: resultadoRecalculo,
      recordatorios: resultadoRecordatorios,
    };
  } catch (error) {
    console.error("[JOBS] Error en job de recordatorios:", error.message);
    throw error;
  }
}

/**
 * Recalcula todas las solicitudes de recarga activas.
 * Itera sobre todas las obligaciones con solicitudes pendientes/parciales.
 */
async function recalcularTodasSolicitudes() {
  // Obtener obligaciones únicas con solicitudes activas
  const { data: solicitudes, error } = await supabase
    .from("solicitudes_recarga")
    .select("obligacion_id")
    .in("estado", ["pendiente", "parcial"]);

  if (error) {
    console.error("[JOBS] Error obteniendo solicitudes para recalculo:", error.message);
    return { obligacionesProcesadas: 0, errores: 1 };
  }

  // Obtener obligaciones únicas
  const obligacionesUnicas = [...new Set((solicitudes || []).map(s => s.obligacion_id))];
  console.log(`[JOBS] Encontradas ${obligacionesUnicas.length} obligaciones con solicitudes activas`);

  let procesadas = 0;
  let errores = 0;

  for (const obligacionId of obligacionesUnicas) {
    try {
      // Importar la función de recalcular
      const { recalcularSolicitudesPorObligacion } = require("../modules/solicitudes-recarga/solicitudes-recarga.service");
      const resultado = await recalcularSolicitudesPorObligacion(obligacionId);
      if (resultado) {
        procesadas++;
      }
    } catch (err) {
      console.error(`[JOBS] Error recalculando obligación ${obligacionId}:`, err.message);
      errores++;
    }
  }

  return { obligacionesProcesadas: procesadas, errores };
}

// Importar función de verificación global (recalcular)
const { verificarRecordatoriosGlobal } = require("../modules/solicitudes-recarga/solicitudes-recarga.service");

// Importar job de alertas inactividad
const { jobVerificarInactividad } = require("../modules/notificaciones/notificaciones.service");

/**
 * Inicializa los jobs programados.
 * Debe llamarse al iniciar el servidor.
 */
function initJobs() {
  if (!cron) {
    console.log("[JOBS] Jobs deshabilitados - node-cron no está instalado");
    return;
  }

  console.log("[JOBS] Inicializando jobs programados...");

  // JOB 1: Evaluación de recargas (9:00 AM) - NUEVO
  const jobRecargas = cron.schedule("0 9 * * *", async () => {
    console.log("[JOBS] ════════════════════════════════════════");
    console.log("[JOBS] EJECUTANDO JOB DE RECARGAS - 9:00 AM");
    console.log("[JOBS] ════════════════════════════════════════");
    try {
      const result = await jobEvaluacionRecargas();
      console.log("[JOBS] Resultado del job:", JSON.stringify(result, null, 2));
    } catch (error) {
      console.error("[JOBS] Error en job de recargas:", error.message);
    }
  });

  // JOB 2: Verificar usuarios sin respuesta (cada 6 horas)
  const jobInactividad = cron.schedule("0 */6 * * *", async () => {
    console.log("[JOBS] ════════════════════════════════════════");
    console.log("[JOBS] EJECUTANDO JOB DE INACTIVIDAD - CADA 6 HORAS");
    console.log("[JOBS] ════════════════════════════════════════");
    try {
      const result = await jobVerificarInactividad();
      console.log("[JOBS] Resultado del job de inactividad:", JSON.stringify(result, null, 2));
    } catch (error) {
      console.error("[JOBS] Error en job de inactividad:", error.message);
    }
  });

  // JOB 3: Recordatorios (opcional, mantener existente)
  // Este job ya no es necesario ya que jobEvaluacionRecargas hace todo
  // Se mantiene por compatibilidad si hay lógica adicional

  console.log("[JOBS] ✓ Job de evaluación de recargas programado para 9:00 AM");
  console.log("[JOBS] ✓ Job de inactividad programado cada 6 horas");
  console.log("[JOBS] ✓ El job evaluará obligaciones, calculará montos y creará notificaciones");
  console.log("[JOBS] Jobs inicializados correctamente");

  return {
    jobRecargas,
    jobInactividad,
    jobRecordatorios: jobRecargas, // Alias para compatibilidad
    stopAll: () => {
      jobRecargas.stop();
      jobInactividad.stop();
      console.log("[JOBS] Todos los jobs detenido");
    },
  };
}

/**
 * Ejecuta manualmente el job de evaluación de recargas (para pruebas).
 */
async function runJobManually() {
  console.log("[JOBS] ════════════════════════════════════════");
  console.log("[JOBS] EJECUTANDO JOB MANUAL DE RECARGAS");
  console.log("[JOBS] ════════════════════════════════════════");
  return await jobEvaluacionRecargas();
}

/**
 * Ejecuta manualmente el job completo (para pruebas).
 */
async function runJobCompletoManually() {
  console.log("[JOBS] ════════════════════════════════════════");
  console.log("[JOBS] EJECUTANDO JOB COMPLETO MANUAL");
  console.log("[JOBS] ════════════════════════════════════════");
  return await jobRecordatoriosCompleto();
}

module.exports = {
  initJobs,
  runJobManually,
  runJobCompletoManually,
  jobRecordatoriosCompleto,
  jobEvaluacionRecargas,
};

