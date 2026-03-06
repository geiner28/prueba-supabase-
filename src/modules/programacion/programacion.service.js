const supabase = require("../../config/supabase");
const { success, errors } = require("../../utils/response");

async function getProgramacion(usuario_id) {
  const { data, error } = await supabase
    .from("programacion_recargas")
    .select("*")
    .eq("usuario_id", usuario_id)
    .single();

  if (error || !data) {
    return errors.notFound("Programación no encontrada");
  }

  return success(data);
}

async function updateProgramacion(usuario_id, payload) {
  const { cantidad_recargas, dia_1, dia_2 } = payload;

  // Validación lógica adicional
  if (cantidad_recargas === 1 && dia_2 !== null) {
    return errors.validation("Si es 1 recarga, dia_2 debe ser null");
  }

  if (cantidad_recargas === 2) {
    if (!dia_2) {
      return errors.validation("Si son 2 recargas, dia_2 es obligatorio");
    }

    if (dia_2 <= dia_1) {
      return errors.validation("dia_2 debe ser mayor a dia_1");
    }
  }

  // Verificar si existe programación para este usuario
  const { data: existing } = await supabase
    .from("programacion_recargas")
    .select("id")
    .eq("usuario_id", usuario_id)
    .single();

  let data, error;

  if (existing) {
    // Si existe, actualizar
    const result = await supabase
      .from("programacion_recargas")
      .update({
        cantidad_recargas,
        dia_1,
        dia_2,
        updated_at: new Date().toISOString(),
      })
      .eq("usuario_id", usuario_id)
      .select()
      .single();
    
    data = result.data;
    error = result.error;
  } else {
    // Si no existe, crear nuevo registro
    const result = await supabase
      .from("programacion_recargas")
      .insert({
        usuario_id,
        cantidad_recargas,
        dia_1,
        dia_2,
      })
      .select()
      .single();
    
    data = result.data;
    error = result.error;
  }

  if (error) throw new Error(error.message);

  return success(data);
}

module.exports = {
  getProgramacion,
  updateProgramacion,
};