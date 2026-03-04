// ===========================================
// Users - Service (Lógica de Negocio)
// ===========================================
const supabase = require("../../config/supabase");
const { success, errors } = require("../../utils/response");

/**
 * Helpers
 */
function defaultProgramacionForPlan(plan = "control") {
  // Asumimos: 'control' y 'tranquilidad' => 1 recarga (día 1)
  // 'respaldo' => 2 recargas (día 1 y 15)
  // Si tu negocio quiere otros defaults, cámbialos aquí.
  if (plan === "respaldo") {
    return { cantidad_recargas: 2, dia_1: 1, dia_2: 15 };
  }
  // control | tranquilidad | cualquier otro => 1 recarga
  return { cantidad_recargas: 1, dia_1: 1, dia_2: null };
}

/**
 * Listar usuarios...
 * (mantener igual)
 */
// ... (tu listUsers aquí sin cambios)

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

  // 4. Crear programacion_recargas por defecto (no bloquear creación si falla)
  try {
    const plan = newUser.plan || "control";
    const def = defaultProgramacionForPlan(plan);

    // Intentamos upsert simple: si existe (no debería), ignore; si no, insert
    // Aquí usamos insert().select().single() y dejamos manejar error por unique key.
    const { error: progErr } = await supabase
      .from("programacion_recargas")
      .insert({
        usuario_id: newUser.id,
        cantidad_recargas: def.cantidad_recargas,
        dia_1: def.dia_1,
        dia_2: def.dia_2,
      });

    if (progErr) {
      // Logueamos, pero no lanzamos para no romper flujo de creación de usuario.
      console.error("[USERS] Error creando programacion_recargas:", progErr.message);
    }
  } catch (e) {
    console.error("[USERS] Excepción creando programacion_recargas:", e.message);
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

  // 3. Ajustar programacion_recargas para ese usuario según nuevo plan
  try {
    const def = defaultProgramacionForPlan(updated.plan);

    // Verificamos si ya existe programacion
    const { data: prog } = await supabase
      .from("programacion_recargas")
      .select("*")
      .eq("usuario_id", updated.id)
      .single();

    if (prog) {
      // Actualizar
      const { error: progUpdateErr } = await supabase
        .from("programacion_recargas")
        .update({
          cantidad_recargas: def.cantidad_recargas,
          dia_1: def.dia_1,
          dia_2: def.dia_2,
          updated_at: new Date().toISOString(),
        })
        .eq("usuario_id", updated.id);

      if (progUpdateErr) {
        console.error("[USERS] Error actualizando programacion_recargas:", progUpdateErr.message);
      }
    } else {
      // Insertar nuevo registro
      const { error: progInsertErr } = await supabase
        .from("programacion_recargas")
        .insert({
          usuario_id: updated.id,
          cantidad_recargas: def.cantidad_recargas,
          dia_1: def.dia_1,
          dia_2: def.dia_2,
        });

      if (progInsertErr) {
        console.error("[USERS] Error insertando programacion_recargas:", progInsertErr.message);
      }
    }
  } catch (e) {
    console.error("[USERS] Excepción al ajustar programacion_recargas:", e.message);
  }

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