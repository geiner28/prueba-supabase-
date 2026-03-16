// ===========================================
// Programación de Recargas - Service
// ===========================================
const supabaseClient = require("../../config/supabase");
const { error, success } = require("../../utils/response");

/**
 * Obtener programación de recargas de un usuario
 */
async function getProgramacionRecargas({ usuario_id }) {
  if (!usuario_id) {
    return error("usuario_id es requerido", "MISSING_PARAM");
  }

  const { data, error: err } = await supabaseClient
    .from("programacion_recargas")
    .select("*")
    .eq("usuario_id", usuario_id)
    .single();

  if (err && err.code !== "PGRST116") {
    console.error("[PROGRAMACION] Error obteniendo programación:", err);
    return error("Error obteniendo programación de recargas", "DB_ERROR");
  }

  return success(data || null);
}

/**
 * Actualizar programación de recargas de un usuario
 */
async function updateProgramacionRecargas({
  usuario_id,
  cantidad_recargas,
  dia_1,
  dia_2,
}) {
  if (!usuario_id) {
    return error("usuario_id es requerido", "MISSING_PARAM");
  }

  if (!cantidad_recargas || ![1, 2].includes(Number(cantidad_recargas))) {
    return error("cantidad_recargas debe ser 1 o 2", "INVALID_PARAM");
  }

  if (!dia_1 || dia_1 < 1 || dia_1 > 31) {
    return error("dia_1 debe estar entre 1 y 31", "INVALID_PARAM");
  }

  if (cantidad_recargas === 2 && (!dia_2 || dia_2 < 1 || dia_2 > 31)) {
    return error("dia_2 debe estar entre 1 y 31 cuando cantidad_recargas es 2", "INVALID_PARAM");
  }

  // Verificar si ya existe registro
  const { data: existing, error: checkErr } = await supabaseClient
    .from("programacion_recargas")
    .select("*")
    .eq("usuario_id", usuario_id)
    .single();

  if (checkErr && checkErr.code !== "PGRST116") {
    console.error("[PROGRAMACION] Error verificando existencia:", checkErr);
    return error("Error verificando programación existente", "DB_ERROR");
  }

  let result;

  if (existing) {
    // UPDATE existente
    const { data, error: err } = await supabaseClient
      .from("programacion_recargas")
      .update({
        cantidad_recargas: Number(cantidad_recargas),
        dia_1: Number(dia_1),
        dia_2: cantidad_recargas === 2 ? Number(dia_2) : null,
        updated_at: new Date().toISOString(),
      })
      .eq("usuario_id", usuario_id)
      .select()
      .single();

    if (err) {
      console.error("[PROGRAMACION] Error actualizando:", err);
      return error("Error actualizando programación de recargas", "DB_ERROR");
    }

    result = data;
  } else {
    // INSERT nuevo
    const { data, error: err } = await supabaseClient
      .from("programacion_recargas")
      .insert({
        usuario_id,
        cantidad_recargas: Number(cantidad_recargas),
        dia_1: Number(dia_1),
        dia_2: cantidad_recargas === 2 ? Number(dia_2) : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (err) {
      console.error("[PROGRAMACION] Error creando:", err);
      return error("Error creando programación de recargas", "DB_ERROR");
    }

    result = data;
  }

  return success(result);
}

module.exports = {
  getProgramacionRecargas,
  updateProgramacionRecargas,
};
