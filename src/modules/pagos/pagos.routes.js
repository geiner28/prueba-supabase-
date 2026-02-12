// ===========================================
// Pagos - Routes
// ===========================================
const { Router } = require("express");
const { authAdminOrSystem } = require("../../middleware/auth");
const { validateBody } = require("../../middleware/validate");
const { crearPagoSchema, confirmarPagoSchema, fallarPagoSchema } = require("./pagos.schema");
const service = require("./pagos.service");

const router = Router();

// POST /api/pagos/crear
router.post("/crear", authAdminOrSystem, validateBody(crearPagoSchema), async (req, res, next) => {
  try {
    const result = await service.crearPago(req.validatedBody, req.actorTipo, req.adminId);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// PUT /api/pagos/:id/confirmar
router.put("/:id/confirmar", authAdminOrSystem, validateBody(confirmarPagoSchema), async (req, res, next) => {
  try {
    const result = await service.confirmarPago(req.params.id, req.validatedBody, req.actorTipo, req.adminId);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// PUT /api/pagos/:id/fallar
router.put("/:id/fallar", authAdminOrSystem, validateBody(fallarPagoSchema), async (req, res, next) => {
  try {
    const result = await service.fallarPago(req.params.id, req.validatedBody, req.actorTipo, req.adminId);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
