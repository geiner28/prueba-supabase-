// ===========================================
// Solicitudes Recarga - Routes
// ===========================================
const { Router } = require("express");
const { authBot } = require("../../middleware/auth");
const { validateBody, validateQuery } = require("../../middleware/validate");
const {
  generarSolicitudesSchema,
  querySolicitudesSchema,
  verificarRecordatoriosSchema,
  actualizarFechasSchema,
} = require("./solicitudes-recarga.schema");
const service = require("./solicitudes-recarga.service");

const router = Router();

// POST /api/solicitudes-recarga/generar
// Genera solicitudes automáticas según el plan del usuario
router.post("/generar", authBot, validateBody(generarSolicitudesSchema), async (req, res, next) => {
  try {
    const result = await service.generarSolicitudes(req.validatedBody);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// GET /api/solicitudes-recarga?telefono=xxx&estado=pendiente&obligacion_id=xxx
// Lista las solicitudes de recarga de un usuario
router.get("/", authBot, validateQuery(querySolicitudesSchema), async (req, res, next) => {
  try {
    const result = await service.listarSolicitudes(req.validatedQuery);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// POST /api/solicitudes-recarga/verificar-recordatorios
// Verifica si hay solicitudes próximas a vencer y genera recordatorios
router.post("/verificar-recordatorios", authBot, validateBody(verificarRecordatoriosSchema), async (req, res, next) => {
  try {
    const result = await service.verificarRecordatorios(req.validatedBody);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// PUT /api/solicitudes-recarga/:id/fechas
// Permite al usuario personalizar las fechas de cuotas
router.put("/:id/fechas", authBot, validateBody(actualizarFechasSchema), async (req, res, next) => {
  try {
    const result = await service.actualizarFechasSolicitud(req.params.id, req.validatedBody);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
