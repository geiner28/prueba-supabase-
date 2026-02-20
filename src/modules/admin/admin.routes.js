// ===========================================
// Admin - Routes
// Dashboard, listado de clientes, historial de pagos
// ===========================================
const { Router } = require("express");
const { authAdmin } = require("../../middleware/auth");
const { validateQuery } = require("../../middleware/validate");
const { queryClientesSchema, queryPagosHistorialSchema } = require("./admin.schema");
const service = require("./admin.service");

const router = Router();

// GET /api/admin/dashboard — Métricas globales
router.get("/dashboard", authAdmin, async (req, res, next) => {
  try {
    const result = await service.dashboard();
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/clientes — Listar todos los clientes (paginado + búsqueda)
router.get("/clientes", authAdmin, validateQuery(queryClientesSchema), async (req, res, next) => {
  try {
    const result = await service.listarClientes(req.validatedQuery);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/clientes/:telefono — Perfil completo de un cliente
router.get("/clientes/:telefono", authAdmin, async (req, res, next) => {
  try {
    const result = await service.perfilCompletoCliente(req.params.telefono);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/pagos — Historial de pagos con filtros
router.get("/pagos", authAdmin, validateQuery(queryPagosHistorialSchema), async (req, res, next) => {
  try {
    const result = await service.historialPagos(req.validatedQuery);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
