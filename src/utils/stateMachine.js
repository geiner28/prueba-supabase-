// ===========================================
// Máquina de Transiciones de Estado
// ===========================================

const transitions = {
  recargas: {
    reportada: ["en_validacion"],
    en_validacion: ["aprobada", "rechazada"],
  },
  facturas: {
    capturada: ["extraida", "en_revision"],
    extraida: ["en_revision", "validada"],
    en_revision: ["validada", "rechazada"],
    validada: ["pagada"],
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
