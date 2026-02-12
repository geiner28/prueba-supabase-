// ===========================================
// Formateador de Respuestas estándar
// ===========================================

function success(data, statusCode = 200) {
  return { statusCode, body: { ok: true, data, error: null } };
}

function error(code, message, details = null, statusCode = 500) {
  return { statusCode, body: { ok: false, data: null, error: { code, message, details } } };
}

// Errores predefinidos
const errors = {
  validation: (message, details) => error("VALIDATION_ERROR", message, details, 400),
  unauthorized: (message = "No autorizado") => error("UNAUTHORIZED", message, null, 401),
  notFound: (message = "Recurso no encontrado") => error("NOT_FOUND", message, null, 404),
  conflict: (message = "Conflicto: recurso duplicado") => error("CONFLICT_DUPLICATE", message, null, 409),
  insufficientFunds: (message = "Fondos insuficientes") => error("INSUFFICIENT_FUNDS", message, null, 409),
  invalidTransition: (message = "Transición de estado inválida") => error("INVALID_STATE_TRANSITION", message, null, 409),
  internal: (message = "Error interno del servidor") => error("INTERNAL_ERROR", message, null, 500),
};

module.exports = { success, error, errors };
