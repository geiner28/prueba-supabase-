// ===========================================
// Recargas - Routes
// ===========================================
const { Router } = require("express");
const { authBot, authAdmin } = require("../../middleware/auth");
const { validateBody } = require("../../middleware/validate");
const { reportarRecargaSchema, aprobarRecargaSchema, rechazarRecargaSchema } = require("./recargas.schema");
const service = require("./recargas.service");

const router = Router();

// POST /api/recargas/reportar
router.post("/reportar", authBot, validateBody(reportarRecargaSchema), async (req, res, next) => {
  try {
    const result = await service.reportarRecarga(req.validatedBody);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// PUT /api/recargas/:id/aprobar
router.put("/:id/aprobar", authAdmin, validateBody(aprobarRecargaSchema), async (req, res, next) => {
  try {
    const result = await service.aprobarRecarga(req.params.id, req.validatedBody, req.adminId);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// PUT /api/recargas/:id/rechazar
router.put("/:id/rechazar", authAdmin, validateBody(rechazarRecargaSchema), async (req, res, next) => {
  try {
    const result = await service.rechazarRecarga(req.params.id, req.validatedBody, req.adminId);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
