// ===========================================
// Revisiones Admin - Routes
// ===========================================
const { Router } = require("express");
const { authAdmin } = require("../../middleware/auth");
const { validateQuery, validateBody } = require("../../middleware/validate");
const { queryRevisionesSchema, descartarRevisionSchema } = require("./revisiones.schema");
const service = require("./revisiones.service");

const router = Router();

// GET /api/revisiones?tipo=factura&estado=pendiente
router.get("/", authAdmin, validateQuery(queryRevisionesSchema), async (req, res, next) => {
  try {
    const result = await service.listarRevisiones(req.validatedQuery);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// PUT /api/revisiones/:id/tomar
router.put("/:id/tomar", authAdmin, async (req, res, next) => {
  try {
    const result = await service.tomarRevision(req.params.id, req.adminId);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// PUT /api/revisiones/:id/descartar
router.put("/:id/descartar", authAdmin, validateBody(descartarRevisionSchema), async (req, res, next) => {
  try {
    const result = await service.descartarRevision(req.params.id, req.validatedBody, req.adminId);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
