// ===========================================
// Facturas - Routes v2
// ===========================================
const { Router } = require("express");
const { authBot, authAdmin, authBotOrAdmin } = require("../../middleware/auth");
const { validateBody } = require("../../middleware/validate");
const { capturaFacturaSchema, validarFacturaSchema, rechazarFacturaSchema, actualizarMontoFacturaSchema, actualizarFacturaSchema } = require("./facturas.schema");
const service = require("./facturas.service");

const router = Router();

// GET /api/facturas/etiquetas-distinct — Catálogo simple de etiquetas usadas (Opción B)
router.get("/etiquetas-distinct", authBotOrAdmin, async (req, res, next) => {
  try {
    const result = await service.listarEtiquetasDistinct();
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

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

// PUT /api/facturas/:id/aproximar — Usuario aproxima monto de factura heredada
router.put("/:id/aproximar", authBotOrAdmin, validateBody(actualizarMontoFacturaSchema), async (req, res, next) => {
  try {
    const result = await service.actualizarMontoFactura(req.params.id, req.validatedBody);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// PUT /api/facturas/:id — Edición libre de cualquier campo (admin)
router.put("/:id", authAdmin, validateBody(actualizarFacturaSchema), async (req, res, next) => {
  try {
    const result = await service.actualizarFactura(req.params.id, req.validatedBody, req.actorTipo, req.adminId);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/facturas/:id — Eliminar factura (sin importar el estado)
router.delete("/:id", authAdmin, async (req, res, next) => {
  try {
    const result = await service.eliminarFactura(req.params.id, { actor: req.actorTipo });
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
