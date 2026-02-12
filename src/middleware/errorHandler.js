// ===========================================
// Middleware: Error Handler Central
// ===========================================
const { errors } = require("../utils/response");

function errorHandler(err, req, res, _next) {
  console.error(`[ERROR] [${req.requestId || "N/A"}] ${err.message}`, {
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  // Errores de Supabase por unique violation
  if (err.code === "23505") {
    const resp = errors.conflict("Registro duplicado detectado");
    return res.status(resp.statusCode).json(resp.body);
  }

  const resp = errors.internal(
    process.env.NODE_ENV === "development" ? err.message : "Error interno del servidor"
  );
  return res.status(resp.statusCode).json(resp.body);
}

module.exports = errorHandler;
