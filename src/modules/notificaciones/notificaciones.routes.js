// ===========================================
// Notificaciones - Routes
// ===========================================
const { Router } = require("express");
const { authAdmin, authBotOrAdmin, authBot } = require("../../middleware/auth");
const { validateBody, validateQuery } = require("../../middleware/validate");
const {
  crearNotificacionSchema,
  crearNotificacionMasivaSchema,
  actualizarEstadoNotificacionSchema,
  queryNotificacionesSchema,
} = require("./notificaciones.schema");
const service = require("./notificaciones.service");

const router = Router();

// POST /api/notificaciones — Crear notificación para un usuario
router.post("/", authAdmin, validateBody(crearNotificacionSchema), async (req, res, next) => {
  try {
    const result = await service.crearNotificacion(req.validatedBody);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// POST /api/notificaciones/masiva — Crear notificación masiva
router.post("/masiva", authAdmin, validateBody(crearNotificacionMasivaSchema), async (req, res, next) => {
  try {
    const result = await service.crearNotificacionMasiva(req.validatedBody);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// GET /api/notificaciones — Listar notificaciones (admin)
router.get("/", authAdmin, validateQuery(queryNotificacionesSchema), async (req, res, next) => {
  try {
    const result = await service.listarNotificaciones(req.validatedQuery);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// GET /api/notificaciones/pendientes/:telefono — Notificaciones pendientes de un usuario (bot)
router.get("/pendientes/:telefono", authBotOrAdmin, async (req, res, next) => {
  try {
    const result = await service.obtenerPendientesUsuario(req.params.telefono);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// PUT /api/notificaciones/:id — Actualizar estado de notificación
router.put("/:id", authBotOrAdmin, validateBody(actualizarEstadoNotificacionSchema), async (req, res, next) => {
  try {
    const result = await service.actualizarEstadoNotificacion(req.params.id, req.validatedBody);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// POST /api/notificaciones/batch-enviadas — Marcar varias como enviadas
router.post("/batch-enviadas", authBotOrAdmin, async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ ok: false, data: null, error: { code: "VALIDATION_ERROR", message: "Se requiere un array de IDs" } });
    }
    const result = await service.marcarEnviadasBatch(ids);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
