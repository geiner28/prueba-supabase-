// ===========================================
// Resolver usuario_id por teléfono
// ===========================================
const supabase = require("../config/supabase");

/**
 * Busca un usuario por su teléfono y retorna su id.
 * @param {string} telefono
 * @returns {Promise<{usuario_id: string, usuario: object} | null>}
 */
async function resolverUsuarioPorTelefono(telefono) {
  const { data, error } = await supabase
    .from("usuarios")
    .select("*")
    .eq("telefono", telefono)
    .single();

  if (error || !data) return null;
  return { usuario_id: data.id, usuario: data };
}

module.exports = { resolverUsuarioPorTelefono };
