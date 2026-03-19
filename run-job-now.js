#!/usr/bin/env node
/**
 * Script para ejecutar manualmente el job de evaluación de recargas
 * Útil cuando necesitas ejecutarlo fuera del horario programado
 */

// Marcar como ejecutado manualmente
console.log("\n");
console.log("═══════════════════════════════════════════════════════════");
console.log("  EJECUTANDO CRON JOB - jobEvaluacionRecargas");
console.log("  Ejecución Manual: " + new Date().toLocaleString());
console.log("═══════════════════════════════════════════════════════════");
console.log("\n");

// Importar el job
const { jobEvaluacionRecargas } = require("./src/jobs/recordatorios.job");

// Ejecutar el job
(async () => {
  try {
    console.log("[JOB] Iniciando evaluación de recargas...\n");
    
    const result = await jobEvaluacionRecargas();
    
    console.log("\n[JOB] ✅ Job completado exitosamente");
    console.log("[JOB] Resultado:", JSON.stringify(result, null, 2));
    
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("  JOB FINALIZADO");
    console.log("═══════════════════════════════════════════════════════════\n");
    
    process.exit(0);
  } catch (error) {
    console.error("\n[JOB] ❌ Error ejecutando el job:");
    console.error(error);
    
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("  ERROR EN LA EJECUCIÓN");
    console.log("═══════════════════════════════════════════════════════════\n");
    
    process.exit(1);
  }
})();
