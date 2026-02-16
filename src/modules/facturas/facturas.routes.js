// ===========================================
// Facturas - Routes v2
// ===========================================
const { Router } = require("express");
const { authBot, authAdmin, authBotOrAdmin } = require("../../middleware/auth");
const { validateBody } = require("../../middleware/validate");
const { capturaFacturaSchema, validarFacturaSchema, rechazarFacturaSchema } = require("./facturas.schema");
const service = require("./facturas.service");

const router = Router();

// POST /api/facturas/captura — Registrar factura (servicio) dentro de una obligación
router.post("/captura", authBotOrAdmin, validateBody(capturaFacturaSchema), async (req, res, next) => {
  try {
    const result = await service.capturaFactura(req.validatedBody, req.actorTipo);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// GET /api/facturas/obligacion/:obligacionId — Listar facturas de una obligación
router.get("/obligacion/:obligacionId", authBotOrAdmin, async (req, res, next) => {
  try {
    const result = await service.listarFacturasPorObligacion(req.params.obligacionId);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// PUT /api/facturas/:id/validar — Admin valida factura
router.put("/:id/validar", authAdmin, validateBody(validarFacturaSchema), async (req, res, next) => {
  try {
    const result = await service.validarFactura(req.params.id, req.validatedBody, req.adminId);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// PUT /api/facturas/:id/rechazar — Admin rechaza factura
router.put("/:id/rechazar", authAdmin, validateBody(rechazarFacturaSchema), async (req, res, next) => {
  try {
    const result = await service.rechazarFactura(req.params.id, req.validatedBody, req.adminId);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
