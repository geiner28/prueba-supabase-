const express = require("express");
const router = express.Router();
const service = require("./programacion.service");
const { updateProgramacionSchema } = require("./programacion.schema");
const { validateBody } = require("../../middleware/validate");

router.get("/:usuario_id", async (req, res, next) => {
  try {
    const result = await service.getProgramacion(req.params.usuario_id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.put(
  "/:usuario_id",
  validateBody(updateProgramacionSchema),
  async (req, res, next) => {
    try {
      const result = await service.updateProgramacion(
        req.params.usuario_id,
        req.validatedBody
      );
      res.status(result.statusCode).json(result.body);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;