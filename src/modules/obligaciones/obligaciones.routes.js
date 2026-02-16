// ===========================================
// Obligaciones - Routes v2
// ===========================================
const { Router } = require("express");
const { authBotOrAdmin, authAdmin } = require("../../middleware/auth");
const { validateBody, validateQuery } = require("../../middleware/validate");
const { createObligacionSchema, updateObligacionSchema, queryObligacionesSchema } = require("./obligaciones.schema");
const service = require("./obligaciones.service");

const router = Router();

// POST /api/obligaciones — Crear obligación del periodo
router.post("/", authBotOrAdmin, validateBody(createObligacionSchema), async (req, res, next) => {
  try {
    const result = await service.crearObligacion(req.validatedBody);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// GET /api/obligaciones?telefono=...&estado=... — Listar obligaciones con facturas
router.get("/", authBotOrAdmin, validateQuery(queryObligacionesSchema), async (req, res, next) => {
  try {
    const result = await service.listarObligaciones(req.validatedQuery.telefono, req.validatedQuery.estado);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// GET /api/obligaciones/:id — Detalle de obligación con facturas
router.get("/:id", authBotOrAdmin, async (req, res, next) => {
  try {
    const result = await service.obtenerObligacion(req.params.id);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// PUT /api/obligaciones/:id — Actualizar obligación
router.put("/:id", authAdmin, validateBody(updateObligacionSchema), async (req, res, next) => {
  try {
    const result = await service.actualizarObligacion(req.params.id, req.validatedBody);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
