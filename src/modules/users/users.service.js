// ===========================================
// Users - Service (Lógica de Negocio)
// ===========================================
const supabase = require("../../config/supabase");
const { success, errors } = require("../../utils/response");

/**
 * Listar usuarios con paginación y búsqueda.
 */
async function listUsers(query = {}) {
  const page = parseInt(query.page, 10) || 1;
  const limit = Math.min(parseInt(query.limit, 10) || 20, 100);
  const offset = (page - 1) * limit;
  const search = query.search || null;
  const plan = query.plan || null;

  let dbQuery = supabase
    .from("usuarios")
    .select("*, ajustes_usuario(*)", { count: "exact" })
    .order("creado_en", { ascending: false })
    .range(offset, offset + limit - 1);

  if (plan) dbQuery = dbQuery.eq("plan", plan);
  if (search) {
    dbQuery = dbQuery.or(`nombre.ilike.%${search}%,telefono.ilike.%${search}%,correo.ilike.%${search}%`);
  }

  const { data, error, count } = await dbQuery;
  if (error) throw new Error(`Error listando usuarios: ${error.message}`);

  return success({
    usuarios: data,
    total: count,
    page,
    limit,
    total_pages: Math.ceil((count || 0) / limit),
  });
}

/**
 * Upsert: busca por teléfono; si existe actualiza, si no crea usuario + ajustes.
 */
async function upsertUser({ telefono, nombre, apellido, correo }) {
  // 1. Buscar usuario existente
  const { data: existing, error: findErr } = await supabase
    .from("usuarios")
    .select("*")
    .eq("telefono", telefono)
    .single();

  if (findErr && findErr.code !== "PGRST116") {
    // PGRST116 = no rows, lo cual es esperado si no existe
    throw new Error(`Error buscando usuario: ${findErr.message}`);
  }

  if (existing) {
    // Actualizar solo campos enviados (no sobrescribir con null)
    const updates = {};
    if (nombre !== undefined) updates.nombre = nombre;
    if (apellido !== undefined) updates.apellido = apellido;
    if (correo !== undefined) updates.correo = correo;

    if (Object.keys(updates).length > 0) {
      const { error: updateErr } = await supabase
        .from("usuarios")
        .update(updates)
        .eq("id", existing.id);

      if (updateErr) throw new Error(`Error actualizando usuario: ${updateErr.message}`);
    }

    return success({ usuario_id: existing.id, creado: false });
  }

  // 2. Crear usuario nuevo
  const { data: newUser, error: createErr } = await supabase
    .from("usuarios")
    .insert({ telefono, nombre: nombre || telefono, apellido, correo })
    .select()
    .single();

  if (createErr) throw new Error(`Error creando usuario: ${createErr.message}`);

  // 3. Crear ajustes por defecto
  const { error: ajustesErr } = await supabase
    .from("ajustes_usuario")
    .insert({ usuario_id: newUser.id });

  if (ajustesErr) {
    console.error("[USERS] Error creando ajustes_usuario:", ajustesErr.message);
  }

  return success({ usuario_id: newUser.id, creado: true }, 201);
}

/**
 * Actualizar el plan de un usuario
 */
async function updateUserPlan({ telefono, plan }) {
  // 1. Buscar usuario existente
  const { data: existing, error: findErr } = await supabase
    .from("usuarios")
    .select("*")
    .eq("telefono", telefono)
    .single();

  if (findErr || !existing) {
    return errors.notFound(`Usuario con teléfono ${telefono} no encontrado`);
  }

  // 2. Actualizar plan
  const { data: updated, error: updateErr } = await supabase
    .from("usuarios")
    .update({ plan })
    .eq("id", existing.id)
    .select()
    .single();

  if (updateErr) throw new Error(`Error actualizando plan: ${updateErr.message}`);

  return success({
    usuario_id: updated.id,
    telefono: updated.telefono,
    plan_anterior: existing.plan,
    plan_nuevo: updated.plan,
    actualizado_en: updated.updated_at
  });
}

/**
 * Obtener usuario por teléfono con ajustes.
 */
async function getUserByTelefono(telefono) {
  const { data, error } = await supabase
    .from("usuarios")
    .select("*, ajustes_usuario(*)")
    .eq("telefono", telefono)
    .single();

  if (error || !data) {
    return errors.notFound(`Usuario con teléfono ${telefono} no encontrado`);
  }

  return success(data);
}

module.exports = { listUsers, upsertUser, updateUserPlan, getUserByTelefono };
