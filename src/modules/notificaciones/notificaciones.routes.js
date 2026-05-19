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
  marcarEntregadasSchema,
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

// ============================================================
// FLUJO NUEVO BOT — Canónico
// ============================================================

// GET /api/notificaciones/bot/campanias
// Devuelve la cola global de mensajes pendientes para el bot.
// Cada item: { ids[], tipo, telefono, mensaje, creado_en, enviada_en }
// Al consumirla, las notificaciones quedan en estado='enviada'
// con enviada_en = NOW() (evita reenvíos por reinicio del bot).
router.get("/bot/campanias", authBotOrAdmin, async (req, res, next) => {
  try {
    const result = await service.obtenerCampaniasBot();
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// POST /api/notificaciones/bot/entregadas
// Body: { ids: [uuid, ...], entregada_en?: ISO }
// El bot reporta los mensajes que ya llegaron al usuario.
// El sistema pasa estado='entregada' y registra entregada_en
// (NOW() por defecto, o el timestamp exacto enviado por el bot).
router.post("/bot/entregadas", authBotOrAdmin, validateBody(marcarEntregadasSchema), async (req, res, next) => {
  try {
    const { ids, entregada_en } = req.validatedBody;
    const result = await service.marcarEntregadas(ids, entregada_en);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// LEGACY (compatibilidad) — preferir /bot/campanias
// ============================================================

// GET /api/notificaciones/pendientes/:telefono — Notificaciones pendientes de un usuario (bot)
router.get("/pendientes/:telefono", authBotOrAdmin, async (req, res, next) => {
  try {
    const result = await service.obtenerPendientesUsuario(req.params.telefono);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// GET /api/notificaciones/pendientes-hoy — Notificaciones pendientes de hoy (global para bot)
router.get("/pendientes-hoy", authBotOrAdmin, async (req, res, next) => {
  try {
    const result = await service.obtenerPendientesHoyGlobal();
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

// GET /api/notificaciones/admin/alertas — Obtener alertas pendientes para el admin
router.get("/admin/alertas", authAdmin, async (req, res, next) => {
  try {
    const result = await service.obtenerAlertasAdmin();
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/notificaciones/:id — Eliminar una notificación (admin)
router.delete("/:id", authAdmin, async (req, res, next) => {
  try {
    const result = await service.eliminarNotificacion(req.params.id);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/notificaciones/batch — Eliminar múltiples notificaciones (admin)
router.delete("/batch", authAdmin, async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ ok: false, data: null, error: { code: "VALIDATION_ERROR", message: "Se requiere un array de IDs" } });
    }
    const result = await service.eliminarNotificacionesBatch(ids);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
