// ===========================================
// Users - Routes
// ===========================================
const { Router } = require("express");
const { authBotOrAdmin, authAdmin } = require("../../middleware/auth");
const { validateBody } = require("../../middleware/validate");
const { upsertUserSchema, updatePlanSchema } = require("./users.schema");
const usersService = require("./users.service");

const router = Router();

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

// GET /api/users/by-telefono/:telefono
router.get("/by-telefono/:telefono", authAdmin, async (req, res, next) => {
  try {
    const result = await usersService.getUserByTelefono(req.params.telefono);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
