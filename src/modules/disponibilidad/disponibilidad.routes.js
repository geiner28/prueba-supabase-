// ===========================================
// Disponibilidad - Routes
// ===========================================
const { Router } = require("express");
const { authBotOrAdmin } = require("../../middleware/auth");
const { validateQuery } = require("../../middleware/validate");
const { queryDisponibleSchema } = require("./disponibilidad.schema");
const service = require("./disponibilidad.service");

const router = Router();

// GET /api/disponible?telefono=...&periodo=2026-02-01
router.get("/", authBotOrAdmin, validateQuery(queryDisponibleSchema), async (req, res, next) => {
  try {
    const result = await service.calcularDisponible(
      req.validatedQuery.telefono,
      req.validatedQuery.periodo
    );
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
