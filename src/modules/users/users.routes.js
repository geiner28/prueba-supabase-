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

// DELETE /api/users/:id?hard=true&force=true — Eliminar usuario (soft por default)
// :id puede ser UUID. Alternativa: DELETE /api/users?telefono=XXX (sin :id)
router.delete("/:id", authAdmin, async (req, res, next) => {
  try {
    const hard = req.query.hard === "true";
    const force = req.query.force === "true";
    const result = await usersService.deleteUser({ id: req.params.id, hard, force, actor: req.actorTipo });
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/users?telefono=XXX&hard=true&force=true — Eliminar por teléfono
router.delete("/", authAdmin, async (req, res, next) => {
  try {
    const { telefono } = req.query;
    if (!telefono) {
      return res.status(400).json({ ok: false, data: null, error: { code: "BAD_REQUEST", message: "Query param 'telefono' requerido (o use DELETE /api/users/:id)" } });
    }
    const hard = req.query.hard === "true";
    const force = req.query.force === "true";
    const result = await usersService.deleteUser({ telefono, hard, force, actor: req.actorTipo });
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
