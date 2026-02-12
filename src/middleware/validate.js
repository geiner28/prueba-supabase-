// ===========================================
// Middleware: Validación con Zod
// ===========================================
const { errors } = require("../utils/response");

/**
 * Crea un middleware que valida req.body contra un schema Zod.
 * @param {import("zod").ZodSchema} schema
 */
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const err = errors.validation(
        "Error de validación en los datos enviados",
        result.error.flatten().fieldErrors
      );
      return res.status(err.statusCode).json(err.body);
    }
    req.validatedBody = result.data;
    next();
  };
}

/**
 * Crea un middleware que valida req.query contra un schema Zod.
 * @param {import("zod").ZodSchema} schema
 */
function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const err = errors.validation(
        "Error de validación en los parámetros de consulta",
        result.error.flatten().fieldErrors
      );
      return res.status(err.statusCode).json(err.body);
    }
    req.validatedQuery = result.data;
    next();
  };
}

module.exports = { validateBody, validateQuery };
