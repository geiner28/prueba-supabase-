// ===========================================
// Facturas - Routes
// ===========================================
const { Router } = require("express");
const { authBot, authAdmin } = require("../../middleware/auth");
const { validateBody } = require("../../middleware/validate");
const { capturaFacturaSchema, validarFacturaSchema, rechazarFacturaSchema } = require("./facturas.schema");
const service = require("./facturas.service");

const router = Router();

// POST /api/facturas/captura
router.post("/captura", authBot, validateBody(capturaFacturaSchema), async (req, res, next) => {
  try {
    const result = await service.capturaFactura(req.validatedBody, req.actorTipo);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// PUT /api/facturas/:id/validar
router.put("/:id/validar", authAdmin, validateBody(validarFacturaSchema), async (req, res, next) => {
  try {
    const result = await service.validarFactura(req.params.id, req.validatedBody, req.adminId);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// PUT /api/facturas/:id/rechazar
router.put("/:id/rechazar", authAdmin, validateBody(rechazarFacturaSchema), async (req, res, next) => {
  try {
    const result = await service.rechazarFactura(req.params.id, req.validatedBody, req.adminId);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
