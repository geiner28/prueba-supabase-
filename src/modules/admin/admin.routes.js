// ===========================================
// Admin - Routes
// Dashboard, listado de clientes, historial de pagos, gestión de usuarios
// ===========================================
const { Router } = require("express");
const { authAdmin } = require("../../middleware/auth");
const { validateQuery, validateBody } = require("../../middleware/validate");
const { queryClientesSchema, queryPagosHistorialSchema, upsertUsuarioAdminSchema, updateUsuarioAdminSchema } = require("./admin.schema");
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

// PUT /api/admin/users/:id — Actualizar usuario por ID (permite cambiar teléfono)
router.put("/users/:id", authAdmin, validateBody(updateUsuarioAdminSchema), async (req, res, next) => {
  try {
    const result = await service.updateUsuarioAdmin(req.params.id, req.validatedBody);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// NOTIFICACIONES - ADMIN ENDPOINTS (Professional Panel)
// ════════════════════════════════════════════════════════════════════════════

// GET /api/admin/notificaciones/list — Listar notificaciones con filtros avanzados
router.get("/notificaciones/list", authAdmin, async (req, res, next) => {
  try {
    const filters = {
      tipo: req.query.tipo,
      estado: req.query.estado,
      usuario_id: req.query.usuario_id,
      periodo: req.query.periodo,
      desde: req.query.desde,
      hasta: req.query.hasta,
      page: parseInt(req.query.page) || 1,
      limit: Math.min(parseInt(req.query.limit) || 20, 100), // Max 100 per page
    };
    const result = await service.listarNotificacionesAdmin(filters);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/notificaciones/estadisticas — Obtener estadísticas de notificaciones
router.get("/notificaciones/estadisticas", authAdmin, async (req, res, next) => {
  try {
    const filters = {
      usuario_id: req.query.usuario_id,
      periodo: req.query.periodo,
      desde: req.query.desde,
      hasta: req.query.hasta,
    };
    const result = await service.obtenerEstadisticasNotificaciones(filters);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/notificaciones/cliente/:usuario_id — Notificaciones de un cliente
router.get("/notificaciones/cliente/:usuario_id", authAdmin, async (req, res, next) => {
  try {
    const filters = {
      tipo: req.query.tipo,
      periodo: req.query.periodo,
    };
    const result = await service.obtenerNotificacionesCliente(req.params.usuario_id, filters);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/notificaciones/:id/enviada — Marcar notificación como enviada
router.put("/notificaciones/:id/enviada", authAdmin, async (req, res, next) => {
  try {
    // admin_id vendría del token, pero por ahora usamos null
    const result = await service.marcarNotificacionEnviada(req.params.id, null);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/notificaciones/batch/enviadas — Marcar múltiples como enviadas
router.post("/notificaciones/batch/enviadas", authAdmin, async (req, res, next) => {
  try {
    const { notificacion_ids } = req.body;
    const result = await service.marcarNotificacionesEnviadasBatch(notificacion_ids, null);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/notificaciones/mock/generar — SOLO PARA TESTING: Generar notificaciones de prueba
router.get("/notificaciones/mock/generar", authAdmin, async (req, res, next) => {
  try {
    // ⚠️ Este endpoint es solo para desarrollo/testing
    console.warn('🔴 ENDPOINT DE MOCK LLAMADO - Generando datos de prueba');
    
    const result = await service.generarNotificacionesMock();
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/notificaciones/alertas — Listar SOLO alertas
router.get("/notificaciones/alertas", authAdmin, async (req, res, next) => {
  try {
    const filters = {
      desde: req.query.desde,
      hasta: req.query.hasta,
      page: parseInt(req.query.page) || 1,
      limit: Math.min(parseInt(req.query.limit) || 20, 100),
    };
    const result = await service.listarAlertasAdmin(filters);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/notificaciones/automaticas — Listar SOLO notificaciones automáticas del bot
router.get("/notificaciones/automaticas", authAdmin, async (req, res, next) => {
  try {
    const filters = {
      desde: req.query.desde,
      hasta: req.query.hasta,
      page: parseInt(req.query.page) || 1,
      limit: Math.min(parseInt(req.query.limit) || 20, 100),
    };
    const result = await service.listarNotificacionesAutomaticas(filters);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/notificaciones/:alerta_id/solicitud-original — Obtener solicitud que generó una alerta
router.get("/notificaciones/:alerta_id/solicitud-original", authAdmin, async (req, res, next) => {
  try {
    const result = await service.obtenerSolicitudOriginal(req.params.alerta_id);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/notificaciones/acciones
// Retorna facturas (estado: extraida/en_revision) y recargas (estado: reportada/en_validacion) agrupadas por usuario
router.get("/notificaciones/acciones", authAdmin, async (req, res, next) => {
  try {
    const { usuario_id, tipo, page, limit } = req.query;
    const filters = {
      usuario_id: usuario_id || undefined,
      tipo: tipo || undefined,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20
    };
    const result = await service.obtenerNotificacionesAcciones(filters);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
