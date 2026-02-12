// ===========================================
// Obligaciones - Service
// ===========================================
const supabase = require("../../config/supabase");
const { success, errors } = require("../../utils/response");
const { resolverUsuarioPorTelefono } = require("../../utils/resolverUsuario");

async function crearObligacion({ telefono, servicio, pagina_pago, tipo_referencia, numero_referencia, periodicidad, estado }) {
  const usuario = await resolverUsuarioPorTelefono(telefono);
  if (!usuario) return errors.notFound("Usuario no encontrado con ese teléfono");

  const { data, error } = await supabase
    .from("obligaciones")
    .insert({
      usuario_id: usuario.usuario_id,
      servicio,
      pagina_pago: pagina_pago || null,
      tipo_referencia,
      numero_referencia,
      periodicidad: periodicidad || "mensual",
      estado: estado || "activa",
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return errors.conflict("Ya existe una obligación con ese servicio y referencia para este usuario");
    }
    throw new Error(`Error creando obligación: ${error.message}`);
  }

  return success(data, 201);
}

async function listarObligaciones(telefono) {
  const usuario = await resolverUsuarioPorTelefono(telefono);
  if (!usuario) return errors.notFound("Usuario no encontrado con ese teléfono");

  const { data, error } = await supabase
    .from("obligaciones")
    .select("*")
    .eq("usuario_id", usuario.usuario_id)
    .order("creado_en", { ascending: false });

  if (error) throw new Error(`Error listando obligaciones: ${error.message}`);

  return success(data);
}

async function actualizarObligacion(id, updates) {
  const { data: existing, error: findErr } = await supabase
    .from("obligaciones")
    .select("*")
    .eq("id", id)
    .single();

  if (findErr || !existing) return errors.notFound("Obligación no encontrada");

  const cleanUpdates = {};
  if (updates.estado !== undefined) cleanUpdates.estado = updates.estado;
  if (updates.periodicidad !== undefined) cleanUpdates.periodicidad = updates.periodicidad;
  if (updates.pagina_pago !== undefined) cleanUpdates.pagina_pago = updates.pagina_pago;
  if (updates.quincena_objetivo !== undefined) cleanUpdates.quincena_objetivo = updates.quincena_objetivo;

  if (Object.keys(cleanUpdates).length === 0) {
    return errors.validation("No se proporcionaron campos para actualizar");
  }

  const { data, error } = await supabase
    .from("obligaciones")
    .update(cleanUpdates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`Error actualizando obligación: ${error.message}`);

  return success(data);
}

module.exports = { crearObligacion, listarObligaciones, actualizarObligacion };
