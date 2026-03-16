// ===========================================
// Programación de Recargas - Routes
// ===========================================
const { Router } = require("express");
const { authBotOrAdmin } = require("../../middleware/auth");
const { validateBody } = require("../../middleware/validate");
const { updateProgramacionRecargasSchema } = require("./programacion.schema");
const programacionService = require("./programacion.service");

const router = Router();

// GET /api/programacion-recargas?usuario_id=xxx
router.get("/", authBotOrAdmin, async (req, res, next) => {
  try {
    const { usuario_id } = req.query;
    const result = await programacionService.getProgramacionRecargas({ usuario_id });
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// PUT /api/programacion-recargas
router.put(
  "/",
  authBotOrAdmin,
  validateBody(updateProgramacionRecargasSchema),
  async (req, res, next) => {
    try {
      const result = await programacionService.updateProgramacionRecargas(
        req.validatedBody
      );
      res.status(result.statusCode).json(result.body);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
