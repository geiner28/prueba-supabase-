// ===========================================
// Users - Routes
// ===========================================
const { Router } = require("express");
const { authBotOrAdmin, authAdmin } = require("../../middleware/auth");
const { validateBody } = require("../../middleware/validate");
const { upsertUserSchema, updatePlanSchema } = require("./users.schema");
const usersService = require("./users.service");

const router = Router();

// GET /api/users — Listar todos los usuarios (paginado + búsqueda)
router.get("/", authAdmin, async (req, res, next) => {
  try {
    const result = await usersService.listUsers(req.query);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// POST /api/users/upsert
router.post("/upsert", authBotOrAdmin, validateBody(upsertUserSchema), async (req, res, next) => {
  try {
    const result = await usersService.upsertUser(req.validatedBody);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/plan
router.put("/plan", authBotOrAdmin, validateBody(updatePlanSchema), async (req, res, next) => {
  try {
    const result = await usersService.updateUserPlan(req.validatedBody);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// GET /api/users/by-telefono/?telefono=573046757626
router.get("/by-telefono/", authAdmin, async (req, res, next) => {
  try {
    const { telefono } = req.query;
    if (!telefono) {
      return res.status(400).json({ ok: false, data: null, error: { code: "BAD_REQUEST", message: "El query parameter 'telefono' es requerido" } });
    }
    const result = await usersService.getUserByTelefono(telefono);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
