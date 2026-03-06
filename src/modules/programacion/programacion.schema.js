const { z } = require("zod");

const updateProgramacionSchema = z.object({
  cantidad_recargas: z.number().int().min(1).max(2),
  dia_1: z.number().int().min(1).max(28),
  dia_2: z.number().int().min(1).max(28).nullable(),
});

module.exports = {
  updateProgramacionSchema,
};