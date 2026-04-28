// ===========================================
// Users - Service (Lógica de Negocio)
// ===========================================
const supabase = require("../../config/supabase");
const { success, errors } = require("../../utils/response");
const { registrarAuditLog } = require("../../utils/auditLog");

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

  // 4. Crear programación de recargas por defecto según el plan
  const plan = newUser.plan || "control";
  const esPlanDoble = plan === "tranquilidad" || plan === "respaldo";
  const programacionData = {
    usuario_id: newUser.id,
    cantidad_recargas: esPlanDoble ? 2 : 1,
    dia_1: 1,
    dia_2: esPlanDoble ? 15 : null,
  };

  const { error: progErr } = await supabase
    .from("programacion_recargas")
    .insert(programacionData);

  if (progErr) {
    console.error("[USERS] Error creando programacion_recargas:", progErr.message);
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

/**
 * Eliminar usuario.
 * - soft (default): marca activo=false (preserva historial).
 * - hard: borra fila usuarios; CASCADE elimina ajustes, obligaciones, facturas,
 *   recargas, pagos, revisiones y solicitudes_recarga; notificaciones quedan con
 *   usuario_id=NULL. Bloqueado si hay obligaciones activas/en_progreso salvo force=true.
 */
async function deleteUser({ id, telefono, hard = false, force = false, actor }) {
  // Resolver usuario por id o telefono
  let query = supabase.from("usuarios").select("*");
  if (id) query = query.eq("id", id);
  else if (telefono) query = query.eq("telefono", telefono);
  else return errors.badRequest("Debe indicar id o telefono");

  const { data: usuario, error: findErr } = await query.single();
  if (findErr || !usuario) return errors.notFound("Usuario no encontrado");

  // Validar obligaciones activas/en_progreso
  const { data: oblsActivas, error: oblsErr } = await supabase
    .from("obligaciones")
    .select("id, estado")
    .eq("usuario_id", usuario.id)
    .in("estado", ["activa", "en_progreso"]);

  if (oblsErr) throw new Error(`Error verificando obligaciones: ${oblsErr.message}`);

  if (oblsActivas && oblsActivas.length > 0 && !force) {
    return errors.invalidTransition(
      `El usuario tiene ${oblsActivas.length} obligación(es) activa(s)/en progreso. Use ?force=true para eliminar de todos modos.`
    );
  }

  if (hard) {
    // Verificar pagos confirmados (datos financieros) antes de borrar definitivamente
    const { count: pagosCount, error: pagosErr } = await supabase
      .from("pagos")
      .select("id", { count: "exact", head: true })
      .eq("usuario_id", usuario.id)
      .in("estado", ["pagado", "en_proceso"]);
    if (pagosErr) throw new Error(`Error verificando pagos: ${pagosErr.message}`);
    if ((pagosCount || 0) > 0 && !force) {
      return errors.invalidTransition(
        `El usuario tiene ${pagosCount} pago(s) confirmado(s). Hard delete bloqueado por integridad financiera. Use ?force=true para forzar.`
      );
    }

    const { error: delErr } = await supabase.from("usuarios").delete().eq("id", usuario.id);
    if (delErr) throw new Error(`Error eliminando usuario: ${delErr.message}`);

    await registrarAuditLog({
      actor_tipo: actor || "admin",
      accion: "hard_delete_usuario",
      entidad: "usuarios",
      entidad_id: usuario.id,
      antes: usuario,
    });

    return success({
      usuario_id: usuario.id,
      telefono: usuario.telefono,
      modo: "hard",
      eliminado: true,
    });
  }

  // Soft delete
  if (usuario.activo === false) {
    return success({
      usuario_id: usuario.id,
      telefono: usuario.telefono,
      modo: "soft",
      eliminado: true,
      mensaje: "El usuario ya estaba inactivo",
    });
  }

  const { data: updated, error: updErr } = await supabase
    .from("usuarios")
    .update({ activo: false })
    .eq("id", usuario.id)
    .select()
    .single();
  if (updErr) throw new Error(`Error desactivando usuario: ${updErr.message}`);

  await registrarAuditLog({
    actor_tipo: actor || "admin",
    accion: "soft_delete_usuario",
    entidad: "usuarios",
    entidad_id: usuario.id,
    antes: usuario,
    despues: updated,
  });

  return success({
    usuario_id: usuario.id,
    telefono: usuario.telefono,
    modo: "soft",
    eliminado: true,
    activo: false,
  });
}

module.exports = { listUsers, upsertUser, updateUserPlan, getUserByTelefono, deleteUser };
