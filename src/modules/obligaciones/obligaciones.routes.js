// ===========================================
// Obligaciones - Routes
// ===========================================
const { Router } = require("express");
const { authBotOrAdmin, authAdmin } = require("../../middleware/auth");
const { validateBody, validateQuery } = require("../../middleware/validate");
const { createObligacionSchema, updateObligacionSchema, queryObligacionesSchema } = require("./obligaciones.schema");
const service = require("./obligaciones.service");

const router = Router();

// POST /api/obligaciones
router.post("/", authBotOrAdmin, validateBody(createObligacionSchema), async (req, res, next) => {
  try {
    const result = await service.crearObligacion(req.validatedBody);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// GET /api/obligaciones?telefono=...
router.get("/", authBotOrAdmin, validateQuery(queryObligacionesSchema), async (req, res, next) => {
  try {
    const result = await service.listarObligaciones(req.validatedQuery.telefono);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// PUT /api/obligaciones/:id
router.put("/:id", authAdmin, validateBody(updateObligacionSchema), async (req, res, next) => {
  try {
    const result = await service.actualizarObligacion(req.params.id, req.validatedBody);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
