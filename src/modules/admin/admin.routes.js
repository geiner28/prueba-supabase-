// ===========================================
// Admin - Routes
// Dashboard, listado de clientes, historial de pagos, gestión de usuarios
// ===========================================
const { Router } = require("express");
const { authAdmin } = require("../../middleware/auth");
const { validateQuery, validateBody } = require("../../middleware/validate");
const { queryClientesSchema, queryPagosHistorialSchema, upsertUsuarioAdminSchema } = require("./admin.schema");
const service = require("./admin.service");

const router = Router();

// GET /api/admin/dashboard — Métricas globales con filtros (año, mes, plan)
router.get("/dashboard", authAdmin, async (req, res, next) => {
  try {
    const { year, month, plan } = req.query;
    const result = await service.dashboard({
      year: year ? parseInt(year) : undefined,
      month: month ? parseInt(month) : undefined,
      plan: plan || "all",
    });
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

// GET /api/admin/clientes/:telefono — Perfil completo de un cliente (opcional: filtrar por ?periodo=YYYY-MM-DD)
router.get("/clientes/:telefono", authAdmin, async (req, res, next) => {
  try {
    const { periodo } = req.query;
    const result = await service.perfilCompletoCliente(req.params.telefono, periodo);
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

// GET /api/admin/users/by-telefono/:telefono — Buscar usuario por teléfono (ADMIN-ONLY)
router.get("/users/by-telefono/:telefono", authAdmin, async (req, res, next) => {
  try {
    const result = await service.getUsuarioByTelefono(req.params.telefono);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/users/upsert — Crear/actualizar usuario (admin-only con campos extendidos)
router.post("/users/upsert", authAdmin, validateBody(upsertUsuarioAdminSchema), async (req, res, next) => {
  try {
    const result = await service.upsertUsuarioAdmin(req.validatedBody);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
