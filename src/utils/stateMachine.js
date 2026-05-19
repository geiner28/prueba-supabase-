// ===========================================
// Máquina de Transiciones de Estado
// ===========================================

const transitions = {
  obligaciones: {
    activa: ["en_progreso", "cancelada"],
    en_progreso: ["completada", "cancelada"],
  },
  recargas: {
    reportada: ["en_validacion"],
    en_validacion: ["aprobada", "rechazada"],
  },
  // Estado visible al usuario (lo que ve en el dashboard / bot)
  facturas: {
    pendiente: ["pagada", "aproximada", "sin_factura"],
    aproximada: ["pagada", "pendiente"],
    sin_factura: ["pendiente", "aproximada", "pagada"],
    pagada: ["pendiente"], // permitir revertir si fue marcado por error
  },
  // Flujo interno admin: sin_revisar → revisada (reversible)
  facturas_validacion: {
    sin_revisar: ["revisada"],
    revisada: ["sin_revisar", "revisada"],
  },
  pagos: {
    pendiente: ["en_proceso", "cancelado"],
    en_proceso: ["pagado", "fallido"],
  },
  revisiones_admin: {
    pendiente: ["en_proceso", "descartada", "resuelta"],
    en_proceso: ["resuelta", "descartada"],
  },
};

/**
 * Valida si una transición de estado es permitida.
 * @param {string} entity - Nombre de la entidad (recargas, facturas, pagos, revisiones_admin)
 * @param {string} from - Estado actual
 * @param {string} to - Estado destino
 * @returns {boolean}
 */
function isValidTransition(entity, from, to) {
  const entityTransitions = transitions[entity];
  if (!entityTransitions) return false;
  const allowed = entityTransitions[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

module.exports = { isValidTransition, transitions };
