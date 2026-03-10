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

const { 
  verificarRecordatoriosGlobal, 
  recalcularSolicitudesPorObligacion 
} = require("../modules/solicitudes-recarga/solicitudes-recarga.service");

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

// Importar supabase para la función interna
const supabase = require("../config/supabase");

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

  // Job: Verificar recordatorios diariamente a las 9:00 AM
  // Formato cron: minuto hora día mes día_semana
  // "0 9 * * *" = a las 9:00 AM todos los días
  const jobRecordatorios = cron.schedule("0 9 * * *", async () => {
    console.log("[JOBS] ════════════════════════════════════════");
    console.log("[JOBS] EJECUTANDO JOB PROGRAMADO - 9:00 AM");
    console.log("[JOBS] ════════════════════════════════════════");
    try {
      const result = await jobRecordatoriosCompleto();
      console.log("[JOBS] Resultado del job:", JSON.stringify(result, null, 2));
    } catch (error) {
      console.error("[JOBS] Error en job programado:", error.message);
    }
  });

  console.log("[JOBS] ✓ Job de recordatorios programado para ejecutarse diariamente a las 9:00 AM");
  console.log("[JOBS] ✓ El job recalculará solicitudes antes de verificar recordatorios");
  console.log("[JOBS] Jobs inicializados correctamente");

  return {
    jobRecordatorios,
    stopAll: () => {
      jobRecordatorios.stop();
      console.log("[JOBS] Todos los jobs detenido");
    },
  };
}

/**
 * Ejecuta manualmente el job completo (para pruebas).
 */
async function runJobManually() {
  console.log("[JOBS] ════════════════════════════════════════");
  console.log("[JOBS] EJECUTANDO JOB MANUAL");
  console.log("[JOBS] ════════════════════════════════════════");
  return await jobRecordatoriosCompleto();
}

module.exports = {
  initJobs,
  runJobManually,
  jobRecordatoriosCompleto,
};

